import { Router } from "express";
import type { SignUpStore } from "./signUps.js";
import type { CalendarEvent, ContentItem, DataSource, Person } from "./types.js";

/** Deadlines are calendar days, so "today" is a date string, read per request. */
const TODAY = () => new Date().toISOString().slice(0, 10);

/**
 * Filters are read from the query string so that every view in the Hub has a
 * URL you can paste to someone and have them see the same thing.
 */
interface ContentQuery {
  forecaster?: string;
  manager?: string;
  vertical?: string;
  type?: string;
  season?: string;
  status?: string;
  /** Filter on publication date by default, or submission date. */
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

/** Public holidays apply to a region; leave and workshops belong to people. */
function eventAppliesTo(event: CalendarEvent, person: Person | undefined): boolean {
  if (!person) return true;
  if (event.personId) return event.personId === person.id;
  if (event.region && event.region !== "All") return event.region === person.region;
  return true;
}

export function createApiRouter(data: DataSource, store: SignUpStore): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ status: "ok", source: data.name });
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

  router.get("/content", async (req, res, next) => {
    try {
      const items = await data.listContent();
      const query = req.query as ContentQuery;
      const field = query.dateField === "submissionDate" ? "submissionDate" : "publicationDate";
      const filtered = items
        .filter((item) => matchesContent(item, query))
        .sort((a, b) => a[field].localeCompare(b[field]));
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
      res.json(item);
    } catch (err) {
      next(err);
    }
  });

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
   * Everything one page of the Hub needs in a single round trip: the schedule,
   * the events around it, and the people to label them with.
   */
  router.get("/schedule", async (req, res, next) => {
    try {
      const { from, to, forecaster } = req.query as Record<string, string | undefined>;
      const [items, events, people] = await Promise.all([
        data.listContent(),
        data.listEvents(),
        data.listPeople(),
      ]);
      const forPerson = forecaster ? people.find((p) => p.id === forecaster) : undefined;
      res.json({
        people,
        content: items
          .filter((item) => (forecaster ? item.forecasterId === forecaster : true))
          .filter((item) => {
            if (from && item.publicationDate < from && item.submissionDate < from) return false;
            if (to && item.submissionDate > to && item.publicationDate > to) return false;
            return true;
          })
          .sort((a, b) => a.submissionDate.localeCompare(b.submissionDate)),
        events: events
          .filter((event) => eventAppliesTo(event, forPerson))
          .filter((event) => overlaps(event, from, to))
          .sort((a, b) => a.startDate.localeCompare(b.startDate)),
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Workshops and knowledge-sharing sessions, each with its sign-ups
   * attached so a card can be drawn without a second request.
   */
  router.get("/sessions", async (req, res, next) => {
    try {
      const { kind, when, person } = req.query as Record<string, string | undefined>;
      const [sessions, people] = await Promise.all([data.listSessions(), data.listPeople()]);
      const known = new Set(people.map((p) => p.id));

      const decorated = sessions
        .filter((s) => (kind ? s.kind === kind : true))
        .filter((s) => {
          if (when === "past") return s.date < TODAY();
          if (when === "upcoming") return s.date >= TODAY();
          return true;
        })
        .map((session) => {
          const signUps = store.get(session.id);
          // Drop anyone who has since left the team.
          const going = signUps.going.filter((id) => known.has(id));
          const waiting = signUps.waiting.filter((id) => known.has(id));
          return {
            ...session,
            going,
            waiting,
            placesLeft: session.capacity === null ? null : Math.max(0, session.capacity - going.length),
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
      const signUps = store.get(session.id);
      res.json({
        ...session,
        ...signUps,
        placesLeft:
          session.capacity === null ? null : Math.max(0, session.capacity - signUps.going.length),
        full: session.capacity !== null && signUps.going.length >= session.capacity,
      });
    } catch (err) {
      next(err);
    }
  });

  /** Take a place, or join the waitlist when the session is full. */
  router.post("/sessions/:id/sign-up", async (req, res, next) => {
    try {
      const { session, personId, error } = await resolveSignUp(req.params.id, req.body?.personId);
      if (error) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      const outcome = store.add(session!, personId!);
      if (outcome.result === "closed") {
        res.status(409).json({ error: "This session is not taking sign-ups." });
        return;
      }
      res.json({ ...outcome, signUps: store.get(session!.id) });
    } catch (err) {
      next(err);
    }
  });

  /** Give up a place; the first person waiting takes it. */
  router.delete("/sessions/:id/sign-up", async (req, res, next) => {
    try {
      const personIdParam = (req.query.personId as string | undefined) ?? req.body?.personId;
      const { session, personId, error } = await resolveSignUp(req.params.id, personIdParam);
      if (error) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      const outcome = store.remove(session!, personId!);
      res.json({ ...outcome, signUps: store.get(session!.id) });
    } catch (err) {
      next(err);
    }
  });

  /** Shared validation for the two sign-up routes. */
  async function resolveSignUp(sessionId: string, personId: unknown) {
    if (typeof personId !== "string" || !personId) {
      return { error: { status: 400, message: "personId is required" } };
    }
    const [sessions, people] = await Promise.all([data.listSessions(), data.listPeople()]);
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) {
      return { error: { status: 404, message: `No session with id "${sessionId}"` } };
    }
    if (!people.some((p) => p.id === personId)) {
      return { error: { status: 400, message: `No person with id "${personId}"` } };
    }
    return { session, personId };
  }

  return router;
}
