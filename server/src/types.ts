/** Domain model for the Forecasters Hub. Mirrors the columns held in Smartsheet. */

import type { AccessRow } from "./auth.js";

export type { AccessRow };

export type Status =
  | "not-started"
  | "in-progress"
  | "submitted"
  | "in-review"
  | "published"
  | "at-risk";

/**
 * A publishing format — "Big Ideas", "Catwalks", "CMF Seasonal Forecast" and
 * so on. The taxonomy in taxonomy.ts is the source of truth for which formats
 * exist and which tier each sits in; there are over seventy, and new ones get
 * added, so a hand-kept union here would only go stale and reject real rows.
 */
export type ContentType = string;

export type Vertical =
  | "Womenswear"
  | "Menswear"
  | "Beauty"
  | "Interiors & Lifestyle"
  | "Footwear & Accessories"
  | "Food & Drink"
  | "Consumer Tech"
  | "Kidswear";

export interface Person {
  id: string;
  name: string;
  email: string;
  role: "forecaster" | "commissioning-manager";
  /**
   * Director / Head Of / Senior / Strategist. Separate from `role`, which is
   * about rights in the Hub — this is the grade the KPI benchmarks key on.
   */
  forecasterRole?: string;
  vertical?: Vertical;
  /** The department the KPI sheet groups them under. */
  department?: string;
  region: string;
}

/**
 * A commissioned forecast.
 *
 * We publish many formats now, so "forecast" and "content" are the words the
 * team uses — not "report".
 */
export interface ContentItem {
  id: string;
  title: string;
  type: ContentType;
  vertical: Vertical;
  season: string;
  /** Person id of the forecaster who writes it. */
  forecasterId: string;
  /** Person id of the commissioning manager who owns the slot. */
  managerId: string;
  /** ISO date (YYYY-MM-DD) the copy is due with the commissioning manager. */
  submissionDate: string;
  /** ISO date (YYYY-MM-DD) it goes live on the platform. */
  publicationDate: string;
  status: Status;
  notes?: string;
  /** When the copy actually arrived, where the sheet records it. */
  submittedOn?: string;
  /**
   * How this forecaster is credited. "Total reports owned" in the KPI sheet
   * means sole plus co-owned; byline and freelance are counted separately.
   */
  ownership?: Ownership;
  /** Everyone credited, so co-owned work counts for both people. */
  contributorIds?: string[];
  /**
   * The row this came out of in the source sheet.
   *
   * Only set when the source is one the Hub can write to, and it is the only
   * address a write may use — `id` is the team's own Content ID, which is a
   * label rather than a location and is not unique on every sheet.
   */
  sourceRowId?: string;
}

export type Ownership = "sole" | "co-owned" | "byline" | "freelance";

export type EventType =
  | "leave"
  | "public-holiday"
  | "workshop"
  | "training"
  | "conference";

export interface CalendarEvent {
  id: string;
  type: EventType;
  title: string;
  /** Person id, when the event belongs to one person (e.g. annual leave). */
  personId?: string;
  /** Region the event applies to, for public holidays. */
  region?: string;
  startDate: string;
  endDate: string;
  location?: string;
  notes?: string;
}

/**
 * The details the team fills in on a forecast — the Hub owns these, unlike the
 * schedule itself.
 */
export interface ForecastDetails {
  contentId: string;
  /** Set here when the sheet's format is wrong or missing. */
  contentType?: string;
  /** The years being forecast — one year, or a span like 2028-2029. */
  yearFrom?: number;
  yearTo?: number;
  /** Content Editor: our internal authoring tool. */
  editorId?: string;
  editorUrl?: string;
  researchLinks: ResearchLink[];
  updatedBy: string;
  updatedAt: string;
}

export interface ResearchLink {
  label: string;
  url: string;
}

/**
 * A published trend profile, as the TFDB sheet holds it.
 *
 * The sheet is Snowflake-linked and read-only here: the profile itself is
 * authored in Content Editor and scored elsewhere. What the Hub adds is in
 * TrendExtras.
 */
