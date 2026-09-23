import type { AccessRow, Role } from "../auth.js";
import {
  TREND_CALLS,
  TREND_INDUSTRIES,
  TREND_TYPES,
  metrics as seedMetrics,
} from "./seed.js";
import { readDirectory } from "../directory.js";
import type {
  CalendarEvent,
  DirectoryPerson,
  CellChange,
  ContentItem,
  ContentType,
  ContentWriter,
  DataSource,
  EventType,
  KnowledgeSession,
  MetricDefinition,
  MetricObservation,
  Ownership,
  Person,
  SessionKind,
  SessionSignUps,
  Status,
  TrendProfile,
  Vertical,
  WritableFields,
} from "../types.js";
import { hubAccessFor } from "../auth.js";
import { WRITABLE_FIELDS } from "../types.js";

/**
 * Where the Smartsheet API lives.
 *
 * Configurable because Smartsheet is regional: a European account is served
 * from api.smartsheet.eu, and pointing a UK team's Hub at the US endpoint
 * either fails or moves their data across a border neither of them chose.
 * It is also how the write path is exercised against a stub, since the real
 * API is unreachable from the environment this was built in.
 */
const API = (process.env.SMARTSHEET_API ?? "https://api.smartsheet.com/2.0").replace(/\/$/, "");

/**
 * How long a sheet's version number stands for before it is asked again.
 *
 * Shorter than the response cache above it on purpose: this is the thing
 * that notices an edit at all, so it should notice sooner than the caller
 * thinks to ask.
 */
const STAMP_TTL_MS = 30_000;

/**
 * How a column is named in a source sheet.
 *
 * A bare string is the title, which is what nearly every entry is and what
 * every non-Smartsheet source has to use: a Google Sheet's header row is its
 * only identity, and a database column has a name and no id.
 *
 * The object form adds the Smartsheet column id as a second way to find the
 * same column. The title is still tried first, deliberately: it is the form
 * that works on every sheet, so a schedule kept one sheet per year resolves
 * in 2027 by the name it shares with 2026 rather than by an id that only ever
 * existed in one of them. The id is the safety net underneath — when somebody
 * renames the column, the title stops matching and the id still finds it, so
 * the field goes on reading instead of quietly emptying every row.
 *
 * Trying the id first was the other order and is worse: an id recorded from
 * one sheet has no meaning in another, and the first thing it would do is
 * make the 2027 sheet resolve against 2026's columns.
 */
export type ColumnRef = string | { title: string; id?: string };

/** The title half of a reference, for the places that need a plain heading. */
export function titleOf(ref: ColumnRef): string {
  return typeof ref === "string" ? ref : ref.title;
}

/** Every field of a group as the plain title the flattened row is keyed by. */
export function titles<T extends Record<string, ColumnRef>>(group: T): { [K in keyof T]: string } {
  const out = {} as { [K in keyof T]: string };
  for (const key of Object.keys(group) as (keyof T)[]) out[key] = titleOf(group[key]);
  return out;
}

/**
 * Which heading in *this* sheet answers each field, where that differs from
 * the mapping.
 *
 * Only the renames come back: a field whose title is present needs no help,
 * and a field found by neither is left out so the caller reads an empty cell
 * and the doctor reports it. Exported because a rename is worth saying out
 * loud rather than silently working — `--columns` tells somebody the mapping
 * has drifted while it is still cheap to correct.
 */
export function renamedColumns<T extends Record<string, ColumnRef>>(
  group: T,
  columns: { id: number; title: string }[],
): { field: string; mapped: string; actual: string }[] {
  const present = new Set(columns.map((c) => c.title));
  const byId = new Map(columns.map((c) => [String(c.id), c.title]));
  const out: { field: string; mapped: string; actual: string }[] = [];
  for (const [field, ref] of Object.entries(group)) {
    if (typeof ref === "string" || !ref.id) continue;
    if (present.has(ref.title)) continue;
    const actual = byId.get(ref.id);
    if (actual) out.push({ field, mapped: ref.title, actual });
  }
  return out;
}

/**
 * Column titles as they appear in the source sheets. Change these to match the
 * real sheets rather than touching the mapping code below.
 */
