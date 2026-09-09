/**
 * Client-side view of the domain model. Kept in step with server/src/types.ts
 * by hand for now; worth promoting to a shared workspace package once the
 * shape settles.
 */

export type Status =
  | "not-started"
  | "in-progress"
  | "submitted"
  | "in-review"
  | "published"
  | "at-risk";

export type EventType =
  | "leave"
  | "public-holiday"
  | "workshop"
  | "training"
  | "conference";

export interface Person {
  id: string;
  name: string;
  email: string;
  role: "forecaster" | "commissioning-manager";
  /** Director / Head Of / Senior / Strategist — what the KPI benchmarks use. */
  forecasterRole?: string;
  vertical?: string;
  department?: string;
  region: string;
}

export interface ContentItem {
  id: string;
  title: string;
  type: string;
  vertical: string;
  season: string;
  forecasterId: string;
  managerId: string;
  submissionDate: string;
  publicationDate: string;
  status: Status;
  notes?: string;
  /** Added by the API: how many notes the piece has, and its peer review. */
  noteCount?: number;
  peerReview?: PeerReview | null;
  details?: ForecastDetails | null;
  /** When the copy actually landed, where the sheet records it. */
  submittedOn?: string;
}

export interface CalendarEvent {
  id: string;
  type: EventType;
  title: string;
  personId?: string;
  region?: string;
  startDate: string;
  endDate: string;
  location?: string;
  notes?: string;
}

export type SessionKind =
  | "workshop"
  | "masterclass"
  | "lunch-and-learn"
  | "critique"
  | "training";

export interface KnowledgeSession {
  id: string;
  title: string;
  kind: SessionKind;
  hostId?: string;
  hostExternal?: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  online: boolean;
  capacity: number | null;
  signUpsOpen: boolean;
  required?: boolean;
  summary: string;
  topics: string[];
  recapUrl?: string;
}

/** A session as the API returns it, with its sign-ups attached. */
export interface SessionWithSignUps extends KnowledgeSession {
  going: string[];
  waiting: string[];
  placesLeft: number | null;
  full: boolean;
}

export type Role = "forecaster" | "commissioning-manager" | "admin";

/** The signed-in account, as /api/me returns it. */
export interface Me {
  email: string;
  name: string;
  personId: string | null;
  role: Role;
  verticals: string[] | "all";
  active: boolean;
  person?: Person;
  seesWholeTeam: boolean;
  aiNotes: boolean;
  calendarFeed: string | null;
}

export interface ContentNote {
  id: string;
  contentId: string;
  authorId: string;
  body: string;
  source: "human" | "ai";
  model?: string;
  createdAt: string;
  updatedAt: string;
}

export type EntryKind = "reminder" | "focus-time" | "personal" | "milestone";

export interface PersonalEntry {
  id: string;
  personId: string;
  title: string;
  kind: EntryKind;
  date: string;
  endDate: string;
  note?: string;
  contentId?: string;
}

export interface PeerReview {
  contentId: string;
  reviewerId: string;
  reviewDate: string;
  arrangedBy: string;
  note?: string;
}

/** A peer review with the piece it belongs to, and which side you are on. */
export interface MyPeerReview extends PeerReview {
  item: ContentItem | null;
  iAmReviewer: boolean;
}

export interface ResearchLink {
  label: string;
  url: string;
}

export interface ForecastDetails {
  contentId: string;
  contentType?: string;
  yearFrom?: number;
  yearTo?: number;
  editorId?: string;
  editorUrl?: string;
  researchLinks: ResearchLink[];
  updatedBy: string;
  updatedAt: string;
}

export type TrendCall = "Protect" | "Test" | "Expand" | "Invest";

/** A published trend profile, as the TFDB sheet holds it. */
export interface TrendProfile {
  id: string;
  profileId: string;
  title: string;
  slug: string;
  /** The sheet credits people by name; the id is derived from it. */
  ownerId: string;
  ownerName: string;
  authorIds: string[];
  authorNames: string[];
  /** "Published" or "Unpublished" on the platform. */
  published?: string;
  /** draft, review or archived, in Content Editor. */
  editorStatus?: string;
  types: string[];
  call?: TrendCall;
  publishedOn: string;
  activeFrom: string;
  activeTo: string;
  editorUrl: string;
  publishedUrl: string;
  coverImageUrl?: string;
  description: string;
  needToKnow: string;
  opportunity: string;
  strategies: number;
  proofPoints: number;
  industries: string[];
  needingScore: string[];
  scored: string[];
  missingScore: string[];
  latestScoreMonth?: string;
  hashtags: string[];
  labels: Record<string, string[]>;
  lastSynced?: string;
}

/** A profile in the list, with what this viewer may do with it. */
export interface TrendRow extends TrendProfile {
  linkCount: number;
  hasNote: boolean;
  mine: boolean;
  canWrite: boolean;
}

/** The list response: the rows, the real owner list, and the sheet's size. */
export interface TrendList {
  owners: { id: string; name: string }[];
  total: number;
  rows: TrendRow[];
}

/** One profile in full, with what the Hub holds against it. */
export interface TrendDetail extends TrendProfile {
  coverFromHub: boolean;
  links: ResearchLink[];
  note?: string;
  updatedBy?: string;
  updatedAt?: string;
  canWrite: boolean;
}

export interface MetricDefinition {
  id: string;
  label: string;
  unit: "count" | "percent" | "days";
  better: "higher" | "lower";
  source: "derived" | "supplied";
  group: string;
  target?: number;
  description: string;
  benchmark?: "halfYearAverage" | "soleOwned" | "coOwned" | "byline" | "freelanced";
  /** Tracked but explicitly not a KPI. */
  notKpi?: boolean;
  /** The most this metric can be — 100% on a compliance measure. */
  ceiling?: number;
}

export interface Taxonomy {
  contentTypes: { name: string; tier: 1 | 2 | 3 }[];
  tiers: { tier: 1 | 2 | 3; name: string; job: string; cadence: string }[];
  roles: {
    role: string;
    annualAverage: number;
    halfYearAverage: number;
    soleOwned: number;
    coOwned: number;
    byline: number;
    freelanced: number;
    trueMidYearAverage: number;
  }[];
}

export interface MetricResult {
  definition: MetricDefinition;
  value: number | null;
  previous: number | null;
  series: { period: string; label: string; value: number | null }[];
  awaitingData: boolean;
  /** The average for this person's role over a window this long. */
  benchmark?: number;
}

export interface KpiRange {
  preset: string;
  from: string;
  to: string;
  bucket: "month" | "quarter";
  label: string;
}

export interface KpiResponse {
  person: Person;
  range: KpiRange;
  previous: { from: string; to: string };
  metrics: MetricResult[];
}

export interface TeamKpiResponse {
  definition: MetricDefinition;
  range: KpiRange;
  rows: { personId: string; value: number | null; person: Person | null }[];
}

export interface Schedule {
  people: Person[];
  content: ContentItem[];
  events: CalendarEvent[];
  /** The signed-in person's own reminders — never a colleague's. */
  entries: PersonalEntry[];
  peerReviews: MyPeerReview[];
}
