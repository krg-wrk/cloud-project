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
export interface DataSource {
  readonly name: string;
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
}
