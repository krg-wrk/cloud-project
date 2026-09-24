/**
 * The forecasting methodology, and whether the schedule actually follows it.
 *
 * The team is moving to planning by horizon rather than by format. For a
 * stretch of months every level of content points at the same year, so the
 * platform says one thing at a time instead of five — and a workshop about
 * 2029 cascades into the round of forecasts that follows it, rather than into
 * whatever happened to be commissioned that week.
 *
 * Three things are needed to say whether a forecast obeys that, and they are
 * separate on purpose:
 *
 *   a horizon  — the year a forecast is forecasting, read off the sheet
 *   a group    — which level of content it belongs to, and how far ahead that
 *                level is meant to work
 *   the plan   — what each group is meant to be pointed at, month by month
 *
 * Only the first two are settled enough to hold here. The plan itself is
 * months of dates that are still being argued over, so it is held as data an
 * admin edits rather than as a constant somebody has to deploy: what ships
 * from this file is the default, in the way `DEFAULT_RESOURCES` is, and a
 * saved plan replaces it. A methodology that needs a developer to move a date
 * by a fortnight is one that will be kept in a spreadsheet instead.
 *
 * Nothing here guesses. A forecast whose Forecast Horizon column is empty is
 * reported as untagged rather than assigned a year from its title and quietly
 * counted as compliant — the whole value of the exercise is knowing which rows
 * nobody has decided about yet.
 */

import { CONTENT_TYPES } from "./taxonomy.js";

/* ---------------------------------------------------------------- horizons */

export type Season = "S/S" | "A/W";

/**
 * The season windows as the team keeps them. Spring/Summer is the first half
 * of its year and Autumn/Winter straddles two, which is the reason a season
 * cannot simply be read as the number printed on it.
 */
const SEASON_WINDOWS: Record<Season, { fromMonth: string; toMonth: string }> = {
  "S/S": { fromMonth: "02-01", toMonth: "07-31" },
  "A/W": { fromMonth: "08-01", toMonth: "01-31" },
};

/**
 * What a forecast is forecasting.
 *
 * `year` is the one the plan buckets on and it is deliberately the later of
 * the two where two are named: A/W 28/29 is worked on as 2029 because it needs
 * the 2029 macro forecasts to complete it, and The Vision 2031/36 is a 2036
 * document. Every other reading — the earlier year, or the year the bulk of
 * the window sits in — puts A/W 28/29 before the work it depends on.
 *
 * `from` and `to` keep the window the horizon really covers, because the
 * bucket year is a planning decision and not a claim about the calendar. A/W
 * 28/29 is mostly 2028 and a view that only ever says "2029" hides that.
 */
export interface Horizon {
  year: number;
  /** Set when the horizon is a season rather than a plain year or a span. */
  season?: Season;
  /** ISO first day of the window the horizon covers, inclusive. */
  from: string;
  /** ISO last day, inclusive. */
  to: string;
  /** Tidied for display: "A/W 28/29", "S/S 29", "2029", "2031–2036". */
  label: string;
}

/** Where a horizon was read from, weakest last. */
export type HorizonSource = "horizon" | "details" | "title";

export interface HorizonReading {
  horizon: Horizon;
  source: HorizonSource;
}

/**
 * A year written in two digits, as every season on the sheet is.
 *
 * Four digits are taken as given — "2031/36" mixes the two forms — and
 * anything else belongs to this century, which is true of every forecast the
 * team will ever commission and honest about being an assumption.
 */
function expandYear(digits: string): number {
  const value = Number(digits);
  return digits.length === 4 ? value : 2000 + value;
}

/**
 * The second year of a pair. A/W 99/00 runs into the next century, so a second
 * year below the first is read as the century rolling over rather than as a
 * span running backwards.
 */
function secondYear(first: number, digits: string): number {
  const value = expandYear(digits);
  return value < first ? value + 100 : value;
}

const SEASON_PATTERN =
  /^(?:(s\/?s|spring\/?summer)|(a\/?w|autumn\/?winter))\s*(\d{2}|\d{4})(?:\s*[/-]\s*(\d{2}|\d{4}))?$/;
const SPAN_PATTERN = /^(\d{4})\s*[/–—-]\s*(\d{2}|\d{4})$/;
const YEAR_PATTERN = /^(\d{4})$/;

