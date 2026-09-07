import { Router } from "express";
import type { CalendarEvent, ContentItem, DataSource, Person } from "./types.js";

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

export function createApiRouter(data: DataSource): Router {
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

  return router;
}
