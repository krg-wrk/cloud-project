import type { AccessRow } from "../auth.js";
import type {
  CalendarEvent,
  ContentItem,
  DataSource,
  KnowledgeSession,
  MetricDefinition,
  MetricObservation,
  Person,
  SessionSignUps,
} from "../types.js";
import {
  access,
  content,
  events,
  metricObservations,
  metrics,
  people,
  sessions,
  signUps,
} from "./seed.js";

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

  async listSessions(): Promise<KnowledgeSession[]> {
    return sessions;
  }

  async listSignUps(): Promise<Record<string, SessionSignUps>> {
    return signUps;
  }

  async listAccess(): Promise<AccessRow[]> {
    return access;
  }

  async listMetrics(): Promise<MetricDefinition[]> {
    return metrics;
  }

  async listMetricObservations(): Promise<MetricObservation[]> {
    return metricObservations;
  }
}
