/**
 * The content taxonomy and the role benchmarks, taken from the Content KPIs
 * sheet.
 *
 * Two things live here because they are shared reference data rather than
 * anyone's numbers:
 *
 * TIERS are a hierarchy of importance and intent — Tier 1 decide, Tier 2
 * understand, Tier 3 track. A forecast's tier follows from its format, so
 * nobody has to tag it by hand: the Hub looks the format up here.
 *
 * ROLE BENCHMARKS are the averages a person's output is read against. A
 * Strategist and a Director are not expected to own the same number of
 * forecasts, so a count on its own says very little.
 */

export type Tier = 1 | 2 | 3;

export interface TierMeaning {
  tier: Tier;
  name: string;
  job: string;
  cadence: string;
}

export const TIER_MEANINGS: TierMeaning[] = [
  {
    tier: 1,
    name: "Decide",
    job: "Decision-defining forecasts — what should I act on?",
    cadence: "Scarce by design; planned, not reactive.",
  },
  {
    tier: 2,
    name: "Understand",
    job: "Depth, evidence and application — help me understand this properly.",
    cadence: "Regular and reliable; responds to Tier 1 themes.",
  },
  {
    tier: 3,
    name: "Track",
    job: "Awareness and early signals — what should I keep an eye on?",
    cadence: "High frequency, designed for scanning.",
  },
];

const TIER_1 = [
  "Big Ideas", "Design Futures", "Foresight Futures", "Foresight Strategies",
  "Future Consumer", "Future Of", "Generational Futures", "Leading Ideas",
  "Marketing Forecast", "Personas", "Retail Forecast", "Social Media Forecast",
  "Sustainability Forecast", "The Vision", "Youth Culture Forecast",
];

const TIER_2 = [
  "Aesthetic Drivers", "Aesthetics Evolution", "Application & Technique",
  "Branding", "Business Strategy", "Buyers' Briefing", "Case Study",
  "Category Annual Forecast", "Category Guides", "Category Outlooks",
  "Category Seasonal Forecast", "CMF Annual Forecast", "CMF Seasonal Forecast",
  "Consumer Priorities", "Core Item Updates", "Design Capsules", "Design Guides",
  "Dynamic Platform", "Industry Priorities", "Influencer Forecast", "Intelligence",
  "Key Icons", "Key Silhouettes", "Key Trends", "Lesson's Learnt/Debrief",
  "Licensing", "Marketing Strategy", "Mega Capsules",
  "Must Have Materials & Details", "Retail Analysis", "Retail Strategy",
  "Shopper Priorities", "Sign Off Checklist", "Social Analytics", "Sourcing Guides",
  "Sustainability & Innovation", "Sustainability Bulletin", "The Buyer's Roadmap",
  "The State of Interiors", "TikTok Analytics/Trading", "Trend Alert",
  "Trend Narratives", "Youth Radar",
];

const TIER_3 = [
  "Ask an Expert", "Brands to Watch", "Catwalks", "Cities to Watch",
  "Consumer Sentiment", "Digital Download", "Discovery Cities", "Essential Cities",
  "Live Intelligence", "Ones to Watch", "Podcast", "Street Style", "Trade Shows",
  "TrendCurve",
];

/** Every format we publish, with the tier it sits in. */
export const CONTENT_TYPES: { name: string; tier: Tier }[] = [
  ...TIER_1.map((name) => ({ name, tier: 1 as Tier })),
  ...TIER_2.map((name) => ({ name, tier: 2 as Tier })),
  ...TIER_3.map((name) => ({ name, tier: 3 as Tier })),
];

const TIER_BY_TYPE = new Map<string, Tier>(
  CONTENT_TYPES.map(({ name, tier }) => [normalise(name), tier]),
);

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");
}

/**
 * The tier for a format, or undefined when the format is not in the taxonomy
 * yet — better an honest gap than a wrong tier.
 */
export function tierFor(contentType: string | undefined): Tier | undefined {
  if (!contentType) return undefined;
  const key = normalise(contentType);
  const exact = TIER_BY_TYPE.get(key);
  if (exact) return exact;
  // Formats arrive with suffixes ("Colour Forecast S/S 28"), so fall back to
  // the longest taxonomy entry the value starts with.
  let best: { tier: Tier; length: number } | undefined;
  for (const { name, tier } of CONTENT_TYPES) {
    const candidate = normalise(name);
    if (key.startsWith(candidate) && (!best || candidate.length > best.length)) {
      best = { tier, length: candidate.length };
    }
  }
  return best?.tier;
}

export type ForecasterRole = "Director" | "Head Of" | "Senior" | "Strategist";

/**
 * How much a role is expected to own. Half-year figures are what the mid-year
 * review reads against; the annual ones are there for a full-year range.
 */
export interface RoleBenchmark {
  role: ForecasterRole;
  annualAverage: number;
  halfYearAverage: number;
  soleOwned: number;
  coOwned: number;
  byline: number;
  freelanced: number;
  /** The average with the outliers taken out, as the sheet has it. */
  trueMidYearAverage: number;
}

export const ROLE_BENCHMARKS: RoleBenchmark[] = [
  { role: "Director", annualAverage: 9.2, halfYearAverage: 5, soleOwned: 1, coOwned: 2, byline: 11, freelanced: 1, trueMidYearAverage: 3 },
  { role: "Head Of", annualAverage: 23.2, halfYearAverage: 12, soleOwned: 6, coOwned: 3, byline: 16, freelanced: 2, trueMidYearAverage: 10 },
  { role: "Senior", annualAverage: 25.4, halfYearAverage: 13, soleOwned: 8, coOwned: 2, byline: 6, freelanced: 1, trueMidYearAverage: 9 },
  { role: "Strategist", annualAverage: 30.5, halfYearAverage: 15, soleOwned: 10, coOwned: 3, byline: 3, freelanced: 1, trueMidYearAverage: 13 },
];

export function benchmarkFor(role: string | undefined): RoleBenchmark | undefined {
  if (!role) return undefined;
  const key = role.trim().toLowerCase();
  return ROLE_BENCHMARKS.find((b) => b.role.toLowerCase() === key);
}

/**
 * Which benchmark figure a metric should be read against, scaled to the range
 * being viewed. A benchmark set for half a year says nothing about a month, so
 * it is pro-rated by the number of days on screen.
 */
export function scaleBenchmark(
  halfYearFigure: number | undefined,
  days: number,
): number | undefined {
  if (halfYearFigure === undefined) return undefined;
  const HALF_YEAR_DAYS = 182;
  const scaled = (halfYearFigure * days) / HALF_YEAR_DAYS;
  return Math.round(scaled * 10) / 10;
}
