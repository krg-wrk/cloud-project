import type { Db } from "../db.js";
import type { DataSource } from "../types.js";
import { MirrorSource } from "./mirrorSource.js";
import { SeedSource } from "./seedSource.js";
import { SmartsheetSource } from "./smartsheetSource.js";

/**
 * Chooses the data source from the environment so the same app can run on seed
 * data locally and against the live sheets in a deployed environment.
 *
 * DATA_SOURCE=seed        (default) built-in sample schedule, no credentials
 * DATA_SOURCE=mirror      reads a local copy of the sheets, pulled on a timer.
 *   Smartsheet stays the system of record and every write still goes there;
 *   this only moves where reads are served from. Takes all the Smartsheet
 *   settings below, plus MIRROR_SYNC_MINUTES. See mirrorSource.ts.
 * DATA_SOURCE=smartsheet  reads the commissioning sheets, requires:
 *   SMARTSHEET_TOKEN, SMARTSHEET_CONTENT_SHEET_ID,
 *   SMARTSHEET_EVENTS_SHEET_ID, SMARTSHEET_PEOPLE_SHEET_ID
 *
 *   SMARTSHEET_EVENTS_SHEET_ID and SMARTSHEET_CONTENT_SHEET_ID each take a
 *   comma-separated list, so holidays, leave and shows can stay in the
 *   separate sheets a team already keeps, and a schedule kept one sheet per
 *   year reads as one schedule. Writing is refused while the content
 *   schedule spans several sheets — see enableWrites for why.
 *
 * SMARTSHEET_API          the API base, for a non-US Smartsheet region
 *   (api.smartsheet.eu for a European account). Defaults to the US one.
 *
 * SMARTSHEET_WRITE=1      also lets commissioning managers change five
 *   columns of the commissioning sheet from the Hub. Off by default: this is
 *   the only thing the Hub does that edits somebody else's system.
 *
 * SEED_WRITES=1           turns the same screens on against the sample data,
 *   for developing them without a Smartsheet token. Nothing leaves the
 *   process and nothing survives a restart. Ignored unless DATA_SOURCE=seed.
 */
/**
 * One environment variable, however many sheets are behind it.
 *
 * `SMARTSHEET_EVENTS_SHEET_ID=111,222,333` because a team's calendar is
 * usually several sheets — holidays in one, leave in another, shows in a
 * third — and the Hub reads Smartsheet as it is kept rather than asking for
 * it to be rearranged. A second variable per sheet was the alternative and
 * would have meant a new deploy every time somebody starts a fourth.
 *
 * Whitespace and empty entries are dropped so a trailing comma, or a list
 * broken across lines in an editor, is not a sheet id of "" that reports as a
 * 404 nobody can place. Duplicates go too: the same id twice would put every
 * holiday on the calendar twice.
 */
export function sheetIds(raw: string | undefined): string[] {
  return [...new Set((raw ?? "").split(",").map((id) => id.trim()).filter(Boolean))];
}

/**
 * `db` is needed only by `DATA_SOURCE=mirror`, which keeps its copy of the
 * schedule in the same database as everything else the Hub owns. Optional so
 * that the demo builder — which reads the seed or the sheets and has no
 * database at all — can go on calling this with no arguments.
 */
export function createDataSource(db?: Db): DataSource {
  const kind = process.env.DATA_SOURCE ?? "seed";

  /*
   * The mirror is Smartsheet underneath, and says so.
   *
   * Written as a wrapper over whatever `DATA_SOURCE` would otherwise have
   * built rather than as a tenth source of its own, because the thing being
   * changed is where reads are served from — not where the data comes from.
   * The upstream keeps its sheet ids, its token, its regional endpoint and,
   * crucially, its writer.
   */
  if (kind === "mirror") {
    if (!db) {
      throw new Error("DATA_SOURCE=mirror needs a database — it keeps its copy of the schedule there");
    }
    const upstream = createUpstream(process.env.MIRROR_UPSTREAM ?? "smartsheet");
    return new MirrorSource(upstream, db);
  }

  return createUpstream(kind);
}