export interface TrendProfile {
  /** TREND_ID — the short number the team quotes. */
  id: string;
  /** The Content Editor document id, which is what the editor URL is built on. */
  profileId: string;
  title: string;
  slug: string;
  /**
   * The sheet names the owner rather than keying to a person, so the name is
   * what the page shows and the id is derived from it — which is also how a
   * signed-in forecaster is matched to the profiles they own.
   */
  ownerId: string;
  ownerName: string;
  authorIds: string[];
  authorNames: string[];
  /** "Published" or "Unpublished" on the platform. */
  published?: string;
  /** Where the profile is in Content Editor: draft, review or archived. */
  editorStatus?: string;
  /** Design & Aesthetic / Lifestyle / Product / Item / Systemic — more than one. */
  types: string[];
  /** The strategic call: Invest, Test, Expand or Protect. Often not set yet. */
  call?: TrendCall;
  publishedOn: string;
  /** The window the trend is called for — START_DATE to END_DATE. */
  activeFrom: string;
  activeTo: string;
  editorUrl: string;
  publishedUrl: string;
  /** MAIN_COVER_IMAGE_URL, on the platform's media host. */
  coverImageUrl?: string;
  description: string;
  needToKnow: string;
  opportunity: string;
  strategies: number;
  proofPoints: number;
  /** Industries the profile is tagged to, and where its scores stand. */
  industries: string[];
  needingScore: string[];
  scored: string[];
  missingScore: string[];
  /** The score month per industry, or "Missing", as the sheet reports it. */
  latestScoreMonth?: string;
  hashtags: string[];
  /** The label groups: generations, personas, emotions, CMF and so on. */
  labels: Record<string, string[]>;
  lastSynced?: string;
}

/**
 * What the sheet calls MORE_LABELS: what a client should do about the trend.
 * Ordered by how much commitment each asks for.
 */
export type TrendCall = "Protect" | "Test" | "Expand" | "Invest";

/**
 * What the Hub adds to a trend profile. The sheet owns the profile; this is
 * the owner's own working note and any supporting material they gather, plus
 * a cover image override for when the sheet's is wrong or missing.
 */
export interface TrendExtras {
  trendId: string;
  coverImageUrl?: string;
  /** Supporting material: research, boards, decks. */
  links: ResearchLink[];
  /** The owner's own note — what would move this on, what to chase. */
  note?: string;
  updatedBy: string;
  updatedAt: string;
}

/** What a KPI is, and how to read it. */
export interface MetricDefinition {
  id: string;
  label: string;
  unit: "count" | "percent" | "days";
  /** Which direction is good, so a change can be coloured honestly. */
  better: "higher" | "lower";
  /**
   * "derived" — the Hub works it out from the schedule it already holds.
   * "supplied" — it comes from a sheet or feed maintained elsewhere.
   */
  source: "derived" | "supplied";
  group: string;
  target?: number;
  description: string;
  /**
   * Which role-benchmark figure this metric is read against. Output is judged
   * against the average for the person's role, not against zero.
   */
  benchmark?: "halfYearAverage" | "soleOwned" | "coOwned" | "byline" | "freelanced";
  /**
   * Tracked but explicitly not a KPI — the sheet marks AI usage this way, and
   * showing it as one would misrepresent it.
   */
  notKpi?: boolean;
  /**
   * The most this metric can be. 100% on a compliance measure is a ceiling
   * rather than a stretch, so a chart should not leave room above it.
   */
  ceiling?: number;
}

/** One supplied reading: this person, this metric, this day. */
export interface MetricObservation {
  metricId: string;
  personId: string;
  date: string;
  value: number;
}

export type SessionKind =
  | "workshop"
  | "masterclass"
  | "lunch-and-learn"
  | "critique"
  | "training";

/**
 * A workshop or knowledge-sharing session. Separate from CalendarEvent
 * because these are things people attend and sign up for, rather than
 * blocks of time to plan around.
 */
export interface KnowledgeSession {
  id: string;
  title: string;
  kind: SessionKind;
  /** Person id of an internal host. */
  hostId?: string;
  /** Named guest speaker, when the host is not on the team. */
  hostExternal?: string;
  date: string;
  /** 24h "HH:MM", in UK time. */
  startTime: string;
  endTime: string;
  location: string;
  online: boolean;
  /** null when there is no limit on numbers. */
  capacity: number | null;
  /** False for sessions nobody signs up for — the required ones. */
  signUpsOpen: boolean;
  /** The whole team is expected, so there is nothing to opt into. */
  required?: boolean;
  summary: string;
  topics: string[];
  /** Notes or a recording, once the session has run. */
  recapUrl?: string;
}

/** Who is going to a session, and who is next in line if it is full. */
export interface SessionSignUps {
  going: string[];
  waiting: string[];
}

/**
 * Everything the Hub reads. Implemented by the seed adapter today and by the
 * Smartsheet / Google Sheets adapters against the live sheets.
 */
