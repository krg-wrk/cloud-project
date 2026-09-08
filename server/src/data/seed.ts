import type { AccessRow } from "../auth.js";
import type {
  CalendarEvent,
  MetricDefinition,
  MetricObservation,
  ContentItem,
  ContentType,
  EventType,
  KnowledgeSession,
  Ownership,
  Person,
  Status,
  TrendCall,
  TrendProfile,
  Vertical,
} from "../types.js";

/**
 * Invented people, deliberately. The real team list, grades and departments
 * live in the KPI sheet; none of that is copied in here, and the Hub reads it
 * from the sheet in a deployed environment.
 *
 * `forecasterRole` is the grade the KPI benchmarks key on (Director, Head Of,
 * Senior, Strategist) and is separate from `role`, which is about rights.
 */
export const people: Person[] = [
  { id: "gk", name: "Graham Krag", email: "graham.krag@wgsn.com", role: "commissioning-manager", forecasterRole: "Director", department: "Content", region: "UK" },
  { id: "er", name: "Elena Roux", email: "elena.roux@wgsn.com", role: "commissioning-manager", forecasterRole: "Director", department: "Content", region: "FR" },
  { id: "ao", name: "Amara Okafor", email: "amara.okafor@wgsn.com", role: "forecaster", forecasterRole: "Head Of", vertical: "Womenswear", department: "Fashion Design", region: "UK" },
  { id: "tb", name: "Tomas Belka", email: "tomas.belka@wgsn.com", role: "forecaster", forecasterRole: "Senior", vertical: "Menswear", department: "Fashion Design", region: "CZ" },
  { id: "rc", name: "Rina Castellano", email: "rina.castellano@wgsn.com", role: "forecaster", forecasterRole: "Head Of", vertical: "Beauty", department: "Beauty", region: "IT" },
  { id: "pr", name: "Priya Raman", email: "priya.raman@wgsn.com", role: "forecaster", forecasterRole: "Senior", vertical: "Interiors & Lifestyle", department: "Interiors", region: "IN" },
  { id: "jw", name: "Joss Whitaker", email: "joss.whitaker@wgsn.com", role: "forecaster", forecasterRole: "Strategist", vertical: "Footwear & Accessories", department: "Fashion Design", region: "UK" },
  { id: "mc", name: "Mei Lin Chow", email: "meilin.chow@wgsn.com", role: "forecaster", forecasterRole: "Strategist", vertical: "Food & Drink", department: "Food & Drink", region: "SG" },
  { id: "da", name: "Dele Adeyemi", email: "dele.adeyemi@wgsn.com", role: "forecaster", forecasterRole: "Senior", vertical: "Consumer Tech", department: "Consumer Tech", region: "US" },
  { id: "sm", name: "Sofia Marchetti", email: "sofia.marchetti@wgsn.com", role: "forecaster", forecasterRole: "Strategist", vertical: "Kidswear", department: "Fashion Design", region: "IT" },
];

/**
 * The access list — the sheet the commissioning managers maintain.
 *
 * Anyone signing in with a WGSN address who is on the team gets a
 * forecaster's view without appearing here. This sheet is for the exceptions:
 * who is a manager, who is an admin, which verticals they oversee, and who
 * has left.
 */
export const access: AccessRow[] = [
  { email: "graham.krag@wgsn.com", name: "Graham Krag", role: "admin", verticals: "All", active: true },
  {
    email: "elena.roux@wgsn.com",
    name: "Elena Roux",
    role: "commissioning-manager",
    verticals: "Beauty, Interiors & Lifestyle, Food & Drink, Kidswear",
    active: true,
  },
];

/** [id, title, type, vertical, season, forecasterId, submissionDate, publicationDate, status, notes?] */
type ContentRow = [
  string, string, ContentType, Vertical, string, string, string, string, Status, string?,
];

