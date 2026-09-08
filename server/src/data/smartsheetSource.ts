import type { AccessRow, Role } from "../auth.js";
import {
  TREND_CALLS,
  TREND_INDUSTRIES,
  TREND_TYPES,
  metrics as seedMetrics,
} from "./seed.js";
import type {
  CalendarEvent,
  ContentItem,
  ContentType,
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
} from "../types.js";

const API = "https://api.smartsheet.com/2.0";

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
    scored: "Industries Scored",
    missingScore: "Industries Missing Score",
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
  columns: { id: number; title: string }[];
  rows: SmartsheetRow[];
}

/** A sheet row flattened to { "Column Title": "value" }. */
type FlatRow = Record<string, string>;

export interface SmartsheetConfig {
  token: string;
  contentSheetId: string;
  eventsSheetId?: string;
  peopleSheetId?: string;
  sessionsSheetId?: string;
  /** One row per person per session: Session ID, Person, State. */
  signUpsSheetId?: string;
  accessSheetId?: string;
  metricsSheetId?: string;
  observationsSheetId?: string;
  trendsSheetId?: string;
}

/**
 * Reads the commissioning sheets through the Smartsheet API. The team never
 * signs in to Smartsheet — the Hub reads on their behalf with a single
 * service token, which is why every response is normalised into our own
 * domain model here rather than passed through raw.
 */
export class SmartsheetSource implements DataSource {
  readonly name = "smartsheet";

  constructor(private readonly config: SmartsheetConfig) {}

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

  async listContent(): Promise<ContentItem[]> {
    const c = COLUMNS.content;
    const rows = await this.fetchRows(this.config.contentSheetId);
    return rows
      .filter((row) => row[c.title])
      .map((row) => ({
        id: row[c.id] || `ss-${row._rowId}`,
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
          ownerId: personId(row[c.owner]),
          authorIds: [
            ...new Set(
              (row[c.authors] ?? "")
                .split(/\s*,\s*/)
                .filter(Boolean)
                .map((name) => personId(name)),
            ),
          ],
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
          scored,
          missingScore: splitKnown(row[c.missingScore], TREND_INDUSTRIES),
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

function normaliseStatus(value: string | undefined): Status {
  const v = (value ?? "").toLowerCase();
  if (v.includes("risk") || v.includes("blocked")) return "at-risk";
  if (v.includes("publish") || v.includes("live")) return "published";
  if (v.includes("review")) return "in-review";
  if (v.includes("submit") || v.includes("delivered")) return "submitted";
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
