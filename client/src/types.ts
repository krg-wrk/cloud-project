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
  /** The sheet row it came from, when the source is one the Hub can write to. */
  sourceRowId?: string;
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

/* ---- The studio: connections, datasets and views ------------------------ */

/**
 * These mirror server/src/studio/types.ts. Note what is missing: a
 * connection's credential has no field here, because it has no field in any
 * response either.
 */
export type ConnectorKind = "hub" | "smartsheet" | "google-sheets" | "mongodb" | "snowflake";

export type FieldType = "text" | "number" | "date" | "boolean" | "person" | "url" | "list";

/**
 * One column of a dataset.
 *
 * `key` and `name` are separate on purpose. A view's spec refers to columns by
 * `key` — for Smartsheet, the column's own id, which survives a rename or a
 * move. `name` is the title as of the last read, and is what a person sees.
 */
export interface Field {
  key: string;
  name: string;
  type: FieldType;
  /** Present when the column has few enough values to offer as a picker. */
  options?: string[];
}

export interface Connection {
  id: string;
  label: string;
  kind: ConnectorKind;
  settings: Record<string, string>;
  secretEnv?: string;
  hasSecret: boolean;
  /** The last four characters, so a credential can be recognised not read. */
  secretHint?: string;
  checkedAt?: string;
  checkOk?: boolean;
  checkNote?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ConnectorInfo {
  kind: ConnectorKind;
  /** False for the systems that are modelled but not built yet. */
  live: boolean;
  needs: {
    settings: { key: string; label: string; placeholder?: string; required: boolean }[];
    credential: string;
  };
}

export interface Dataset {
  id: string;
  connectionId: string;
  label: string;
  ref: string;
  fields: Field[];
  rowCount?: number;
  /** True when the source holds more rows than the read pulled. */
  truncated?: boolean;
  refreshSeconds: number;
  describedAt?: string;
  updatedAt: string;
  updatedBy: string;
}

export type Layout = "table" | "cards" | "list" | "calendar" | "board";

export type FilterOp =
  | "is"
  | "is-not"
  | "contains"
  | "empty"
  | "not-empty"
  | "before"
  | "after"
  | "gt"
  | "lt"
  | "mine";

export interface Filter {
  field: string;
  op: FilterOp;
  value?: string;
}

export interface FieldRoles {
  title?: string;
  subtitle?: string;
  body?: string;
  date?: string;
  endDate?: string;
  status?: string;
  group?: string;
  person?: string;
  image?: string;
  link?: string;
  columns?: string[];
  meta?: string[];
}

export interface ViewSpec {
  layout: Layout;
  fields: FieldRoles;
  filters: Filter[];
  sort?: { field: string; direction: "asc" | "desc" };
  pageSize: number;
}

export interface Audience {
  roles: Me["role"][] | "all";
  verticals: string[] | "all";
  emails: string[];
}

export interface ViewDef {
  id: string;
  slug: string;
  label: string;
  icon: string;
  section: string;
  order: number;
  datasetId: string;
  description?: string;
  spec: ViewSpec;
  audience: Audience;
  state: "draft" | "live";
  updatedAt: string;
  updatedBy: string;
}

/** A custom view in the sidebar. */
/**
 * Somebody in the Content Directory.
 *
 * The sheet's own shape, minus the one thing the server keeps back: why
 * somebody is away. See server/src/directory.ts.
 */
export interface DirectoryPerson {
  id: string;
  name: string;
  email?: string;
  role?: string;
  team?: string;
  tags: string[];
  knowledge: string[];
  region?: string;
  country?: string;
  feedLead: boolean;
  deiBoard: boolean;
  senior: boolean;
  cm?: string;
  managerEmail?: string;
  availability: "here" | "away" | "gone";
  aliases: string[];
}

export interface DirectoryPage {
  by: string;
  q: string;
  facets: { key: string; label: string }[];
  counts: {
    people: number;
    feedLeads: number;
    deiBoard: number;
    teams: number;
    knowledge: number;
    away: number;
  };
  total: number;
  groups: { name: string; people: DirectoryPerson[] }[];
}

/**
 * A link in the Resources drawer: a tool or a document that is not ours to
 * hold, kept in the menu so nobody has to ask for it in chat again.
 */
export interface ResourceLink {
  id: string;
  label: string;
  url: string;
  note?: string;
}

export interface ViewLink {
  slug: string;
  label: string;
  icon: string;
  section: string;
  order: number;
  state: "draft" | "live";
}

/** A view and its rows, as the generic renderer receives them. */
export interface ViewPage {
  view: ViewLink & { description?: string; spec: ViewSpec };
  fields: Field[];
  source: { dataset: string; connection: string; kind: ConnectorKind };
  total: number;
  rows: Record<string, string>[];
  /** Set when the source would not answer, so the page can say why. */
  error?: string;
}

/** What the builder's preview returns: the same shape, plus the source size. */
export interface Preview {
  fields: Field[];
  source: { dataset: string; connection: string; kind: ConnectorKind };
  total: number;
  sourceRows: number;
  rows: Record<string, string>[];
  error?: string;
}

/* ---- Proof points ------------------------------------------------------- */

/**
 * How good a match is, as the ensemble judged it. A and B are both models
 * agreeing at different strengths; C is agreement neither was confident
 * about; D is one model alone, but very sure.
 */
export type ProofPointTier = "A" | "B" | "C" | "D";

/** The same data callout, suggested for another trend. */
export interface AlsoMatch {
  id: string;
  trendId: string;
  match: number;
  title?: string;
  url?: string;
}

/** A suggested proof point, with its trend's details filled in. */
export interface ProofPointRow {
  id: string;
  trendId: string;
  trendTitle: string;
  calloutId: string;
  tier: ProofPointTier;
  match: number;
  claudeScore?: number;
  geminiScore?: number;
  agreed: boolean;
  forecastTag: string;
  forecastYear?: number;
  kpiStatus?: string;
  alreadyKnown: boolean;
  wgsnData: boolean;
  whyClaude?: string;
  whyGemini?: string;
  /** Sanitised on the server, which is the only place it is safe to do. */
  html: string;
  text: string;
  sourceUrl?: string;
  forecastUrl?: string;
  forecastTitle?: string;
  reportTitles?: string[];
  alsoMatches?: AlsoMatch[];
  decision?: "approve" | "reject";
  decidedAt?: string;
  decidedByOwner?: boolean;
  industries: string[];
  ownerName: string;
  /** Whether the signed-in person owns the trend it is suggested for. */
  mine: boolean;
  /** The Hub's own profile id, so a proof point links to the profile. */
  profileId?: string;
  /** Why it was turned down, where a reason was given. */
  reason?: string;
  /** Whether the decision was made in the Hub, so an undo can take it back. */
  decidedHere?: boolean;
}

export type Quality = "top" | "mid" | "all";

/** A page of the library, with the pickers for the filters above it. */
export interface LibraryPage {
  total: number;
  page: number;
  pageSize: number;
  rows: ProofPointRow[];
  /**
   * Which owner filter the server actually applied. "mine" can be asked for
   * and not granted — somebody who owns no trends gets everyone's instead —
   * so the page reads this rather than assuming.
   */
  owner: "mine" | "all";
  counts: { all: number; approved: number; wgsnData: number; mine: number; mineAll: number };
  trends: { id: string; title: string; total: number; mine: boolean }[];
  /**
   * Every value the library holds with the count each would leave, including
   * the ones at nought — a chip that vanishes when it would return nothing
   * takes its neighbours with it as the row reflows, so clicking one moves
   * the next one you were about to click.
   */
  industries: Facet[];
  forecasts: Facet[];
}

export interface Facet {
  value: string;
  total: number;
}

/** One proof point enlarged, with the trend it is evidence for. */
export interface ProofPointDetail {
  point: ProofPointRow;
  trend: {
    id: string;
    title: string;
    description: string;
    industries: string[];
    ownerName: string;
    total: number;
    tierA: number;
    editorUrl?: string;
    publishedUrl?: string;
  } | null;
  tierMeaning: string;
}

/* ---- Changing the commissioning sheet ----------------------------------- */

/** One cell that would change, in the words the confirmation shows. */
export interface CellChange {
  field: "status" | "submissionDate" | "publicationDate" | "submittedOn" | "notes";
  /** The column's title in the sheet, so the confirmation names the real cell. */
  column: string;
  from: string;
  to: string;
}

/** One recorded attempt, successful or refused. */
export interface ScheduleWrite {
  id: string;
  contentId: string;
  sourceRowId: string;
  target: string;
  changes: CellChange[];
  byEmail: string;
  byPersonId?: string;
  at: string;
  ok: boolean;
  problem?: string;
}

/** Whether this account may change this row, and what it already changed. */
export interface ScheduleState {
  canWrite: boolean;
  /** Why not, when it may not — a read-only Hub, or the wrong role. */
  why: string | null;
  target: string | null;
  fields: CellChange["field"][];
  history: ScheduleWrite[];
}

/**
 * What a change would do, and nothing else. Asking for this writes nothing.
 *
 * `expect` goes back with the change unaltered: it is what the row held when
 * this was worked out, so the server can refuse a write against a row
 * somebody else has edited since.
 */
export interface SchedulePreview {
  target: string;
  row: string;
  changes: CellChange[];
  /** Fields the server would not accept, and why. */
  refused: string[];
  expect: Record<string, string>;
}

/* ---- How fresh the data is ----------------------------------------------- */

/** One cached read, and how long it has left. */
export interface FreshnessRead {
  key: string;
  label: string;
  readAt: string;
  ageMs: number;
  cacheMs: number;
}

/** A file somebody generates, rather than something read live. */
export interface FreshnessExtract {
  label: string;
  what: string;
  at: string | null;
  note: string;
}

export interface FreshnessReport {
  visibleToAll: boolean;
  canChangeVisibility: boolean;
  source: string;
  reads: FreshnessRead[];
  extracts: FreshnessExtract[];
  /** Where a write would go, or null in a Hub that only reads. */
  writes: string | null;
}

/* ---- The review queue ---------------------------------------------------- */

/** A suggestion waiting on a decision, with whether you may make it. */
export interface ReviewRow extends ProofPointRow {
  canDecide: boolean;
}

export interface ReviewQueue {
  total: number;
  rows: ReviewRow[];
  decided: { approved: number; rejected: number };
  /** Already cited in the profile, so there is nothing to decide about them. */
  cited: number;
  /** The offered rejection reasons — a shortcut, not a vocabulary. */
  reasons: string[];
  /** How many this person has decided in the Hub. */
  yours: number;
}

/* ---- Notifications ------------------------------------------------------- */

export type NoticeChannel = "inApp" | "email" | "chat";
export type NoticeKind = "digest" | "deadline" | "review";

/** One notice in the bell's inbox. */
export interface Inboxed {
  id: string;
  key: string;
  personId: string;
  kind: NoticeKind;
  title: string;
  body: string;
  link?: string;
  /** 0 ordinary, 1 wants attention, 2 late. */
  urgency: 0 | 1 | 2;
  at: string;
  readAt?: string;
}

export interface Inbox {
  unread: number;
  rows: Inboxed[];
}

/** Whether a channel can send at all, and what to say when it cannot. */
export interface ChannelState {
  channel: NoticeChannel;
  ready: boolean;
  note: string;
}

export interface NotifyPrefs {
  personId: string;
  on: Record<NoticeKind, NoticeChannel[]>;
  chatWebhook?: string;
  updatedAt?: string;
}

export interface NotifySettings {
  prefs: NotifyPrefs;
  /** False when nothing has been saved, so the page can say "the default". */
  saved: boolean;
  channels: ChannelState[];
  kinds: { kind: NoticeKind; label: string; hint: string }[];
  channelLabels: Record<NoticeChannel, string>;
}

/** What one channel did with one notice, in a run or a dry run. */
export interface Delivery {
  personId: string;
  kind: NoticeKind;
  channel: NoticeChannel;
  key: string;
  ok: boolean;
  problem?: string;
}

export interface RunResult {
  today: string;
  built: number;
  deliveries: Delivery[];
  dry: boolean;
  summary: string;
  names?: Record<string, string>;
}

export interface NotifyLog {
  channels: ChannelState[];
  /** Whether anything sends itself, or only an admin pressing the button. */
  scheduled: boolean;
  sends: {
    key: string;
    channel: string;
    personId: string;
    kind: string;
    at: string;
    ok: boolean;
    problem?: string;
  }[];
  /** How many of the team have chosen, against how many there are. */
  chose: number;
  team: number;
  names: Record<string, string>;
}

/* ---- One search box ------------------------------------------------------ */

export type SearchKind = "forecast" | "trend" | "person" | "session" | "proof" | "view";

export interface SearchHit {
  kind: SearchKind;
  /** Where to go. Already a path, so it goes straight into a Link. */
  to: string;
  title: string;
  sub: string;
  /** Why it matched, when the match was in the body rather than the title. */
  why?: string;
  score: number;
}

export interface SearchResult {
  q: string;
  total: number;
  hits: SearchHit[];
  counts: Partial<Record<SearchKind, number>>;
  /** True when a kind had more than it showed. */
  more: boolean;
  labels: Record<SearchKind, string>;
}

/* --- The Forecast Lab ----------------------------------------------------- */

/**
 * What the Hub already holds on what is on the builder's canvas.
 *
 * Mirrors `server/src/lab/weave.ts` by hand, the way the rest of this file
 * mirrors the server's types.
 */
export interface WeaveTrend {
  id: string;
  profileId: string;
  title: string;
  call?: string;
  ownerName: string;
  published: boolean;
  industries: string[];
  /** How many of the canvas's terms this profile carried. */
  matched: number;
}

export interface WeaveProof {
  id: string;
  text: string;
  trendId: string;
  trendTitle: string;
  match: number;
  /** Other trends the same callout is matched to. */
  alsoOn: string[];
}

export interface WeaveForecast {
  id: string;
  title: string;
  /** The sheet calls it type; every page of the Hub calls it format. */
  format: string;
  vertical: string;
  status: string;
  forecasterId: string;
}

export interface WeaveResult {
  terms: string[];
  trends: WeaveTrend[];
  proofPoints: WeaveProof[];
  forecasts: WeaveForecast[];
  /** Two live profiles on shared ground, called differently. */
  tensions: { a: WeaveTrend; b: WeaveTrend; note: string }[];
  counts: { trends: number; proofPoints: number; forecasts: number };
  /** The terms the proof point search actually used, when it had to loosen. */
  proofTerms: string[];
  /** How many terms a row had to carry to be counted. */
  threshold: number;
}
