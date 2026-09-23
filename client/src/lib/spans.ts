/**
 * Laying multi-day things out across a calendar week.
 *
 * A week of leave used to appear as five identical chips, one per day, which
 * reads as five events rather than one. Here anything covering more than a
 * day becomes a single bar drawn across the columns it covers, clipped at the
 * week boundary with a marker to say it carries on.
 *
 * Kept in step with the copy in demo/hub.template.html by hand.
 */

export interface Spanning {
  /** ISO first day, inclusive. */
  from: string;
  /** ISO last day, inclusive. */
  to: string;
}

export interface Bar<T> {
  item: T;
  /** 0-6, the first and last column of this week the bar covers. */
  startCol: number;
  endCol: number;
  /** It began before this week, or runs past the end of it. */
  continuesBefore: boolean;
  continuesAfter: boolean;
  /** Which row of the span area it sits on. */
  lane: number;
}

/** True when a thing covers more than one day, and so earns a bar. */
export function isMultiDay(span: Spanning): boolean {
  return Boolean(span.from && span.to && span.to > span.from);
}

/**
 * True when a thing runs on a day.
 *
 * Tolerant of a half-filled span, because the sheets these come from are
 * maintained by hand and the end date is the thing most often left out: a
 * span with no end runs on the day it starts rather than every day since,
 * and a span with no start runs on no day at all. Absent is not the same as
 * always, which is exactly the way this went wrong — a workshop drawn across
 * the days it runs, with nothing left asking which days those were, put
 * every workshop on every day.
 */
export function coversDay(span: Spanning, date: string): boolean {
  if (!span.from) return false;
  return span.from <= date && (span.to || span.from) >= date;
}

/**
 * Packs the bars for one week into as few lanes as will hold them, so a lane
 * is reused by anything that does not overlap it.
 *
 * `week` is the seven ISO dates in column order.
 */
export function packWeek<T>(
  week: string[],
  items: T[],
  spanOf: (item: T) => Spanning,
): { bars: Bar<T>[]; lanes: number } {
  const first = week[0];
  const last = week[6];

  const overlapping = items
    .map((item) => ({ item, span: spanOf(item) }))
    .filter(({ span }) => span.from <= last && span.to >= first)
    .map(({ item, span }) => {
      const startCol = Math.max(0, week.indexOf(clampToWeek(span.from, week)));
      const endCol = Math.max(startCol, week.indexOf(clampToWeek(span.to, week)));
      return {
        item,
        startCol,
        endCol,
        continuesBefore: span.from < first,
        continuesAfter: span.to > last,
        lane: 0,
      };
    })
    // Longest first from the left, so the bars that cross the week sit on top
    // and the short ones fill in underneath.
    .sort(
      (a, b) => a.startCol - b.startCol || b.endCol - b.startCol - (a.endCol - a.startCol),
    );

  // occupied[lane] is the last column already taken on that lane.
  const occupied: number[] = [];
  for (const bar of overlapping) {
    let lane = 0;
    while (occupied[lane] !== undefined && occupied[lane] >= bar.startCol) lane++;
    occupied[lane] = bar.endCol;
    bar.lane = lane;
  }

  return { bars: overlapping, lanes: occupied.length };
}

/**
 * The nearest date inside the week: a span starting last month is drawn from
 * this week's Monday, and one ending next month runs to its Sunday.
 */
function clampToWeek(date: string, week: string[]): string {
  if (date < week[0]) return week[0];
  if (date > week[6]) return week[6];
  return date;
}