export const COLUMNS = {
  /*
   * An empty title is a field the team has said it does not keep, rather
   * than one nobody has got to yet. It reads as absent, and `--columns`
   * passes over it instead of reporting a column that was never wanted.
   */
  content: {
    id: "Forecast ID",
    title: "Title",
    type: "Report Type",
    vertical: "Vertical",
    /** The horizon a forecast points at — the team plans by it, not by season. */
    forecastHorizon: "Forecast Horizon",
    forecastCategory: "Forecast Category",
    forecaster: "Owner",
    /** Recorded outside the schedule. */
    manager: "",
    submissionDate: "Sub Date",
    publicationDate: "Live Date",
    /** When the copy actually landed — what the timeliness KPIs measure. */
    submittedOn: "Content Submitted",
    status: "Status",
    /** The Hub keeps its own notes, threaded and attributed. */
    notes: "",
    /** Sole / Co-owned / Byline / Freelance. Recorded outside the schedule. */
    ownership: "",
    /** Everyone credited. Recorded outside the schedule. */
    contributors: "",
  },
  events: {
    type: "Type",
    title: "Title",
    person: "Owner",
    /**
     * The country, which the region is worked out from — see `regionFor`.
     * `region` is the fallback for a sheet that records one directly and no
     * country, which is how the trade shows sheet is kept.
     */
    country: "Country",
    region: "Region",
    startDate: "Start",
    endDate: "End",
    location: "Country",
    notes: "",
  },
  people: {
    name: "Name",
    email: "Email",
    /** Director / Head Of / Senior / Strategist — what the benchmarks key on. */
    role: "Role",
    team: "Team",
    department: "Department",
    vertical: "",
    /** A country here too, turned into a region the same way. */
    region: "Country",
    managerEmail: "Manager Email",
    /** What somebody may do in the Hub. Blank reads as an ordinary forecaster. */
    hubAccess: "Hub Access",
    /**
     * Employment status, read only for whether somebody is still here. The
     * reason never leaves the server: "Maternity Leave" and "Medical Leave"
     * sit in this column beside "Full-Time", and a Hub that published either
     * would have taken something told to HR and shown it to two hundred
     * people. Only "Inactive" changes anything, and it changes it to no.
     */
    status: "Status",
  },
  sessions: {
    id: "Event ID",
    title: "Title",
    kind: "Type",
    /** The workshop lead. */
    host: "Host",
    /** Everybody tagged into it — the Owner column is a multi-contact list. */
    attendees: "Owner",
    /** "All" here means the whole team, whatever anybody's country says. */
    department: "Department",
    guest: "",
    startDate: "Start",
    endDate: "End",
    startTime: "",
    endTime: "",
    location: "Country",
    capacity: "Capacity",
    signUpsOpen: "Sign-Ups",
    required: "",
    summary: "",
    topics: "",
    recapUrl: "",
  },
  signUps: {
    session: "Session ID",
    person: "Person",
    state: "State",
  },
  /**
   * The access sheet. One row per exception — managers, admins, leavers.
   * Team members absent from it get an ordinary forecaster's view.
   */
  access: {
    email: "Email",
    name: "Name",
    role: "Role",
    verticals: "Verticals",
    active: "Active",
  },
  /** The KPIs being tracked. One row per metric. */
  metrics: {
    id: "Metric ID",
    label: "Label",
    unit: "Unit",
    better: "Better",
    group: "Group",
    target: "Target",
    description: "Description",
  },
  /**
   * The TFDB trend profile sheet — Snowflake-linked, so the column names are
   * the warehouse's own. Only the ones the Hub shows are listed.
   */
  trends: {
    profileId: "ID",
    editorLink: "LINK",
    title: "TITLE",
    id: "TREND_ID",
    slug: "TREND_URL_SLUG",
    published: "Published",
    editorStatus: "RE Status",
    publishedLink: "PUBLISHED LINK",
    publishedOn: "Publish Date",
    authors: "AUTHORS",
    owner: "Owner",
    hashtags: "HASHTAGS",
    types: "TREND_TYPES",
    activeFrom: "START_DATE",
    activeTo: "END_DATE",
    industries: "TAGGED_PRODUCTS",
    call: "MORE_LABELS",
    coverImage: "MAIN_COVER_IMAGE_URL",
    description: "Trend Description",
    needToKnow: "NEED_TO_KNOW",
    opportunity: "MAIN_OPPORTUNITY",
    strategies: "NUMBER_OF_STRATEGIES",
    proofPoints: "NUMBER_OF_PROOF_POINTS",
    needingScore: "Industries Needing Scores",
    scored: "Industries Scored",
    missingScore: "Industries Missing Score",
    latestScoreMonth: "Latest Score Month",
    lastSynced: "Last Synced",
  },
  /**
   * The label columns, by the group they belong to. Each cell is a run of
   * label names separated by spaces, so they are matched against the known
   * vocabulary rather than split naively.
   */
  trendLabels: {
    Generations: "GENERATION_LABELS",
    Markets: "MARKET_LABELS",
    Regions: "REGION_LABELS",
    "Age Ranges": "AGE_RANGES_LABELS",
    Personas: "PERSONAS_LABELS",
    Emotions: "EMOTIONS_LABELS",
    CMF: "CMF_LABELS",
    "Design & Aesthetics": "DESIGN_AESTHETICS_LABELS",
    Packaging: "PACKAGING_LABELS",
    Sustainability: "SUSTAINABILITY_LABELS",
    "Ingredients & Formulation": "INGREDIENTS_FORMULATION_LABELS",
  },
  /** Readings for the supplied metrics. One row per person per period. */
  observations: {
    metric: "Metric ID",
    person: "Person",
    date: "Date",
    value: "Value",
  },
} as const;

/** One contact in a cell: Smartsheet gives the name and the address apart. */
interface SmartsheetContact {
  name?: string;
  email?: string;
}

interface SmartsheetCell {
  columnId: number;
  value?: string | number | boolean;
  displayValue?: string;
  /**
   * Only present when the sheet is asked for at level 2. A multi-contact or
   * multi-picklist cell has no `value` at all, and its `displayValue` is the
   * values joined with commas — so this is the only faithful reading of one.
   */
  objectValue?: SmartsheetContact & { objectType?: string; values?: SmartsheetContact[] };
}

interface SmartsheetRow {
  id: number;
  rowNumber: number;
  cells: SmartsheetCell[];
}

interface SmartsheetSheet {
  id: number;
  name: string;
  /** `options` is a picklist column's allowed values, which a write must use. */
  columns: { id: number; title: string; type?: string; options?: string[] }[];
  rows: SmartsheetRow[];
  /**
   * Incremented by Smartsheet on every change to the sheet, and the same
   * number `/sheets/{id}/version` reports on its own. Read from the body
   * rather than asked for again, so a copy is filed under the version it
   * actually is.
   */
  version?: number;
}

/** A sheet row flattened to { "Column Title": "value" }. */
/**
 * A row flattened to its column titles, with the people kept as people.
 *
 * Every cell reads as a string because that is what the mapping code wants,
 * and a contact column flattens to the names Smartsheet shows — "Allyson
 * Rees, Hannah Allan" for a piece two people own. Read as one value that is
 * nobody: `personId` turned it into "allyson-rees-hannah-allan", a person
 * who does not exist, so the work belonged to neither of them and the access
 * check refused them both.
 *
 * So the addresses are kept beside the string, under `_people`. Addresses
 * rather than names because an address is the identity the directory is
 * keyed on and the one thing that cannot be spelled two ways — the same
 * person is "Ellie Bull" in one sheet and "Ellie  Bull" in another, and an
 * id built from either has to be the same id.
 */
type FlatRow = Record<string, string> & { _people?: Record<string, string[]> };

export interface SmartsheetConfig {
  token: string;
  /**
   * Usually one, but a team that starts a fresh sheet each year has several.
   *
   * Read as one schedule, the way the calendar reads holidays and leave from
   * wherever they are kept. Writing is the reason this is not simply the same
   * change twice: the commissioning sheet is the one the Hub writes back to,
   * and a row id is unique within its sheet rather than across sheets — so
   * with several configured, `enableWrites` refuses rather than let an edit to
   * a 2027 row land on whatever 2026 row happens to share its id.
   */
  contentSheetIds: string[];
  /**
   * Whether the Hub may write to the commissioning sheet.
   *
   * Off unless switched on deliberately, because this is the managers' live
   * sheet. With it off the source reports no write capability at all and the
   * API refuses before it gets anywhere near a request.
   */
  allowWrites?: boolean;
  /**
   * How long a sheet's version number stands for before it is asked again.
   *
   * Here rather than only as a constant so a test can set it to nothing and
   * watch the version decide, which is otherwise a thing that can only be
   * proved by waiting half a minute.
   */
  stampTtlMs?: number;
  /**
   * Several, because a team keeps its calendar the way it already keeps it.
   *
   * Holidays in one sheet, leave in another, shows in a third is the ordinary
   * arrangement, and the Hub is a reading surface over Smartsheet rather than
   * a reason to reorganise it. Asking somebody to merge three sheets into one
   * so the Hub can read them puts the tool's convenience ahead of the system
   * of record, which is the wrong way round. A Smartsheet report across the
   * three would have been the other answer and does not work: a report is
   * served from /reports and this reads /sheets.
   */
  eventsSheetIds?: string[];
  peopleSheetId?: string;
  sessionsSheetId?: string;
  /** One row per person per session: Session ID, Person, State. */
  signUpsSheetId?: string;
  accessSheetId?: string;
  metricsSheetId?: string;
  observationsSheetId?: string;
  trendsSheetId?: string;
  /** The Content Directory: who is on which team, and what they know about. */
  directorySheetId?: string;
}

