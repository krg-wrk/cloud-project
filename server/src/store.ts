import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { CellChange, ForecastDetails, ResearchLink, TrendExtras } from "./types.js";
import {
  CHANNELS,
  DEFAULT_ON,
  NOTICE_KINDS,
  type Channel,
  type Inboxed,
  type NoticeKind,
  type NotifyPrefs,
} from "./notify/types.js";

/**
 * Everything the Hub owns rather than reads.
 *
 * The commissioning schedule stays in Smartsheet, where the managers work.
 * Notes, personal entries, peer reviews and sign-ups are written by the team
 * — hundreds of small writes a day across 200 people — which a sheet cannot
 * take, so they live here instead.
 *
 * SQLite is deliberate for the POC: it needs no service, it is a real
 * database with real indexes, and every query below is ordinary SQL that
 * moves to Postgres unchanged when the Hub is deployed for the whole team.
 */

export type NoteSource = "human" | "ai";

export interface ContentNote {
  id: string;
  contentId: string;
  authorId: string;
  body: string;
  source: NoteSource;
  /** Which model wrote it, for AI notes. */
  model?: string;
  createdAt: string;
  updatedAt: string;
}

export type EntryKind = "reminder" | "focus-time" | "personal" | "milestone";

export interface PersonalEntry {
  id: string;
  personId: string;
  title: string;
  kind: EntryKind;
  date: string;
  endDate: string;
  note?: string;
  /** Optionally pinned to a piece of content. */
  contentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PeerReview {
  contentId: string;
  reviewerId: string;
  reviewDate: string;
  /** Who set it up — kept so either side can see who arranged it. */
  arrangedBy: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SignUpRow {
  sessionId: string;
  personId: string;
  state: "going" | "waiting";
  createdAt: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS content_notes (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'human',
  model TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS content_notes_by_content ON content_notes (content_id, created_at);

CREATE TABLE IF NOT EXISTS personal_entries (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'reminder',
  date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  note TEXT,
  content_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS personal_entries_by_person ON personal_entries (person_id, date);

CREATE TABLE IF NOT EXISTS peer_reviews (
  content_id TEXT PRIMARY KEY,
  reviewer_id TEXT NOT NULL,
  review_date TEXT NOT NULL,
  arranged_by TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS peer_reviews_by_reviewer ON peer_reviews (reviewer_id, review_date);

CREATE TABLE IF NOT EXISTS session_signups (
  session_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (session_id, person_id)
);

CREATE TABLE IF NOT EXISTS forecast_details (
  content_id TEXT PRIMARY KEY,
  content_type TEXT,
  year_from INTEGER,
  year_to INTEGER,
  editor_id TEXT,
  editor_url TEXT,
  research_links TEXT NOT NULL DEFAULT '[]',
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trend_extras (
  trend_id TEXT PRIMARY KEY,
  cover_image_url TEXT,
  links TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calendar_tokens (
  person_id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

/*
 * Every attempt to change the commissioning sheet, whether it worked or not.
 *
 * Smartsheet keeps cell history and the Hub is taking a slice of that work
 * away from it, so it has to keep its own. This is the record of who changed
 * which cell, from what to what, and when — and of the ones that were
 * refused, because a failed write with no trace is worse than no write.
 */
CREATE TABLE IF NOT EXISTS schedule_writes (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL,
  source_row_id TEXT NOT NULL,
  /** Which sheet, in the words the confirmation used. */
  target TEXT NOT NULL,
  /** [{ field, column, from, to }], as it was shown before applying. */
  changes TEXT NOT NULL,
  by_email TEXT NOT NULL,
  by_person_id TEXT,
  at TEXT NOT NULL,
  ok INTEGER NOT NULL,
  /** Why it was refused, when it was. */
  problem TEXT
);

CREATE INDEX IF NOT EXISTS schedule_writes_content ON schedule_writes (content_id, at DESC);

/*
 * What a trend's owner decided about a suggested proof point.
 *
 * The library itself is a read-only extract — a pipeline writes it weekly and
 * nothing here edits it — so decisions live in the Hub instead and are laid
 * over the extract when it is read. That also means a decision survives the
 * next extract, which is the whole point: nobody wants to review the same
 * ten thousand suggestions again because the pipeline ran.
 *
 * One row per suggestion, replaced when somebody changes their mind, deleted
 * by an undo. The reason is optional because the reviewer can skip it, and
 * asking twice for something optional is how a queue stops being used.
 */
CREATE TABLE IF NOT EXISTS proof_point_decisions (
  suggestion_id TEXT PRIMARY KEY,
  trend_id TEXT NOT NULL,
  callout_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT,
  by_email TEXT NOT NULL,
  by_person_id TEXT,
  /** Whether the person deciding owns the trend, as the pipeline records it. */
  by_owner INTEGER NOT NULL DEFAULT 0,
  decided_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS proof_point_decisions_trend
  ON proof_point_decisions (trend_id, decided_at DESC);

/*
 * Settings that belong to the Hub rather than to a person.
 *
 * One row per switch, so adding one needs no migration, and the code's own
 * default stands until somebody changes it — the same arrangement the page
 * wording uses. Not for credentials: those go in an environment variable or
 * the studio's own secret column.
 */
CREATE TABLE IF NOT EXISTS hub_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

/*
 * Which notices each person wants, and where.
 *
 * No row means the defaults in notify/types.ts, which are the bell and
 * nothing that leaves the building. The grid of kinds against channels is
 * one small JSON column rather than three, because the kinds will change and
 * the channels might, and a migration per notification type is not a trade
 * worth making for something nothing queries across.
 */
CREATE TABLE IF NOT EXISTS notify_prefs (
  person_id TEXT PRIMARY KEY,
  on_json TEXT NOT NULL,
  /** This person's own Google Chat space, when they gave one. */
  chat_webhook TEXT,
  updated_at TEXT NOT NULL
);

/*
 * The in-app inbox: one row per notice shown on the bell.
 *
 * Held rather than recomputed, so "you were told about this" survives the
 * thing itself changing — a deadline notice stays readable after the
 * forecast is submitted, which is exactly when somebody wants to check what
 * they were told and when.
 */
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  /** The notice's stable key, so the same thing is never inboxed twice. */
  notice_key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  urgency INTEGER NOT NULL DEFAULT 0,
  at TEXT NOT NULL,
  read_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_key ON notifications (notice_key);
CREATE INDEX IF NOT EXISTS notifications_by_person ON notifications (person_id, at DESC);

/*
 * Every send attempt, so nothing is said twice and a silence can be explained.
 *
 * This is the record that makes the schedule safe to re-run: a notice's key
 * plus a channel is unique, so a run that fires twice on a Monday sends one
 * digest. Failures are kept too — a webhook that 403s every week is a thing
 * an admin should be able to see rather than guess at.
 */
CREATE TABLE IF NOT EXISTS notification_sends (
  notice_key TEXT NOT NULL,
  channel TEXT NOT NULL,
  person_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  at TEXT NOT NULL,
  ok INTEGER NOT NULL,
  problem TEXT,
  PRIMARY KEY (notice_key, channel)
);
CREATE INDEX IF NOT EXISTS notification_sends_recent ON notification_sends (at DESC);
`;

const now = () => new Date().toISOString();

export class HubStore {
  private db: DatabaseSync;

  constructor(file = process.env.HUB_DB ?? "./data/hub.db") {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  /**
   * The studio's tables live in the same database and own their own SQL, so
   * they get the handle rather than another two hundred lines in here.
   */
  get connection(): DatabaseSync {
    return this.db;
  }

  // --- Notes -------------------------------------------------------------

  notesFor(contentId: string): ContentNote[] {
    const rows = this.db
      .prepare(
        `SELECT id, content_id, author_id, body, source, model, created_at, updated_at
         FROM content_notes WHERE content_id = ? ORDER BY created_at DESC`,
      )
      .all(contentId) as Record<string, string>[];
    return rows.map(toNote);
  }

  /** How many notes each piece has, for badging a list without N queries. */
  noteCounts(): Record<string, number> {
    const rows = this.db
      .prepare(`SELECT content_id, COUNT(*) AS n FROM content_notes GROUP BY content_id`)
      .all() as { content_id: string; n: number }[];
    return Object.fromEntries(rows.map((r) => [r.content_id, Number(r.n)]));
  }

  addNote(input: {
    contentId: string;
    authorId: string;
    body: string;
    source?: NoteSource;
    model?: string;
  }): ContentNote {
    const stamp = now();
    const note: ContentNote = {
      id: randomUUID(),
      contentId: input.contentId,
      authorId: input.authorId,
      body: input.body,
      source: input.source ?? "human",
      model: input.model,
      createdAt: stamp,
      updatedAt: stamp,
    };
    this.db
      .prepare(
        `INSERT INTO content_notes
           (id, content_id, author_id, body, source, model, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        note.id,
        note.contentId,
        note.authorId,
        note.body,
        note.source,
        note.model ?? null,
        note.createdAt,
        note.updatedAt,
      );
    return note;
  }

  getNote(id: string): ContentNote | undefined {
    const row = this.db
      .prepare(
        `SELECT id, content_id, author_id, body, source, model, created_at, updated_at
         FROM content_notes WHERE id = ?`,
      )
      .get(id) as Record<string, string> | undefined;
    return row ? toNote(row) : undefined;
  }

  updateNote(id: string, body: string): ContentNote | undefined {
    this.db
      .prepare(`UPDATE content_notes SET body = ?, updated_at = ? WHERE id = ?`)
      .run(body, now(), id);
    return this.getNote(id);
  }

  deleteNote(id: string): void {
    this.db.prepare(`DELETE FROM content_notes WHERE id = ?`).run(id);
  }

  // --- Personal entries --------------------------------------------------

  entriesFor(personId: string, from?: string, to?: string): PersonalEntry[] {
    const rows = this.db
      .prepare(
        `SELECT id, person_id, title, kind, date, end_date, note, content_id, created_at, updated_at
         FROM personal_entries
         WHERE person_id = ?
           AND (? IS NULL OR end_date >= ?)
           AND (? IS NULL OR date <= ?)
         ORDER BY date`,
      )
      .all(personId, from ?? null, from ?? null, to ?? null, to ?? null) as Record<string, string>[];
    return rows.map(toEntry);
  }

  getEntry(id: string): PersonalEntry | undefined {
    const row = this.db
      .prepare(
        `SELECT id, person_id, title, kind, date, end_date, note, content_id, created_at, updated_at
         FROM personal_entries WHERE id = ?`,
      )
      .get(id) as Record<string, string> | undefined;
    return row ? toEntry(row) : undefined;
  }

  addEntry(input: {
    personId: string;
    title: string;
    kind: EntryKind;
    date: string;
    endDate?: string;
    note?: string;
    contentId?: string;
  }): PersonalEntry {
    const stamp = now();
    const entry: PersonalEntry = {
      id: randomUUID(),
      personId: input.personId,
      title: input.title,
      kind: input.kind,
      date: input.date,
      endDate: input.endDate || input.date,
      note: input.note,
      contentId: input.contentId,
      createdAt: stamp,
      updatedAt: stamp,
    };
    this.db
      .prepare(
        `INSERT INTO personal_entries
           (id, person_id, title, kind, date, end_date, note, content_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.id,
        entry.personId,
        entry.title,
        entry.kind,
        entry.date,
        entry.endDate,
        entry.note ?? null,
        entry.contentId ?? null,
        entry.createdAt,
        entry.updatedAt,
      );
    return entry;
  }

  updateEntry(
    id: string,
    patch: Partial<Pick<PersonalEntry, "title" | "kind" | "date" | "endDate" | "note">>,
  ): PersonalEntry | undefined {
    const current = this.getEntry(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    this.db
      .prepare(
        `UPDATE personal_entries
         SET title = ?, kind = ?, date = ?, end_date = ?, note = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(next.title, next.kind, next.date, next.endDate || next.date, next.note ?? null, now(), id);
    return this.getEntry(id);
  }

  deleteEntry(id: string): void {
    this.db.prepare(`DELETE FROM personal_entries WHERE id = ?`).run(id);
  }

  // --- Peer reviews ------------------------------------------------------

  peerReviewFor(contentId: string): PeerReview | undefined {
    const row = this.db
      .prepare(
        `SELECT content_id, reviewer_id, review_date, arranged_by, note, created_at, updated_at
         FROM peer_reviews WHERE content_id = ?`,
      )
      .get(contentId) as Record<string, string> | undefined;
    return row ? toPeerReview(row) : undefined;
  }

  allPeerReviews(): PeerReview[] {
    const rows = this.db
      .prepare(
        `SELECT content_id, reviewer_id, review_date, arranged_by, note, created_at, updated_at
         FROM peer_reviews ORDER BY review_date`,
      )
      .all() as Record<string, string>[];
    return rows.map(toPeerReview);
  }

  /** One review per piece, so setting it again amends the existing one. */
  setPeerReview(input: {
    contentId: string;
    reviewerId: string;
    reviewDate: string;
    arrangedBy: string;
    note?: string;
  }): PeerReview {
    const existing = this.peerReviewFor(input.contentId);
    const stamp = now();
    this.db
      .prepare(
        `INSERT INTO peer_reviews
           (content_id, reviewer_id, review_date, arranged_by, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (content_id) DO UPDATE SET
           reviewer_id = excluded.reviewer_id,
           review_date = excluded.review_date,
           note = excluded.note,
           updated_at = excluded.updated_at`,
      )
      .run(
        input.contentId,
        input.reviewerId,
        input.reviewDate,
        existing?.arrangedBy ?? input.arrangedBy,
        input.note ?? null,
        existing?.createdAt ?? stamp,
        stamp,
      );
    return this.peerReviewFor(input.contentId)!;
  }

  deletePeerReview(contentId: string): void {
    this.db.prepare(`DELETE FROM peer_reviews WHERE content_id = ?`).run(contentId);
  }

  // --- Session sign-ups --------------------------------------------------

  signUpsFor(sessionId: string): SignUpRow[] {
    const rows = this.db
      .prepare(
        `SELECT session_id, person_id, state, created_at
         FROM session_signups WHERE session_id = ? ORDER BY created_at`,
      )
      .all(sessionId) as Record<string, string>[];
    return rows.map(toSignUp);
  }

  allSignUps(): SignUpRow[] {
    const rows = this.db
      .prepare(
        `SELECT session_id, person_id, state, created_at FROM session_signups ORDER BY created_at`,
      )
      .all() as Record<string, string>[];
    return rows.map(toSignUp);
  }

  addSignUp(sessionId: string, personId: string, state: "going" | "waiting"): void {
    this.db
      .prepare(
        `INSERT INTO session_signups (session_id, person_id, state, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (session_id, person_id) DO UPDATE SET state = excluded.state`,
      )
      .run(sessionId, personId, state, now());
  }

  removeSignUp(sessionId: string, personId: string): void {
    this.db
      .prepare(`DELETE FROM session_signups WHERE session_id = ? AND person_id = ?`)
      .run(sessionId, personId);
  }

  promoteSignUp(sessionId: string, personId: string): void {
    this.db
      .prepare(`UPDATE session_signups SET state = 'going' WHERE session_id = ? AND person_id = ?`)
      .run(sessionId, personId);
  }

  /** Seeds sign-ups on an empty table so the POC starts with a realistic mix. */
  seedSignUpsIfEmpty(seed: Record<string, { going: string[]; waiting: string[] }>): void {
    const { n } = this.db.prepare(`SELECT COUNT(*) AS n FROM session_signups`).get() as {
      n: number;
    };
    if (Number(n) > 0) return;
    for (const [sessionId, value] of Object.entries(seed)) {
      for (const personId of value.going) this.addSignUp(sessionId, personId, "going");
      for (const personId of value.waiting) this.addSignUp(sessionId, personId, "waiting");
    }
  }

  // --- Forecast details -------------------------------------------------

  detailsFor(contentId: string): ForecastDetails | undefined {
    const row = this.db
      .prepare(
        `SELECT content_id, content_type, year_from, year_to, editor_id, editor_url,
                research_links, updated_by, updated_at
         FROM forecast_details WHERE content_id = ?`,
      )
      .get(contentId) as Record<string, unknown> | undefined;
    return row ? toDetails(row) : undefined;
  }

  allDetails(): Record<string, ForecastDetails> {
    const rows = this.db
      .prepare(
        `SELECT content_id, content_type, year_from, year_to, editor_id, editor_url,
                research_links, updated_by, updated_at
         FROM forecast_details`,
      )
      .all() as Record<string, unknown>[];
    return Object.fromEntries(rows.map((row) => [String(row.content_id), toDetails(row)]));
  }

  /** One row per forecast, so saving again replaces what is there. */
  setDetails(input: {
    contentId: string;
    contentType?: string;
    yearFrom?: number;
    yearTo?: number;
    editorId?: string;
    editorUrl?: string;
    researchLinks: ResearchLink[];
    updatedBy: string;
  }): ForecastDetails {
    const stamp = now();
    this.db
      .prepare(
        `INSERT INTO forecast_details
           (content_id, content_type, year_from, year_to, editor_id, editor_url,
            research_links, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (content_id) DO UPDATE SET
           content_type = excluded.content_type,
           year_from = excluded.year_from,
           year_to = excluded.year_to,
           editor_id = excluded.editor_id,
           editor_url = excluded.editor_url,
           research_links = excluded.research_links,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
      )
      .run(
        input.contentId,
        input.contentType ?? null,
        input.yearFrom ?? null,
        input.yearTo ?? null,
        input.editorId ?? null,
        input.editorUrl ?? null,
        JSON.stringify(input.researchLinks),
        input.updatedBy,
        stamp,
      );
    return this.detailsFor(input.contentId)!;
  }

  // --- Trend profiles ---------------------------------------------------

  /**
   * What the Hub holds on top of the trends sheet. Only the fields the owner
   * filled in are stored, so an empty override never blanks a sheet value.
   */
  trendExtrasFor(trendId: string): TrendExtras | undefined {
    const row = this.db
      .prepare(
        `SELECT trend_id, cover_image_url, links, note, updated_by, updated_at
         FROM trend_extras WHERE trend_id = ?`,
      )
      .get(trendId) as Record<string, unknown> | undefined;
    return row ? toTrendExtras(row) : undefined;
  }

  allTrendExtras(): Record<string, TrendExtras> {
    const rows = this.db
      .prepare(
        `SELECT trend_id, cover_image_url, links, note, updated_by, updated_at
         FROM trend_extras`,
      )
      .all() as Record<string, unknown>[];
    return Object.fromEntries(rows.map((row) => [String(row.trend_id), toTrendExtras(row)]));
  }

  setTrendExtras(input: {
    trendId: string;
    coverImageUrl?: string;
    links: ResearchLink[];
    note?: string;
    updatedBy: string;
  }): TrendExtras {
    const stamp = now();
    this.db
      .prepare(
        `INSERT INTO trend_extras
           (trend_id, cover_image_url, links, note, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (trend_id) DO UPDATE SET
           cover_image_url = excluded.cover_image_url,
           links = excluded.links,
           note = excluded.note,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
      )
      .run(
        input.trendId,
        input.coverImageUrl ?? null,
        JSON.stringify(input.links),
        input.note ?? null,
        input.updatedBy,
        stamp,
      );
    return this.trendExtrasFor(input.trendId)!;
  }

  // --- Calendar feed tokens ---------------------------------------------

  /**
   * A per-person secret in the feed URL. Anyone with the URL can read that
   * person's calendar, which is how subscribable feeds work — so it is
   * rotatable, and rotating invalidates the old one immediately.
   */
  /* ---- Proof point decisions --------------------------------------------- */

  /**
   * Every decision the Hub holds, keyed by suggestion.
   *
   * Read whole rather than per suggestion: the library lays them over ten
   * thousand rows on every request, and twenty-five thousand single-row
   * queries to do it would be the slowest thing in the Hub.
   */
  proofPointDecisions(): Map<string, ProofPointDecision> {
    const rows = this.db
      .prepare(`SELECT * FROM proof_point_decisions`)
      .all() as Record<string, unknown>[];
    return new Map(rows.map((row) => [String(row.suggestion_id), toDecision(row)]));
  }

  /** One decision, replacing whatever was there. */
  decideProofPoint(input: {
    suggestionId: string;
    trendId: string;
    calloutId: string;
    decision: "approve" | "reject";
    reason?: string;
    byEmail: string;
    byPersonId?: string | null;
    byOwner: boolean;
  }): ProofPointDecision {
    const entry: ProofPointDecision = {
      suggestionId: input.suggestionId,
      trendId: input.trendId,
      calloutId: input.calloutId,
      decision: input.decision,
      reason: input.reason || undefined,
      byEmail: input.byEmail,
      byPersonId: input.byPersonId ?? undefined,
      byOwner: input.byOwner,
      decidedAt: now(),
    };
    this.db
      .prepare(
        `INSERT INTO proof_point_decisions
           (suggestion_id, trend_id, callout_id, decision, reason,
            by_email, by_person_id, by_owner, decided_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(suggestion_id) DO UPDATE SET
           decision = excluded.decision, reason = excluded.reason,
           by_email = excluded.by_email, by_person_id = excluded.by_person_id,
           by_owner = excluded.by_owner, decided_at = excluded.decided_at`,
      )
      .run(
        entry.suggestionId,
        entry.trendId,
        entry.calloutId,
        entry.decision,
        entry.reason ?? null,
        entry.byEmail,
        entry.byPersonId ?? null,
        entry.byOwner ? 1 : 0,
        entry.decidedAt,
      );
    return entry;
  }

  /**
   * Take a decision back.
   *
   * Returns whether there was one to take back, so an undo on a suggestion
   * the extract itself decided can say so rather than appearing to work.
   */
  undecideProofPoint(suggestionId: string): boolean {
    const before = this.db
      .prepare(`SELECT 1 FROM proof_point_decisions WHERE suggestion_id = ?`)
      .get(suggestionId);
    if (!before) return false;
    this.db.prepare(`DELETE FROM proof_point_decisions WHERE suggestion_id = ?`).run(suggestionId);
    return true;
  }

  /** What this person has decided lately, newest first. */
  recentProofPointDecisions(byEmail: string, limit = 20): ProofPointDecision[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM proof_point_decisions WHERE by_email = ? ORDER BY decided_at DESC LIMIT ?`,
      )
      .all(byEmail, limit) as Record<string, unknown>[];
    return rows.map(toDecision);
  }

  /* ---- Settings that belong to the Hub ---------------------------------- */

  /**
   * One setting, or the caller's default.
   *
   * An untouched setting has no row at all, so what ships is whatever the
   * code asks for — nothing to seed and nothing to migrate.
   */
  setting(key: string, fallback = ""): string {
    const row = this.db
      .prepare(`SELECT value FROM hub_settings WHERE key = ?`)
      .get(key) as { value: string } | undefined;
    return row?.value ?? fallback;
  }

  flag(key: string, fallback = false): boolean {
    const value = this.setting(key, fallback ? "1" : "0");
    return value === "1" || value === "true";
  }

  setSetting(key: string, value: string, by: string): void {
    this.db
      .prepare(
        `INSERT INTO hub_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value,
           updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      )
      .run(key, value, by, now());
  }

  /* ---- The record of what the Hub changed in Smartsheet ----------------- */

  /**
   * Log an attempt, successful or not.
   *
   * Written after the attempt either way, so a refusal leaves a trace. The
   * caller passes the changes exactly as the confirmation showed them, which
   * is the point: the log says what somebody was told they were doing.
   */
  logScheduleWrite(input: {
    contentId: string;
    sourceRowId: string;
    target: string;
    changes: CellChange[];
    byEmail: string;
    byPersonId?: string | null;
    ok: boolean;
    problem?: string;
  }): ScheduleWrite {
    const entry: ScheduleWrite = {
      id: randomUUID(),
      contentId: input.contentId,
      sourceRowId: input.sourceRowId,
      target: input.target,
      changes: input.changes,
      byEmail: input.byEmail,
      byPersonId: input.byPersonId ?? undefined,
      at: now(),
      ok: input.ok,
      problem: input.problem,
    };
    this.db
      .prepare(
        `INSERT INTO schedule_writes
           (id, content_id, source_row_id, target, changes, by_email, by_person_id, at, ok, problem)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.id,
        entry.contentId,
        entry.sourceRowId,
        entry.target,
        JSON.stringify(entry.changes),
        entry.byEmail,
        entry.byPersonId ?? null,
        entry.at,
        entry.ok ? 1 : 0,
        entry.problem ?? null,
      );
    return entry;
  }

  /** What the Hub has changed on one forecast, most recent first. */
  scheduleWrites(contentId: string, limit = 20): ScheduleWrite[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM schedule_writes WHERE content_id = ? ORDER BY at DESC LIMIT ?`,
      )
      .all(contentId, limit) as Record<string, unknown>[];
    return rows.map(toScheduleWrite);
  }

  /** The whole log, for an admin. */
  allScheduleWrites(limit = 200): ScheduleWrite[] {
    const rows = this.db
      .prepare(`SELECT * FROM schedule_writes ORDER BY at DESC LIMIT ?`)
      .all(limit) as Record<string, unknown>[];
    return rows.map(toScheduleWrite);
  }

  // --- Notifications -----------------------------------------------------

  /** What this person asked for, or nothing if they never said. */
  notifyPrefs(personId: string): NotifyPrefs | undefined {
    const row = this.db
      .prepare(`SELECT * FROM notify_prefs WHERE person_id = ?`)
      .get(personId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    let on = { ...DEFAULT_ON };
    try {
      const parsed = JSON.parse(String(row.on_json)) as Record<string, unknown>;
      on = Object.fromEntries(
        NOTICE_KINDS.map((kind) => {
          const asked = parsed[kind];
          const clean = Array.isArray(asked)
            ? CHANNELS.filter((c) => asked.includes(c))
            : DEFAULT_ON[kind];
          return [kind, clean];
        }),
      ) as Record<NoticeKind, Channel[]>;
    } catch {
      // A malformed row falls back to the defaults rather than failing.
    }
    return {
      personId,
      on,
      chatWebhook: row.chat_webhook ? String(row.chat_webhook) : undefined,
      updatedAt: String(row.updated_at),
    };
  }

  /** Everyone who has said anything, for an admin reading the whole picture. */
  allNotifyPrefs(): NotifyPrefs[] {
    const rows = this.db
      .prepare(`SELECT person_id FROM notify_prefs`)
      .all() as { person_id: string }[];
    return rows
      .map((r) => this.notifyPrefs(String(r.person_id)))
      .filter((p): p is NotifyPrefs => Boolean(p));
  }

  setNotifyPrefs(prefs: NotifyPrefs): NotifyPrefs {
    this.db
      .prepare(
        `INSERT INTO notify_prefs (person_id, on_json, chat_webhook, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(person_id) DO UPDATE SET
           on_json = excluded.on_json,
           chat_webhook = excluded.chat_webhook,
           updated_at = excluded.updated_at`,
      )
      .run(prefs.personId, JSON.stringify(prefs.on), prefs.chatWebhook ?? null, now());
    return this.notifyPrefs(prefs.personId)!;
  }

  /**
   * Put a notice in somebody's inbox.
   *
   * Keyed on the notice rather than the moment, so a run that happens twice
   * leaves one row. The insert is a no-op the second time rather than an
   * error, because a duplicate is expected — that is the mechanism working.
   */
  addNotification(notice: {
    key: string;
    personId: string;
    kind: string;
    title: string;
    body: string;
    link?: string;
    urgency?: number;
  }): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO notifications
           (id, person_id, kind, notice_key, title, body, link, urgency, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        notice.personId,
        notice.kind,
        notice.key,
        notice.title,
        notice.body,
        notice.link ?? null,
        notice.urgency ?? 0,
        now(),
      );
  }

  /** This person's inbox, newest first. */
  notifications(personId: string, limit = 40): Inboxed[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM notifications WHERE person_id = ? ORDER BY at DESC LIMIT ?`,
      )
      .all(personId, limit) as Record<string, unknown>[];
    return rows.map(toInboxed);
  }

  unreadCount(personId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM notifications WHERE person_id = ? AND read_at IS NULL`)
      .get(personId) as { n: number };
    return Number(row?.n ?? 0);
  }

  /** Mark one as read. Scoped to the person, so nobody can read another's. */
  markRead(personId: string, id: string): void {
    this.db
      .prepare(
        `UPDATE notifications SET read_at = ? WHERE id = ? AND person_id = ? AND read_at IS NULL`,
      )
      .run(now(), id, personId);
  }

  markAllRead(personId: string): void {
    this.db
      .prepare(`UPDATE notifications SET read_at = ? WHERE person_id = ? AND read_at IS NULL`)
      .run(now(), personId);
  }

  deleteNotification(personId: string, id: string): void {
    this.db
      .prepare(`DELETE FROM notifications WHERE id = ? AND person_id = ?`)
      .run(id, personId);
  }

  /** Has this exact notice already gone down this channel? */
  alreadySent(key: string, channel: string): boolean {
    const row = this.db
      .prepare(
        `SELECT ok FROM notification_sends WHERE notice_key = ? AND channel = ? AND ok = 1`,
      )
      .get(key, channel) as { ok: number } | undefined;
    return Boolean(row);
  }

  /**
   * Record an attempt.
   *
   * A failure is written too, and replaces an earlier failure for the same
   * key and channel — so a webhook that comes back to life next week gets
   * another go, while one that succeeded is never asked again.
   */
  logNotification(entry: {
    key: string;
    personId: string;
    kind: string;
    channel: string;
    ok: boolean;
    problem?: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO notification_sends (notice_key, channel, person_id, kind, at, ok, problem)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(notice_key, channel) DO UPDATE SET
           at = excluded.at, ok = excluded.ok, problem = excluded.problem`,
      )
      .run(
        entry.key,
        entry.channel,
        entry.personId,
        entry.kind,
        now(),
        entry.ok ? 1 : 0,
        entry.problem ?? null,
      );
  }

  /** The send log, newest first, for an admin. */
  recentSends(limit = 100): NotificationSend[] {
    const rows = this.db
      .prepare(`SELECT * FROM notification_sends ORDER BY at DESC LIMIT ?`)
      .all(limit) as Record<string, unknown>[];
    return rows.map((row) => ({
      key: String(row.notice_key),
      channel: String(row.channel),
      personId: String(row.person_id),
      kind: String(row.kind),
      at: String(row.at),
      ok: row.ok === 1 || row.ok === true,
      problem: row.problem ? String(row.problem) : undefined,
    }));
  }

  calendarToken(personId: string): string {
    const row = this.db
      .prepare(`SELECT token FROM calendar_tokens WHERE person_id = ?`)
      .get(personId) as { token: string } | undefined;
    if (row) return row.token;
    const token = randomUUID().replace(/-/g, "");
    this.db
      .prepare(`INSERT INTO calendar_tokens (person_id, token, created_at) VALUES (?, ?, ?)`)
      .run(personId, token, now());
    return token;
  }

  rotateCalendarToken(personId: string): string {
    this.db.prepare(`DELETE FROM calendar_tokens WHERE person_id = ?`).run(personId);
    return this.calendarToken(personId);
  }

  personForToken(token: string): string | undefined {
    const row = this.db
      .prepare(`SELECT person_id FROM calendar_tokens WHERE token = ?`)
      .get(token) as { person_id: string } | undefined;
    return row?.person_id;
  }
}

function toTrendExtras(row: Record<string, unknown>): TrendExtras {
  let links: ResearchLink[] = [];
  try {
    const parsed = JSON.parse(String(row.links ?? "[]"));
    if (Array.isArray(parsed)) links = parsed;
  } catch {
    // A malformed row should not take the page down.
  }
  return {
    trendId: String(row.trend_id),
    coverImageUrl: row.cover_image_url ? String(row.cover_image_url) : undefined,
    links,
    note: row.note ? String(row.note) : undefined,
    updatedBy: String(row.updated_by),
    updatedAt: String(row.updated_at),
  };
}

function toDetails(row: Record<string, unknown>): ForecastDetails {
  let researchLinks: ResearchLink[] = [];
  try {
    const parsed = JSON.parse(String(row.research_links ?? "[]"));
    if (Array.isArray(parsed)) researchLinks = parsed;
  } catch {
    // A malformed row should not take the page down.
  }
  return {
    contentId: String(row.content_id),
    contentType: row.content_type ? String(row.content_type) : undefined,
    yearFrom: row.year_from == null ? undefined : Number(row.year_from),
    yearTo: row.year_to == null ? undefined : Number(row.year_to),
    editorId: row.editor_id ? String(row.editor_id) : undefined,
    editorUrl: row.editor_url ? String(row.editor_url) : undefined,
    researchLinks,
    updatedBy: String(row.updated_by),
    updatedAt: String(row.updated_at),
  };
}

function toNote(row: Record<string, unknown>): ContentNote {
  return {
    id: String(row.id),
    contentId: String(row.content_id),
    authorId: String(row.author_id),
    body: String(row.body),
    source: row.source === "ai" ? "ai" : "human",
    model: row.model ? String(row.model) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toEntry(row: Record<string, unknown>): PersonalEntry {
  return {
    id: String(row.id),
    personId: String(row.person_id),
    title: String(row.title),
    kind: String(row.kind) as EntryKind,
    date: String(row.date),
    endDate: String(row.end_date),
    note: row.note ? String(row.note) : undefined,
    contentId: row.content_id ? String(row.content_id) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toPeerReview(row: Record<string, unknown>): PeerReview {
  return {
    contentId: String(row.content_id),
    reviewerId: String(row.reviewer_id),
    reviewDate: String(row.review_date),
    arrangedBy: String(row.arranged_by),
    note: row.note ? String(row.note) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toSignUp(row: Record<string, unknown>): SignUpRow {
  return {
    sessionId: String(row.session_id),
    personId: String(row.person_id),
    state: row.state === "waiting" ? "waiting" : "going",
    createdAt: String(row.created_at),
  };
}

/**
 * One recorded attempt to change the commissioning sheet.
 *
 * `changes` is what the person was shown before they pressed Apply, so the
 * log answers "what did they think they were doing" as well as "what
 * happened". A refused attempt is kept, with the reason.
 */
export interface ScheduleWrite {
  id: string;
  contentId: string;
  sourceRowId: string;
  target: string;
  changes: CellChange[];
  byEmail: string;
  byPersonId?: string;
  at: string;
  ok: boolean;
  problem?: string;
}

function toScheduleWrite(row: Record<string, unknown>): ScheduleWrite {
  let changes: CellChange[] = [];
  try {
    changes = JSON.parse(String(row.changes)) as CellChange[];
  } catch {
    // A log entry with unreadable changes is still worth having.
  }
  return {
    id: String(row.id),
    contentId: String(row.content_id),
    sourceRowId: String(row.source_row_id),
    target: String(row.target),
    changes,
    byEmail: String(row.by_email),
    byPersonId: row.by_person_id ? String(row.by_person_id) : undefined,
    at: String(row.at),
    ok: row.ok === 1 || row.ok === true,
    problem: row.problem ? String(row.problem) : undefined,
  };
}

/**
 * A decision the Hub holds about a suggested proof point.
 *
 * Separate from the extract's own `decision` field, which is the state as of
 * the last time the pipeline ran. Where both exist the Hub's wins, because it
 * is the one somebody made here.
 */
export interface ProofPointDecision {
  suggestionId: string;
  trendId: string;
  calloutId: string;
  decision: "approve" | "reject";
  reason?: string;
  byEmail: string;
  byPersonId?: string;
  byOwner: boolean;
  decidedAt: string;
}

/** One recorded send attempt, for the admin's log. */
export interface NotificationSend {
  key: string;
  channel: string;
  personId: string;
  kind: string;
  at: string;
  ok: boolean;
  problem?: string;
}

function toInboxed(row: Record<string, unknown>): Inboxed {
  const urgency = Number(row.urgency ?? 0);
  return {
    id: String(row.id),
    key: String(row.notice_key),
    personId: String(row.person_id),
    kind: String(row.kind) as NoticeKind,
    title: String(row.title),
    body: String(row.body),
    link: row.link ? String(row.link) : undefined,
    urgency: (urgency === 2 ? 2 : urgency === 1 ? 1 : 0) as 0 | 1 | 2,
    at: String(row.at),
    readAt: row.read_at ? String(row.read_at) : undefined,
  };
}

function toDecision(row: Record<string, unknown>): ProofPointDecision {
  return {
    suggestionId: String(row.suggestion_id),
    trendId: String(row.trend_id),
    calloutId: String(row.callout_id),
    decision: row.decision === "reject" ? "reject" : "approve",
    reason: row.reason ? String(row.reason) : undefined,
    byEmail: String(row.by_email),
    byPersonId: row.by_person_id ? String(row.by_person_id) : undefined,
    byOwner: row.by_owner === 1 || row.by_owner === true,
    decidedAt: String(row.decided_at),
  };
}
