import type { HubStore } from "./store.js";
import type {
  ContentItem,
  KnowledgeSession,
  MetricDefinition,
  MetricObservation,
} from "./types.js";

/**
 * KPIs for a forecaster over a time range.
 *
 * Two sources, deliberately. The derived metrics are worked out from the
 * schedule and the store the Hub already holds, so they are real today.
 * The supplied ones (client meetings, stats reports) arrive from a sheet or
 * feed maintained elsewhere; only the numbers are missing, not the shape.
 *
 * Adding a metric is a row in the metrics list plus, for a derived one, a
 * function in DERIVED below. Nothing else changes.
 */

export type Bucket = "month" | "quarter";

export interface Period {
  /** "2026-07" or "2026-Q3" — the key the series is grouped by. */
  key: string;
  label: string;
  start: string;
  end: string;
}

export interface MetricResult {
  definition: MetricDefinition;
  /** The headline figure for the whole range, or null when nothing applies. */
  value: number | null;
  /** The same figure for the preceding range of equal length. */
  previous: number | null;
  series: { period: string; label: string; value: number | null }[];
  /** True when this metric has no data at all yet — an honest empty state. */
  awaitingData: boolean;
}

export interface KpiInput {
  personId: string;
  from: string;
  to: string;
  bucket: Bucket;
  content: ContentItem[];
  sessions: KnowledgeSession[];
  observations: MetricObservation[];
  /** Session ids this person had a place on. */
  attended: Set<string>;
  store: HubStore;
}

const inRange = (date: string | undefined, from: string, to: string): boolean =>
  Boolean(date) && date! >= from && date! <= to;

const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Submissions that actually landed in the window, for this person. */
function submissions(input: KpiInput, from: string, to: string): ContentItem[] {
  return input.content.filter(
    (c) => c.forecasterId === input.personId && inRange(c.submittedOn, from, to),
  );
}

const mean = (values: number[]): number | null =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

/**
 * One function per derived metric, each answering "what is this worth for this
 * person between these two dates". The bucketing calls them once per period.
 */
const DERIVED: Record<string, (input: KpiInput, from: string, to: string) => number | null> = {
  "forecasts-submitted": (input, from, to) => submissions(input, from, to).length,

  "forecasts-published": (input, from, to) =>
    input.content.filter(
      (c) =>
        c.forecasterId === input.personId &&
        c.status === "published" &&
        inRange(c.publicationDate, from, to),
    ).length,

  "on-time-rate": (input, from, to) => {
    const rows = submissions(input, from, to);
    if (!rows.length) return null;
    const onTime = rows.filter((c) => c.submittedOn! <= c.submissionDate).length;
    return Math.round((onTime / rows.length) * 100);
  },

  "days-late": (input, from, to) => {
    const rows = submissions(input, from, to);
    // On-time counts as zero, so this reads as "how late on average", not
    // "how late when late" — the second is easy to hide behind.
    const late = rows.map((c) => Math.max(0, daysBetween(c.submissionDate, c.submittedOn!)));
    const average = mean(late);
    return average === null ? null : Math.round(average * 10) / 10;
  },

  "late-submissions": (input, from, to) =>
    submissions(input, from, to).filter((c) => c.submittedOn! > c.submissionDate).length,

  "peer-reviews-given": (input, from, to) =>
    input.store
      .allPeerReviews()
      .filter((r) => r.reviewerId === input.personId && inRange(r.reviewDate, from, to)).length,

  "sessions-attended": (input, from, to) =>
    input.sessions.filter((s) => input.attended.has(s.id) && inRange(s.date, from, to)).length,
};

/** Supplied metrics are a sum of their readings in the window. */
function suppliedValue(
  input: KpiInput,
  metricId: string,
  from: string,
  to: string,
): number | null {
  const rows = input.observations.filter(
    (o) =>
      o.metricId === metricId &&
      o.personId === input.personId &&
      inRange(o.date, from, to),
  );
  if (!rows.length) return null;
  return rows.reduce((total, o) => total + o.value, 0);
}

function valueFor(
  input: KpiInput,
  definition: MetricDefinition,
  from: string,
  to: string,
): number | null {
  if (definition.source === "derived") {
    const calculate = DERIVED[definition.id];
    // A derived metric with no calculator is a definition waiting for one.
    return calculate ? calculate(input, from, to) : null;
  }
  return suppliedValue(input, definition.id, from, to);
}

/** Splits a range into months or quarters, oldest first. */
export function periods(from: string, to: string, bucket: Bucket): Period[] {
  const out: Period[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const step = bucket === "quarter" ? 3 : 1;

  let year = start.getUTCFullYear();
  let month = bucket === "quarter" ? Math.floor(start.getUTCMonth() / 3) * 3 : start.getUTCMonth();

  while (Date.UTC(year, month, 1) <= end) {
    const periodStart = new Date(Date.UTC(year, month, 1));
    const periodEnd = new Date(Date.UTC(year, month + step, 0));
    const startIso = periodStart.toISOString().slice(0, 10);
    const endIso = periodEnd.toISOString().slice(0, 10);
    out.push({
      key:
        bucket === "quarter"
          ? `${year}-Q${Math.floor(month / 3) + 1}`
          : startIso.slice(0, 7),
      label:
        bucket === "quarter"
          ? `Q${Math.floor(month / 3) + 1} ${year}`
          : periodStart.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }) +
            (month === 0 || out.length === 0 ? ` ${String(year).slice(2)}` : ""),
      // Clip to the requested range so a part-period is not read as a full one.
      start: startIso < from ? from : startIso,
      end: endIso > to ? to : endIso,
    });
    month += step;
    if (month > 11) {
      year += Math.floor(month / 12);
      month %= 12;
    }
  }
  return out;
}

/** The range of equal length immediately before this one, for comparison. */
export function precedingRange(from: string, to: string): { from: string; to: string } {
  const length = daysBetween(from, to) + 1;
  const previousTo = new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000);
  const previousFrom = new Date(previousTo.getTime() - (length - 1) * 86_400_000);
  return {
    from: previousFrom.toISOString().slice(0, 10),
    to: previousTo.toISOString().slice(0, 10),
  };
}

export function computeKpis(
  definitions: MetricDefinition[],
  input: KpiInput,
): MetricResult[] {
  const buckets = periods(input.from, input.to, input.bucket);
  const previous = precedingRange(input.from, input.to);

  return definitions.map((definition) => {
    const series = buckets.map((period) => ({
      period: period.key,
      label: period.label,
      value: valueFor(input, definition, period.start, period.end),
    }));
    const value = valueFor(input, definition, input.from, input.to);
    return {
      definition,
      value,
      previous: valueFor(input, definition, previous.from, previous.to),
      series,
      awaitingData:
        definition.source === "supplied" &&
        value === null &&
        series.every((point) => point.value === null),
    };
  });
}

/** One metric across a set of people, for the manager's comparison. */
export function compareTeam(
  definition: MetricDefinition,
  personIds: string[],
  build: (personId: string) => KpiInput,
): { personId: string; value: number | null }[] {
  return personIds
    .map((personId) => {
      const input = build(personId);
      return { personId, value: valueFor(input, definition, input.from, input.to) };
    })
    .sort((a, b) => {
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      return definition.better === "higher" ? b.value - a.value : a.value - b.value;
    });
}
