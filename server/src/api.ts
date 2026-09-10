import { Router, type Response } from "express";
import { aiNotesEnabled, type NoteDrafter } from "./ai.js";
import {
  canEditNote,
  canSignUpAs,
  canViewKpis,
  canWriteDetails,
  canWriteEntry,
  canWriteNote,
  canWritePeerReview,
  canWriteSchedule,
  canWriteTrend,
  nameId,
  requirePerson,
  seesWholeTeam,
  type Viewer,
  type ViewerRequest,
} from "./auth.js";
import { buildFeed } from "./ics.js";
import { compareTeam, computeKpis, precedingRange, type Bucket } from "./kpis.js";
import { COLUMNS } from "./data/smartsheetSource.js";
import { CONTENT_TYPES, ROLE_BENCHMARKS, TIER_MEANINGS } from "./taxonomy.js";
import type { SignUps } from "./signUps.js";
import type { EntryKind, HubStore } from "./store.js";
import type {
  CalendarEvent,
  CellChange,
  ContentItem,
  DataSource,
  Person,
  ResearchLink,
  Status,
  TrendProfile,
  WritableFields,
} from "./types.js";
import { WRITABLE_FIELDS } from "./types.js";

/** Deadlines are calendar days, so "today" is a date string, read per request. */
const TODAY = () => new Date().toISOString().slice(0, 10);

const ENTRY_KINDS: EntryKind[] = ["reminder", "focus-time", "personal", "milestone"];

interface ContentQuery {
  forecaster?: string;
  manager?: string;
  vertical?: string;
  type?: string;
  season?: string;
  status?: string;
  dateField?: "publicationDate" | "submissionDate";
  from?: string;
  to?: string;
  q?: string;
}