const contentRows: ContentRow[] = [
  ["ss-4008", "Big Idea 2028: The Repair Economy", "Big Ideas", "Womenswear", "A/W 27/28", "ao", "2026-08-14", "2026-09-01", "published"],
  ["ss-4009", "Colour Forecast S/S 28: Saturated Calm", "CMF Seasonal Forecast", "Womenswear", "S/S 28", "ao", "2026-08-21", "2026-09-08", "in-review", "Colour chips with the studio, swatch sign-off outstanding."],
  ["ss-4010", "Catwalk Report: Milan Menswear", "Catwalks", "Menswear", "S/S 28", "tb", "2026-08-28", "2026-09-10", "submitted"],
  ["ss-4011", "Skinimalism, Phase Three", "TrendCurve", "Beauty", "S/S 28", "rc", "2026-09-04", "2026-09-15", "in-review"],
  ["ss-4012", "The Vision S/S 28: Womenswear Key Items", "The Vision", "Womenswear", "S/S 28", "ao", "2026-09-11", "2026-09-25", "in-progress"],
  ["ss-4013", "Quiet Kitchens: Interiors Materials Update", "Retail Analysis", "Interiors & Lifestyle", "S/S 28", "pr", "2026-09-09", "2026-09-22", "at-risk", "Photography still to be commissioned — flagged with the picture desk."],
  ["ss-4014", "Sneaker Silhouettes: The Low Profile Shift", "TrendCurve", "Footwear & Accessories", "S/S 28", "jw", "2026-09-15", "2026-09-29", "in-progress"],
  ["ss-4015", "Fermentation Goes Mainstream", "Consumer Priorities", "Food & Drink", "S/S 28", "mc", "2026-09-16", "2026-09-30", "in-progress"],
  ["ss-4016", "Wearables After the Watch", "Retail Analysis", "Consumer Tech", "S/S 28", "da", "2026-09-18", "2026-10-02", "not-started"],
  ["ss-4017", "Kidswear Colour Forecast S/S 28", "CMF Seasonal Forecast", "Kidswear", "S/S 28", "sm", "2026-09-22", "2026-10-06", "in-progress"],
  ["ss-4018", "Catwalk Report: Paris Womenswear", "Catwalks", "Womenswear", "S/S 28", "ao", "2026-09-25", "2026-10-08", "not-started", "Shows run 28 Sep – 6 Oct, tight turnaround agreed."],
  ["ss-4019", "Case Study: A Resale Programme That Paid", "Case Study", "Womenswear", "A/W 27/28", "ao", "2026-09-30", "2026-10-14", "not-started"],
  ["ss-4020", "Menswear Key Items A/W 28/29", "Category Seasonal Forecast", "Menswear", "A/W 28/29", "tb", "2026-10-02", "2026-10-16", "not-started"],
  ["ss-4021", "The New Fragrance Consumer", "Consumer Priorities", "Beauty", "S/S 28", "rc", "2026-10-06", "2026-10-20", "not-started"],
  ["ss-4022", "Big Idea 2028: Slow Tech", "Big Ideas", "Consumer Tech", "A/W 28/29", "da", "2026-10-09", "2026-10-23", "not-started"],
  ["ss-4023", "Outdoor Living, Year Round", "TrendCurve", "Interiors & Lifestyle", "A/W 28/29", "pr", "2026-10-13", "2026-10-27", "not-started"],
  ["ss-4024", "Bag Shapes: The Structured Return", "Category Seasonal Forecast", "Footwear & Accessories", "A/W 28/29", "jw", "2026-10-16", "2026-10-30", "not-started"],
  ["ss-4025", "Low-Alcohol, High-Design", "Retail Analysis", "Food & Drink", "A/W 28/29", "mc", "2026-10-20", "2026-11-03", "not-started"],
  ["ss-4026", "Kidswear Key Items A/W 28/29", "Category Seasonal Forecast", "Kidswear", "A/W 28/29", "sm", "2026-10-23", "2026-11-06", "not-started"],
  ["ss-4027", "Colour Forecast A/W 28/29: Deep Earths", "CMF Seasonal Forecast", "Womenswear", "A/W 28/29", "ao", "2026-10-28", "2026-11-11", "not-started"],
  ["ss-4028", "Beauty Devices: Clinic at Home", "Retail Analysis", "Beauty", "A/W 28/29", "rc", "2026-11-03", "2026-11-17", "not-started"],
  ["ss-4029", "Catwalk Report: Copenhagen", "Catwalks", "Womenswear", "A/W 28/29", "ao", "2026-11-06", "2026-11-19", "not-started"],
  ["ss-4030", "Menswear Tailoring Softens Again", "TrendCurve", "Menswear", "A/W 28/29", "tb", "2026-11-10", "2026-11-24", "not-started"],
  ["ss-4031", "Case Study: Modular Furniture at Scale", "Case Study", "Interiors & Lifestyle", "A/W 28/29", "pr", "2026-11-13", "2026-11-27", "not-started"],
  ["ss-4032", "The Quiet Commute", "Consumer Priorities", "Consumer Tech", "A/W 28/29", "da", "2026-11-17", "2026-12-01", "not-started"],
  ["ss-4033", "Footwear Materials: Post-Leather", "Retail Analysis", "Footwear & Accessories", "A/W 28/29", "jw", "2026-11-20", "2026-12-04", "not-started"],
  ["ss-4034", "Snacking as a Meal Occasion", "TrendCurve", "Food & Drink", "A/W 28/29", "mc", "2026-11-24", "2026-12-08", "not-started"],
  ["ss-4035", "Big Idea 2029: Proof of Origin", "Big Ideas", "Womenswear", "S/S 29", "ao", "2026-12-01", "2026-12-15", "not-started"],
  ["ss-4036", "Kidswear Consumer: The Handed-Down Wardrobe", "Consumer Priorities", "Kidswear", "S/S 29", "sm", "2026-12-04", "2026-12-18", "not-started"],
  ["ss-4037", "Beauty Colour Forecast S/S 29", "CMF Seasonal Forecast", "Beauty", "S/S 29", "rc", "2026-12-08", "2027-01-05", "not-started"],
  ["ss-4038", "Interiors Season Forecast S/S 29", "Category Seasonal Forecast", "Interiors & Lifestyle", "S/S 29", "pr", "2026-12-11", "2027-01-08", "not-started"],
  ["ss-4039", "Menswear Catwalk Preview S/S 29", "Catwalks", "Menswear", "S/S 29", "tb", "2027-01-08", "2027-01-21", "not-started"],
  ["ss-4001", "Future Consumer A/W 27/28: Womenswear", "Future Consumer", "Womenswear", "A/W 27/28", "ao", "2026-06-12", "2026-06-26", "published"],
  ["ss-4002", "Catwalk Report: New York A/W 27/28", "Catwalks", "Womenswear", "A/W 27/28", "ao", "2026-06-26", "2026-07-09", "published"],
  ["ss-4003", "Beauty Big Idea: The Barrier Obsession", "Big Ideas", "Beauty", "A/W 27/28", "rc", "2026-07-03", "2026-07-16", "published"],
  ["ss-4004", "Interiors Colour Forecast A/W 27/28", "CMF Seasonal Forecast", "Interiors & Lifestyle", "A/W 27/28", "pr", "2026-07-10", "2026-07-23", "published"],
  ["ss-4005", "Trainers as Formalwear", "TrendCurve", "Footwear & Accessories", "A/W 27/28", "jw", "2026-07-17", "2026-07-30", "published"],
  ["ss-4006", "Menswear Consumer: Value Over Volume", "Consumer Priorities", "Menswear", "A/W 27/28", "tb", "2026-07-24", "2026-08-06", "published"],
  ["ss-4007", "Asia-Pacific Food Retail Update", "Retail Analysis", "Food & Drink", "A/W 27/28", "mc", "2026-08-07", "2026-08-20", "published"],
];

/**
 * How each forecast is credited: sole owner, co-owned, a byline contribution,
 * or commissioned out to a freelancer. "Forecasts owned" is sole plus
 * co-owned; the other two are counted separately.
 * [contentId, ownership, extra contributor ids]
 */
const credit: Record<string, { ownership: Ownership; with?: string[] }> = {
  "ss-4001": { ownership: "sole" },
  "ss-4002": { ownership: "co-owned", with: ["tb"] },
  "ss-4003": { ownership: "sole" },
  "ss-4004": { ownership: "co-owned", with: ["sm"] },
  "ss-4005": { ownership: "sole" },
  "ss-4006": { ownership: "byline" },
  "ss-4007": { ownership: "sole" },
  "ss-4008": { ownership: "sole" },
  "ss-4009": { ownership: "co-owned", with: ["sm"] },
  "ss-4010": { ownership: "sole" },
  "ss-4011": { ownership: "sole" },
  "ss-4012": { ownership: "sole" },
  "ss-4013": { ownership: "freelance" },
  "ss-4014": { ownership: "sole" },
  "ss-4015": { ownership: "byline" },
  "ss-4016": { ownership: "sole" },
  "ss-4017": { ownership: "co-owned", with: ["ao"] },
  "ss-4018": { ownership: "sole" },
  "ss-4019": { ownership: "byline" },
  "ss-4020": { ownership: "sole" },
  "ss-4021": { ownership: "sole" },
  "ss-4022": { ownership: "co-owned", with: ["mc"] },
  "ss-4023": { ownership: "sole" },
  "ss-4024": { ownership: "sole" },
  "ss-4025": { ownership: "freelance" },
  "ss-4026": { ownership: "sole" },
  "ss-4027": { ownership: "sole" },
  "ss-4028": { ownership: "co-owned", with: ["pr"] },
  "ss-4029": { ownership: "byline" },
  "ss-4030": { ownership: "sole" },
};

/**
 * When the copy actually landed. Only the forecasts that have been delivered have
 * one — that is what makes the timeliness KPIs mean something.
 * [contentId, submittedOn]
 */