/**
 * Reads the commissioning sheets through the Smartsheet API. The team never
 * signs in to Smartsheet — the Hub reads on their behalf with a single
 * service token, which is why every response is normalised into our own
 * domain model here rather than passed through raw.
 */
/**
 * Writing back to the commissioning sheet.
 *
 * This is the one place in the Hub that changes somebody else's system, so
 * every constraint is in the type rather than in the caller's good manners:
 *
 * - It only exists when `allowWrites` is on. A source with it off has no
 *   `writes` at all, so there is no object to call.
 * - It writes only the five columns in `WRITABLE_FIELDS`, addressed by the
 *   titles in `COLUMNS.content`. A field not in that list has no column to
 *   write to and is dropped before a request is built.
 * - It re-reads the row first and refuses if the sheet no longer matches what
 *   the change was worked out against. Somebody else's edit is not ours to
 *   discard, and a stale confirmation is exactly how that happens.
 * - A status is written as one of the *sheet's own* picklist options, chosen
 *   by normalising each option and matching it to the status wanted — so the
 *   Hub never invents a value the column would reject.
 */
class SmartsheetContentWriter implements ContentWriter {
  readonly target: string;

  constructor(
    private readonly source: SmartsheetSource,
    private readonly sheetId: string,
    sheetName: string,
  ) {
    this.target = `${sheetName} (sheet ${sheetId})`;
  }

  /** The sheet, the row, and the writable cells as the sheet words them. */
  private async readRow(rowId: string) {
    const sheet = await this.source.contentSheet();
    const row = sheet.rows.find((r) => String(r.id) === rowId);
    if (!row) {
      throw new Error(
        `Row ${rowId} is no longer on ${this.target}. It may have been deleted or moved.`,
      );
    }
    const byId = new Map(sheet.columns.map((col) => [col.id, col]));
    const writable = new Set<string>(WRITABLE_FIELDS.map((f) => COLUMNS.content[f]));
    const current: Record<string, string> = {};
    for (const cell of row.cells) {
      const col = byId.get(cell.columnId);
      if (!col || !writable.has(col.title)) continue;
      current[col.title] = cell.displayValue ?? (cell.value != null ? String(cell.value) : "");
    }
    return { sheet, row, current };
  }

  async current(rowId: string): Promise<Record<string, string>> {
    return (await this.readRow(rowId)).current;
  }

  async apply(
    rowId: string,
    changes: WritableFields,
    expect: Record<string, string>,
  ): Promise<void> {
    const c = COLUMNS.content;
    const { sheet, current } = await this.readRow(rowId);
    const byTitle = new Map(sheet.columns.map((col) => [col.title, col]));

    /*
     * The row has to be what it was when the change was described. Without
     * this, two managers looking at the same forecast quietly overwrite each
     * other and neither is told.
     */
    for (const [title, was] of Object.entries(expect)) {
      const now = current[title] ?? "";
      if (now.trim() !== was.trim()) {
        throw new Error(
          `"${title}" on ${this.target} now reads "${now || "(empty)"}" rather than ` +
            `"${was || "(empty)"}". Somebody changed the row — reload and look again.`,
        );
      }
    }

    const cells: { columnId: number; value: string | null }[] = [];
    for (const field of WRITABLE_FIELDS) {
      if (!(field in changes)) continue;
      const column = byTitle.get(c[field]);
      // A column the sheet does not have is not an error worth stopping for,
      // but it is worth saying: the write simply cannot reach it.
      if (!column) {
        throw new Error(
          `${this.target} has no "${c[field]}" column, so ${field} cannot be written. ` +
            `Add the column, or correct COLUMNS.content.`,
        );
      }
      const value = changes[field];
      if (field === "status") {
        cells.push({ columnId: column.id, value: statusOptionFor(column, value as Status) });
      } else {
        cells.push({ columnId: column.id, value: value ? String(value) : null });
      }
    }
    if (cells.length === 0) return;

    const res = await fetch(`${API}/sheets/${this.sheetId}/rows`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.source.tokenForWrite}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{ id: Number(rowId), cells }]),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(
        `Smartsheet refused the change to ${this.target}: ${res.status} ` +
          `${body.message ?? res.statusText}`,
      );
    }
  }
}

/**
 * The word to write in a status column.
 *
 * The sheet's own picklist is the authority: each option is normalised the
 * same way reading normalises it, and the one that lands on the status we
 * want is what gets written. A column with no picklist takes a plain label.
 */
function statusOptionFor(
  column: { options?: string[] },
  status: Status,
): string {
  const match = (column.options ?? []).find((option) => normaliseStatus(option) === status);
  return match ?? STATUS_LABELS[status];
}

/** What to write when the column has no picklist to choose from. */
export const STATUS_LABELS: Record<Status, string> = {
  "not-started": "Not Started",
  "in-progress": "In Progress",
  submitted: "Submitted",
  "in-review": "In Review",
  published: "Published",
  "at-risk": "At Risk",
};

/**
 * Whether a sheet already in hand can be served again without reading it.
 *
 * Smartsheet increments a sheet's version on every change to it, so a
 * version that has not moved means the copy held is the copy the API would
 * send back. Everything else answers no: a sheet never read, a sheet whose
 * version could not be had, a check that failed. The asymmetry is on
 * purpose. Reading again costs a second; serving a schedule somebody has
 * already corrected costs them the afternoon they spend working from it.
 *
 * A version rather than a modified time, though the sheet reports both. The
 * timestamp is only accurate to the second, so an edit landing in the same
 * second as a read would leave a stamp that matches and a sheet that does
 * not. A counter cannot do that.
 */
export function sheetIsCurrent(
  held: number | undefined,
  current: number | undefined,
): boolean {
  if (held === undefined || current === undefined) return false;
  return held === current;
}

export class SmartsheetSource implements DataSource {
  readonly name = "smartsheet";
  readonly writes?: ContentWriter;

  /*
   * What has been read, and the version it was read at.
   *
   * Drawing the fixed pages reads thirteen sheets and takes about seven
   * seconds, and most of them — the directory above all — change perhaps
   * weekly. Asking each one for its version costs a few bytes and answers
   * "has this moved", so the usual refresh reads nothing at all. The
   * alternative was simply to cache for longer, which buys the same speed by
   * showing people staler data; a schedule exists to be current, so that is
   * the wrong end to save at.
   */
  private readonly held = new Map<string, { version: number; sheet: SmartsheetSheet }>();
  private readonly versions = new Map<string, { at: number; version?: number }>();