function matchesContent(item: ContentItem, query: ContentQuery): boolean {
  const field = query.dateField === "submissionDate" ? "submissionDate" : "publicationDate";
  const date = item[field];
  if (query.forecaster && item.forecasterId !== query.forecaster) return false;
  if (query.manager && item.managerId !== query.manager) return false;
  if (query.vertical && item.vertical !== query.vertical) return false;
  if (query.type && item.type !== query.type) return false;
  if (query.season && item.season !== query.season) return false;
  if (query.status && item.status !== query.status) return false;
  if (query.from && date && date < query.from) return false;
  if (query.to && date && date > query.to) return false;
  if (query.q) {
    const needle = query.q.toLowerCase();
    const haystack = `${item.title} ${item.type} ${item.vertical} ${item.season}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function overlaps(event: CalendarEvent, from?: string, to?: string): boolean {
  if (from && event.endDate && event.endDate < from) return false;
  if (to && event.startDate && event.startDate > to) return false;
  return true;
}

/** Public holidays apply to a region; leave and shows belong to people. */
function eventAppliesTo(event: CalendarEvent, person: Person | undefined): boolean {
  if (!person) return true;
  if (event.personId) return event.personId === person.id;
  if (event.region && event.region !== "All") return event.region === person.region;
  return true;
}

const isDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

function bad(res: Response, message: string): void {
  res.status(400).json({ error: message });
}

/** One cached read's age, as CachedDataSource reports it. */
interface Freshness {
  key: string;
  readAt: string;
  ageMs: number;
  cacheMs: number;
}

export function createApiRouter(
  data: DataSource,
  store: HubStore,
  signUps: SignUps,
  drafter: NoteDrafter,
  proofPoints: { size: number; trendCount: number; extractedAt?: string },
): Router {
  const router = Router();

  /**
   * Who the caller is and what they can do. The front end reads this once and
   * uses it to decide the default filters and which controls to show — the
   * server still checks every write.
   */
  router.get("/me", async (req: ViewerRequest, res, next) => {
    try {
      const viewer = req.viewer!;
      const people = await data.listPeople();
      const person = viewer.personId ? people.find((p) => p.id === viewer.personId) : undefined;
      res.json({
        email: viewer.email,
        name: viewer.name,
        personId: viewer.personId,
        role: viewer.role,
        verticals: viewer.verticals,
        active: viewer.active,
        person,
        seesWholeTeam: seesWholeTeam(viewer),
        aiNotes: aiNotesEnabled(),
        calendarFeed: viewer.personId
          ? `/api/calendar/${store.calendarToken(viewer.personId)}.ics`
          : null,
      });
    } catch (err) {
      next(err);
    }
  });

  /* --- How fresh is any of this ------------------------------------------
   *
   * The Hub caches its reads, the sheets are edited by people, and the trend
   * and proof point extracts run on somebody else's schedule — so "how old is
   * what I am looking at" is a real question that had no answer anywhere on
   * screen. Silent staleness is the failure mode nobody spots.
   *
   * Admins only to begin with, because it is a diagnostic and the wording
   * will want tuning once it has been read in anger. An admin can turn it on
   * for everybody, which is the setting below.
   */

  const FRESHNESS_FOR_ALL = "freshness.visibleToAll";

  /** What each cached read is called, in the words the team uses. */
  const READ_LABELS: Record<string, string> = {
    content: "The commissioning schedule",
    events: "Leave, holidays and shows",
    people: "The team",
    sessions: "The workshop programme",
    signups: "Workshop sign-ups",
    access: "Who may sign in",
    metrics: "The KPI definitions",
    observations: "KPI readings",
    trends: "Trend profiles (TFDB)",
  };

  router.get("/freshness", async (req: ViewerRequest, res, next) => {
    try {
      const viewer = req.viewer!;
      const forAll = store.flag(FRESHNESS_FOR_ALL);
      if (viewer.role !== "admin" && !forAll) {
        res.status(403).json({
          error: "Data freshness is shown to admins. An admin can turn it on for everybody.",
        });
        return;
      }

      /*
       * Only what has actually been read this session appears. A source
       * nobody has asked for has no age, and inventing one — "never" — reads
       * as a fault rather than as "nothing has needed it yet".
       */
      const reads = (data.forget ? (data as { freshness?: () => Freshness[] }).freshness?.() ?? [] : [])
        .map((r) => ({ ...r, label: READ_LABELS[r.key] ?? r.key }))
        .sort((a, b) => b.ageMs - a.ageMs);

      // The trend sheet stamps its own extract date, which is a different
      // and more useful thing than when the Hub last read it.
      const trends = await data.listTrends();
      const synced = trends.map((t) => t.lastSynced).filter(Boolean).sort();

      res.json({
        visibleToAll: forAll,
        canChangeVisibility: viewer.role === "admin",
        source: data.name,
        reads,
        extracts: [
          {
            label: "Trend profiles",
            what: "extracted from TFDB",
            at: synced.length > 0 ? synced[synced.length - 1] : null,
            note: `${trends.length} profiles`,
          },
          {
            label: "Proof points",
            what: "extracted from the Proof Points Reviewer workbook",
            at: proofPoints.extractedAt ?? null,
            note: `${proofPoints.size.toLocaleString()} suggestions across ${proofPoints.trendCount} trends`,
          },
        ],
        // Where a write would go, since that is the other thing an admin
        // wants to know at a glance.
        writes: data.writes?.target ?? null,
      });
    } catch (err) {
      next(err);
    }
  });

  /** Show it to everybody, or put it back to admins only. */
  router.put("/freshness/visibility", (req: ViewerRequest, res) => {
    const viewer = req.viewer!;
    if (viewer.role !== "admin") {
      res.status(403).json({ error: "Only an admin can change who sees this." });
      return;
    }
    const body = (req.body ?? {}) as { visibleToAll?: unknown };
    if (typeof body.visibleToAll !== "boolean") {
      bad(res, "visibleToAll must be true or false.");
      return;
    }
    store.setSetting(FRESHNESS_FOR_ALL, body.visibleToAll ? "1" : "0", viewer.email);
    res.json({ visibleToAll: body.visibleToAll });
  });

  /** The content taxonomy: every format we publish, and its tier. */
  router.get("/taxonomy", (_req, res) => {
    res.json({ contentTypes: CONTENT_TYPES, tiers: TIER_MEANINGS, roles: ROLE_BENCHMARKS });
  });

  router.get("/people", async (_req, res, next) => {
    try {
      res.json(await data.listPeople());
    } catch (err) {
      next(err);
    }
  });

  router.get("/people/:id", async (req, res, next) => {
    try {
      const people = await data.listPeople();
      const person = people.find((p) => p.id === req.params.id);
      if (!person) {
        res.status(404).json({ error: `No person with id "${req.params.id}"` });
        return;
      }
      res.json(person);
    } catch (err) {
      next(err);
    }
  });

  /**
   * The schedule. Everyone on the team can read all of it — a forecaster
   * needs to see what else is publishing around them — but the default
   * filter is set from the signed-in account, so a forecaster who opens the
   * Hub sees their own work first without touching a control.
   */
  router.get("/content", async (req: ViewerRequest, res, next) => {
    try {
      const viewer = req.viewer!;
      if (!viewer.active) {
        res.status(403).json({ error: "This account does not have access to the Hub." });
        return;
      }
      const items = await data.listContent();
      const query = req.query as ContentQuery;
      const field = query.dateField === "submissionDate" ? "submissionDate" : "publicationDate";
      const counts = store.noteCounts();
      const reviews = new Map(store.allPeerReviews().map((r) => [r.contentId, r]));
      const filtered = items
        .filter((item) => matchesContent(item, query))
        .sort((a, b) => a[field].localeCompare(b[field]))
        .map((item) => ({
          ...item,
          noteCount: counts[item.id] ?? 0,
          peerReview: reviews.get(item.id) ?? null,
        }));
      res.json(filtered);
    } catch (err) {
      next(err);
    }
  });

  router.get("/content/:id", async (req, res, next) => {
    try {
      const items = await data.listContent();
      const item = items.find((c) => c.id === req.params.id);
      if (!item) {
        res.status(404).json({ error: `No content item with id "${req.params.id}"` });
        return;
      }
      res.json({
        ...item,
        peerReview: store.peerReviewFor(item.id) ?? null,
        noteCount: store.notesFor(item.id).length,
        details: store.detailsFor(item.id) ?? null,
      });
    } catch (err) {
      next(err);
    }
  });

  /* --- Changing the commissioning sheet ---------------------------------
   *
   * Two steps, deliberately. The first works out and returns exactly which
   * cells would change, and writes nothing. The second applies it, and only
   * the thing the first step described: the client sends back the same
   * before-values, the source re-reads the row, and if the sheet has moved on
   * the write is refused rather than overwriting somebody else's edit.
   *
   * Everything about this is narrow on purpose. It is off unless the
   * deployment turned it on, it is managers and admins only, it reaches five
   * columns, and every attempt — including every refusal — is logged.
   */

  /** The status words a write may use. */
  const STATUSES = new Set<Status>([
    "not-started",
    "in-progress",
    "submitted",
    "in-review",
    "published",
    "at-risk",
  ]);

  const ISO = /^\d{4}-\d{2}-\d{2}$/;

  /**
   * A requested change, cleaned.
   *
   * Anything unrecognised is dropped rather than corrected: a status the Hub
   * does not know and a date that is not a date have no business being
   * guessed at on somebody else's sheet. Returns the fields it accepted and
   * the ones it would not.
   */
  function readChanges(body: unknown): { changes: WritableFields; refused: string[] } {
    const input = (body ?? {}) as Record<string, unknown>;
    const changes: WritableFields = {};
    const refused: string[] = [];
    for (const field of WRITABLE_FIELDS) {
      if (!(field in input)) continue;
      const raw = input[field];
      if (field === "status") {
        if (typeof raw === "string" && STATUSES.has(raw as Status)) changes.status = raw as Status;
        else refused.push(`status "${String(raw)}" is not one the Hub knows`);
        continue;
      }
      if (field === "notes") {
        if (typeof raw === "string" && raw.length <= 4000) changes.notes = raw;
        else refused.push("notes must be text of 4000 characters or fewer");
        continue;
      }
      // A date, or an empty string to clear the cell.
      if (raw === "" || raw === null) {
        changes[field] = "";
      } else if (typeof raw === "string" && ISO.test(raw) && !Number.isNaN(Date.parse(raw))) {
        changes[field] = raw;
      } else {
        refused.push(`${field} must be a date as YYYY-MM-DD, or empty to clear it`);
      }
    }
    return { changes, refused };
  }

  /** What each writable field currently reads as on the item. */
  function currently(item: ContentItem, field: keyof WritableFields): string {
    switch (field) {
      case "status":
        return item.status;
      case "submissionDate":
        return item.submissionDate ?? "";
      case "publicationDate":
        return item.publicationDate ?? "";
      case "submittedOn":
        return item.submittedOn ?? "";
      case "notes":
        return item.notes ?? "";
    }
  }

  /**
   * The cells that would change, in the words the confirmation shows.
   *
   * A field set to what it already says is not a change and is left out, so
   * pressing Apply on an untouched form does nothing rather than writing the
   * same value back and filling the log.
   */
  function describeChanges(item: ContentItem, changes: WritableFields): CellChange[] {
    const out: CellChange[] = [];
    for (const field of WRITABLE_FIELDS) {
      if (!(field in changes)) continue;
      const from = currently(item, field);
      const to = String(changes[field] ?? "");
      if (from.trim() === to.trim()) continue;
      out.push({ field, column: COLUMNS.content[field], from, to });
    }
    return out;
  }

  /**
   * Whether this request may change this row at all, and why not.
   *
   * The order matters: the capability first, then the person. Somebody
   * without the right should be told they lack it, but a Hub that cannot
   * write at all should say that to everybody rather than implying the
   * feature exists for someone else.
   */
  function refuseWrite(viewer: Viewer, item: ContentItem): string | null {
    if (!data.writes) {
      return (
        "This Hub is not set up to change the commissioning sheet. " +
        "It reads the schedule and nothing else."
      );
    }
    if (!item.sourceRowId) {
      return (
        `"${item.title}" did not come from a sheet row the Hub can address, ` +
        "so it cannot be changed here."
      );
    }
    if (!canWriteSchedule(viewer, item)) {
      return "Only a commissioning manager for this vertical, or an admin, can change the sheet.";
    }
    return null;
  }

  /** What would change, and nothing else. Writes nothing. */
  router.post("/content/:id/schedule/preview", async (req: ViewerRequest, res, next) => {
    try {
      const items = await data.listContent();
      const item = items.find((c) => c.id === req.params.id);
      if (!item) {
        res.status(404).json({ error: `No content item with id "${req.params.id}"` });
        return;
      }
      const no = refuseWrite(req.viewer!, item);
      if (no) {
        res.status(403).json({ error: no });
        return;
      }
      const { changes, refused } = readChanges(req.body);
      const cells = describeChanges(item, changes);
      /*
       * What the row must still say when Apply arrives — in the sheet's own
       * words, not the Hub's.
       *
       * The two vocabularies are not the same: the Hub reads "Writing" as
       * `in-progress`, so comparing its own word against the cell would
       * never match and the check would be decorative. What a person is
       * shown stays in the Hub's words; what is compared against the sheet
       * is read from the sheet.
       */
      const raw = cells.length > 0 ? await data.writes!.current(item.sourceRowId!) : {};
      res.json({
        target: data.writes!.target,
        row: item.sourceRowId,
        changes: cells,
        refused,
        expect: Object.fromEntries(cells.map((c) => [c.column, raw[c.column] ?? ""])),
      });
    } catch (err) {
      next(err);
    }
  });

  /** Apply exactly what the preview described. */
  router.post("/content/:id/schedule", async (req: ViewerRequest, res, next) => {
    const viewer = req.viewer!;
    let item: ContentItem | undefined;
    try {
      const items = await data.listContent();
      item = items.find((c) => c.id === req.params.id);
      if (!item) {
        res.status(404).json({ error: `No content item with id "${req.params.id}"` });
        return;
      }
      const no = refuseWrite(viewer, item);
      if (no) {
        res.status(403).json({ error: no });
        return;
      }

      const body = (req.body ?? {}) as { changes?: unknown; expect?: unknown };
      const { changes, refused } = readChanges(body.changes);
      const cells = describeChanges(item, changes);
      if (refused.length > 0) {
        bad(res, refused.join("; "));
        return;
      }
      if (cells.length === 0) {
        bad(res, "Nothing to change: every field already says that.");
        return;
      }

      /*
       * The client echoes what the preview read off the sheet, and it has to
       * cover every column being changed.
       *
       * That coverage requirement is the load-bearing part. The values
       * themselves are checked against the sheet by the writer, so a client
       * that sends a wrong one simply gets refused — but a client that sent
       * none at all would have nothing checked, and would write over
       * whatever it found. What gets *applied* never comes from the client
       * either way: the changes are re-derived here from the current row.
       */
      const expect = (body.expect ?? {}) as Record<string, string>;
      for (const cell of cells) {
        if (!(cell.column in expect)) {
          bad(
            res,
            `The change to "${cell.column}" was not confirmed. ` +
              "Reload the forecast and review it again.",
          );
          return;
        }
      }

      try {
        await data.writes!.apply(item.sourceRowId!, changes, expect);
      } catch (err) {
        const problem = err instanceof Error ? err.message : "The sheet refused the change.";
        store.logScheduleWrite({
          contentId: item.id,
          sourceRowId: item.sourceRowId!,
          target: data.writes!.target,
          changes: cells,
          byEmail: viewer.email,
          byPersonId: viewer.personId,
          ok: false,
          problem,
        });
        res.status(409).json({ error: problem });
        return;
      }

      const entry = store.logScheduleWrite({
        contentId: item.id,
        sourceRowId: item.sourceRowId!,
        target: data.writes!.target,
        changes: cells,
        byEmail: viewer.email,
        byPersonId: viewer.personId,
        ok: true,
      });
      // The cached read is now wrong, and the page is about to ask for it.
      data.forget?.("content");
      res.json({ applied: entry, item: items.find((c) => c.id === item!.id) });
    } catch (err) {
      next(err);
    }
  });

  /** What the Hub has changed on this forecast, and whether it may change it. */
  router.get("/content/:id/schedule", async (req: ViewerRequest, res, next) => {
    try {
      const items = await data.listContent();
      const item = items.find((c) => c.id === req.params.id);
      if (!item) {
        res.status(404).json({ error: `No content item with id "${req.params.id}"` });
        return;
      }
      const no = refuseWrite(req.viewer!, item);
      res.json({
        canWrite: no === null,
        why: no,
        target: data.writes?.target ?? null,
        fields: WRITABLE_FIELDS,
        history: store.scheduleWrites(item.id),
      });
    } catch (err) {
      next(err);
    }
  });

  // --- Notes on a forecast ----------------------------------------------

  router.get("/content/:id/notes", async (req: ViewerRequest, res, next) => {
    try {
      const items = await data.listContent();
      const item = items.find((c) => c.id === req.params.id);
      if (!item) {
        res.status(404).json({ error: `No content item with id "${req.params.id}"` });
        return;
      }
      res.json({
        notes: store.notesFor(item.id),
        canWrite: canWriteNote(req.viewer!, item),
        aiNotes: aiNotesEnabled(),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/content/:id/notes", async (req: ViewerRequest, res, next) => {
    try {
      const personId = requirePerson(req, res);
      if (!personId) return;
      const items = await data.listContent();
      const item = items.find((c) => c.id === req.params.id);
      if (!item) {
        res.status(404).json({ error: `No content item with id "${req.params.id}"` });
        return;
      }
      if (!canWriteNote(req.viewer!, item)) {
        res.status(403).json({ error: "You can only add notes to your own forecasts." });
        return;
      }
      const body = String(req.body?.body ?? "").trim();
      if (!body) return bad(res, "A note needs some text.");
      if (body.length > 20_000) return bad(res, "That note is too long.");

      const source = req.body?.source === "ai" ? "ai" : "human";
      res.status(201).json(
        store.addNote({
          contentId: item.id,
          authorId: personId,
          body,
          source,
          model: source === "ai" ? String(req.body?.model ?? drafter.model) : undefined,
        }),
      );
    } catch (err) {
      next(err);
    }
  });

  router.patch("/notes/:noteId", async (req: ViewerRequest, res, next) => {
    try {
      const personId = requirePerson(req, res);
      if (!personId) return;
      const note = store.getNote(req.params.noteId);
      if (!note) {
        res.status(404).json({ error: "That note no longer exists." });
        return;
      }
      const items = await data.listContent();
      const item = items.find((c) => c.id === note.contentId);
      if (!item || !canEditNote(req.viewer!, item, note.authorId)) {
        res.status(403).json({ error: "You can only edit your own notes." });
        return;
      }
      const body = String(req.body?.body ?? "").trim();
      if (!body) return bad(res, "A note needs some text.");
      res.json(store.updateNote(note.id, body));
    } catch (err) {
      next(err);
    }
  });

  router.delete("/notes/:noteId", async (req: ViewerRequest, res, next) => {
    try {
      const personId = requirePerson(req, res);
      if (!personId) return;
      const note = store.getNote(req.params.noteId);
      if (!note) {
        res.status(204).end();
        return;
      }
      const items = await data.listContent();
      const item = items.find((c) => c.id === note.contentId);
      if (!item || !canEditNote(req.viewer!, item, note.authorId)) {
        res.status(403).json({ error: "You can only delete your own notes." });
        return;
      }
      store.deleteNote(note.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  /**
   * Drafts a note from the forecast's context. Returns the text rather than
   * saving it, so nothing lands on the forecast until the forecaster keeps it.
   */
  router.post("/content/:id/notes/draft", async (req: ViewerRequest, res, next) => {
    try {
      const personId = requirePerson(req, res);
      if (!personId) return;
      if (!aiNotesEnabled()) {
        res.status(501).json({
          error: "AI notes are not switched on yet — a Gemini key needs setting on the server.",
        });
        return;
      }
      const [items, people] = await Promise.all([data.listContent(), data.listPeople()]);
      const item = items.find((c) => c.id === req.params.id);
      if (!item) {
        res.status(404).json({ error: `No content item with id "${req.params.id}"` });
        return;
      }
      if (!canWriteNote(req.viewer!, item)) {
        res.status(403).json({ error: "You can only draft notes for your own forecasts." });
        return;
      }
      const steer = req.body?.steer ? String(req.body.steer).slice(0, 1000) : undefined;
      const text = await drafter.draft({
        item,
        forecaster: people.find((p) => p.id === item.forecasterId),
        existingNotes: store.notesFor(item.id).map((n) => n.body),
        siblings: items.filter((c) => c.vertical === item.vertical && c.id !== item.id).slice(0, 8),
        steer,
      });
      res.json({ draft: text, model: drafter.model });
    } catch (err) {
      // A model failure is not a server fault — report it as its own thing.
      res.status(502).json({ error: (err as Error).message });
    }
  });

  // --- Details on a forecast --------------------------------------------

  /**
   * Only http(s) links are stored. A research link is rendered as an anchor,
   * so anything else — javascript:, data: — is a way in.
   */
  function cleanLinks(raw: unknown): ResearchLink[] | { error: string } {
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw)) return { error: "Research links must be a list." };
    if (raw.length > 25) return { error: "That is more research links than the page can show." };
    const out: ResearchLink[] = [];
    for (const entry of raw) {
      const url = String((entry as ResearchLink)?.url ?? "").trim();
      if (!url) continue;
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return { error: `"${url.slice(0, 60)}" is not a valid web address.` };
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { error: "Research links have to be http or https addresses." };
      }
      const label = String((entry as ResearchLink)?.label ?? "").trim();
      out.push({ label: (label || parsed.hostname).slice(0, 120), url: parsed.toString() });
    }
    return out;
  }

  /**
   * A trend profile as the page needs it: the sheet's row plus whatever the
   * owner has added on top. The Hub's cover image wins where both have one,
   * because the owner set it more recently than the sync.
   */
  function trendView(trend: TrendProfile, viewer: Viewer, viewerName?: string) {
    const extras = store.trendExtrasFor(trend.profileId);
    return {
      ...trend,
      coverImageUrl: extras?.coverImageUrl ?? trend.coverImageUrl,
      /** True when the image is the owner's rather than the sheet's. */
      coverFromHub: Boolean(extras?.coverImageUrl),
      links: extras?.links ?? [],
      note: extras?.note,
      updatedBy: extras?.updatedBy,
      updatedAt: extras?.updatedAt,
      canWrite: canWriteTrend(viewer, trend, viewerName),
    };
  }

  /**
   * Trend profiles. A forecaster's own by default — "which trends do I own"
   * is the question the page answers — with ?owner= to widen it. The whole
   * database is readable by the team; it is their shared record.
   */
  /**
   * Trend profiles.
   *
   * The sheet credits people by name, so "mine" matches the signed-in
   * person's id or their name in the sheet's own id form. A forecaster opens
   * on their own profiles; a manager on the whole database, which is the view
   * they need. `owners` comes back alongside the rows so the page can offer
   * the real list without a second request.
   */
  router.get("/trends", async (req: ViewerRequest, res, next) => {
    try {
      const viewer = req.viewer!;
      const viewerName = req.viewer?.name;
      const all = await data.listTrends();
      const owner = typeof req.query.owner === "string" ? req.query.owner : undefined;
      const type = typeof req.query.type === "string" ? req.query.type : undefined;
      const call = typeof req.query.call === "string" ? req.query.call : undefined;
      const industry = typeof req.query.industry === "string" ? req.query.industry : undefined;
      const state = typeof req.query.state === "string" ? req.query.state : undefined;
      const needsScore = req.query.needsScore === "1";

      const mine = new Set([viewer.personId, nameId(viewerName)].filter(Boolean));
      const isMine = (t: TrendProfile) =>
        mine.has(t.ownerId) || t.authorIds.some((a) => mine.has(a));

      let rows = all;
      if (owner === "mine" || (!owner && !seesWholeTeam(viewer) && viewer.personId)) {
        rows = rows.filter(isMine);
      } else if (owner && owner !== "all") {
        rows = rows.filter((t) => t.ownerId === owner || t.authorIds.includes(owner));
      }
      if (type) rows = rows.filter((t) => t.types.includes(type));
      if (call) rows = rows.filter((t) => t.call === call);
      if (industry) rows = rows.filter((t) => t.industries.includes(industry));
      if (state === "published") rows = rows.filter((t) => t.published === "Published");
      if (state === "unpublished") rows = rows.filter((t) => t.published !== "Published");
      if (state === "archived") rows = rows.filter((t) => t.editorStatus === "archived");
      if (needsScore) rows = rows.filter((t) => t.missingScore.length > 0);

      const extras = store.allTrendExtras();
      // Owners as the sheet spells them, for the page's filter.
      const owners = [...new Map(all.filter((t) => t.ownerName).map((t) => [t.ownerId, t.ownerName]))]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json({
        owners,
        total: all.length,
        rows: rows
          .map((t) => ({
            ...t,
            // The full opportunity write-up is long and only the profile page
            // shows it, so the list does not carry it.
            opportunity: undefined,
            coverImageUrl: extras[t.profileId]?.coverImageUrl ?? t.coverImageUrl,
            linkCount: extras[t.profileId]?.links.length ?? 0,
            hasNote: Boolean(extras[t.profileId]?.note),
            mine: isMine(t),
            canWrite: canWriteTrend(viewer, t, viewerName),
          }))
          .sort((a, b) => a.title.localeCompare(b.title)),
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Resolve a profile from the path.
   *
   * `TREND_ID` is the short number the team quotes, and it is not unique on
   * the sheet: an archived earlier version of a trend carries the same one as
   * the live profile. So the record is keyed on the Content Editor document
   * id, which is, and the short number still resolves — to the live profile
   * rather than whichever row came first.
   */
  async function findTrend(ref: string): Promise<TrendProfile | undefined> {
    const all = await data.listTrends();
    const byProfile = all.find((t) => t.profileId === ref);
    if (byProfile) return byProfile;
    const byNumber = all.filter((t) => t.id === ref);
    return (
      byNumber.find((t) => t.published === "Published" && t.editorStatus !== "archived") ??
      byNumber.find((t) => t.editorStatus !== "archived") ??
      byNumber[0]
    );
  }

  router.get("/trends/:id", async (req: ViewerRequest, res, next) => {
    try {
      const trend = await findTrend(req.params.id);
      if (!trend) {
        res.status(404).json({ error: `No trend profile with id "${req.params.id}"` });
        return;
      }
      res.json(trendView(trend, req.viewer!, req.viewer?.name));
    } catch (err) {
      next(err);
    }
  });

  /**
   * What the owner adds to a profile: a working note, supporting material,
   * and a cover image for when the sheet has none. The image is rendered as
   * an <img> and the links as anchors, so both go through the same
   * http(s)-only check as a research link.
   */
  router.put("/trends/:id", async (req: ViewerRequest, res, next) => {
    try {
      const personId = requirePerson(req, res);
      if (!personId) return;
      const trend = await findTrend(req.params.id);
      if (!trend) {
        res.status(404).json({ error: `No trend profile with id "${req.params.id}"` });
        return;
      }
      if (!canWriteTrend(req.viewer!, trend, req.viewer?.name)) {
        res.status(403).json({
          error: "Only the profile's owner, a credited author or a commissioning manager can change it.",
        });
        return;
      }

      const links = cleanLinks(req.body?.links);
      if ("error" in links) return bad(res, links.error);

      const coverImageUrl = webAddress(req.body?.coverImageUrl);
      if (coverImageUrl === "bad") {
        return bad(res, "The image address has to be an http or https address.");
      }

      store.setTrendExtras({
        trendId: trend.profileId,
        coverImageUrl,
        links,
        note: req.body?.note ? String(req.body.note).trim().slice(0, 4000) : undefined,
        updatedBy: personId,
      });
      res.json(trendView(trend, req.viewer!, req.viewer?.name));
    } catch (err) {
      next(err);
    }
  });

  /**
   * "bad" rather than undefined for a value that was given and is not usable,
   * so a typo is reported instead of silently dropped.
   */
  function webAddress(raw: unknown): string | undefined | "bad" {
    if (raw === undefined || raw === null || String(raw).trim() === "") return undefined;
    try {
      const parsed = new URL(String(raw).trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "bad";
      return parsed.toString();
    } catch {
      return "bad";
    }
  }

  router.get("/content/:id/details", async (req: ViewerRequest, res, next) => {
    try {
      const items = await data.listContent();
      const item = items.find((c) => c.id === req.params.id);
      if (!item) {
        res.status(404).json({ error: `No forecast with id "${req.params.id}"` });
        return;
      }
      res.json({
        details: store.detailsFor(item.id) ?? null,
        canWrite: canWriteDetails(req.viewer!, item),
      });
    } catch (err) {
      next(err);
    }
  });

  router.put("/content/:id/details", async (req: ViewerRequest, res, next) => {
    try {
      const personId = requirePerson(req, res);
      if (!personId) return;
      const items = await data.listContent();
      const item = items.find((c) => c.id === req.params.id);
      if (!item) {
        res.status(404).json({ error: `No forecast with id "${req.params.id}"` });
        return;
      }
      if (!canWriteDetails(req.viewer!, item)) {
        res.status(403).json({
          error: "Only the forecaster on this forecast or a commissioning manager can change it.",
        });
        return;
      }

      const links = cleanLinks(req.body?.researchLinks);
      if ("error" in links) return bad(res, links.error);

      const yearFrom = optionalYear(req.body?.yearFrom);
      const yearTo = optionalYear(req.body?.yearTo);
      if (yearFrom === "bad" || yearTo === "bad") {
        return bad(res, "Forecast years should be four digits, somewhere between 2000 and 2100.");
      }
      if (yearFrom && yearTo && yearTo < yearFrom) {
        return bad(res, "The last forecast year is before the first.");
      }

      let editorUrl: string | undefined;
      if (req.body?.editorUrl) {
        const raw = String(req.body.editorUrl).trim();
        try {
          const parsed = new URL(raw);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
          editorUrl = parsed.toString();
        } catch {
          return bad(res, "The Content Editor link is not a valid http or https address.");
        }
      }

      res.json(
        store.setDetails({
          contentId: item.id,
          contentType: req.body?.contentType
            ? String(req.body.contentType).trim().slice(0, 80)
            : undefined,
          yearFrom: yearFrom || undefined,
          yearTo: yearTo || undefined,
          editorId: req.body?.editorId ? String(req.body.editorId).trim().slice(0, 80) : undefined,
          editorUrl,
          researchLinks: links,
          updatedBy: personId,
        }),
      );
    } catch (err) {
      next(err);
    }
  });

  // --- KPIs --------------------------------------------------------------

  /**
   * A forecaster's KPIs over a time range.
   *
   * Some are derived from the schedule the Hub already holds, so they are
   * real now; the rest are supplied from elsewhere and say so until the feed
   * is connected.
   */
  router.get("/kpis", async (req: ViewerRequest, res, next) => {
    try {
      const viewer = req.viewer!;
      const [people, content, sessions, definitions, observations] = await Promise.all([
        data.listPeople(),
        data.listContent(),
        data.listSessions(),
        data.listMetrics(),
        data.listMetricObservations(),
      ]);

      const wanted = (req.query.person as string | undefined) ?? viewer.personId ?? "";
      const subject = people.find((p) => p.id === wanted);
      if (!subject) {
        res.status(404).json({ error: "No forecaster to report on." });
        return;
      }
      if (!canViewKpis(viewer, subject)) {
        res.status(403).json({ error: "You can only see your own KPIs." });
        return;
      }

      const range = readRange(req.query as Record<string, string | undefined>);
      if ("error" in range) return bad(res, range.error);

      const results = computeKpis(definitions, {
        personId: subject.id,
        role: subject.forecasterRole,
        from: range.from,
        to: range.to,
        bucket: range.bucket,
        content,
        sessions,
        observations,
        attended: signUps.forPerson(subject.id),
        store,
      });

      res.json({
        person: subject,
        range,
        previous: precedingRange(range.from, range.to),
        metrics: results,
      });
    } catch (err) {
      next(err);
    }
  });

  /** One metric across the team, for a manager comparing like with like. */
  router.get("/kpis/team", async (req: ViewerRequest, res, next) => {
    try {
      const viewer = req.viewer!;
      if (!seesWholeTeam(viewer)) {
        res.status(403).json({ error: "The team comparison is for commissioning managers." });
        return;
      }
      const [people, content, sessions, definitions, observations] = await Promise.all([
        data.listPeople(),
        data.listContent(),
        data.listSessions(),
        data.listMetrics(),
        data.listMetricObservations(),
      ]);
      const definition = definitions.find((m) => m.id === req.query.metric);
      if (!definition) {
        res.status(404).json({ error: "No metric with that id." });
        return;
      }
      const range = readRange(req.query as Record<string, string | undefined>);
      if ("error" in range) return bad(res, range.error);

      const subjects = people.filter(
        (p) => p.role === "forecaster" && canViewKpis(viewer, p),
      );

      res.json({
        definition,
        range,
        rows: compareTeam(
          definition,
          subjects.map((p) => p.id),
          (personId) => ({
            personId,
            role: people.find((p) => p.id === personId)?.forecasterRole,
            from: range.from,
            to: range.to,
            bucket: range.bucket,
            content,
            sessions,
            observations,
            attended: signUps.forPerson(personId),
            store,
          }),
        ).map((row) => ({
          ...row,
          person: subjects.find((p) => p.id === row.personId) ?? null,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  // --- Peer review -------------------------------------------------------

  router.put("/content/:id/peer-review", async (req: ViewerRequest, res, next) => {
    try {
      const personId = requirePerson(req, res);
      if (!personId) return;
      const [items, people] = await Promise.all([data.listContent(), data.listPeople()]);
      const item = items.find((c) => c.id === req.params.id);
      if (!item) {
        res.status(404).json({ error: `No content item with id "${req.params.id}"` });
        return;
      }
      const existing = store.peerReviewFor(item.id);
      if (!canWritePeerReview(req.viewer!, item, existing?.reviewerId)) {
        res.status(403).json({
          error: "Only the forecaster, their reviewer or a commissioning manager can change this.",
        });
        return;
      }

      const reviewerId = String(req.body?.reviewerId ?? "");
      const reviewDate = req.body?.reviewDate;
      if (!people.some((p) => p.id === reviewerId)) {
        return bad(res, "Pick a reviewer from the team.");
      }
      if (reviewerId === item.forecasterId) {
        return bad(res, "A piece cannot be peer reviewed by its own author.");
      }
      if (!isDate(reviewDate)) return bad(res, "A review date is needed (YYYY-MM-DD).");
      if (reviewDate > item.publicationDate) {
        return bad(res, "A peer review after publication is too late to be useful.");
      }

      res.json(
        store.setPeerReview({
          contentId: item.id,
          reviewerId,
          reviewDate,
          arrangedBy: personId,
          note: req.body?.note ? String(req.body.note).slice(0, 2000) : undefined,
        }),
      );
    } catch (err) {
      next(err);
    }
  });

  router.delete("/content/:id/peer-review", async (req: ViewerRequest, res, next) => {
    try {
      const personId = requirePerson(req, res);
      if (!personId) return;
      const items = await data.listContent();
      const item = items.find((c) => c.id === req.params.id);
      if (!item) {
        res.status(404).json({ error: `No content item with id "${req.params.id}"` });
        return;
      }
      const existing = store.peerReviewFor(item.id);
      if (!existing) {
        res.status(204).end();
        return;
      }
      if (!canWritePeerReview(req.viewer!, item, existing.reviewerId)) {
        res.status(403).json({
          error: "Only the forecaster, their reviewer or a commissioning manager can remove this.",
        });
        return;
      }
      store.deletePeerReview(item.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  /** Peer reviews touching this person, either as author or as reviewer. */
  router.get("/my/peer-reviews", async (req: ViewerRequest, res, next) => {
    try {
      const personId = requirePerson(req, res);
      if (!personId) return;
      const items = await data.listContent();
      const byId = new Map(items.map((i) => [i.id, i]));
      const mine = store.allPeerReviews().filter((review) => {
        const item = byId.get(review.contentId);
        return review.reviewerId === personId || item?.forecasterId === personId;
      });
      res.json(
        mine.map((review) => ({
          ...review,
          item: byId.get(review.contentId) ?? null,
          iAmReviewer: review.reviewerId === personId,
        })),
      );
    } catch (err) {
      next(err);
    }
  });

  // --- Personal entries --------------------------------------------------

  router.get("/my/entries", (req: ViewerRequest, res) => {
    const personId = requirePerson(req, res);
    if (!personId) return;
    const { from, to } = req.query as Record<string, string | undefined>;
    res.json(store.entriesFor(personId, from, to));
  });

  router.post("/my/entries", (req: ViewerRequest, res) => {
    const personId = requirePerson(req, res);
    if (!personId) return;
    const title = String(req.body?.title ?? "").trim();
    const { date, endDate, kind, note, contentId } = req.body ?? {};
    if (!title) return bad(res, "Give the entry a title.");
    if (!isDate(date)) return bad(res, "A date is needed (YYYY-MM-DD).");
    if (endDate !== undefined && endDate !== "" && !isDate(endDate)) {
      return bad(res, "The end date is not a valid date.");
    }
    if (isDate(endDate) && endDate < date) return bad(res, "The end date is before the start.");
    const entryKind: EntryKind = ENTRY_KINDS.includes(kind) ? kind : "reminder";

    res.status(201).json(
      store.addEntry({
        personId,
        title: title.slice(0, 200),
        kind: entryKind,
        date,
        endDate: isDate(endDate) ? endDate : date,
        note: note ? String(note).slice(0, 4000) : undefined,
        contentId: contentId ? String(contentId) : undefined,
      }),
    );
  });

  router.patch("/my/entries/:entryId", (req: ViewerRequest, res) => {
    const personId = requirePerson(req, res);
    if (!personId) return;
    const entry = store.getEntry(req.params.entryId);
    if (!entry) {
      res.status(404).json({ error: "That entry no longer exists." });
      return;
    }
    if (!canWriteEntry(req.viewer!, entry.personId)) {
      res.status(403).json({ error: "Personal entries can only be changed by the person who made them." });
      return;
    }
    const { title, date, endDate, kind, note } = req.body ?? {};
    if (date !== undefined && !isDate(date)) return bad(res, "The date is not valid.");
    if (endDate !== undefined && endDate !== "" && !isDate(endDate)) {
      return bad(res, "The end date is not valid.");
    }
    res.json(
      store.updateEntry(entry.id, {
        ...(title !== undefined ? { title: String(title).trim().slice(0, 200) } : {}),
        ...(isDate(date) ? { date } : {}),
        ...(isDate(endDate) ? { endDate } : {}),
        ...(ENTRY_KINDS.includes(kind) ? { kind } : {}),
        ...(note !== undefined ? { note: String(note).slice(0, 4000) } : {}),
      }),
    );
  });

  router.delete("/my/entries/:entryId", (req: ViewerRequest, res) => {
    const personId = requirePerson(req, res);
    if (!personId) return;
    const entry = store.getEntry(req.params.entryId);
    if (!entry) {
      res.status(204).end();
      return;
    }
    if (!canWriteEntry(req.viewer!, entry.personId)) {
      res.status(403).json({ error: "Personal entries can only be removed by the person who made them." });
      return;
    }
    store.deleteEntry(entry.id);
    res.status(204).end();
  });

  // --- Diary and schedule ------------------------------------------------

  router.get("/events", async (req, res, next) => {
    try {
      const { type, person, from, to } = req.query as Record<string, string | undefined>;
      const [events, people] = await Promise.all([data.listEvents(), data.listPeople()]);
      const forPerson = person ? people.find((p) => p.id === person) : undefined;
      const filtered = events
        .filter((event) => (type ? event.type === type : true))
        .filter((event) => eventAppliesTo(event, forPerson))
        .filter((event) => overlaps(event, from, to))
        .sort((a, b) => a.startDate.localeCompare(b.startDate));
      res.json(filtered);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Everything one page of the Hub needs in a single round trip. Personal
   * entries and peer reviews are always the signed-in person's own — nobody
   * sees a colleague's reminders.
   */
  router.get("/schedule", async (req: ViewerRequest, res, next) => {
    try {
      const viewer = req.viewer!;
      const { from, to, forecaster } = req.query as Record<string, string | undefined>;
      const [items, events, people] = await Promise.all([
        data.listContent(),
        data.listEvents(),
        data.listPeople(),
      ]);
      const forPerson = forecaster ? people.find((p) => p.id === forecaster) : undefined;
      const reviews = new Map(store.allPeerReviews().map((r) => [r.contentId, r]));
      const byId = new Map(items.map((i) => [i.id, i]));

      const myReviews = viewer.personId
        ? [...reviews.values()]
            .filter((review) => {
              const item = byId.get(review.contentId);
              return (
                review.reviewerId === viewer.personId || item?.forecasterId === viewer.personId
              );
            })
            .map((review) => ({
              ...review,
              item: byId.get(review.contentId) ?? null,
              iAmReviewer: review.reviewerId === viewer.personId,
            }))
        : [];

      res.json({
        people,
        content: items
          .filter((item) => (forecaster ? item.forecasterId === forecaster : true))
          .filter((item) => {
            if (from && item.publicationDate < from && item.submissionDate < from) return false;
            if (to && item.submissionDate > to && item.publicationDate > to) return false;
            return true;
          })
          .sort((a, b) => a.submissionDate.localeCompare(b.submissionDate))
          .map((item) => ({ ...item, peerReview: reviews.get(item.id) ?? null })),
        events: events
          .filter((event) => eventAppliesTo(event, forPerson))
          .filter((event) => overlaps(event, from, to))
          .sort((a, b) => a.startDate.localeCompare(b.startDate)),
        entries: viewer.personId ? store.entriesFor(viewer.personId, from, to) : [],
        peerReviews: myReviews,
      });
    } catch (err) {
      next(err);
    }
  });

  // --- Sessions ----------------------------------------------------------

  router.get("/sessions", async (req, res, next) => {
    try {
      const { kind, when, person } = req.query as Record<string, string | undefined>;
      const [sessions, people] = await Promise.all([data.listSessions(), data.listPeople()]);
      const known = new Set(people.map((p) => p.id));
      const all = signUps.all();

      const decorated = sessions
        .filter((s) => (kind ? s.kind === kind : true))
        .filter((s) => {
          if (when === "past") return s.date < TODAY();
          if (when === "upcoming") return s.date >= TODAY();
          return true;
        })
        .map((session) => {
          const seats = all[session.id] ?? { going: [], waiting: [] };
          const going = seats.going.filter((id) => known.has(id));
          const waiting = seats.waiting.filter((id) => known.has(id));
          return {
            ...session,
            going,
            waiting,
            placesLeft:
              session.capacity === null ? null : Math.max(0, session.capacity - going.length),
            full: session.capacity !== null && going.length >= session.capacity,
          };
        })
        .filter((s) => (person ? s.going.includes(person) || s.waiting.includes(person) : true))
        .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

      res.json(decorated);
    } catch (err) {
      next(err);
    }
  });

  router.get("/sessions/:id", async (req, res, next) => {
    try {
      const sessions = await data.listSessions();
      const session = sessions.find((s) => s.id === req.params.id);
      if (!session) {
        res.status(404).json({ error: `No session with id "${req.params.id}"` });
        return;
      }
      const seats = signUps.get(session.id);
      res.json({
        ...session,
        ...seats,
        placesLeft:
          session.capacity === null ? null : Math.max(0, session.capacity - seats.going.length),
        full: session.capacity !== null && seats.going.length >= session.capacity,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/sessions/:id/sign-up", async (req: ViewerRequest, res, next) => {
    try {
      const me = requirePerson(req, res);
      if (!me) return;
      const personId = String(req.body?.personId ?? me);
      if (!canSignUpAs(req.viewer!, personId)) {
        res.status(403).json({ error: "You can only sign yourself up." });
        return;
      }
      const sessions = await data.listSessions();
      const session = sessions.find((s) => s.id === req.params.id);
      if (!session) {
        res.status(404).json({ error: `No session with id "${req.params.id}"` });
        return;
      }
      const outcome = signUps.add(session, personId);
      if (outcome.result === "closed") {
        res.status(409).json({ error: "This session is not taking sign-ups." });
        return;
      }
      res.json({ ...outcome, signUps: signUps.get(session.id) });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/sessions/:id/sign-up", async (req: ViewerRequest, res, next) => {
    try {
      const me = requirePerson(req, res);
      if (!me) return;
      const personId = String((req.query.personId as string | undefined) ?? req.body?.personId ?? me);
      if (!canSignUpAs(req.viewer!, personId)) {
        res.status(403).json({ error: "You can only change your own sign-up." });
        return;
      }
      const sessions = await data.listSessions();
      const session = sessions.find((s) => s.id === req.params.id);
      if (!session) {
        res.status(404).json({ error: `No session with id "${req.params.id}"` });
        return;
      }
      const outcome = signUps.remove(session, personId);
      res.json({ ...outcome, signUps: signUps.get(session.id) });
    } catch (err) {
      next(err);
    }
  });

  // --- Calendar feed -----------------------------------------------------

  /** Rotating the token invalidates any feed already subscribed elsewhere. */
  router.post("/my/calendar/rotate", (req: ViewerRequest, res) => {
    const personId = requirePerson(req, res);
    if (!personId) return;
    res.json({ calendarFeed: `/api/calendar/${store.rotateCalendarToken(personId)}.ics` });
  });

  return router;
}

/** Years are four digits; anything else is a typo worth reporting. */
function optionalYear(raw: unknown): number | "bad" | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return "bad";
  return year;
}

/**
 * Time range for the KPI pages. Presets keep the common cases to one click;
 * from/to takes over when someone wants a specific window.
 */
function readRange(
  query: Record<string, string | undefined>,
):
  | { preset: string; from: string; to: string; bucket: Bucket; label: string }
  | { error: string } {
  const today = TODAY();
  const preset = query.range ?? "last-12-months";

  const startOfMonth = (offset: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1))
      .toISOString()
      .slice(0, 10);
  };
  const quarterStart = (offset: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    const q = Math.floor(d.getUTCMonth() / 3) + offset;
    return new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1)).toISOString().slice(0, 10);
  };
  const dayBefore = (date: string) =>
    new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

  switch (preset) {
    case "this-quarter":
      return { preset, from: quarterStart(0), to: today, bucket: "month", label: "This quarter" };
    case "last-quarter": {
      const from = quarterStart(-1);
      return { preset, from, to: dayBefore(quarterStart(0)), bucket: "month", label: "Last quarter" };
    }
    case "year-to-date":
      return {
        preset,
        from: `${today.slice(0, 4)}-01-01`,
        to: today,
        bucket: "month",
        label: "Year to date",
      };
    case "last-12-months":
      return {
        preset,
        from: startOfMonth(-11),
        to: today,
        bucket: "month",
        label: "Last 12 months",
      };
    case "last-6-months":
      return { preset, from: startOfMonth(-5), to: today, bucket: "month", label: "Last 6 months" };
    case "custom": {
      const { from, to } = query;
      if (!isDate(from) || !isDate(to)) {
        return { error: "A custom range needs a start and an end date (YYYY-MM-DD)." };
      }
      if (to < from) return { error: "The end of the range is before the start." };
      // Long windows get quarters, so the bars stay readable.
      const days = Math.round(
        (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
      );
      return {
        preset,
        from,
        to,
        bucket: days > 550 ? "quarter" : "month",
        label: `${from} to ${to}`,
      };
    }
    default:
      return { error: `Unknown range "${preset}".` };
  }
}

/**
 * The calendar feed sits outside the router above because Google fetches it
 * without a session — the token in the URL is the credential.
 */
export function createFeedRouter(
  data: DataSource,
  store: HubStore,
  signUps: SignUps,
): Router {
  const router = Router();

  // Unauthenticated on purpose: load balancers and uptime checks call this.
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", source: data.name, aiNotes: aiNotesEnabled() });
  });

  router.get("/calendar/:token.ics", async (req, res, next) => {
    try {
      const token = String(req.params.token ?? "").replace(/\.ics$/, "");
      const personId = store.personForToken(token);
      if (!personId) {
        res.status(404).type("text/plain").send("No calendar for that address.");
        return;
      }
      const [people, content, events, sessions] = await Promise.all([
        data.listPeople(),
        data.listContent(),
        data.listEvents(),
        data.listSessions(),
      ]);
      const person = people.find((p) => p.id === personId);
      if (!person) {
        res.status(404).type("text/plain").send("No calendar for that address.");
        return;
      }
      const byId = new Map(content.map((c) => [c.id, c]));
      const peerReviews = store
        .allPeerReviews()
        .map((review) => ({ review, item: byId.get(review.contentId) }))
        .filter((row) => row.item)
        .filter(
          (row) => row.review.reviewerId === personId || row.item!.forecasterId === personId,
        )
        .map((row) => ({
          review: row.review,
          item: row.item!,
          counterpart: people.find(
            (p) =>
              p.id ===
              (row.review.reviewerId === personId ? row.item!.forecasterId : row.review.reviewerId),
          ),
        }));

      const feed = buildFeed({
        person,
        content,
        events,
        sessions,
        signedUpTo: signUps.forPerson(personId),
        entries: store.entriesFor(personId),
        peerReviews,
        baseUrl: process.env.PUBLIC_URL ?? `${req.protocol}://${req.get("host")}`,
      });

      res
        .type("text/calendar; charset=utf-8")
        .set("Cache-Control", "public, max-age=1800")
        .set("Content-Disposition", `inline; filename="forecasters-hub-${person.id}.ics"`)
        .send(feed);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
