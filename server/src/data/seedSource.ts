import type { CalendarEvent, ContentItem, DataSource, Person } from "../types.js";
import { content, events, people } from "./seed.js";

/**
 * In-memory data source used for the POC and for local development, so the Hub
 * runs with no credentials and no network access.
 */
export class SeedSource implements DataSource {
  readonly name = "seed";

  async listPeople(): Promise<Person[]> {
    return people;
  }

  async listContent(): Promise<ContentItem[]> {
    return content;
  }

  async listEvents(): Promise<CalendarEvent[]> {
    return events;
  }
}