  constructor(private readonly config: SmartsheetConfig) {}

  /** A write of the Hub's own makes both the copy and its version wrong. */
  forget(): void {
    this.held.clear();
    this.versions.clear();
  }

  /**
   * What version Smartsheet holds of one sheet.
   *
   * Asked per sheet, of the sheets this deployment is pointed at, rather
   * than by listing the account. Listing works and was how this started, but
   * it returns all hundred and twenty-six sheets the token can see to answer
   * a question about thirteen — twice as slow, and it means a token narrowed
   * to the Hub's own folder would stop being able to answer it. What the Hub
   * is configured to read is exactly what it should need to ask about.
   *
   * A version that cannot be had is remembered as absent for the usual
   * interval: the sheet is then read the long way, which is the slow path
   * rather than the wrong one, and one failed call rather than one per read.
   */
  private async versionOf(sheetId: string): Promise<number | undefined> {
    const now = Date.now();
    const ttl = this.config.stampTtlMs ?? STAMP_TTL_MS;
    const known = this.versions.get(sheetId);
    if (known && now - known.at < ttl) return known.version;
    let version: number | undefined;
    try {
      const res = await fetch(`${API}/sheets/${sheetId}/version`, {
        headers: { Authorization: `Bearer ${this.config.token}` },
      });
      if (res.ok) {
        const body = (await res.json()) as { version?: number };
        if (typeof body.version === "number") version = body.version;
      }
    } catch {
      // Unreachable is not the same as unchanged, and no version says so.
    }
    this.versions.set(sheetId, { at: now, version });
    return version;
  }

  /** The token, for the writer only. Nothing else needs it from outside. */
  get tokenForWrite(): string {
    return this.config.token;
  }

  /**
   * The commissioning sheet as the API returns it, for the writer.
   *
   * Singular, and only ever reached with one sheet configured: everything
   * that calls it is behind the writer, and `enableWrites` refuses to build
   * a writer at all when the schedule spans several sheets.
   *
   * Always read afresh. This is the read the preview and the apply compare
   * against, and a cached answer would turn "has somebody else changed this
   * row" into a question asked of the Hub's own memory.
   */
  contentSheet(): Promise<SmartsheetSheet> {
    return this.fetchSheet(this.config.contentSheetIds[0], { fresh: true });
  }

  /**
   * Turn writing on, once.
   *
   * Called at boot rather than in the constructor because it reads the sheet
   * to learn its name and confirm the token can see it — so a misconfigured
   * write flag fails at startup with a message, rather than the first time a
   * manager presses Apply.
   */
  async enableWrites(): Promise<string> {
    if (!this.config.allowWrites) return "off";
    /*
     * Refused outright while the schedule spans several sheets.
     *
     * A write addresses a row by `sourceRowId`, and a Smartsheet row id is
     * unique within its sheet and not across sheets — so with 2026 and 2027
     * both configured there is nothing in the address saying which sheet is
     * meant. The writer holds one sheet id, so every edit would be sent to
     * the first one: at best rejected, at worst applied to whichever row
     * there happens to carry the same id. Carrying the sheet on the address
     * would be the fix; until somebody does that, refusing is the only
     * honest answer, and a refusal somebody can read beats a write nobody
     * can trace.
     */
    if (this.config.contentSheetIds.length > 1) {
      return `off — refused: the schedule is read from ${this.config.contentSheetIds.length} sheets, and a write cannot say which one it means`;
    }
    const sheet = await this.contentSheet();
    const writer = new SmartsheetContentWriter(
      this,
      this.config.contentSheetIds[0],
      sheet.name ?? "the commissioning sheet",
    );
    (this as { writes?: ContentWriter }).writes = writer;
    return writer.target;
  }