const submittedOn: Record<string, string> = {
  "ss-4001": "2026-06-12", "ss-4002": "2026-06-29", "ss-4003": "2026-07-03",
  "ss-4004": "2026-07-14", "ss-4005": "2026-07-17", "ss-4006": "2026-07-27",
  "ss-4007": "2026-08-07", "ss-4008": "2026-08-14", "ss-4009": "2026-08-25",
  "ss-4010": "2026-08-28", "ss-4011": "2026-09-04",
};

const managerFor: Record<string, string> = {
  ao: "gk", tb: "gk", jw: "gk", da: "gk",
  rc: "er", pr: "er", mc: "er", sm: "er",
};

export const content: ContentItem[] = contentRows.map(
  ([id, title, type, vertical, season, forecasterId, submissionDate, publicationDate, status, notes]) => ({
    id,
    title,
    type,
    vertical,
    season,
    forecasterId,
    managerId: managerFor[forecasterId] ?? "gk",
    submissionDate,
    publicationDate,
    status,
    notes,
    submittedOn: submittedOn[id],
    ownership: credit[id]?.ownership ?? "sole",
    contributorIds: credit[id]?.with,
  }),
);

/**
 * The KPIs.
 *
 * Two kinds. "derived" ones the Hub works out from the schedule it already
 * holds, so they are live today. "supplied" ones come from a sheet or feed
 * maintained elsewhere — the shape is fixed, the numbers arrive later.
 */
export const metrics: MetricDefinition[] = [
  // --- Output, read against the average for the person's role -------------
  {
    id: "reports-owned",
    label: "Forecasts owned",
    unit: "count",
    better: "higher",
    source: "derived",
    group: "Output",
    benchmark: "halfYearAverage",
    description:
      "Sole plus co-owned — what the sheet calls total reports owned. Byline and freelance are counted separately.",
  },
  {
    id: "sole-owned",
    label: "Solely owned",
    unit: "count",
    better: "higher",
    source: "derived",
    group: "Output",
    benchmark: "soleOwned",
    description: "Forecasts where this forecaster is the only person tagged as owner.",
  },
  {
    id: "co-owned",
    label: "Co-owned",
    unit: "count",
    better: "higher",
    source: "derived",
    group: "Output",
    benchmark: "coOwned",
    description: "Forecasts owned jointly, counted for everyone credited.",
  },
  {
    id: "byline-contributions",
    label: "Byline contributions",
    unit: "count",
    better: "higher",
    source: "derived",
    group: "Output",
    benchmark: "byline",
    description: "Forecasts contributed to with a byline rather than owned.",
  },
  {
    id: "freelance",
    label: "Freelance commissioned",
    unit: "count",
    better: "higher",
    source: "derived",
    group: "Output",
    benchmark: "freelanced",
    description: "Forecasts written by a freelancer under this forecaster.",
  },
  {
    id: "forecasts-published",
    label: "Published",
    unit: "count",
    better: "higher",
    source: "derived",
    group: "Output",
    description: "Forecasts that went live on the platform in the period.",
  },

  // --- Tier mix: the taxonomy gives this away for free --------------------
  {
    id: "tier-1",
    label: "Tier 1 — Decide",
    unit: "count",
    better: "higher",
    source: "derived",
    group: "Tier mix",
    description: "Decision-defining forecasts. Scarce by design.",
  },
  {
    id: "tier-2",
    label: "Tier 2 — Understand",
    unit: "count",
    better: "higher",
    source: "derived",
    group: "Tier mix",
    description: "Depth, evidence and application. Regular and reliable.",
  },
  {
    id: "tier-3",
    label: "Tier 3 — Track",
    unit: "count",
    better: "higher",
    source: "derived",
    group: "Tier mix",
    description: "Awareness and early signals. High frequency, built for scanning.",
  },

  // --- Timeliness --------------------------------------------------------
  {
    id: "on-time-rate",
    label: "Submitted on time",
    unit: "percent",
    better: "higher",
    source: "derived",
    group: "Timeliness",
    target: 90,
    description:
      "Share of submissions that reached the editor on or before the agreed date.",
  },
  {
    id: "days-late",
    label: "Average days late",
    unit: "days",
    better: "lower",
    source: "derived",
    group: "Timeliness",
    target: 0,
    description:
      "Averaged across submissions in the period; on time counts as zero. Zero delays is the target.",
  },
  {
    id: "late-submissions",
    label: "Late submissions",
    unit: "count",
    better: "lower",
    source: "derived",
    group: "Timeliness",
    target: 0,
    description: "Submissions that reached the editor after the agreed date. Zero is the target.",
  },
  {
    id: "editor-late",
    label: "Editor late",
    unit: "count",
    better: "lower",
    source: "supplied",
    group: "Timeliness",
    target: 0,
    description:
      "Delays counted against the editor's dates, as recorded in the KPI sheet. Zero delays is the target.",
  },

  // --- Quality and standards: supplied ------------------------------------
  {
    id: "qual-of-quant",
    label: "Qual of quant",
    unit: "percent",
    better: "higher",
    source: "supplied",
    group: "Quality",
    target: 100,
    ceiling: 100,
    description:
      "Quality-of-quantity assessment. 100% is the ceiling — it cannot be beaten, only met.",
  },
  {
    id: "dei",
    label: "DEI commitments met",
    unit: "count",
    better: "higher",
    source: "supplied",
    group: "Quality",
    target: 1,
    description:
      "Against the required number, with anything extra on top. Supplied from the KPI sheet.",
  },
  {
    id: "ai-projections",
    label: "AI projections",
    unit: "percent",
    better: "higher",
    source: "supplied",
    group: "Quality",
    ceiling: 100,
    description: "AI projections as a share of the total content made in the period.",
  },
  {
    id: "ai-usage",
    label: "AI used in forecasts",
    unit: "percent",
    better: "higher",
    source: "supplied",
    group: "Quality",
    notKpi: true,
    ceiling: 100,
    description:
      "Share of the total content made. Tracked for visibility, explicitly not a KPI — nobody is measured up or down on it.",
  },

  // --- Client and commercial: supplied ------------------------------------
  {
    id: "vas-salesforce",
    label: "VAS (Salesforce)",
    unit: "count",
    better: "higher",
    source: "supplied",
    group: "Client",
    description: "Value Added Services delivered, as logged in Salesforce.",
  },
  {
    id: "additional-client-calls",
    label: "Additional client calls",
    unit: "count",
    better: "higher",
    source: "supplied",
    group: "Client",
    description:
      "Enterprise sessions, client calls, analyst calls and presentations beyond the VAS count.",
  },
  {
    id: "marketing-presentations",
    label: "Marketing / internal talks",
    unit: "count",
    better: "higher",
    source: "supplied",
    group: "Client",
    description: "Marketing and internal presentations given.",
  },
  {
    id: "awards",
    label: "Awards",
    unit: "count",
    better: "higher",
    source: "supplied",
    group: "Client",
    description: "Award wins and shortlistings.",
  },

  // --- H2 TFDB focus: supplied -------------------------------------------
  {
    id: "tfdb-proof-points",
    label: "Proof points to TFDB",
    unit: "count",
    better: "higher",
    source: "supplied",
    group: "TFDB",
    description: "Proof points contributed to the Trend Forecasting Database.",
  },
  {
    id: "tfdb-trends",
    label: "Trends in TFDB",
    unit: "count",
    better: "higher",
    source: "supplied",
    group: "TFDB",
    description: "Trends entered into the Trend Forecasting Database.",
  },
  {
    id: "trend-profiles-owned",
    label: "Trend profiles owned",
    unit: "count",
    better: "higher",
    source: "supplied",
    group: "TFDB",
    description: "Trend profiles this forecaster owns.",
  },

  // --- Team --------------------------------------------------------------
  {
    id: "peer-reviews-given",
    label: "Peer reviews given",
    unit: "count",
    better: "higher",
    source: "derived",
    group: "Team",
    description: "Reviews where this forecaster was the reviewer.",
  },
  {
    id: "sessions-attended",
    label: "Sessions attended",
    unit: "count",
    better: "higher",
    source: "derived",
    group: "Team",
    description: "Workshops and knowledge-sharing sessions they had a place on.",
  },
];

