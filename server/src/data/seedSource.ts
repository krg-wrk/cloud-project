import type { AccessRow } from "../auth.js";
import { fileRows, readDirectory } from "../directory.js";
import type {
  CalendarEvent,
  DirectoryPerson,
  ContentItem,
  DataSource,
  KnowledgeSession,
  MetricDefinition,
  MetricObservation,
  Person,
  SessionSignUps,
  TrendProfile,
} from "../types.js";
import { directoryRows } from "./directory.js";
import {
  access,
  content,
  events,
  metricObservations,
  metrics,
  people,
  sessions,
  signUps,
  trends,
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

  /*
   * Read once: the rows never change while the process is up, and the reader
   * does real work — splitting multi-value cells, making ids, deciding who is
   * away — that there is no reason to repeat on every request.
   */
  private directory = readDirectory(fileRows() ?? directoryRows);

  async listDirectory(): Promise<DirectoryPerson[]> {
    return this.directory;
  }

  async listMetrics(): Promise<MetricDefinition[]> {
    return metrics;
  }

  async listMetricObservations(): Promise<MetricObservation[]> {
    return metricObservations;
  }

  async listTrends(): Promise<TrendProfile[]> {
    return trends;
  }
}