/**
 * Read a horizon out of whatever the sheet says, or return null.
 *
 * Null is a real answer and the caller is expected to show it: a Forecast
 * Horizon column nobody has filled in is the thing this feature exists to
 * surface, so it must not be silently absorbed into a default year.
 */
export function readHorizon(value: string | undefined): Horizon | null {
  if (!value) return null;
  const text = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return null;

  const season = SEASON_PATTERN.exec(text);
  if (season) {
    const [, springSummer, , first, second] = season;
    const kind: Season = springSummer ? "S/S" : "A/W";
    const firstYear = expandYear(first);
    // S/S names one year; A/W names two, and the second is the one it is
    // bucketed under. "A/W 29" with no second year means 29/30.
    const year =
      kind === "S/S"
        ? firstYear
        : second
          ? secondYear(firstYear, second)
          : firstYear + 1;
    const window = SEASON_WINDOWS[kind];
    const startYear = kind === "S/S" ? year : year - 1;
    return {
      year,
      season: kind,
      from: `${startYear}-${window.fromMonth}`,
      to: `${year}-${window.toMonth}`,
      label:
        kind === "S/S"
          ? `S/S ${short(year)}`
          : `A/W ${short(year - 1)}/${short(year)}`,
    };
  }

  const span = SPAN_PATTERN.exec(text);
  if (span) {
    const first = expandYear(span[1]);
    const last = secondYear(first, span[2]);
    return {
      year: last,
      from: `${first}-01-01`,
      to: `${last}-12-31`,
      label: `${first}–${last}`,
    };
  }

  const year = YEAR_PATTERN.exec(text);
  if (year) {
    const value = Number(year[1]);
    return {
      year: value,
      from: `${value}-01-01`,
      to: `${value}-12-31`,
      label: String(value),
    };
  }

  return null;
}

/** Two digits, the way a season is written. */
function short(year: number): string {
  return String(year % 100).padStart(2, "0");
}

/**
 * A year mentioned in a title — "BIG IDEAS 2029", "The Vision 2036".
 *
 * The last one wins, because a title that names two is naming a span and the
 * horizon is its far end. Only years a forecast could plausibly be pointed at
 * are considered: a title carrying a season code is read as a season first, so
 * this is the fallback and not the rule.
 */
