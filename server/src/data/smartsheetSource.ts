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
 * Column titles as they appear in the source sheets. Change these to match the
 * real sheets rather than touching the mapping code below.
 */
export const COLUMNS = {
  content: {
    id: "Content ID",
    title: "Title",
    type: "Content Type",
    vertical: "Vertical",
    season: "Season",
    forecaster: "Forecaster",
    manager: "Commissioning Manager",
    submissionDate: "Submission Date",
    publicationDate: "Publication Date",
    /** When the copy actually landed — what the timeliness KPIs measure. */
    submittedOn: "Actual Submission",
    status: "Status",
    notes: "Notes",
    /** Sole / Co-owned / Byline / Freelance. */
    ownership: "Ownership",
    /** Everyone credited, so co-owned work counts for both people. */
    contributors: "Contributors",
  },
  events: {
    type: "Event Type",
    title: "Title",
    person: "Person",
    region: "Region",
    startDate: "Start Date",
    endDate: "End Date",
    location: "Location",
    notes: "Notes",
  },
  people: {
    name: "Name",
    email: "Email",
    /** Director / Head Of / Senior / Strategist — what the benchmarks key on. */
    role: "Role",
    team: "Team",
    department: "Department",
    vertical: "Vertical",
    region: "Region",
    managerEmail: "Manager Email",
  },
  sessions: {
    id: "Session ID",
    title: "Title",
    kind: "Kind",
    host: "Host",
    guest: "Guest Speaker",
    date: "Date",
    startTime: "Start Time",
    endTime: "End Time",
    location: "Location",
    capacity: "Capacity",
    signUpsOpen: "Sign-ups Open",
    required: "Required",
    summary: "Summary",
    topics: "Topics",
    recapUrl: "Recap",
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

interface SmartsheetCell {
  columnId: number;
  value?: string | number | boolean;
  displayValue?: string;
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
}

/** A sheet row flattened to { "Column Title": "value" }. */
type FlatRow = Record<string, string>;

export interface SmartsheetConfig {
  token: string;
  contentSheetId: string;
  /**
   * Whether the Hub may write to the commissioning sheet.
   *
   * Off unless switched on deliberately, because this is the managers' live
   * sheet. With it off the source reports no write capability at all and the
   * API refuses before it gets anywhere near a request.
   */
  allowWrites?: boolean;
  eventsSheetId?: string;
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
const STATUS_LABELS: Record<Status, string> = {
  "not-started": "Not Started",
  "in-progress": "In Progress",
  submitted: "Submitted",
  "in-review": "In Review",
  published: "Published",
  "at-risk": "At Risk",
};

export class SmartsheetSource implements DataSource {
  readonly name = "smartsheet";
  readonly writes?: ContentWriter;

  constructor(private readonly config: SmartsheetConfig) {}

  /** The token, for the writer only. Nothing else needs it from outside. */
  get tokenForWrite(): string {
    return this.config.token;
  }

  /** The commissioning sheet as the API returns it, for the writer. */
  contentSheet(): Promise<SmartsheetSheet> {
    return this.fetchSheet(this.config.contentSheetId);
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
    const sheet = await this.contentSheet();
    const writer = new SmartsheetContentWriter(
      this,
      this.config.contentSheetId,
      sheet.name ?? "the commissioning sheet",
    );
    (this as { writes?: ContentWriter }).writes = writer;
    return writer.target;
  }

  private async fetchSheet(sheetId: string): Promise<SmartsheetSheet> {
    const res = await fetch(`${API}/sheets/${sheetId}`, {
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
    return (await res.json()) as SmartsheetSheet;
  }

  private async fetchRows(sheetId: string): Promise<FlatRow[]> {
    const sheet = await this.fetchSheet(sheetId);
    const titleById = new Map(sheet.columns.map((c) => [c.id, c.title]));
    return sheet.rows.map((row) => {
      const flat: FlatRow = { _rowId: String(row.id) };
      for (const cell of row.cells) {
        const title = titleById.get(cell.columnId);
        if (!title) continue;
        flat[title] = cell.displayValue ?? (cell.value != null ? String(cell.value) : "");
      }
      return flat;
    });
  }

  async listPeople(): Promise<Person[]> {
    if (!this.config.peopleSheetId) return [];
    const c = COLUMNS.people;
    const rows = await this.fetchRows(this.config.peopleSheetId);
    return rows
      .filter((row) => row[c.email])
      .map((row) => ({
        id: personId(row[c.email]),
        name: row[c.name] ?? row[c.email],
        email: row[c.email],
        role: row[c.role]?.toLowerCase().includes("commission")
          ? ("commissioning-manager" as const)
          : ("forecaster" as const),
        forecasterRole: row[c.role] || undefined,
        vertical: (row[c.vertical] || row[c.team] || undefined) as Vertical | undefined,
        department: row[c.department] || undefined,
        region: row[c.region] || "UK",
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

  async listContent(): Promise<ContentItem[]> {
    const c = COLUMNS.content;
    const rows = await this.fetchRows(this.config.contentSheetId);
    return rows
      .filter((row) => row[c.title])
      .map((row) => ({
        id: row[c.id] || `ss-${row._rowId}`,
        // The row, not the Content ID: the only address a write may use.
        sourceRowId: row._rowId,
        title: row[c.title],
        type: (row[c.type] || "Market Report") as ContentType,
        vertical: (row[c.vertical] || "Womenswear") as Vertical,
        season: row[c.season] || "",
        forecasterId: personId(row[c.forecaster]),
        managerId: personId(row[c.manager]),
        submissionDate: isoDate(row[c.submissionDate]),
        publicationDate: isoDate(row[c.publicationDate]),
        status: normaliseStatus(row[c.status]),
        notes: row[c.notes] || undefined,
        submittedOn: isoDate(row[c.submittedOn]) || undefined,
        ownership: normaliseOwnership(row[c.ownership]),
        contributorIds: (row[c.contributors] || "")
          .split(/\s*,\s*/)
          .filter(Boolean)
          .map(personId),
      }));
  }

  async listEvents(): Promise<CalendarEvent[]> {
    if (!this.config.eventsSheetId) return [];
    const c = COLUMNS.events;
    const rows = await this.fetchRows(this.config.eventsSheetId);
    return rows
      .filter((row) => row[c.title] && row[c.startDate])
      .map((row, i) => ({
        id: row._rowId || `ev-${i}`,
        type: normaliseEventType(row[c.type]),
        title: row[c.title],
        personId: row[c.person] ? personId(row[c.person]) : undefined,
        region: row[c.region] || undefined,
        startDate: isoDate(row[c.startDate]),
        endDate: isoDate(row[c.endDate] || row[c.startDate]),
        location: row[c.location] || undefined,
        notes: row[c.notes] || undefined,
      }));
  }

  async listSessions(): Promise<KnowledgeSession[]> {
    if (!this.config.sessionsSheetId) return [];
    const c = COLUMNS.sessions;
    const rows = await this.fetchRows(this.config.sessionsSheetId);
    return rows
      .filter((row) => row[c.title] && row[c.date])
      .map((row) => {
        const capacity = Number.parseInt(row[c.capacity] ?? "", 10);
        const location = row[c.location] ?? "";
        return {
          id: row[c.id] || `ws-${row._rowId}`,
          title: row[c.title],
          kind: normaliseSessionKind(row[c.kind]),
          hostId: row[c.host] ? personId(row[c.host]) : undefined,
          hostExternal: row[c.guest] || undefined,
          date: isoDate(row[c.date]),
          startTime: row[c.startTime] || "09:00",
          endTime: row[c.endTime] || "10:00",
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
    const c = COLUMNS.signUps;
    const rows = await this.fetchRows(this.config.signUpsSheetId);
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
    const c = COLUMNS.access;
    const rows = await this.fetchRows(this.config.accessSheetId);
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
    const c = COLUMNS.metrics;
    const rows = await this.fetchRows(this.config.metricsSheetId);
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
    const c = COLUMNS.trends;
    const rows = await this.fetchRows(this.config.trendsSheetId);
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
    const c = COLUMNS.observations;
    const rows = await this.fetchRows(this.config.observationsSheetId);
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

/** Smartsheet returns dates as YYYY-MM-DD already, but display values vary by sheet locale. */
function isoDate(value: string | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
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
