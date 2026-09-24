import type { Db } from "../db.js";
import type { AccessRow } from "../auth.js";
import type {
  CalendarEvent,
  ContentItem,
  ContentWriter,
  DataSource,
  DirectoryPerson,
  KnowledgeSession,
  MetricDefinition,
  MetricObservation,
  Person,
  SessionSignUps,
  TrendProfile,
  WritableFields,
} from "../types.js";

/**
 * The schedule, read from a local copy that Smartsheet fills.
 *
 * Smartsheet stays the system of record and this changes nothing about that.
 * The subbing teams and everybody else who works in the sheets go on working
 * in them; what moves is only where the Hub *reads* from, and it reads from a
 * copy it pulls on a timer. Three things follow, and they are the whole
 * argument for it:
 *
 * - **Reads stop costing a round trip to another company's API.** A page that
 *   needs the schedule, the team and the calendar makes three sheet requests
 *   today, each a second or so, rate-limited per token and shared by everyone
 *   signed in.
 * - **A Smartsheet outage stops being a Hub outage.** The copy is still there
 *   and still readable; the freshness page says how old it is, which is the
 *   honest version of carrying on.
 * - **The schedule becomes something SQL can reach**, alongside the notes and
 *   sign-ups that already live in the same database.
 *
 * What it is emphatically not is a second place to write. Every write still
 * goes to Smartsheet through the upstream source's own writer, unchanged and
 * un-wrapped where it matters — see `writes` below. A mirror that accepted
 * writes would be a fork, and a fork nobody had agreed to: the subbing teams
 * would go on editing a sheet that no longer said what the Hub said.
 *
 * The cost, stated rather than buried: a read can be up to
 * `MIRROR_SYNC_MINUTES` old. That is the trade being made, it is why the age
 * is on the freshness page, and it is why the preview that guards a write
 * does not come from here.
 */

/**
 * The ten reads, named once.
 *
 * Held as data rather than as ten methods that each name themselves, because
 * every one of them does the same four things — pull, replace, count, read
 * back — and ten copies of that is ten places for one of them to drift.
 */
const KINDS = [
  "content",
  "people",
  "events",
  "sessions",
  "signups",
  "access",
  "metrics",
  "observations",
  "trends",
  "directory",
] as const;

export type MirrorKind = (typeof KINDS)[number];

/** What each pull is called on the freshness page, in the Hub's words. */
const LABELS: Record<MirrorKind, string> = {
  content: "The commissioning schedule, mirrored",
  people: "The team, mirrored",
  events: "Leave, holidays and shows, mirrored",
  sessions: "The workshop programme, mirrored",
  signups: "Workshop sign-ups, mirrored",
  access: "Who may sign in, mirrored",
  metrics: "The KPI definitions, mirrored",
  observations: "KPI readings, mirrored",
  trends: "Trend profiles, mirrored",
  directory: "The content directory, mirrored",
};

/**
 * Sign-ups are a map keyed by session, not a list.
 *
 * Kept whole in one row rather than split into one row per session, because
 * nothing here queries inside it and splitting it would mean reassembling the
 * map on every read to hand back the shape the interface asks for.
 */
const WHOLE: MirrorKind[] = ["signups"];

/** What one pull did, for the log line and the report. */
export interface SyncResult {
  kind: MirrorKind;
  rows: number;
  ok: boolean;
  /** Why it failed, when it did. Never the driver's message unprompted. */
  why?: string;
}