function yearInTitle(title: string): Horizon | null {
  // The word boundaries are load-bearing: without them the "aw" inside a word
  // like "Lawn" reads as Autumn/Winter and "Lawn 2029" becomes A/W 20/21.
  const seasonInTitle = /\b((?:s\/?s|a\/?w)\s*\d{2}(?:\s*\/\s*\d{2})?)\b/i.exec(title);
  if (seasonInTitle) {
    const found = readHorizon(seasonInTitle[1]);
    if (found) return found;
  }
  const years = [...title.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  if (!years.length) return null;
  const year = Math.max(...years);
  return {
    year,
    from: `${year}-01-01`,
    to: `${year}-12-31`,
    label: String(year),
  };
}

/**
 * What a forecast is forecasting, and how confidently the Hub knows.
 *
 * The Forecast Horizon column is asked first because it is the column the team
 * maps deliberately for exactly this purpose. The years typed on the
 * forecast in the Hub come next — somebody meant those, so they beat a guess
 * but not the sheet. The title is last and is reported as such, so a view can
 * draw an inferred year differently from a stated one rather than presenting
 * a parse of "BIG IDEAS 2029" as though somebody had confirmed it.
 */
export function horizonFor(
  item: { forecastHorizon?: string; title?: string },
  details?: { yearFrom?: number; yearTo?: number },
): HorizonReading | null {
  const fromHorizon = readHorizon(item.forecastHorizon);
  if (fromHorizon) return { horizon: fromHorizon, source: "horizon" };

  if (details?.yearFrom) {
    const first = details.yearFrom;
    const last = details.yearTo && details.yearTo > first ? details.yearTo : first;
    return {
      horizon: {
        year: last,
        from: `${first}-01-01`,
        to: `${last}-12-31`,
        label: first === last ? String(first) : `${first}–${last}`,
      },
      source: "details",
    };
  }

  const fromTitle = item.title ? yearInTitle(item.title) : null;
  if (fromTitle) return { horizon: fromTitle, source: "title" };

  return null;
}

/* ------------------------------------------------------------------ groups */

/**
 * How far ahead a level of content works, in years.
 *
 * A band rather than a figure because most levels are written as one — "2.5-2
 * Year" — and the two ends mean different rounds of the same forecast. Where
 * the sheet names a single figure both ends are the same, which keeps every
 * reader of this one shape instead of two.
 */
export interface Lead {
  /** The shortest lead in the band. */
  minYears: number;
  /** The longest. Equal to `minYears` where a single figure is named. */
  maxYears: number;
}

export interface PlannedFormat {
  /** The format as the commissioning sheet writes it. */
  name: string;
  /**
   * Absent where the grouping sheet has not settled on one. Undefined is an
   * honest gap: a format with no agreed lead cannot be off-plan, and saying so
   * is more use than inheriting a neighbour's figure.
   */
  lead?: Lead;
}

export interface ForecastGroup {
  /** Stable across a rename, because a saved plan and a URL both key on it. */
  id: string;
  name: string;
  formats: PlannedFormat[];
}

const lead = (minYears: number, maxYears = minYears): Lead => ({ minYears, maxYears });

/**
 * The groupings as the team currently has them.
 *
 * The lead sits on the format rather than on the group because Foresight
 * proves it has to: Foresight Futures works ten years out and Advanced CMF
 * five, and they are the same level of content. Where a group's formats all
 * share a lead it simply looks like a group-level one.
 *
 * Two groups carry no lead at all yet. They are listed anyway — a group that
 * exists and has not been timed is a different thing from a group nobody has
 * thought of, and only the first can be filled in.
 *
 * This is the default. Once the studio editor lands a saved grouping replaces
 * it wholesale, because these names are still moving.
 */
export const FORECAST_GROUPS: ForecastGroup[] = [
  {
    id: "foresight",
    name: "Foresight",
    formats: [
      { name: "Foresight Futures", lead: lead(10) },
      { name: "Foresight Strategies", lead: lead(10) },
      { name: "The Vision", lead: lead(10) },
      { name: "Future Of", lead: lead(5) },
      { name: "Advanced CMF", lead: lead(5) },
    ],
  },
  {
    id: "intelligence",
    name: "Intelligence",
    formats: [
      { name: "Intelligence", lead: lead(3) },
      { name: "Consumer Priorities", lead: lead(3) },
    ],
  },
  {
    id: "macro",
    name: "Macro",
    formats: [
      { name: "Big Ideas", lead: lead(2.5) },
      { name: "Future Consumer", lead: lead(2.5) },
      // Personas is being kept as a version of Future Consumer, so it sits
      // beside it rather than in a group of its own.
      { name: "Personas", lead: lead(2.5) },
    ],
  },
  {
    id: "forecasts",
    name: "Forecasts",
    formats: [
      { name: "Annual Forecast", lead: lead(2, 2.5) },
      { name: "Seasonal Forecast", lead: lead(2, 2.5) },
      { name: "Category Annual Forecast", lead: lead(2, 2.5) },
      { name: "Category Seasonal Forecast", lead: lead(2, 2.5) },
      { name: "Marketing Forecast", lead: lead(2, 2.5) },
      { name: "Retail Forecast", lead: lead(2, 2.5) },
      { name: "Youth Culture Forecast", lead: lead(2, 2.5) },
      { name: "Social Media Forecast", lead: lead(2, 2.5) },
      { name: "Sustainability Forecast", lead: lead(2, 2.5) },
      { name: "Product Forecast", lead: lead(2, 2.5) },
      { name: "CMF Forecast", lead: lead(2, 2.5) },
      { name: "CMF Annual Forecast", lead: lead(2, 2.5) },
      { name: "CMF Seasonal Forecast", lead: lead(2, 2.5) },
      { name: "Key Silhouettes", lead: lead(2, 2.5) },
      { name: "Generational Futures", lead: lead(2, 2.5) },
    ],
  },
  {
    id: "forecast-update",
    name: "Forecast Update",
    formats: [
      { name: "Core Item Updates", lead: lead(1.5, 2) },
      { name: "Trend Narratives", lead: lead(1.5, 2) },
      { name: "Trend Narratives Store Sets", lead: lead(1.5, 2) },
      { name: "Designers' Briefing", lead: lead(1.5, 2) },
    ],
  },
  {
    id: "event-forecasts",
    name: "Event Forecasts",
    /**
     * Eighteen months is the aim, and the band is deliberately left at exactly
     * that rather than widened to cover what the schedule currently does.
     *
     * A seasonal event forecast is a wrapper around dated events — Halloween,
     * Diwali, Lunar New Year — so its real lead is to the event and not to the
     * year, and the alignment grid already annotates this row as 22 months.
     * The two do not agree, and a band stretched to accept both would report
     * nothing, which is the one outcome that makes the check worthless. It
     * stays at the stated aim so that plotting the events measures the drift.
     */
    formats: [{ name: "Seasonal Event Forecast", lead: lead(1.5) }],
  },
  {
    id: "trend-strategy",
    name: "Trend Strategy",
    formats: [
      { name: "Key Trends", lead: lead(1, 2) },
      { name: "Business Strategy", lead: lead(1, 2) },
      { name: "Consumer Strategy", lead: lead(1, 2) },
      { name: "Marketing Strategy", lead: lead(1, 2) },
      { name: "Retail Strategy", lead: lead(1, 2) },
      { name: "Youth Radar", lead: lead(1, 2) },
    ],
  },
  {
    id: "research-design",
    name: "Research & Design Development",
    formats: [
      { name: "Application & Technique" },
      { name: "Aesthetics Evolution" },
      { name: "Sourcing Guides" },
      { name: "Key Icons" },
      { name: "Branding" },
      { name: "Licensing" },
    ],
  },
  {
    id: "buying",
    name: "Buying & Assortment Planning",
    formats: [
      { name: "Buyers' Briefing" },
      { name: "The Buyer's Roadmap" },
      { name: "Must Have Materials & Details" },
      { name: "Sign Off Checklist" },
    ],
  },
  {
    id: "signals",
    name: "Signals",
    formats: [
      { name: "Live Intelligence", lead: lead(0, 0.5) },
      { name: "Digital Download", lead: lead(0, 0.5) },
      { name: "TrendCurve", lead: lead(0, 0.5) },
      { name: "Social Analytics", lead: lead(0, 0.5) },
      { name: "Trade Shows", lead: lead(0, 0.5) },
      { name: "Catwalks", lead: lead(0, 0.5) },
      { name: "Street Style", lead: lead(0, 0.5) },
      { name: "Retail Analysis", lead: lead(0, 0.5) },
      { name: "Lesson's Learnt/Debrief", lead: lead(0, 0.5) },
      { name: "TikTok Analytics/Trading", lead: lead(0, 0.5) },
      { name: "Sustainability Bulletin", lead: lead(0, 0.5) },
      { name: "Podcast", lead: lead(0, 0.5) },
    ],
  },
];

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");
}