/**
 * Sample readings for the supplied metrics, so the page has something in it
 * before the real feed is connected. [metricId, personId, date, value]
 */
type ObservationRow = [string, string, string, number];

const forecasterIds = ["ao", "tb", "rc", "pr", "jw", "mc", "da", "sm"];

const observationRows: ObservationRow[] = [];
// A plausible spread across the last six months, steady rather than random.
const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
/**
 * Sample readings for the supplied metrics. These are invented forecasters, so
 * the figures are illustrative — enough to see every metric read the way the
 * KPI sheet reads it, with nothing taken from the real sheet.
 */
const vasByPerson: Record<string, number[]> = {
  ao: [1, 2, 1, 2, 1, 0],
  tb: [0, 1, 1, 0, 1, 0],
  rc: [2, 1, 2, 2, 3, 1],
  pr: [1, 1, 0, 1, 1, 0],
  jw: [1, 0, 2, 1, 1, 1],
  mc: [0, 1, 1, 1, 0, 0],
  da: [2, 2, 1, 3, 2, 1],
  sm: [0, 0, 1, 1, 0, 0],
};
const callsByPerson: Record<string, number[]> = {
  ao: [4, 6, 5, 7, 5, 3],
  tb: [2, 3, 4, 3, 4, 2],
  rc: [6, 5, 7, 6, 8, 4],
  pr: [3, 4, 3, 5, 4, 2],
  jw: [5, 4, 6, 5, 5, 3],
  mc: [2, 2, 3, 4, 3, 1],
  da: [7, 8, 6, 9, 7, 4],
  sm: [1, 2, 2, 3, 2, 1],
};

/** Zero delays is the target, so most months are zero and a few are not. */
const editorLateByPerson: Record<string, number[]> = {
  ao: [0, 1, 0, 0, 1, 0],
  tb: [0, 0, 1, 0, 0, 0],
  rc: [0, 0, 0, 0, 0, 0],
  pr: [1, 0, 2, 1, 0, 1],
  jw: [0, 0, 0, 1, 0, 0],
  mc: [0, 1, 0, 0, 0, 0],
  da: [0, 0, 0, 0, 1, 0],
  sm: [0, 0, 0, 0, 0, 0],
};

/** Percentages are a monthly reading rather than something to add up. */
const qualByPerson: Record<string, number> = {
  ao: 100, tb: 90, rc: 100, pr: 80, jw: 100, mc: 90, da: 100, sm: 100,
};
const aiProjectionsByPerson: Record<string, number> = {
  ao: 50, tb: 30, rc: 60, pr: 20, jw: 40, mc: 30, da: 70, sm: 25,
};
const aiUsageByPerson: Record<string, number> = {
  ao: 35, tb: 20, rc: 45, pr: 15, jw: 30, mc: 25, da: 55, sm: 20,
};
const deiByPerson: Record<string, number> = {
  ao: 1, tb: 1, rc: 2, pr: 1, jw: 1, mc: 0, da: 1, sm: 1,
};
const marketingByPerson: Record<string, number> = {
  ao: 3, tb: 1, rc: 5, pr: 2, jw: 2, mc: 1, da: 4, sm: 1,
};
const awardsByPerson: Record<string, number> = {
  ao: 1, tb: 0, rc: 2, pr: 0, jw: 0, mc: 0, da: 1, sm: 0,
};
const tfdbByPerson: Record<string, [number, number, number]> = {
  ao: [12, 4, 3], tb: [7, 2, 2], rc: [15, 6, 4], pr: [9, 3, 2],
  jw: [11, 4, 3], mc: [6, 2, 1], da: [14, 5, 4], sm: [5, 2, 1],
};

for (const personId of forecasterIds) {
  months.forEach((month, i) => {
    observationRows.push(["vas-salesforce", personId, `${month}-15`, vasByPerson[personId][i]]);
    observationRows.push([
      "additional-client-calls",
      personId,
      `${month}-20`,
      callsByPerson[personId][i],
    ]);
    observationRows.push(["editor-late", personId, `${month}-25`, editorLateByPerson[personId][i]]);
  });

  // One reading per half-year for the assessed measures and the H2 focus.
  observationRows.push(["qual-of-quant", personId, "2026-06-30", qualByPerson[personId]]);
  observationRows.push(["ai-projections", personId, "2026-06-30", aiProjectionsByPerson[personId]]);
  observationRows.push(["ai-usage", personId, "2026-06-30", aiUsageByPerson[personId]]);
  observationRows.push(["dei", personId, "2026-06-30", deiByPerson[personId]]);
  observationRows.push(["marketing-presentations", personId, "2026-06-30", marketingByPerson[personId]]);
  observationRows.push(["awards", personId, "2026-06-30", awardsByPerson[personId]]);
  const [proof, trends, profiles] = tfdbByPerson[personId];
  observationRows.push(["tfdb-proof-points", personId, "2026-08-31", proof]);
  observationRows.push(["tfdb-trends", personId, "2026-08-31", trends]);
  observationRows.push(["trend-profiles-owned", personId, "2026-08-31", profiles]);
}

export const metricObservations: MetricObservation[] = observationRows.map(
  ([metricId, personId, date, value]) => ({ metricId, personId, date, value }),
);

/**
 * The knowledge-sharing programme. Sign-ups are seeded so the page shows a
 * realistic mix of states: places left, nearly full, full with a waitlist,
 * and the required sessions nobody opts into.
 */