/**
 * The tables.
 *
 * One table for every kind, holding each row as the JSON the source handed
 * over, rather than a table per kind with a column per field. A column per
 * field was the other answer and is wrong twice: the schema here only ever
 * grows — `CREATE TABLE IF NOT EXISTS` on boot is the whole migration story —
 * and this is a mirror of somebody else's sheet, which gains a column
 * whenever they add one. Columns would mean an `ALTER TABLE` the moment a
 * manager adds a heading, on a schema that by policy never alters.
 *
 * `run_id` is what makes a pull atomic without a transaction. The `Db` here
 * is a pool on Postgres, so `BEGIN` and the statements after it are not
 * promised the same connection and a hand-rolled transaction would silently
 * not be one. Instead each pull writes a fresh run, and only when every row
 * is in does one `UPDATE` move the kind's pointer to it. A pull that dies
 * half-way leaves the previous copy serving, untouched; the rows it wrote are
 * orphans, and the next successful pull clears them.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS mirror_rows (
  kind TEXT NOT NULL,
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (kind, run_id, seq)
);
CREATE TABLE IF NOT EXISTS mirror_runs (
  kind TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  read_at TEXT NOT NULL,
  row_count INTEGER NOT NULL
);
`;

export class MirrorSource implements DataSource {
  readonly name: string;

  constructor(
    private readonly upstream: DataSource,
    private readonly db: Db,
  ) {
    this.name = `${upstream.name} (mirrored in ${db.kind})`;
  }

  /** The tables, if they are not there yet. */
  async init(): Promise<void> {
    await this.db.exec(SCHEMA);
  }

  /**
   * Writing, which goes upstream and never here.
   *
   * The upstream writer is handed back with `current` untouched. That matters
   * more than it looks: `current` is the read the preview and the apply
   * compare against, and answering it from the mirror would compare the
   * sheet against a copy of itself taken up to ten minutes ago — which is a
   * concurrency check that passes while somebody else's edit is sitting
   * unread in the sheet. The one thing wrapped is `apply`, and only to pull
   * the schedule again afterwards so the page that reloads shows the change
   * rather than the copy that predates it.
   */
  get writes(): ContentWriter | undefined {
    const inner = this.upstream.writes;
    if (!inner) return undefined;
    return {
      target: inner.target,
      current: (rowId: string) => inner.current(rowId),
      apply: async (rowId: string, changes: WritableFields, expect: Record<string, string>) => {
        await inner.apply(rowId, changes, expect);
        /*
         * Awaited, not left running. A write whose refresh is still in
         * flight when the page reloads shows the manager the old value and
         * tells them the change did not take — so the cost of waiting for
         * one sheet read is worth paying here.
         */
        this.upstream.forget?.("content");
        await this.pull("content");
      },
    };
  }

  /**
   * Turn writing on, if the upstream can.
   *
   * Asked for as a capability rather than reached through a type test, so
   * that wrapping a source — which is what this class is — does not quietly
   * turn writing off at boot.
   */
  async enableWrites(): Promise<string> {
    const up = this.upstream as DataSource & { enableWrites?: () => Promise<string> };
    if (up.enableWrites) return up.enableWrites();
    return up.writes?.target ?? "off";
  }

  /**
   * Pull every kind, and say what happened to each.
   *
   * One failure does not stop the rest. The sheets are separate reads against
   * a rate-limited API and a token that cannot see the KPI sheet is a reason
   * for the KPI page to be stale, not for the schedule to be.
   */
  async sync(): Promise<SyncResult[]> {
    const out: SyncResult[] = [];
    for (const kind of KINDS) out.push(await this.pull(kind));
    return out;
  }

  /**
   * The same sync, but never twice at once.
   *
   * A sync takes about ten seconds against real sheets, which is long enough
   * for somebody to press the button again — and two running together would
   * make fourteen more requests against a rate-limited API to reach the
   * answer one of them already had. The second caller waits for the first and
   * is given its result, which is also the honest thing to show them: the
   * copy really is as fresh as that.
   *
   * Held as a promise rather than a boolean flag, because a flag answers
   * "is one running" and this needs to answer "what did it find".
   */
  private inFlight: Promise<SyncResult[]> | null = null;

  refresh(): Promise<SyncResult[]> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.sync().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /**
   * One kind: read it upstream, write a new run, move the pointer.
   *
   * The order is the whole safety property. Nothing a reader can see changes
   * until the last statement, so an interrupted pull is invisible rather than
   * half-applied.
   */
  async pull(kind: MirrorKind): Promise<SyncResult> {
    let rows: unknown[];
    try {
      rows = await this.fromUpstream(kind);
    } catch (err) {
      return { kind, rows: 0, ok: false, why: (err as Error).message };
    }

    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    let seq = 0;
    for (const row of rows) {
      await this.db.run("INSERT INTO mirror_rows (kind, run_id, seq, body) VALUES (?, ?, ?, ?)", [
        kind,
        runId,
        seq++,
        JSON.stringify(row),
      ]);
    }

    /*
     * `ON CONFLICT … DO UPDATE` rather than a read followed by an insert or
     * an update: `INSERT OR REPLACE` is SQLite's alone, and the read-then-
     * decide version is two statements that two syncs could interleave.
     */
    await this.db.run(
      `INSERT INTO mirror_runs (kind, run_id, read_at, row_count) VALUES (?, ?, ?, ?)
       ON CONFLICT (kind) DO UPDATE SET run_id = ?, read_at = ?, row_count = ?`,
      [kind, runId, new Date().toISOString(), rows.length, runId, new Date().toISOString(), rows.length],
    );

    // Whatever the previous run left, and any run that died before it. Last,
    // and deliberately not fatal: orphaned rows are wasted space, and losing
    // a pull that otherwise worked over a failed tidy-up would be worse.
    try {
      await this.db.run("DELETE FROM mirror_rows WHERE kind = ? AND run_id <> ?", [kind, runId]);
    } catch {
      /* Space, not correctness. The next pull tries again. */
    }

    return { kind, rows: rows.length, ok: true };
  }

  /** When each kind was last pulled, for the freshness page. */
  async freshness(): Promise<
    { key: string; label: string; readAt: string; ageMs: number; cacheMs: number }[]
  > {
    const rows = await this.db.all("SELECT kind, read_at, row_count FROM mirror_runs ORDER BY kind");
    const at = Date.now();
    return rows.map((r) => {
      const readAt = String(r.read_at);
      return {
        key: `mirror:${String(r.kind)}`,
        label: LABELS[String(r.kind) as MirrorKind] ?? String(r.kind),
        readAt,
        ageMs: at - new Date(readAt).getTime(),
        cacheMs: syncEveryMs(),
      };
    });
  }

  /**
   * Drop the upstream's own cache.
   *
   * Nothing to forget here — the mirror is not a cache of a read, it is the
   * read — but the source underneath keeps one, and a stale answer there
   * would be pulled straight into the next sync.
   */
  forget(key: "content" | "events" | "people" | "trends"): void {
    this.upstream.forget?.(key);
  }

  /** Whether a kind has ever been pulled. A Hub with none refuses to start. */
  async synced(): Promise<MirrorKind[]> {
    const rows = await this.db.all("SELECT kind FROM mirror_runs");
    return rows.map((r) => String(r.kind) as MirrorKind);
  }

  listContent(): Promise<ContentItem[]> {
    return this.read<ContentItem>("content");
  }

  listPeople(): Promise<Person[]> {
    return this.read<Person>("people");
  }

  listEvents(): Promise<CalendarEvent[]> {
    return this.read<CalendarEvent>("events");
  }

  listSessions(): Promise<KnowledgeSession[]> {
    return this.read<KnowledgeSession>("sessions");
  }

  listAccess(): Promise<AccessRow[]> {
    return this.read<AccessRow>("access");
  }

  listMetrics(): Promise<MetricDefinition[]> {
    return this.read<MetricDefinition>("metrics");
  }

  listMetricObservations(): Promise<MetricObservation[]> {
    return this.read<MetricObservation>("observations");
  }

  listTrends(): Promise<TrendProfile[]> {
    return this.read<TrendProfile>("trends");
  }

  listDirectory(): Promise<DirectoryPerson[]> {
    return this.read<DirectoryPerson>("directory");
  }

  async listSignUps(): Promise<Record<string, SessionSignUps>> {
    const whole = await this.read<Record<string, SessionSignUps>>("signups");
    return whole[0] ?? {};
  }

  /**
   * Read a kind back, in the order it was pulled.
   *
   * `ORDER BY seq` and nothing else, because `seq` is unique within a run by
   * its own primary key — this is the one ordering in the Hub that needs no
   * tie-break. Preserving the order at all is the point: the sheets are kept
   * in an order the team chose, and a schedule that reshuffles itself between
   * two page loads reads as a bug in the Hub.
   */
  private async read<T>(kind: MirrorKind): Promise<T[]> {
    const run = await this.db.get("SELECT run_id FROM mirror_runs WHERE kind = ?", [kind]);
    /*
     * Never pulled is an error, not an empty list.
     *
     * An empty schedule looks exactly like a real schedule with nothing in
     * it — the page renders, says there is nothing on, and nobody has any
     * reason to doubt it. Refusing is louder and therefore kinder. This is
     * only reachable when a sync has never succeeded for this kind, because
     * boot refuses to serve at all without one.
     */
    if (!run) {
      throw new Error(
        `The mirror has no copy of ${LABELS[kind]?.replace(", mirrored", "") ?? kind} yet — it has not synced since this database was created.`,
      );
    }
    const rows = await this.db.all(
      "SELECT body FROM mirror_rows WHERE kind = ? AND run_id = ? ORDER BY seq",
      [kind, String(run.run_id)],
    );
    return rows.map((r) => JSON.parse(String(r.body)) as T);
  }

  /** The upstream read for a kind, kept beside the list that names them. */
  private async fromUpstream(kind: MirrorKind): Promise<unknown[]> {
    switch (kind) {
      case "content":
        return this.upstream.listContent();
      case "people":
        return this.upstream.listPeople();
      case "events":
        return this.upstream.listEvents();
      case "sessions":
        return this.upstream.listSessions();
      case "signups":
        // Whole, in one row. See WHOLE above.
        return [await this.upstream.listSignUps()];
      case "access":
        return this.upstream.listAccess();
      case "metrics":
        return this.upstream.listMetrics();
      case "observations":
        return this.upstream.listMetricObservations();
      case "trends":
        return this.upstream.listTrends();
      case "directory":
        return this.upstream.listDirectory();
    }
  }
}

/**
 * How often the mirror pulls, in milliseconds.
 *
 * Ten minutes by default. The schedule changes a few times a day, the
 * calendar less often than that, and the number that matters is not how fresh
 * this keeps things — it is how long somebody would stare at a date they know
 * was corrected before doubting the Hub. Ten is comfortably inside that and
 * costs ten sheet reads an hour against a rate limit measured in hundreds.
 *
 * Exported so the freshness page can say what the number is rather than
 * leaving somebody to guess from two timestamps.
 */
export function syncEveryMs(): number {
  const minutes = Number(process.env.MIRROR_SYNC_MINUTES ?? 10);
  if (!Number.isFinite(minutes) || minutes < 1) return 10 * 60_000;
  return minutes * 60_000;
}

/** Named so the list above is not the only thing that knows them. */
export const MIRROR_KINDS: readonly MirrorKind[] = KINDS;
export { WHOLE as MIRROR_WHOLE_KINDS };
