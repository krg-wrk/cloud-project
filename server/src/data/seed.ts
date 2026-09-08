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
    target: 1,
    description: "Averaged across submissions in the period; on time counts as zero.",
  },
  {
    id: "late-submissions",
    label: "Late submissions",
    unit: "count",
    better: "lower",
    source: "derived",
    group: "Timeliness",
    description: "Submissions that reached the editor after the agreed date.",
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
    description: "Quality-of-quantity assessment. Supplied from the KPI sheet.",
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
    description: "Progress against the AI projection commitment. Supplied from the KPI sheet.",
  },
  {
    id: "ai-usage",
    label: "AI used in forecasts",
    unit: "percent",
    better: "higher",
    source: "supplied",
    group: "Quality",
    notKpi: true,
    description:
      "Tracked for visibility, explicitly not a KPI — nobody is measured up or down on it.",
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
 * Only two of the supplied metrics are given sample values, so the rest show
 * their real state — "awaiting data" — rather than inventing performance
 * figures for people.
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

for (const personId of forecasterIds) {
  months.forEach((month, i) => {
    observationRows.push(["vas-salesforce", personId, `${month}-15`, vasByPerson[personId][i]]);
    observationRows.push([
      "additional-client-calls",
      personId,
      `${month}-20`,
      callsByPerson[personId][i],
    ]);
  });
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