export const sessions: KnowledgeSession[] = [
  {
    id: "ws-201",
    title: "S/S 28 Colour Workshop",
    kind: "workshop",
    hostId: "ao",
    date: "2026-09-17",
    startTime: "10:00",
    endTime: "13:00",
    location: "London studio, Level 3",
    online: false,
    capacity: 14,
    signUpsOpen: true,
    summary:
      "Working session on the S/S 28 palette. Bring your vertical's swatches — we sign off colour chips as a group and agree the six key colours.",
    topics: ["Colour", "S/S 28", "Cross-vertical"],
  },
  {
    id: "ws-202",
    title: "House Style Refresher",
    kind: "training",
    hostId: "gk",
    date: "2026-09-24",
    startTime: "14:00",
    endTime: "15:30",
    location: "Remote (Zoom)",
    online: true,
    capacity: 20,
    signUpsOpen: true,
    summary:
      "What changed in the style guide this year, the headline conventions we keep getting notes on, and how to structure a Trend Curve so it needs fewer edits.",
    topics: ["Writing", "Editorial standards"],
  },
  {
    id: "ws-203",
    title: "Lunch & Learn: Reading Retail Data Without Getting Fooled",
    kind: "lunch-and-learn",
    hostId: "da",
    date: "2026-09-30",
    startTime: "12:30",
    endTime: "13:15",
    location: "Remote (Zoom)",
    online: true,
    capacity: 30,
    signUpsOpen: true,
    summary:
      "Sell-through, sell-in and the traps in between. Half an hour on the mistakes that make a market report say the opposite of what the numbers show.",
    topics: ["Data", "Market analysis"],
  },
  {
    id: "ws-204",
    title: "A/W 28/29 Concept Kick-off",
    kind: "workshop",
    hostId: "gk",
    date: "2026-10-08",
    startTime: "09:30",
    endTime: "16:30",
    location: "London studio, The Forum",
    online: false,
    capacity: null,
    signUpsOpen: false,
    required: true,
    summary:
      "Two days setting the A/W 28/29 direction across every vertical. Whole team — no sign-up needed, and the commissioning grid comes out of it.",
    topics: ["A/W 28/29", "Whole team"],
  },
  {
    id: "ws-205",
    title: "Catwalk Critique: Paris Debrief",
    kind: "critique",
    hostId: "ao",
    date: "2026-10-12",
    startTime: "11:00",
    endTime: "12:30",
    location: "London studio, Level 3",
    online: false,
    capacity: 16,
    signUpsOpen: true,
    summary:
      "Open critique of the Paris coverage while it is fresh. We read each other's copy out loud, which is uncomfortable and works.",
    topics: ["Catwalk", "Critique", "S/S 28"],
  },
  {
    id: "ws-206",
    title: "Masterclass: Coloro and How Colour Systems Actually Work",
    kind: "masterclass",
    hostExternal: "Guest speaker, Coloro",
    date: "2026-10-15",
    startTime: "10:00",
    endTime: "12:00",
    location: "London studio, The Forum",
    online: false,
    capacity: 12,
    signUpsOpen: true,
    summary:
      "The system behind the codes we publish: how Coloro references are built, why they beat hex for manufacture, and how to specify colour a supplier can hit.",
    topics: ["Colour", "Coloro", "Guest"],
  },
  {
    id: "ws-207",
    title: "Data Storytelling for Forecasters",
    kind: "training",
    hostId: "da",
    date: "2026-10-29",
    startTime: "14:00",
    endTime: "16:00",
    location: "Remote (Zoom)",
    online: true,
    capacity: 25,
    signUpsOpen: true,
    summary:
      "Turning a spreadsheet into a chart that argues something. Practical session — bring a dataset from your own vertical and leave with one finished exhibit.",
    topics: ["Data", "Charts", "Writing"],
  },
  {
    id: "ws-208",
    title: "Big Ideas 2029 Ideation",
    kind: "workshop",
    hostId: "er",
    date: "2026-11-05",
    startTime: "10:00",
    endTime: "15:00",
    location: "Remote (Miro + Zoom)",
    online: true,
    capacity: 18,
    signUpsOpen: true,
    summary:
      "First pass at the 2029 Big Ideas. Wide open at this stage — the aim is fifty candidates on the board, not five good ones.",
    topics: ["Big Ideas", "2029", "Cross-vertical"],
  },
  {
    id: "ws-209",
    title: "Lunch & Learn: Inside a Consumer Attitudes Survey",
    kind: "lunch-and-learn",
    hostId: "mc",
    date: "2026-11-19",
    startTime: "12:30",
    endTime: "13:15",
    location: "Remote (Zoom)",
    online: true,
    capacity: 30,
    signUpsOpen: true,
    summary:
      "Where the survey panels come from, what the sample sizes let you claim, and the phrasing that quietly biases an answer.",
    topics: ["Consumer research", "Method"],
  },
  {
    id: "ws-210",
    title: "Masterclass: Trend Curve Methodology",
    kind: "masterclass",
    hostId: "jw",
    date: "2026-11-26",
    startTime: "10:00",
    endTime: "12:30",
    location: "London studio, Level 3",
    online: false,
    capacity: 8,
    signUpsOpen: true,
    summary:
      "How a trend gets placed on the curve, what evidence moves it a stage, and how to defend the call when a client disagrees.",
    topics: ["Method", "TrendCurve"],
  },
  {
    id: "ws-211",
    title: "Quarterly Forecast Review",
    kind: "workshop",
    hostId: "gk",
    date: "2026-12-03",
    startTime: "10:00",
    endTime: "13:00",
    location: "Remote (Zoom)",
    online: true,
    capacity: null,
    signUpsOpen: false,
    required: true,
    summary:
      "What we called right, what we called early, and what we got wrong. Whole team, and the honest half is the useful half.",
    topics: ["Review", "Whole team"],
  },
  {
    id: "ws-101",
    title: "Writing Punchier Headlines",
    kind: "training",
    hostId: "gk",
    date: "2026-08-20",
    startTime: "14:00",
    endTime: "15:00",
    location: "Remote (Zoom)",
    online: true,
    capacity: 25,
    signUpsOpen: false,
    summary:
      "Forty minutes on titles that say something. Recording and the before/after examples are in the recap.",
    topics: ["Writing", "Editorial standards"],
    recapUrl: "#recap-ws-101",
  },
  {
    id: "ws-102",
    title: "Masterclass: Forecasting for Beauty",
    kind: "masterclass",
    hostId: "rc",
    date: "2026-08-27",
    startTime: "10:00",
    endTime: "12:00",
    location: "London studio, Level 3",
    online: false,
    capacity: 12,
    signUpsOpen: false,
    summary:
      "How beauty cycles differ from apparel — shorter, more ingredient-led, and far more sensitive to regulation.",
    topics: ["Beauty", "Method"],
    recapUrl: "#recap-ws-102",
  },
  {
    id: "ws-103",
    title: "Lunch & Learn: Inside the Photography Desk",
    kind: "lunch-and-learn",
    hostId: "er",
    date: "2026-09-03",
    startTime: "12:30",
    endTime: "13:15",
    location: "Remote (Zoom)",
    online: true,
    capacity: 30,
    signUpsOpen: false,
    summary:
      "What the picture desk needs from a brief, how long a shoot really takes, and why late image requests are the main cause of a slipped publication date.",
    topics: ["Process", "Photography"],
    recapUrl: "#recap-ws-103",
  },
];

