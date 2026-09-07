import type {
  CalendarEvent,
  ContentItem,
  ContentType,
  EventType,
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
  ["ev-301", "workshop", "S/S 28 Colour Workshop", "2026-09-17", "2026-09-17", undefined, undefined, "London studio"],
  ["ev-302", "workshop", "A/W 28/29 Concept Kick-off", "2026-10-08", "2026-10-09", undefined, undefined, "London studio"],
  ["ev-303", "workshop", "Big Ideas 2029 Ideation", "2026-11-05", "2026-11-05", undefined, undefined, "Remote"],
  ["ev-304", "workshop", "Quarterly Forecast Review", "2026-12-03", "2026-12-03", undefined, undefined, "Remote"],
  ["ev-401", "training", "House Style Refresher", "2026-09-24", "2026-09-24", undefined, undefined, "Remote"],
  ["ev-402", "training", "Data Storytelling for Forecasters", "2026-10-29", "2026-10-29", undefined, undefined, "Remote"],
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
