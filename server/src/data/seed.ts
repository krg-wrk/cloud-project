import type { AccessRow } from "../auth.js";
import type {
  CalendarEvent,
  ContentItem,
  ContentType,
  EventType,
  KnowledgeSession,
  Person,
  Status,
  Vertical,
} from "../types.js";

export const people: Person[] = [
  { id: "gk", name: "Graham Krag", email: "graham.krag@wgsn.com", role: "commissioning-manager", region: "UK" },
  { id: "er", name: "Elena Roux", email: "elena.roux@wgsn.com", role: "commissioning-manager", region: "FR" },
  { id: "ao", name: "Amara Okafor", email: "amara.okafor@wgsn.com", role: "forecaster", vertical: "Womenswear", region: "UK" },
  { id: "tb", name: "Tomas Belka", email: "tomas.belka@wgsn.com", role: "forecaster", vertical: "Menswear", region: "CZ" },
  { id: "rc", name: "Rina Castellano", email: "rina.castellano@wgsn.com", role: "forecaster", vertical: "Beauty", region: "IT" },
  { id: "pr", name: "Priya Raman", email: "priya.raman@wgsn.com", role: "forecaster", vertical: "Interiors & Lifestyle", region: "IN" },
  { id: "jw", name: "Joss Whitaker", email: "joss.whitaker@wgsn.com", role: "forecaster", vertical: "Footwear & Accessories", region: "UK" },
  { id: "mc", name: "Mei Lin Chow", email: "meilin.chow@wgsn.com", role: "forecaster", vertical: "Food & Drink", region: "SG" },
  { id: "da", name: "Dele Adeyemi", email: "dele.adeyemi@wgsn.com", role: "forecaster", vertical: "Consumer Tech", region: "US" },
  { id: "sm", name: "Sofia Marchetti", email: "sofia.marchetti@wgsn.com", role: "forecaster", vertical: "Kidswear", region: "IT" },
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
  ["ss-4008", "Big Idea 2028: The Repair Economy", "Big Idea", "Womenswear", "A/W 27/28", "ao", "2026-08-14", "2026-09-01", "published"],
  ["ss-4009", "Colour Forecast S/S 28: Saturated Calm", "Colour Forecast", "Womenswear", "S/S 28", "ao", "2026-08-21", "2026-09-08", "in-review", "Colour chips with the studio, swatch sign-off outstanding."],
  ["ss-4010", "Catwalk Report: Milan Menswear", "Catwalk Report", "Menswear", "S/S 28", "tb", "2026-08-28", "2026-09-10", "submitted"],
  ["ss-4011", "Skinimalism, Phase Three", "Trend Curve", "Beauty", "S/S 28", "rc", "2026-09-04", "2026-09-15", "in-review"],
  ["ss-4012", "Season Forecast S/S 28: Womenswear Key Items", "Season Forecast", "Womenswear", "S/S 28", "ao", "2026-09-11", "2026-09-25", "in-progress"],
  ["ss-4013", "Quiet Kitchens: Interiors Materials Update", "Market Report", "Interiors & Lifestyle", "S/S 28", "pr", "2026-09-09", "2026-09-22", "at-risk", "Photography still to be commissioned — flagged with the picture desk."],
  ["ss-4014", "Sneaker Silhouettes: The Low Profile Shift", "Trend Curve", "Footwear & Accessories", "S/S 28", "jw", "2026-09-15", "2026-09-29", "in-progress"],
  ["ss-4015", "Fermentation Goes Mainstream", "Consumer Attitudes", "Food & Drink", "S/S 28", "mc", "2026-09-16", "2026-09-30", "in-progress"],
  ["ss-4016", "Wearables After the Watch", "Market Report", "Consumer Tech", "S/S 28", "da", "2026-09-18", "2026-10-02", "not-started"],
  ["ss-4017", "Kidswear Colour Forecast S/S 28", "Colour Forecast", "Kidswear", "S/S 28", "sm", "2026-09-22", "2026-10-06", "in-progress"],
  ["ss-4018", "Catwalk Report: Paris Womenswear", "Catwalk Report", "Womenswear", "S/S 28", "ao", "2026-09-25", "2026-10-08", "not-started", "Shows run 28 Sep – 6 Oct, tight turnaround agreed."],
  ["ss-4019", "Case Study: A Resale Programme That Paid", "Case Study", "Womenswear", "A/W 27/28", "ao", "2026-09-30", "2026-10-14", "not-started"],
  ["ss-4020", "Menswear Key Items A/W 28/29", "Season Forecast", "Menswear", "A/W 28/29", "tb", "2026-10-02", "2026-10-16", "not-started"],
  ["ss-4021", "The New Fragrance Consumer", "Consumer Attitudes", "Beauty", "S/S 28", "rc", "2026-10-06", "2026-10-20", "not-started"],
  ["ss-4022", "Big Idea 2028: Slow Tech", "Big Idea", "Consumer Tech", "A/W 28/29", "da", "2026-10-09", "2026-10-23", "not-started"],
  ["ss-4023", "Outdoor Living, Year Round", "Trend Curve", "Interiors & Lifestyle", "A/W 28/29", "pr", "2026-10-13", "2026-10-27", "not-started"],
  ["ss-4024", "Bag Shapes: The Structured Return", "Season Forecast", "Footwear & Accessories", "A/W 28/29", "jw", "2026-10-16", "2026-10-30", "not-started"],
  ["ss-4025", "Low-Alcohol, High-Design", "Market Report", "Food & Drink", "A/W 28/29", "mc", "2026-10-20", "2026-11-03", "not-started"],
  ["ss-4026", "Kidswear Key Items A/W 28/29", "Season Forecast", "Kidswear", "A/W 28/29", "sm", "2026-10-23", "2026-11-06", "not-started"],
  ["ss-4027", "Colour Forecast A/W 28/29: Deep Earths", "Colour Forecast", "Womenswear", "A/W 28/29", "ao", "2026-10-28", "2026-11-11", "not-started"],
  ["ss-4028", "Beauty Devices: Clinic at Home", "Market Report", "Beauty", "A/W 28/29", "rc", "2026-11-03", "2026-11-17", "not-started"],
  ["ss-4029", "Catwalk Report: Copenhagen", "Catwalk Report", "Womenswear", "A/W 28/29", "ao", "2026-11-06", "2026-11-19", "not-started"],
  ["ss-4030", "Menswear Tailoring Softens Again", "Trend Curve", "Menswear", "A/W 28/29", "tb", "2026-11-10", "2026-11-24", "not-started"],
  ["ss-4031", "Case Study: Modular Furniture at Scale", "Case Study", "Interiors & Lifestyle", "A/W 28/29", "pr", "2026-11-13", "2026-11-27", "not-started"],
  ["ss-4032", "The Quiet Commute", "Consumer Attitudes", "Consumer Tech", "A/W 28/29", "da", "2026-11-17", "2026-12-01", "not-started"],
  ["ss-4033", "Footwear Materials: Post-Leather", "Market Report", "Footwear & Accessories", "A/W 28/29", "jw", "2026-11-20", "2026-12-04", "not-started"],
  ["ss-4034", "Snacking as a Meal Occasion", "Trend Curve", "Food & Drink", "A/W 28/29", "mc", "2026-11-24", "2026-12-08", "not-started"],
  ["ss-4035", "Big Idea 2029: Proof of Origin", "Big Idea", "Womenswear", "S/S 29", "ao", "2026-12-01", "2026-12-15", "not-started"],
  ["ss-4036", "Kidswear Consumer: The Handed-Down Wardrobe", "Consumer Attitudes", "Kidswear", "S/S 29", "sm", "2026-12-04", "2026-12-18", "not-started"],
  ["ss-4037", "Beauty Colour Forecast S/S 29", "Colour Forecast", "Beauty", "S/S 29", "rc", "2026-12-08", "2027-01-05", "not-started"],
  ["ss-4038", "Interiors Season Forecast S/S 29", "Season Forecast", "Interiors & Lifestyle", "S/S 29", "pr", "2026-12-11", "2027-01-08", "not-started"],
  ["ss-4039", "Menswear Catwalk Preview S/S 29", "Catwalk Report", "Menswear", "S/S 29", "tb", "2027-01-08", "2027-01-21", "not-started"],
  ["ss-4001", "Season Forecast A/W 27/28: Womenswear Key Items", "Season Forecast", "Womenswear", "A/W 27/28", "ao", "2026-06-12", "2026-06-26", "published"],
  ["ss-4002", "Catwalk Report: New York A/W 27/28", "Catwalk Report", "Womenswear", "A/W 27/28", "ao", "2026-06-26", "2026-07-09", "published"],
  ["ss-4003", "Beauty Big Idea: The Barrier Obsession", "Big Idea", "Beauty", "A/W 27/28", "rc", "2026-07-03", "2026-07-16", "published"],
  ["ss-4004", "Interiors Colour Forecast A/W 27/28", "Colour Forecast", "Interiors & Lifestyle", "A/W 27/28", "pr", "2026-07-10", "2026-07-23", "published"],
  ["ss-4005", "Trainers as Formalwear", "Trend Curve", "Footwear & Accessories", "A/W 27/28", "jw", "2026-07-17", "2026-07-30", "published"],
  ["ss-4006", "Menswear Consumer: Value Over Volume", "Consumer Attitudes", "Menswear", "A/W 27/28", "tb", "2026-07-24", "2026-08-06", "published"],
  ["ss-4007", "Asia-Pacific Food Retail Update", "Market Report", "Food & Drink", "A/W 27/28", "mc", "2026-08-07", "2026-08-20", "published"],
];

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
  }),
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
    topics: ["Method", "Trend Curve"],
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