/** Seeded sign-ups: [sessionId, going[], waiting[]] */
export const signUps: Record<string, { going: string[]; waiting: string[] }> = {
  "ws-201": { going: ["ao", "rc", "pr", "sm", "jw"], waiting: [] },
  "ws-202": { going: ["tb", "sm"], waiting: [] },
  "ws-203": { going: ["da", "mc", "jw", "tb", "pr", "gk"], waiting: [] },
  "ws-205": { going: ["ao", "tb", "er"], waiting: [] },
  "ws-206": { going: ["ao", "rc", "pr", "sm", "jw", "mc", "tb", "da", "er", "gk"], waiting: [] },
  "ws-207": { going: ["da", "mc"], waiting: [] },
  "ws-208": { going: ["er", "ao", "rc"], waiting: [] },
  "ws-209": { going: ["mc"], waiting: [] },
  // Full, with a queue — so the waitlist behaviour is visible in the POC.
  "ws-210": {
    going: ["jw", "tb", "rc", "pr", "mc", "da", "sm", "er"],
    waiting: ["gk"],
  },
  "ws-101": { going: ["ao", "tb", "rc", "pr", "jw"], waiting: [] },
  "ws-102": { going: ["rc", "ao", "sm"], waiting: [] },
  "ws-103": { going: ["er", "pr", "mc", "sm", "jw"], waiting: [] },
};

/** [id, type, title, startDate, endDate, personId?, region?, location?] */
type EventRow = [
  string, EventType, string, string, string, string?, string?, string?,
];

const eventRows: EventRow[] = [
  ["ev-101", "public-holiday", "Summer Bank Holiday", "2026-08-31", "2026-08-31", undefined, "UK"],
  ["ev-102", "public-holiday", "Labor Day", "2026-09-07", "2026-09-07", undefined, "US"],
  ["ev-103", "public-holiday", "Mid-Autumn Festival", "2026-09-25", "2026-09-25", undefined, "SG"],
  ["ev-104", "public-holiday", "Gandhi Jayanti", "2026-10-02", "2026-10-02", undefined, "IN"],
  ["ev-105", "public-holiday", "All Saints' Day", "2026-11-01", "2026-11-01", undefined, "FR"],
  ["ev-106", "public-holiday", "Thanksgiving", "2026-11-26", "2026-11-27", undefined, "US"],
  ["ev-107", "public-holiday", "Christmas closure", "2026-12-24", "2027-01-01", undefined, "All"],
  ["ev-201", "leave", "Annual leave", "2026-09-14", "2026-09-18", "rc"],
  ["ev-202", "leave", "Annual leave", "2026-09-28", "2026-10-02", "mc"],
  ["ev-203", "leave", "Annual leave", "2026-10-12", "2026-10-23", "tb"],
  ["ev-204", "leave", "Annual leave", "2026-11-09", "2026-11-13", "jw"],
  ["ev-205", "leave", "Parental leave", "2026-11-02", "2026-12-11", "sm"],
  ["ev-206", "leave", "Annual leave", "2026-12-14", "2026-12-23", "ao"],
  // Workshops and training live in `sessions` — people sign up for those.
  ["ev-501", "conference", "Paris Fashion Week", "2026-09-28", "2026-10-06", undefined, undefined, "Paris"],
  ["ev-502", "conference", "Salone Satellite Preview", "2026-11-18", "2026-11-20", undefined, undefined, "Milan"],
];

export const events: CalendarEvent[] = eventRows.map(
  ([id, type, title, startDate, endDate, personId, region, location]) => ({
    id,
    type,
    title,
    startDate,
    endDate,
    personId,
    region,
    location,
  }),
);


/**
 * The trend database, in the shape the TFDB sheet holds it.
 *
 * The trends themselves are invented, and the owners are the invented people
 * above — no real profile, author or comment from the sheet is copied here.
 * What is taken from it is structure: the columns, the trend types, the
 * Invest/Test/Expand/Protect call, the industry list, the label groups, and
 * the fact that a profile carries a cover image, an editor link and a live
 * link. The Hub reads the real rows from the sheet in a deployed environment.
 *
 * [id, profileId, title, slug, ownerId, types, call, publishedOn,
 *  activeFrom, activeTo, strategies, proofPoints, industries, scored,
 *  description, needToKnow]
 */
type TrendRow = [
  string, string, string, string, string, string[], TrendCall | undefined,
  string, string, string, number, number, string[], string[], string, string,
];

/** The industries a profile can be tagged to and scored for. */
export const TREND_INDUSTRIES = [
  "Beauty",
  "Consumer Tech",
  "Fashion",
  "Food & Drink",
  "Interiors",
  "Sports & Outdoor",
  "Overall",
];

/** The trend types, as the sheet lists them. A profile can carry several. */
export const TREND_TYPES = ["Design & Aesthetic", "Lifestyle", "Product / Item", "Systemic"];

export const TREND_CALLS: TrendCall[] = ["Protect", "Test", "Expand", "Invest"];