  private async fetchSheet(
    sheetId: string,
    { fresh = false }: { fresh?: boolean } = {},
  ): Promise<SmartsheetSheet> {
    /*
     * A read that may be answered from the copy in hand, and one that may
     * not. The writer's re-read asks for fresh, because comparing a row
     * against a copy the Hub is already holding would compare it against
     * itself and agree every time — which is the concurrency check gone,
     * with every test still passing.
     */
    const current = fresh ? undefined : await this.versionOf(sheetId);
    const held = this.held.get(sheetId);
    if (held && sheetIsCurrent(held.version, current)) return held.sheet;

    /*
     * Level 2, with the object values.
     *
     * Asked for plainly, Smartsheet answers in a shape that predates
     * multi-select: a multi-contact or multi-picklist column reports its type
     * as TEXT_NUMBER and its cells arrive as the values joined with commas,
     * with no structure at all. Every person in a co-owned cell is then one
     * unsplittable string, and a name containing a comma makes it
     * unsplittable in principle rather than only in practice. This is the
     * request that returns the people as people.
     */
    const res = await fetch(`${API}/sheets/${sheetId}?level=2&include=objectValue`, {
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(
        `Smartsheet request for sheet ${sheetId} failed: ${res.status} ${res.statusText}`,
      );
    }
    const sheet = (await res.json()) as SmartsheetSheet;
    /*
     * Filed under the version the sheet itself reports, not the one asked
     * for a moment earlier. An edit landing between the two would otherwise
     * be labelled with the version before it, and the copy would look
     * current until somebody edited the sheet again.
     */
    if (typeof sheet.version === "number") {
      this.held.set(sheetId, { version: sheet.version, sheet });
      this.versions.set(sheetId, { at: Date.now(), version: sheet.version });
    }
    return sheet;
  }

  private async fetchRows(sheetId: string): Promise<FlatRow[]> {
    return this.flatten(await this.fetchSheet(sheetId));
  }

  /** A fetched sheet as rows keyed by column title. */
  private flatten(sheet: SmartsheetSheet): FlatRow[] {
    const titleById = new Map(sheet.columns.map((c) => [c.id, c.title]));
    /*
     * Which columns hold days, so those cells can be read the other way
     * round. The sheet already says — every column arrives with its type —
     * so this costs nothing beyond noticing.
     */
    const dateColumns = new Set(
      sheet.columns.filter((c) => isDateColumn(c.type)).map((c) => c.id),
    );
    return sheet.rows.map((row) => {
      const flat: FlatRow = { _rowId: String(row.id) };
      for (const cell of row.cells) {
        const title = titleById.get(cell.columnId);
        if (!title) continue;
        flat[title] = dateColumns.has(cell.columnId)
          ? String(cell.value ?? cell.displayValue ?? "")
          : (cell.displayValue ?? (cell.value != null ? String(cell.value) : ""));

        const who = peopleIn(cell);
        if (who.length) (flat._people ??= {})[title] = who;
      }
      return flat;
    });
  }

  /**
   * Rows, with a renamed column answering to the name the mapping knows it by.
   *
   * The alternative was to resolve the mapping into this sheet's own titles
   * and hand that down, which would have meant every reader taking a second
   * argument for a case that almost never happens. Aliasing instead keeps
   * `row[c.submissionDate]` reading exactly as it did, whether the sheet
   * still calls that column what it was called when somebody mapped it or
   * not.
   */
  private async readRows<T extends Record<string, ColumnRef>>(
    sheetId: string,
    group: T,
  ): Promise<FlatRow[]> {
    const sheet = await this.fetchSheet(sheetId);
    const rows = this.flatten(sheet);
    const renamed = renamedColumns(group, sheet.columns);
    if (renamed.length === 0) return rows;
    for (const row of rows) {
      for (const { mapped, actual } of renamed) {
        if (row[actual] !== undefined) row[mapped] = row[actual];
      }
    }
    return rows;
  }

  async listPeople(): Promise<Person[]> {
    if (!this.config.peopleSheetId) return [];
    const c = titles(COLUMNS.people);
    const rows = await this.readRows(this.config.peopleSheetId, COLUMNS.people);
    return rows
      .filter((row) => row[c.email])
      .map((row) => ({
        id: personId(row[c.email]),
        name: row[c.name] ?? row[c.email],
        email: row[c.email],
        /*
         * Which side of the team somebody is on, read from the access column
         * first and the grade only as a fallback.
         *
         * The grade was doing both jobs and doing one of them badly: it
         * matched on the word "commission", and this directory writes "CM",
         * so six commissioning managers were reading as forecasters and could
         * not see the team they commission for. The grade is what the KPI
         * benchmarks key on; what somebody may do is a separate question and
         * now has a column of its own.
         */
        role:
          hubAccessFor(row[c.hubAccess]).role === "commissioning-manager" ||
          hubAccessFor(row[c.hubAccess]).role === "admin" ||
          /commission|^cm$/i.test((row[c.role] ?? "").trim())
            ? ("commissioning-manager" as const)
            : ("forecaster" as const),
        hubAccess: hubAccessFor(row[c.hubAccess]).role,
        /*
         * Still here, or not. Both halves can say no and either is enough:
         * the access column for somebody who was never to have an account,
         * the status column for somebody who has left.
         */
        active:
          hubAccessFor(row[c.hubAccess]).active !== false &&
          !/^inactive$/i.test((row[c.status] ?? "").trim()),
        forecasterRole: row[c.role] || undefined,
        vertical: (row[c.vertical] || row[c.team] || undefined) as Vertical | undefined,
        department: row[c.department] || undefined,
        region: regionFor(row[c.region]) ?? row[c.region] ?? "UK",
        country: row[c.region] || undefined,
        managerEmail: row[c.managerEmail] || undefined,
      }));
  }

  /**
   * The Content Directory, straight off its own sheet.
   *
   * The rows arrive keyed by column title, which is exactly what the
   * directory's reader takes — so the sheet, the spreadsheet export and the
   * invented seed all go through one piece of code, and a column renamed in
   * Smartsheet is a one-line change in directory.ts rather than three.
   */
  async listDirectory(): Promise<DirectoryPerson[]> {
    if (!this.config.directorySheetId) return [];
    return readDirectory(await this.fetchRows(this.config.directorySheetId));
  }

  /**
   * The schedule, from every sheet it is kept in.
   *
   * Asked for together rather than one after another, for the same reason
   * the calendar is: the wait is the slowest sheet rather than the sum of
   * them.
   *
   * The made-up id for a row with no Content ID carries its sheet only when
   * there is more than one, because `/content/ss-4021` is an address people
   * paste to each other and a link that changes shape because a second sheet
   * was configured is a link that stops working. With one sheet this reads
   * exactly as it always has.
   */
  async listContent(): Promise<ContentItem[]> {
    const c = titles(COLUMNS.content);
    const sheetIds = this.config.contentSheetIds;
    const several = sheetIds.length > 1;
    const perSheet = await Promise.all(
      sheetIds.map(async (sheetId) =>
        (await this.readRows(sheetId, COLUMNS.content)).map((row) => ({ row, sheetId })),
      ),
    );
    return perSheet
      .flat()
      .filter(({ row }) => row[c.title])
      .map(({ row, sheetId }) => ({
        id: row[c.id] || (several ? `ss-${sheetId}-${row._rowId}` : `ss-${row._rowId}`),
        // The row, not the Content ID: the only address a write may use.
        sourceRowId: row._rowId,
        title: row[c.title],
        type: (row[c.type] || "Market Report") as ContentType,
        vertical: (row[c.vertical] || "Womenswear") as Vertical,
        forecastHorizon: row[c.forecastHorizon] || "",
        forecastCategory: row[c.forecastCategory] || undefined,
        /*
         * The first person named owns it, and everybody named is credited.
         *
         * Smartsheet's contact column has no notion of a lead — the people in
         * it are equal — so the Hub picks the first for the one field that
         * takes a single person and keeps the whole list beside it. That is
         * the reading that matches the team's practice without inventing a
         * hierarchy their sheet does not record, and it is why a co-owned
         * piece now shows up for both of them rather than for neither.
         */
        forecasterId: personId(whoIn(row, c.forecaster)[0] ?? row[c.forecaster]),
        managerId: personId(whoIn(row, c.manager)[0] ?? row[c.manager]),
        submissionDate: isoDate(row[c.submissionDate]),
        publicationDate: isoDate(row[c.publicationDate]),
        status: normaliseStatus(row[c.status]),
        notes: row[c.notes] || undefined,
        submittedOn: isoDate(row[c.submittedOn]) || undefined,
        ownership: normaliseOwnership(row[c.ownership]),
        /*
         * Everybody on the piece, the owners included.
         *
         * A team with no separate Contributors column still co-owns work, and
         * it says so by putting two people in the owner cell. Splitting the
         * display string on commas was the old reading and is wrong twice
         * over: it cannot tell "Rees, Allyson" from two people, and a team
         * that maps no Contributors column at all got an empty list while
         * the owner cell plainly named two.
         */
        contributorIds: [
          ...new Set([...whoIn(row, c.forecaster), ...whoIn(row, c.contributors)]),
        ].map(personId),
      }));
  }

  /**
   * Every events sheet, read as one calendar.
   *
   * The sheets are asked for together rather than one after another: three
   * sequential round trips to Smartsheet is three times the wait on a page
   * somebody opens every morning, and they do not depend on each other.
   *
   * A row's id carries its sheet, because a Smartsheet row id is unique
   * within its sheet and not across sheets — two rows in two sheets can
   * collide, and an event quietly standing in for another on the calendar is
   * the sort of thing nobody reports as a bug because it just looks wrong.
   */
  async listEvents(): Promise<CalendarEvent[]> {
    const sheetIds = this.config.eventsSheetIds ?? [];
    if (sheetIds.length === 0) return [];
    const c = titles(COLUMNS.events);
    const perSheet = await Promise.all(
      sheetIds.map(async (sheetId) =>
        (await this.readRows(sheetId, COLUMNS.events)).map((row) => ({ row, sheetId })),
      ),
    );
    return perSheet
      .flat()
      .filter(({ row }) => row[c.title] && row[c.startDate])
      .map(({ row, sheetId }, i) => ({
        id: row._rowId ? `${sheetId}-${row._rowId}` : `ev-${i}`,
        type: normaliseEventType(row[c.type]),
        title: row[c.title],
        // The first name in the cell: leave belongs to one person, and a
        // shared entry is the calendar saying it is not really leave.
        personId: whoIn(row, c.person)[0] ? personId(whoIn(row, c.person)[0]) : undefined,
        region: regionFor(row[c.country]) ?? regionFor(row[c.region]) ?? row[c.region] ?? undefined,
        startDate: isoDate(row[c.startDate]),
        endDate: isoDate(row[c.endDate] || row[c.startDate]),
        location: row[c.location] || undefined,
        notes: row[c.notes] || undefined,
      }));
  }

  async listSessions(): Promise<KnowledgeSession[]> {
    if (!this.config.sessionsSheetId) return [];
    const c = titles(COLUMNS.sessions);
    const rows = await this.readRows(this.config.sessionsSheetId, COLUMNS.sessions);
    return rows
      .filter((row) => row[c.title] && row[c.startDate])
      .map((row) => {
        const capacity = Number.parseInt(row[c.capacity] ?? "", 10);
        const location = row[c.location] ?? "";
        return {
          id: row[c.id] || `ws-${row._rowId}`,
          title: row[c.title],
          kind: normaliseSessionKind(row[c.kind]),
          hostId: whoIn(row, c.host)[0] ? personId(whoIn(row, c.host)[0]) : undefined,
          hostExternal: row[c.guest] || undefined,
          attendeeIds: whoIn(row, c.attendees).map(personId),
          department: row[c.department] || undefined,
          // A session with no end runs for the day it starts, which is what a
          // blank End cell means on a workshop sheet rather than a gap.
          startDate: isoDate(row[c.startDate]),
          endDate: isoDate(row[c.endDate]) || isoDate(row[c.startDate]),
          startTime: row[c.startTime] || undefined,
          endTime: row[c.endTime] || undefined,
          location,
          online: /remote|zoom|teams|online/i.test(location),
          capacity: Number.isFinite(capacity) ? capacity : null,
          signUpsOpen: isYes(row[c.signUpsOpen]),
          required: isYes(row[c.required]) || undefined,
          summary: row[c.summary] || "",
          topics: (row[c.topics] || "")
            .split(/\s*,\s*/)
            .filter(Boolean),
          recapUrl: row[c.recapUrl] || undefined,
        };
      });
  }

  async listSignUps(): Promise<Record<string, SessionSignUps>> {
    if (!this.config.signUpsSheetId) return {};
    const c = titles(COLUMNS.signUps);
    const rows = await this.readRows(this.config.signUpsSheetId, COLUMNS.signUps);
    const out: Record<string, SessionSignUps> = {};
    for (const row of rows) {
      const session = row[c.session];
      const who = row[c.person];
      if (!session || !who) continue;
      out[session] ??= { going: [], waiting: [] };
      const waiting = /wait/i.test(row[c.state] ?? "");
      out[session][waiting ? "waiting" : "going"].push(personId(who));
    }
    return out;
  }

  async listAccess(): Promise<AccessRow[]> {
    if (!this.config.accessSheetId) return [];
    const c = titles(COLUMNS.access);
    const rows = await this.readRows(this.config.accessSheetId, COLUMNS.access);
    return rows
      .filter((row) => row[c.email]?.includes("@"))
      .map((row) => ({
        email: row[c.email].trim().toLowerCase(),
        name: row[c.name] || undefined,
        role: normaliseRole(row[c.role]),
        verticals: row[c.verticals] || undefined,
        // Blank means active; only an explicit "no" removes access.
        active: !/^(false|no|n|0|inactive|left)$/i.test((row[c.active] ?? "").trim()),
      }));
  }

  /**
   * Metrics from the sheet are always "supplied" — a derived one needs a
   * calculator in kpis.ts, which is code, not a row.
   */
  async listMetrics(): Promise<MetricDefinition[]> {
    if (!this.config.metricsSheetId) return seedMetrics;
    const c = titles(COLUMNS.metrics);
    const rows = await this.readRows(this.config.metricsSheetId, COLUMNS.metrics);
    const supplied = rows
      .filter((row) => row[c.id] && row[c.label])
      .map((row) => {
        const target = Number.parseFloat(row[c.target] ?? "");
        return {
          id: row[c.id].trim(),
          label: row[c.label],
          unit: normaliseUnit(row[c.unit]),
          better: /low/i.test(row[c.better] ?? "") ? ("lower" as const) : ("higher" as const),
          source: "supplied" as const,
          group: row[c.group] || "Other",
          target: Number.isFinite(target) ? target : undefined,
          description: row[c.description] || "",
        };
      });
    // Keep the derived metrics; the sheet adds to them rather than replacing.
    const derived = seedMetrics.filter((m) => m.source === "derived");
    const suppliedIds = new Set(supplied.map((m) => m.id));
    return [...derived.filter((m) => !suppliedIds.has(m.id)), ...supplied];
  }

  /**
   * The trend database.
   *
   * Several columns hold a run of label names with nothing between them but
   * spaces ("Gen Z Millennials Boomers"), so they are read against the known
   * vocabulary rather than split on whitespace — otherwise "Gen Z" becomes
   * two labels. The cover image and both links are rendered, so anything that
   * is not http(s) is dropped rather than trusted.
   */
  async listTrends(): Promise<TrendProfile[]> {
    if (!this.config.trendsSheetId) return [];
    const c = titles(COLUMNS.trends);
    const rows = await this.readRows(this.config.trendsSheetId, COLUMNS.trends);
    return rows
      .filter((row) => row[c.id] && row[c.title])
      .map((row) => {
        const industries = splitKnown(row[c.industries], TREND_INDUSTRIES);
        const scored = splitKnown(row[c.scored], TREND_INDUSTRIES);
        const labels: Record<string, string[]> = {};
        for (const [group, column] of Object.entries(COLUMNS.trendLabels)) {
          const value = (row[column] ?? "").trim();
          if (value) labels[group] = [value];
        }
        return {
          id: String(row[c.id]).trim(),
          profileId: (row[c.profileId] ?? "").trim(),
          title: row[c.title].trim(),
          slug: (row[c.slug] ?? "").trim(),
          // The sheet names people rather than keying to them, so keep the
          // name for display and derive the id the same way the seed does.
          ownerName: (row[c.owner] ?? "").trim(),
          ownerId: personId(row[c.owner]),
          authorNames: authorList(row[c.authors], row[c.owner]),
          authorIds: authorList(row[c.authors], row[c.owner]).map((name) => personId(name)),
          types: splitKnown(row[c.types], TREND_TYPES),
          call: TREND_CALLS.find((k) => (row[c.call] ?? "").includes(k)),
          publishedOn: isoDate(row[c.publishedOn]),
          activeFrom: isoDate(row[c.activeFrom]),
          activeTo: isoDate(row[c.activeTo]),
          editorUrl: webUrl(row[c.editorLink]) ?? "",
          publishedUrl: webUrl(row[c.publishedLink]) ?? "",
          coverImageUrl: webUrl(row[c.coverImage]),
          description: row[c.description] ?? "",
          needToKnow: row[c.needToKnow] ?? "",
          opportunity: row[c.opportunity] ?? "",
          strategies: countOf(row[c.strategies]),
          proofPoints: countOf(row[c.proofPoints]),
          industries,
          needingScore: splitKnown(row[c.needingScore], TREND_INDUSTRIES),
          scored,
          missingScore: splitKnown(row[c.missingScore], TREND_INDUSTRIES),
          latestScoreMonth: (row[c.latestScoreMonth] ?? "").trim() || undefined,
          published: (row[c.published] ?? "").trim() || undefined,
          editorStatus: (row[c.editorStatus] ?? "").trim() || undefined,
          hashtags: (row[c.hashtags] ?? "").split(/\s+/).filter((h) => h.startsWith("#")),
          labels,
          lastSynced: isoDate(row[c.lastSynced]) || undefined,
        };
      });
  }

  async listMetricObservations(): Promise<MetricObservation[]> {
    if (!this.config.observationsSheetId) return [];
    const c = titles(COLUMNS.observations);
    const rows = await this.readRows(this.config.observationsSheetId, COLUMNS.observations);
    return rows
      .map((row) => ({
        metricId: (row[c.metric] ?? "").trim(),
        personId: personId(row[c.person]),
        date: isoDate(row[c.date]),
        value: Number.parseFloat(row[c.value] ?? ""),
      }))
      .filter((o) => o.metricId && o.date && Number.isFinite(o.value));
  }
}

function normaliseOwnership(value: string | undefined): Ownership {
  const v = (value ?? "").toLowerCase();
  if (v.includes("co-own") || v.includes("co own") || v.includes("joint")) return "co-owned";
  if (v.includes("byline") || v.includes("contribut")) return "byline";
  if (v.includes("freelance")) return "freelance";
  return "sole";
}

/**
 * Pulls known names out of a cell that runs them together with spaces. Longest
 * first, so "Fashion Design" is not read as "Fashion" plus a stray word.
 */
function splitKnown(value: string | undefined, vocabulary: string[]): string[] {
  const v = (value ?? "").trim();
  if (!v) return [];
  return [...vocabulary]
    .sort((a, b) => b.length - a.length)
    .filter((name) => v.includes(name))
    .sort((a, b) => vocabulary.indexOf(a) - vocabulary.indexOf(b));
}

/**
 * The AUTHORS cell lists full names; the Owner is the one accountable and is
 * put first whether or not the authors cell repeats them.
 */
function authorList(authors: string | undefined, owner: string | undefined): string[] {
  const names = (authors ?? "")
    .split(/\s*,\s*/)
    .map((n) => n.trim())
    .filter(Boolean);
  const lead = (owner ?? "").trim();
  if (lead && !names.includes(lead)) names.unshift(lead);
  return [...new Set(names)];
}

function countOf(value: string | undefined): number {
  const n = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * A sheet cell that is going to be rendered as a link or an image. Only
 * http(s) survives, because anything else is a way in.
 */
function webUrl(value: string | undefined): string | undefined {
  const v = (value ?? "").trim();
  return /^https?:\/\//i.test(v) ? v : undefined;
}

function normaliseUnit(value: string | undefined): "count" | "percent" | "days" {
  const v = (value ?? "").toLowerCase();
  if (v.includes("percent") || v.includes("%") || v.includes("rate")) return "percent";
  if (v.includes("day")) return "days";
  return "count";
}

function normaliseRole(value: string | undefined): Role {
  const v = (value ?? "").toLowerCase();
  if (v.includes("admin")) return "admin";
  if (v.includes("commission") || v.includes("manager")) return "commissioning-manager";
  return "forecaster";
}

/** Smartsheet checkboxes come back as "true"/"false"; humans type "Yes". */
function isYes(value: string | undefined): boolean {
  return /^(true|yes|y|1)$/i.test((value ?? "").trim());
}

function normaliseSessionKind(value: string | undefined): SessionKind {
  const v = (value ?? "").toLowerCase();
  if (v.includes("masterclass")) return "masterclass";
  if (v.includes("lunch")) return "lunch-and-learn";
  if (v.includes("critique") || v.includes("review")) return "critique";
  if (v.includes("training") || v.includes("course")) return "training";
  return "workshop";
}

/**
 * People are referenced by name or email in the sheets, so derive a stable id
 * from the email local part where we have one, and from the name otherwise.
 */
function personId(nameOrEmail: string | undefined): string {
  if (!nameOrEmail) return "unassigned";
  const value = nameOrEmail.trim().toLowerCase();
  const local = value.includes("@") ? value.split("@")[0] : value;
  return local.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * The region a country belongs to.
 *
 * The sheets record a country and the Hub compares regions, so something has
 * to bridge the two. Holding the bridge here rather than asking the team to
 * add a Region column to ten calendar sheets is the point: `Country` is
 * already filled in on the sheets that have it, and a column nobody
 * remembers to populate is worse than a table one person maintains.
 *
 * A value that is already a region passes straight through, so a sheet may
 * say "EMEA" in the country column and still work. A country nobody has
 * listed comes back undefined rather than guessed — an event with no region
 * reaches everybody, which is the safer failure for a public holiday, and
 * the doctor is where an unrecognised country should be noticed.
 */
const REGIONS: Record<string, string[]> = {
  EMEA: [
    "UK", "United Kingdom", "England", "Scotland", "Wales", "Northern Ireland", "Ireland",
    "France", "Germany", "Italy", "Spain", "Portugal", "Netherlands", "Holland", "Belgium",
    "Luxembourg", "Denmark", "Sweden", "Norway", "Finland", "Iceland", "Switzerland",
    "Austria", "Poland", "Czech Republic", "Czechia", "Hungary", "Romania", "Bulgaria",
    "Greece", "Croatia", "Serbia", "Ukraine", "Russia", "Turkey", "Israel",
    "UAE", "United Arab Emirates", "Dubai", "Saudi Arabia", "Qatar", "Kuwait",
    "Egypt", "Morocco", "Tunisia", "South Africa", "Nigeria", "Kenya", "Ghana", "Ethiopia",
  ],
  APAC: [
    "China", "Hong Kong", "Macau", "Taiwan", "Japan", "Korea", "South Korea",
    "India", "Pakistan", "Bangladesh", "Sri Lanka", "Singapore", "Malaysia", "Thailand",
    "Vietnam", "Indonesia", "Philippines", "Cambodia", "Myanmar",
    "Australia", "New Zealand",
  ],
  NAM: ["USA", "US", "United States", "United States of America", "Canada"],
  LATAM: [
    "Brazil", "Mexico", "Argentina", "Chile", "Colombia", "Peru", "Uruguay",
    "Ecuador", "Bolivia", "Paraguay", "Venezuela", "Costa Rica", "Panama",
  ],
};

const REGION_BY_COUNTRY = new Map<string, string>();
for (const [region, countries] of Object.entries(REGIONS)) {
  REGION_BY_COUNTRY.set(region.toLowerCase(), region);
  for (const country of countries) REGION_BY_COUNTRY.set(country.toLowerCase(), region);
}

/**
 * Everybody named in a cell, as addresses.
 *
 * A contact cell carries its people in `objectValue.values`, each with a name
 * and an address, and that is the only place the two are still separate — the
 * display value has already joined them with commas, which cannot be undone
 * safely because a name may contain one. Reading the structure rather than
 * unpicking the string is the whole fix.
 *
 * The address is preferred and the name is the fallback, for an entry
 * somebody typed by hand that Smartsheet never resolved to an account: a
 * cell holding a person the Hub cannot address is still a cell holding a
 * person, and dropping them would quietly un-assign the work.
 */
/**
 * The people in one column of a row, as addresses.
 *
 * Falls back to splitting the display string on commas, because not every
 * source is Smartsheet: a Google Sheet's contact column is a line of text
 * somebody typed, and the old reading is the only one available for it. The
 * structured list is preferred wherever it exists, which is why a name with
 * a comma in it survives on a real sheet and not in a spreadsheet — that is
 * the difference between the two sources, not a bug in the reader.
 */
function whoIn(row: FlatRow, column: string): string[] {
  if (!column) return [];
  const structured = row._people?.[column];
  if (structured?.length) return structured;
  return (row[column] || "").split(/\s*,\s*/).filter(Boolean);
}

export function peopleIn(cell: SmartsheetCell): string[] {
  const values = cell.objectValue?.values;
  if (Array.isArray(values)) {
    return values.map((v) => (v.email || v.name || "").trim()).filter(Boolean);
  }
  const one = cell.objectValue;
  if (one && (one.email || one.name)) return [(one.email || one.name || "").trim()].filter(Boolean);
  return [];
}

export function regionFor(country: string | undefined): string | undefined {
  const key = (country ?? "").trim().toLowerCase();
  if (!key) return undefined;
  return REGION_BY_COUNTRY.get(key);
}

/**
 * Whether an event in a region reaches a particular person.
 *
 * One function because the rule was written out twice — in the notice
 * builder and in the calendar feed — and two copies of a rule are two
 * chances to change one of them. Somebody reading their calendar and
 * somebody reading the email about it must be told the same thing.
 *
 * An event with no region reaches everybody, and so does one marked "all":
 * matched without regard to case, because a team that agrees to tag things
 * ALL will type ALL, and a rule that quietly excludes everybody from an
 * event meant for everybody is the worst way to find that out.
 */
export function inRegion(eventRegion: string | undefined, personRegion: string | undefined): boolean {
  const theirs = (eventRegion ?? "").trim();
  if (!theirs) return true;
  if (theirs.toLowerCase() === "all") return true;
  return theirs.toLowerCase() === (personRegion ?? "").trim().toLowerCase();
}

/**
 * A cell that holds a calendar day rather than words.
 *
 * Worth knowing about because a date column is the one place where the
 * display value is the wrong one to read: Smartsheet renders it to the
 * account's regional format, so a UK sheet says "06/01/26" for the sixth of
 * January and the underlying value says "2026-01-06". Everywhere else the
 * display value is the one a person would recognise — a contact column shows
 * a name over an address, a formula shows its result — so the preference is
 * inverted here and nowhere else.
 */
export function isDateColumn(type: string | undefined): boolean {
  return type === "DATE" || type === "DATETIME" || type === "ABSTRACT_DATETIME";
}

/**
 * A calendar day, as the domain model holds them.
 *
 * Three rules, and each one exists because the obvious version was wrong.
 *
 * An ISO date is taken as characters, never parsed and reformatted. Reading
 * "2026-09-21" into a Date and calling toISOString on it returns the
 * twentieth anywhere east of Greenwich, because the string is read as
 * midnight UTC but a datetime is rendered back in local time. A date that
 * arrives correct must leave untouched.
 *
 * A date written only in digits and slashes is refused rather than guessed.
 * "06/01/26" is the sixth of January to the team who typed it and the first
 * of June to `new Date`, and there is nothing in the string that says which —
 * so the honest answer is no answer. An empty cell on a page is somebody
 * asking why; a deadline five months out is nobody asking anything.
 *
 * Anything else — "21 Sep 2026" and the like — is parsed, but the day is read
 * back off the local clock rather than through UTC, for the same reason as
 * the first rule.
 */
export function isoDate(value: string | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "";

  const iso = /^(\d{4}-\d{2}-\d{2})(?:[T ]|$)/.exec(text);
  if (iso) return iso[1];

  if (/^\d{1,4}[/.]\d{1,2}[/.]\d{1,4}$/.test(text)) return "";

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

/**
 * A status word from the sheet, as one of ours.
 *
 * Loose matching on purpose: "In Progress", "Writing" and "Draft" are all the
 * same thing to the Hub, and different sheets word them differently. The
 * order is not arbitrary — the specific tests have to come before the general
 * ones, and "live" has to be a whole word, because "delivered" contains it
 * and a delivered forecast was being read as a published one.
 */
function normaliseStatus(value: string | undefined): Status {
  const v = (value ?? "").toLowerCase();
  if (v.includes("risk") || v.includes("blocked")) return "at-risk";
  if (v.includes("review")) return "in-review";
  if (v.includes("submit") || v.includes("deliver")) return "submitted";
  if (v.includes("publish") || /\blive\b/.test(v)) return "published";
  if (v.includes("progress") || v.includes("writing") || v.includes("draft")) return "in-progress";
  return "not-started";
}

function normaliseEventType(value: string | undefined): EventType {
  const v = (value ?? "").toLowerCase();
  if (v.includes("holiday") || v.includes("bank")) return "public-holiday";
  if (v.includes("workshop")) return "workshop";
  if (v.includes("training") || v.includes("course")) return "training";
  if (v.includes("conference") || v.includes("show") || v.includes("week")) return "conference";
  return "leave";
}
