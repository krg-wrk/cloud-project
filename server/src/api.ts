import { Router, type Response } from "express";
import { aiNotesEnabled, type NoteDrafter } from "./ai.js";
import {
  canEditNote,
  canSignUpAs,
  canWriteEntry,
  canWriteNote,
  canWritePeerReview,
  requirePerson,
  seesWholeTeam,
  type ViewerRequest,
} from "./auth.js";
import { buildFeed } from "./ics.js";
import type { SignUps } from "./signUps.js";
import type { EntryKind, HubStore } from "./store.js";
import type { CalendarEvent, ContentItem, DataSource, Person } from "./types.js";

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

export function createApiRouter(
  data: DataSource,
  store: HubStore,
  signUps: SignUps,
  drafter: NoteDrafter,
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
        res.status(403).json({ error: "You can only add notes to your own pieces." });
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
   * saving it, so nothing lands on the piece until the forecaster keeps it.
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
        res.status(403).json({ error: "You can only draft notes for your own pieces." });
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