const trendRows: TrendRow[] = [
  ["485", "6a26a48c4abf618f8254aec4", "Repair as Retail", "repair-as-retail", "ao",
   ["Systemic", "Lifestyle"], "Invest", "2026-07-30", "2027-01-01", "2030-12-31", 5, 14,
   ["Fashion", "Interiors", "Overall"], ["Fashion", "Overall"],
   "Repair moves from a service desk at the back of the shop to the reason for the visit, with pricing, waiting lists and a trained bench behind it.",
   "Mending becomes a product line rather than an aftercare promise. Expect repair capacity, not repair messaging, to be the thing a shopper checks before buying."],
  ["488", "6a26ee1a4abf618f82585292", "Saturated Calm", "saturated-calm", "ao",
   ["Design & Aesthetic"], "Test", "2026-07-22", "2026-01-01", "2029-12-31", 3, 6,
   ["Fashion", "Interiors"], ["Fashion"],
   "High-chroma colour used at low volume: one saturated piece against quiet neutrals, rather than a saturated wardrobe.",
   "The appetite is for a single loud decision, not a loud whole. Ranges built entirely on brights will read as last season."],
  ["491", "69a8575479d056e468ea243d", "Proof of Origin", "proof-of-origin", "ao",
   ["Systemic"], undefined, "2026-07-15", "2027-06-01", "2035-12-31", 2, 3,
   ["Fashion", "Food & Drink", "Overall"], [],
   "Provenance stops being a marketing claim and becomes a scannable record that a shopper can check at the shelf.",
   "The claim is no longer the asset — the verifiable record is. Anyone without one will be read as having something to hide."],
  ["494", "6a1b3c7e4abf618f82441a09", "Value Over Volume", "value-over-volume", "tb",
   ["Lifestyle", "Product / Item"], "Invest", "2026-07-07", "2026-01-01", "2030-12-31", 6, 21,
   ["Fashion", "Sports & Outdoor", "Overall"],
   ["Fashion", "Sports & Outdoor", "Overall"],
   "Menswear buyers trade breadth for durability: fewer pieces, heavier cloth, and a willingness to pay for a jacket that lasts five winters.",
   "Unit growth is the wrong target in this category now. The winning ranges are shorter and dearer, with the wear life stated on the ticket."],
  ["497", "6a1c5d914abf618f8245bb31", "Soft Tailoring", "soft-tailoring", "tb",
   ["Design & Aesthetic", "Product / Item"], "Expand", "2026-07-20", "2026-01-01", "2029-12-31", 4, 11,
   ["Fashion"], ["Fashion"],
   "The unstructured jacket returns, cut long and worn with formal trousers — tailoring loosens without collapsing into loungewear.",
   "The distinction that matters is drape, not formality. Read this as a construction change rather than a dressing-down of the category."],
  ["502", "6a09fe224abf618f823fc7d8", "The Barrier Obsession", "the-barrier-obsession", "rc",
   ["Product / Item"], "Invest", "2026-03-31", "2026-01-01", "2029-01-31", 7, 26,
   ["Beauty", "Overall"], ["Beauty", "Overall"],
   "Skin barrier language moves from dermatology to the mass shelf, and claims shift from active strength to how little a product disturbs.",
   "Potency is no longer the proof point. Formulations will be judged on what they leave alone."],
  ["505", "6a0a11b34abf618f823fd944", "Skinimalism, Phase Three", "skinimalism-phase-three", "rc",
   ["Lifestyle", "Product / Item"], "Protect", "2026-07-09", "2026-01-01", "2028-12-31", 3, 18,
   ["Beauty"], ["Beauty"],
   "The pared-back routine consolidates: fewer steps, each doing more. The novelty has gone and what is left is a habit.",
   "This is a mature trend to defend rather than a new one to chase. The growth is in reformulating what people already buy."],
  ["508", "6a1e88c14abf618f8247d012", "Clinic at Home", "clinic-at-home", "rc",
   ["Product / Item", "Systemic"], "Test", "2026-07-24", "2027-01-01", "2030-12-31", 4, 5,
   ["Beauty", "Consumer Tech"], ["Beauty"],
   "Devices that used to need an appointment arrive as consumer products, and with them the question of who is accountable for the result.",
   "The regulatory position is the commercial risk here, not the technology. Watch liability language as closely as claims."],
  ["511", "6a20a4de4abf618f824911fe", "Quiet Kitchens", "quiet-kitchens", "pr",
   ["Design & Aesthetic", "Lifestyle"], "Expand", "2026-07-13", "2026-01-01", "2030-12-31", 5, 9,
   ["Interiors", "Consumer Tech"], ["Interiors"],
   "Kitchens designed to be heard less: soft-close everything, textiles on hard surfaces, and appliances chosen on decibels.",
   "Sound becomes a spec a shopper compares. Expect decibel figures on packaging where wattage used to be."],
  ["514", "6a21b7ff4abf618f824a3388", "Outdoor Living, Year Round", "outdoor-living-year-round", "pr",
   ["Lifestyle"], undefined, "2026-07-06", "2027-01-01", "2030-12-31", 3, 4,
   ["Interiors", "Sports & Outdoor"], [],
   "The garden becomes a winter room: heating, lighting and weatherproof upholstery extend the season at both ends.",
   "The season is no longer the constraint on the category. Ranges built for a summer window will miss most of the year."],
  ["517", "6a22c9104abf618f824b5599", "The Low Profile Shift", "the-low-profile-shift", "jw",
   ["Product / Item", "Design & Aesthetic"], "Invest", "2026-07-10", "2026-01-01", "2029-07-31", 4, 12,
   ["Fashion", "Sports & Outdoor"], ["Fashion", "Sports & Outdoor"],
   "Sneaker silhouettes flatten: the chunky sole recedes and the flat court shoe carries the volume in the upper instead.",
   "The volume has not gone, it has moved. Read upper construction rather than stack height to place a style."],
  ["520", "6a23da214abf618f824c77aa", "Post-Leather Materials", "post-leather-materials", "jw",
   ["Product / Item", "Systemic"], "Test", "2026-07-27", "2027-01-01", "2035-12-31", 2, 7,
   ["Fashion", "Interiors"], ["Fashion"],
   "Mycelium and plant-based coatings reach a price and a wear life a buyer will sign off, which moves the conversation from ethics to margin.",
   "The blocker is no longer the material's story but its second-year condition. Ask for wear data, not certificates."],
  ["523", "6a24eb324abf618f824d99bb", "Fermentation Goes Mainstream", "fermentation-goes-mainstream", "mc",
   ["Lifestyle", "Product / Item"], "Expand", "2026-07-16", "2026-01-01", "2030-12-31", 6, 15,
   ["Food & Drink", "Beauty"], ["Food & Drink"],
   "Fermented flavour moves from the specialist aisle to the centre of the plate, and with it a tolerance for sourness in mass products.",
   "Sourness is now a mainstream flavour cue rather than an acquired taste. Reformulating down the sweetness scale is the opportunity."],
  ["526", "6a25fc434abf618f824ebbcc", "Low-Alcohol, High-Design", "low-alcohol-high-design", "mc",
   ["Design & Aesthetic", "Product / Item"], "Invest", "2026-08-06", "2026-01-01", "2030-12-31", 5, 19,
   ["Food & Drink", "Overall"], ["Food & Drink", "Overall"],
   "The no-and-low category stops apologising: packaging and pricing sit alongside the spirits they replace rather than below them.",
   "Price positioning is the signal here. A no-and-low range priced as a compromise will be read as one."],
  ["529", "6a270d544abf618f824fdddd", "Wearables After the Watch", "wearables-after-the-watch", "da",
   ["Product / Item"], undefined, "2026-07-30", "2027-01-01", "2030-12-31", 3, 6,
   ["Consumer Tech", "Sports & Outdoor"], [],
   "Sensing moves off the wrist and into rings, patches and clothing, which forces a rethink of where a screen is needed at all.",
   "The form factor question is really a screen question. Products that assume a display will look overbuilt."],
  ["532", "6a281e654abf618f8250ffee", "The Quiet Commute", "the-quiet-commute", "da",
   ["Lifestyle", "Systemic"], "Expand", "2026-07-21", "2026-01-01", "2029-12-31", 4, 8,
   ["Consumer Tech", "Interiors"], ["Consumer Tech"],
   "Noise control becomes the point of the journey rather than a feature of the headphones, and shapes what people carry.",
   "The category is quiet, not audio. Anything sold on sound quality alone is competing in the wrong race."],
  ["535", "6a292f764abf618f825221ff", "The Handed-Down Wardrobe", "the-handed-down-wardrobe", "sm",
   ["Systemic", "Product / Item"], "Invest", "2026-07-15", "2026-01-01", "2030-12-31", 5, 10,
   ["Fashion", "Overall"], ["Fashion"],
   "Kidswear bought to be passed on: sizing that grows, seams that survive a second child, and resale value quoted at the point of sale.",
   "Resale value becomes a first-sale argument. Construction that fails a second child will be visible in the resale data."],
  ["538", "6a2a40874abf618f82534400", "Play as Infrastructure", "play-as-infrastructure", "sm",
   ["Systemic", "Lifestyle"], undefined, "2026-07-13", "2027-01-01", "2035-12-31", 1, 2,
   ["Interiors", "Fashion"], [],
   "Play stops being a category of product and becomes a requirement of the space — in homes, in shops, and in the clothes themselves.",
   "This is a planning-and-fixtures trend before it is a product trend. The early signals are in retail design, not ranges."],
];