interface Placed {
  group: ForecastGroup;
  format: PlannedFormat;
}

/**
 * Built once per grouping rather than per lookup. `coverage` asks about every
 * format we publish against every format in the plan, so rebuilding the map
 * inside the loop turns a list into a few thousand string operations for no
 * reason. Keyed weakly, so a grouping loaded from the store is collected with
 * everything else when the request ends.
 */
const indexes = new WeakMap<ForecastGroup[], Map<string, Placed>>();

function index(groups: ForecastGroup[]): Map<string, Placed> {
  const cached = indexes.get(groups);
  if (cached) return cached;
  const map = new Map<string, Placed>();
  for (const group of groups) {
    for (const format of group.formats) map.set(normalise(format.name), { group, format });
  }
  indexes.set(groups, map);
  return map;
}

/**
 * Which group a format belongs to.
 *
 * Matched the way `tierFor` matches, and for the same reason: formats arrive
 * off the sheet with a season stuck on the end — "CMF Forecast A/W 28/29" —
 * so an exact lookup finds almost nothing. The longest grouping name the value
 * starts with wins, which keeps "CMF Seasonal Forecast" from being taken as
 * "CMF Forecast".
 *
 * Undefined where nothing matches, and a view is expected to show those rather
 * than drop them: a format in no group is a gap in the methodology, which is
 * one of the two things this page is for.
 */
