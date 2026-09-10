import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { CellChange, ForecastDetails, ResearchLink, TrendExtras } from "./types.js";

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