/**
 * The label groups the sheet carries. Vocabulary from the real taxonomy;
 * which profile gets which is invented.
 */
const trendLabels: Record<string, Record<string, string[]>> = {
  "485": {
    Generations: ["Gen Z", "Millennials", "Gen X"],
    Personas: ["The Keepers", "The Restorers"],
    Emotions: ["Quietude", "Strategic Joy"],
    Sustainability: ["Sustainability"],
    "Design & Aesthetics": ["Form & Function"],
  },
  "488": {
    Generations: ["Gen Z", "Millennials"],
    Personas: ["The Gleamers"],
    Emotions: ["Glimmers", "Flourishing"],
    CMF: ["CMF", "Colour", "Finish"],
    "Design & Aesthetics": ["Design Aesthetics", "Textiles"],
  },
  "491": { Generations: ["Alphas", "Betas", "Gen Z"], Personas: ["The Challengers"], Emotions: ["Selective Engagement"] },
  "494": { Generations: ["Gen X", "Boomers", "Millennials"], Markets: ["Men's"], Personas: ["The Keepers"], Emotions: ["Quietude"] },
  "497": { Generations: ["Gen X", "Millennials"], Markets: ["Men's"], "Design & Aesthetics": ["Design Aesthetics", "Trims & Details"] },
  "502": { Generations: ["Gen Z", "Millennials", "Gen X"], "Ingredients & Formulation": ["Ingredients", "Texture"], Emotions: ["Flourishing"] },
  "505": { Generations: ["Millennials", "Gen X"], "Ingredients & Formulation": ["Ingredients", "Format"], Emotions: ["Quietude"] },
  "508": { Generations: ["Gen X", "Boomers"], "Ingredients & Formulation": ["Format"], Personas: ["The Ascendants"] },
  "511": { Generations: ["Millennials", "Gen X", "Boomers"], "Design & Aesthetics": ["Form & Function"], Emotions: ["Quietude"] },
  "514": { Generations: ["Gen X", "Boomers"], "Design & Aesthetics": ["Form & Function"], Emotions: ["Flourishing"] },
  "517": { Generations: ["Gen Z", "Alphas"], Markets: ["Gender-Inclusive"], "Design & Aesthetics": ["Design Aesthetics"] },
  "520": { Generations: ["Gen Z", "Millennials"], Sustainability: ["Sustainability"], CMF: ["Material", "Finish"] },
  "523": { Generations: ["Gen Z", "Millennials"], "Ingredients & Formulation": ["Flavour", "Mouthfeel", "Ingredients"] },
  "526": { Generations: ["Gen Z", "Millennials"], "Ingredients & Formulation": ["Flavour"], Packaging: ["Packaging"], Personas: ["The Synergists"] },
  "529": { Generations: ["Gen Z", "Millennials"], "Design & Aesthetics": ["UX/UI", "Form & Function"], Personas: ["The Ascendants"] },
  "532": { Generations: ["Millennials", "Gen X"], "Design & Aesthetics": ["UX/UI"], Emotions: ["Quietude", "Witherwill"] },
  "535": { Generations: ["Alphas", "Millennials"], "Age Ranges": ["Baby/Toddler (0-3 years)", "Kids (3-8 years)", "Tween (9-12 years)"] },
  "538": { Generations: ["Alphas", "Betas"], "Age Ranges": ["Kids (3-8 years)", "Tween (9-12 years)"], Personas: ["The Restorers"] },
};

const trendHashtags: Record<string, string[]> = {
  "485": ["#Repair", "#CircularDesign", "#SlowLuxury"],
  "488": ["#SaturatedCalm", "#Colour28"],
  "491": ["#ProofOfOrigin", "#Traceability"],
  "494": ["#ValueOverVolume", "#Longevity"],
  "497": ["#SoftTailoring"],
  "502": ["#BarrierCare", "#SkinBarrier"],
  "505": ["#Skinimalism"],
  "508": ["#ClinicAtHome", "#BeautyTech"],
  "511": ["#QuietKitchens", "#wellnessrituals"],
  "514": ["#OutdoorLiving"],
  "517": ["#LowProfile", "#Sneakers"],
  "520": ["#PostLeather", "#Mycelium", "#deadstockdesign"],
  "523": ["#Fermentation", "#aperitif"],
  "526": ["#LowNoAlcohol", "#SoftSelling"],
  "529": ["#Wearables"],
  "532": ["#QuietCommute"],
  "535": ["#HandedDown", "#Resale"],
  "538": ["#PlayAsInfrastructure"],
};

/**
 * Second authors, where a profile has one. The sheet's AUTHORS column can
 * list several people; the Owner column names the one accountable for it.
 */
const trendCoAuthors: Record<string, string[]> = {
  "485": ["sm"],
  "494": ["jw"],
  "508": ["da"],
  "511": ["mc"],
  "526": ["rc"],
  "535": ["ao"],
};

/**
 * Cover images sit on the platform's media host, so they need the network.
 * Two profiles have none, which is what an owner has to fix — and in the
 * offline demo the rest fall back to the same stand-in, which is honest about
 * where the image comes from.
 */
const MEDIA = "https://media.wgsn.com/ss_image_store";
const noCover = new Set(["491", "538"]);

export const trends: TrendProfile[] = trendRows.map(
  (
    [
      id, profileId, title, slug, ownerId, types, call, publishedOn,
      activeFrom, activeTo, strategies, proofPoints, industries, scored,
      description, needToKnow,
    ],
    i,
  ) => ({
    id,
    profileId,
    title,
    slug,
    ownerId,
    authorIds: [ownerId, ...(trendCoAuthors[id] ?? [])],
    types,
    call,
    publishedOn,
    activeFrom,
    activeTo,
    editorUrl: `https://www.wgsn.com/report-editor/${profileId}`,
    publishedUrl: `https://www.wgsn.com/trends/${slug}`,
    coverImageUrl: noCover.has(id)
      ? undefined
      : `${MEDIA}/${(i + 11) * 7}/${(i + 3) * 13}/original_WGSN_${slug.replace(/-/g, "_")}.jpg`,
    description,
    needToKnow,
    // The full opportunity write-up lives in Content Editor; the sheet's
    // column runs to a couple of thousand words, so the Hub links out to it.
    opportunity: `${needToKnow} The full opportunity, by industry, is in the profile.`,
    strategies,
    proofPoints,
    industries,
    scored,
    missingScore: industries.filter((ind) => !scored.includes(ind)),
    hashtags: trendHashtags[id] ?? [],
    labels: trendLabels[id] ?? {},
    lastSynced: "2026-09-07",
  }),
);