export function placeFormat(
  contentType: string | undefined,
  groups: ForecastGroup[] = FORECAST_GROUPS,
): Placed | undefined {
  if (!contentType) return undefined;
  const key = normalise(contentType);
  const map = index(groups);
  const exact = map.get(key);
  if (exact) return exact;

  let best: { placed: Placed; length: number } | undefined;
  for (const [name, placed] of map) {
    if (key.startsWith(name) && (!best || name.length > best.length)) {
      best = { placed, length: name.length };
    }
  }
  return best?.placed;
}

export function groupFor(
  contentType: string | undefined,
  groups: ForecastGroup[] = FORECAST_GROUPS,
): ForecastGroup | undefined {
  return placeFormat(contentType, groups)?.group;
}

export function leadFor(
  contentType: string | undefined,
  groups: ForecastGroup[] = FORECAST_GROUPS,
): Lead | undefined {
  return placeFormat(contentType, groups)?.format.lead;
}

/**
 * The two ways a grouping and the taxonomy can fail to meet.
 *
 * Both are reported because both are somebody's job to fix and neither is
 * visible otherwise: a grouping naming a format we do not publish is a typo or
 * a rename nobody carried across, and a format we publish that sits in no
 * group is content the methodology has not been asked about. A view that
 * silently drops either would show a tidy page and a wrong one.
 */
export function coverage(groups: ForecastGroup[] = FORECAST_GROUPS): {
  unknownFormats: string[];
  ungroupedTypes: string[];
} {
  const published = new Set(CONTENT_TYPES.map((t) => normalise(t.name)));
  const unknownFormats: string[] = [];
  for (const group of groups) {
    for (const format of group.formats) {
      if (!published.has(normalise(format.name))) unknownFormats.push(format.name);
    }
  }
  const ungroupedTypes = CONTENT_TYPES.filter((t) => !placeFormat(t.name, groups)).map(
    (t) => t.name,
  );
  return { unknownFormats, ungroupedTypes };
}

/* --------------------------------------------------------------- alignment */

/**
 * The year a forecast published on this date is expected to be pointed at.
 *
 * Measured in whole months from the publication month, because every lead the
 * team uses is a whole or half year and a month count is exact where a
 * fraction of a Date is not. The band's two ends give two years, and anything
 * between them counts — a 2-2.5 year lead in August names both next-but-one
 * and the year after, which is the truth of a band and not a slack tolerance
 * bolted on afterwards.
 */
export function expectedYears(publicationDate: string, band: Lead): number[] {
  const year = Number(publicationDate.slice(0, 4));
  const month = Number(publicationDate.slice(5, 7));
  if (!year || !month) return [];
  const at = (years: number) => {
    const months = (year * 12 + (month - 1)) + Math.round(years * 12);
    return Math.floor(months / 12);
  };
  const first = at(band.minYears);
  const last = at(band.maxYears);
  const out: number[] = [];
  for (let value = Math.min(first, last); value <= Math.max(first, last); value++) {
    out.push(value);
  }
  return out;
}

/**
 * Whether a forecast sits where the methodology says it should.
 *
 * Five answers rather than two, because "we have no lead agreed for Buying"
 * and "this Buyers' Briefing is pointed at the wrong year" are different
 * problems for different people and a shared colour would hide both. `early`
 * and `late` are kept apart for the same reason: a forecast running ahead of
 * its level is a cohesion problem, one running behind it is a deadline.
 */
export type Alignment = "on-plan" | "early" | "late" | "untagged" | "no-lead";

export function alignment(
  item: { type?: string; forecastHorizon?: string; title?: string; publicationDate: string },
  details?: { yearFrom?: number; yearTo?: number },
  groups: ForecastGroup[] = FORECAST_GROUPS,
): { alignment: Alignment; horizon?: Horizon; source?: HorizonSource; expected?: number[] } {
  const reading = horizonFor(item, details);
  if (!reading) return { alignment: "untagged" };

  const band = leadFor(item.type, groups);
  if (!band) {
    return { alignment: "no-lead", horizon: reading.horizon, source: reading.source };
  }

  const expected = expectedYears(item.publicationDate, band);
  const actual = reading.horizon.year;
  const state: Alignment = expected.includes(actual)
    ? "on-plan"
    : actual > Math.max(...expected)
      ? "early"
      : "late";
  return { alignment: state, horizon: reading.horizon, source: reading.source, expected };
}