/** Everything that is not the mirror, which is everything that reads a source. */
function createUpstream(kind: string): DataSource {
  if (kind === "smartsheet") {
    const token = process.env.SMARTSHEET_TOKEN;
    const contentSheetIds = sheetIds(process.env.SMARTSHEET_CONTENT_SHEET_ID);
    if (!token || contentSheetIds.length === 0) {
      throw new Error(
        "DATA_SOURCE=smartsheet needs SMARTSHEET_TOKEN and SMARTSHEET_CONTENT_SHEET_ID",
      );
    }
    return new SmartsheetSource({
      token,
      contentSheetIds,
      /*
       * Writing to the managers' live sheet needs saying out loud. Nothing
       * about a read-only deployment changes; a Hub without this reports no
       * write capability at all and the API refuses before it builds a
       * request.
       */
      allowWrites: process.env.SMARTSHEET_WRITE === "1",
      eventsSheetIds: sheetIds(process.env.SMARTSHEET_EVENTS_SHEET_ID),
      peopleSheetId: process.env.SMARTSHEET_PEOPLE_SHEET_ID,
      directorySheetId: process.env.SMARTSHEET_DIRECTORY_SHEET_ID,
      sessionsSheetId: process.env.SMARTSHEET_SESSIONS_SHEET_ID,
      signUpsSheetId: process.env.SMARTSHEET_SIGNUPS_SHEET_ID,
      accessSheetId: process.env.SMARTSHEET_ACCESS_SHEET_ID,
      metricsSheetId: process.env.SMARTSHEET_METRICS_SHEET_ID,
      observationsSheetId: process.env.SMARTSHEET_KPI_SHEET_ID,
      trendsSheetId: process.env.SMARTSHEET_TRENDS_SHEET_ID,
    });
  }

  if (kind !== "seed") {
    throw new Error(`Unknown DATA_SOURCE "${kind}" (expected "seed", "smartsheet" or "mirror")`);
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
   * Read everything again, and drop what was being held.
   *
   * The second half is the half that matters and is easy to leave out. A
   * refresh that reloads the mirror but keeps this cache is a button that
   * appears to do nothing for up to a minute: the copy underneath is new, the
   * page asks this object, and this object confidently answers with what it
   * was holding before. Cleared wholesale rather than key by key, because
   * `forget` takes four of the ten keys and a refresh means all of them.
   */
  async refresh(): Promise<{ kind: string; rows: number; ok: boolean; why?: string }[]> {
    const below = this.inner as DataSource & {
      refresh?: () => Promise<{ kind: string; rows: number; ok: boolean; why?: string }[]>;
    };
    if (!below.refresh) return [];
    const results = await below.refresh();
    this.cache.clear();
    return results;
  }

  /**
   * When each thing was last actually read from the source.
   *
   * The Hub caches, the sheets are edited by people, and the trend extract
   * runs on somebody else's schedule — so "how old is what I am looking at"
   * is a real question with no answer anywhere on screen. This is the answer
   * for the reads; the pages report the rest.
   */
  async freshness(): Promise<
    { key: string; readAt: string; ageMs: number; cacheMs: number; label?: string }[]
  > {
    const at = Date.now();
    const mine = [...this.cache.entries()].map(([key, hit]) => ({
      key,
      readAt: new Date(hit.at).toISOString(),
      ageMs: at - hit.at,
      cacheMs: this.ttlMs,
    }));
    /*
     * And whatever the source underneath knows, which for the mirror is when
     * it last pulled each sheet. Two ages rather than one, on purpose: this
     * cache is sixty seconds old and the copy behind it may be ten minutes
     * old, and reporting only the first would answer "how fresh is this"
     * with the smaller and more flattering of the two numbers.
     *
     * Asynchronous for the same reason — the mirror's answer is a query, not
     * a map lookup.
     */
    const below = this.inner as DataSource & {
      freshness?: () => Promise<{ key: string; readAt: string; ageMs: number; cacheMs: number; label?: string }[]>;
    };
    return [...mine, ...((await below.freshness?.()) ?? [])];
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

  listDirectory() {
    return this.through("directory", () => this.inner.listDirectory());
  }

  listTrends() {
    return this.through("trends", () => this.inner.listTrends());
  }

  listMetricObservations() {
    return this.through("observations", () => this.inner.listMetricObservations());
  }
}