/**
 * The fields of a commissioned forecast the Hub may write back.
 *
 * Deliberately five. The schedule belongs to the commissioning managers and
 * the Hub reads it; this is the short list of things the team learns *after*
 * a row is created and that somebody currently retypes into Smartsheet by
 * hand. Everything else — who writes it, which vertical, which season — is
 * commissioning's to set, and there is no code path here that can reach
 * another column.
 */
export interface WritableFields {
  status?: Status;
  submissionDate?: string;
  publicationDate?: string;
  /** When the copy actually landed, which the timeliness KPIs measure. */
  submittedOn?: string;
  notes?: string;
}

export const WRITABLE_FIELDS: (keyof WritableFields)[] = [
  "status",
  "submissionDate",
  "publicationDate",
  "submittedOn",
  "notes",
];

/** One cell that would change, as the confirmation names it. */
export interface CellChange {
  field: keyof WritableFields;
  /** The column's title in the sheet, so the confirmation names the real cell. */
  column: string;
  from: string;
  to: string;
}

/**
 * What a source will accept back.
 *
 * Absent on a source means read-only, which is what the seed always is and
 * what Smartsheet is until it is switched on deliberately. The API checks for
 * this rather than for a source's name, so nothing can be written by a source
 * that has not said it accepts writes.
 */
export interface ContentWriter {
  /** Named in the confirmation, so a person sees which sheet they are changing. */
  readonly target: string;
  /**
   * What the writable cells of one row hold *in the sheet's own words*,
   * keyed by column title.
   *
   * Not the same thing as the domain model, and that is the point. The Hub
   * reads "Writing" as `in-progress`, so a check that compared the two would
   * never pass — and a concurrency check that never passes is a concurrency
   * check that is not there. Everything shown to a person is in the Hub's
   * words; everything compared against the sheet is in the sheet's.
   */
  current(rowId: string): Promise<Record<string, string>>;
  /**
   * Apply the change to one row.
   *
   * `expect` is what `current` returned when the change was worked out. If
   * the sheet no longer matches, this throws rather than overwriting —
   * somebody else edited the row in between, and their edit is not ours to
   * discard.
   */
  apply(
    rowId: string,
    changes: WritableFields,
    expect: Record<string, string>,
  ): Promise<void>;
}

export type Availability = "here" | "away" | "gone";

export interface DirectoryPerson {
  id: string;
  name: string;
  /** Absent for the rows that carry no address. */
  email?: string;
  /** Strategist, Senior, Head Of, Director, Data Analyst, CM… */
  role?: string;
  /** The industry team: Fashion Design, Interiors, Beauty, Insight… */
  team?: string;
  /** The categories they cover — the sheet's Secondary Team Tags. */
  tags: string[];
  /** The knowledge networks they sit on — Signals, Macro, Sustainability… */
  knowledge: string[];
  region?: string;
  country?: string;
  /** Whether they run their team's feed. */
  feedLead: boolean;
  /** Whether they sit on the DEI board. */
  deiBoard: boolean;
  /** Senior and above, as the sheet marks it. */
  senior: boolean;
  /** Their commissioning manager, by name as the sheet holds it. */
  cm?: string;
  /** Their manager's address, for a question that needs escalating. */
  managerEmail?: string;
  /** Here, away, or no longer with us — never why. */
  availability: Availability;
  /** Other names they are known by, so search finds them. */
  aliases: string[];
}

export interface DataSource {
  readonly name: string;
  /** Set only on a source that accepts writes. See ContentWriter. */
  readonly writes?: ContentWriter;
  listPeople(): Promise<Person[]>;
  listContent(): Promise<ContentItem[]>;
  listEvents(): Promise<CalendarEvent[]>;
  listSessions(): Promise<KnowledgeSession[]>;
  /** Sign-ups keyed by session id. Seeds the store on first run only. */
  listSignUps(): Promise<Record<string, SessionSignUps>>;
  /** Who may sign in, and what rights they have. */
  listAccess(): Promise<AccessRow[]>;
  /** The KPIs being tracked. */
  listMetrics(): Promise<MetricDefinition[]>;
  /** Readings for the supplied metrics. */
  listMetricObservations(): Promise<MetricObservation[]>;
  /** Trend profiles, owned one apiece. */
  listTrends(): Promise<TrendProfile[]>;
  /** The content directory: who is on which team, and what they know about. */
  listDirectory(): Promise<DirectoryPerson[]>;
  /**
   * Drop a cached read, where the source caches.
   *
   * Only one thing needs this: a write the Hub just made means the cached
   * copy is wrong and the page is about to ask for it again. An uncached
   * source has nothing to do.
   */
  forget?(key: "content" | "events" | "people" | "trends"): void;
}
