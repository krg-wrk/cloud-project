import type { DataSource } from "../types.js";
import { SeedSource } from "./seedSource.js";
import { SmartsheetSource } from "./smartsheetSource.js";

/**
 * Chooses the data source from the environment so the same app can run on seed
 * data locally and against the live sheets in a deployed environment.
 *
 * DATA_SOURCE=seed        (default) built-in sample schedule, no credentials
 * DATA_SOURCE=smartsheet  reads the commissioning sheets, requires:
 *   SMARTSHEET_TOKEN, SMARTSHEET_CONTENT_SHEET_ID,
 *   SMARTSHEET_EVENTS_SHEET_ID, SMARTSHEET_PEOPLE_SHEET_ID
 *
 * SMARTSHEET_API          the API base, for a non-US Smartsheet region
 *   (api.smartsheet.eu for a European account). Defaults to the US one.
 *
 * SMARTSHEET_WRITE=1      also lets commissioning managers change five
 *   columns of the commissioning sheet from the Hub. Off by default: this is
 *   the only thing the Hub does that edits somebody else's system.
 */
export function createDataSource(): DataSource {
  const kind = process.env.DATA_SOURCE ?? "seed";

  if (kind === "smartsheet") {
    const token = process.env.SMARTSHEET_TOKEN;
    const contentSheetId = process.env.SMARTSHEET_CONTENT_SHEET_ID;
    if (!token || !contentSheetId) {
      throw new Error(
        "DATA_SOURCE=smartsheet needs SMARTSHEET_TOKEN and SMARTSHEET_CONTENT_SHEET_ID",
      );
    }
    return new SmartsheetSource({
      token,
      contentSheetId,
      /*
       * Writing to the managers' live sheet needs saying out loud. Nothing
       * about a read-only deployment changes; a Hub without this reports no
       * write capability at all and the API refuses before it builds a
       * request.
       */
      allowWrites: process.env.SMARTSHEET_WRITE === "1",
      eventsSheetId: process.env.SMARTSHEET_EVENTS_SHEET_ID,
      peopleSheetId: process.env.SMARTSHEET_PEOPLE_SHEET_ID,
      sessionsSheetId: process.env.SMARTSHEET_SESSIONS_SHEET_ID,
      signUpsSheetId: process.env.SMARTSHEET_SIGNUPS_SHEET_ID,
      accessSheetId: process.env.SMARTSHEET_ACCESS_SHEET_ID,
      metricsSheetId: process.env.SMARTSHEET_METRICS_SHEET_ID,
      observationsSheetId: process.env.SMARTSHEET_KPI_SHEET_ID,
      trendsSheetId: process.env.SMARTSHEET_TRENDS_SHEET_ID,
    });
  }

  if (kind !== "seed") {
    throw new Error(`Unknown DATA_SOURCE "${kind}" (expected "seed" or "smartsheet")`);
  }
  return new SeedSource();
}

/**
 * Sheet reads are slow and the schedule changes a few times a day at most, so
 * responses are cached briefly. Long enough to keep page loads snappy, short
 * enough that a corrected date shows up while someone is still looking.
 */
export class CachedDataSource implements DataSource {
  readonly name: string;
  private cache = new Map<string, { at: number; value: unknown }>();

  constructor(
    private readonly inner: DataSource,
    private readonly ttlMs = 60_000,
  ) {
    this.name = `${inner.name} (cached ${Math.round(ttlMs / 1000)}s)`;
  }

  /** Whatever the source underneath will accept back, unchanged. */
  get writes() {
    return this.inner.writes;
  }

  /** When the Hub has just changed something, the cached copy is wrong. */
  forget(key: "content" | "events" | "people" | "trends"): void {
    this.cache.delete(key);
    this.inner.forget?.(key);
  }

  /**
   * When each thing was last actually read from the source.
   *
   * The Hub caches, the sheets are edited by people, and the trend extract
   * runs on somebody else's schedule — so "how old is what I am looking at"
   * is a real question with no answer anywhere on screen. This is the answer
   * for the reads; the pages report the rest.
   */
  freshness(): { key: string; readAt: string; ageMs: number; cacheMs: number }[] {
    const at = Date.now();
    return [...this.cache.entries()].map(([key, hit]) => ({
      key,
      readAt: new Date(hit.at).toISOString(),
      ageMs: at - hit.at,
      cacheMs: this.ttlMs,
    }));
  }

  private async through<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value as T;
    const value = await load();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  listPeople() {
    return this.through("people", () => this.inner.listPeople());
  }

  listContent() {
    return this.through("content", () => this.inner.listContent());
  }

  listEvents() {
    return this.through("events", () => this.inner.listEvents());
  }

  listSessions() {
    return this.through("sessions", () => this.inner.listSessions());
  }

  listSignUps() {
    return this.through("signups", () => this.inner.listSignUps());
  }

  listAccess() {
    return this.through("access", () => this.inner.listAccess());
  }

  listMetrics() {
    return this.through("metrics", () => this.inner.listMetrics());
  }

  listTrends() {
    return this.through("trends", () => this.inner.listTrends());
  }

  listMetricObservations() {
    return this.through("observations", () => this.inner.listMetricObservations());
  }
}
