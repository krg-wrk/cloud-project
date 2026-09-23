/**
 * Dates are plain YYYY-MM-DD strings throughout — deadlines are calendar days,
 * not instants, so no timezone ever gets to shift one.
 */

export const TODAY = new Date().toISOString().slice(0, 10);

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "2026-09" for a month key. */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function parseMonth(key: string): { year: number; month: number } {
  const [year, month] = key.split("-").map(Number);
  return { year, month: (month || 1) - 1 };
}

export function shiftMonth(key: string, delta: number): string {
  const { year, month } = parseMonth(key);
  const d = new Date(Date.UTC(year, month + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const { year, month } = parseMonth(key);
  return `${MONTHS[month]} ${year}`;
}

export function firstOfMonth(key: string): string {
  return `${key}-01`;
}

export function lastOfMonth(key: string): string {
  const { year, month } = parseMonth(key);
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return iso(year, month, days);
}

/** Weeks of a month as 6 x 7 ISO date strings, weeks starting Monday. */
export function monthGrid(key: string): string[][] {
  const { year, month } = parseMonth(key);
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(Date.UTC(year, month, 1 - offset));
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setUTCDate(start.getUTCDate() + w * 7 + d);
      week.push(day.toISOString().slice(0, 10));
    }
    weeks.push(week);
  }
  return weeks;
}

/** Shifts a date by whole days. */
export function addDays(date: string, delta: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** The Monday of the week a date falls in. */
export function startOfWeek(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return addDays(date, -((d.getUTCDay() + 6) % 7));
}

/** The seven ISO dates of a week, Monday first. */
export function weekGrid(date: string): string[] {
  const monday = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/**
 * A week as a heading: "9 — 15 Nov 2026", collapsing the parts the two ends
 * share, so a week inside one month does not repeat the month and year.
 */
export function weekLabel(date: string): string {
  const from = startOfWeek(date);
  const to = addDays(from, 6);
  const opts: Intl.DateTimeFormatOptions = { timeZone: "UTC", day: "numeric" };
  const end = new Date(`${to}T00:00:00Z`).toLocaleDateString("en-GB", {
    ...opts,
    month: "short",
    year: "numeric",
  });
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const start = new Date(`${from}T00:00:00Z`).toLocaleDateString(
    "en-GB",
    sameMonth
      ? opts
      : { ...opts, month: "short", ...(from.slice(0, 4) === to.slice(0, 4) ? {} : { year: "numeric" }) },
  );
  return `${start} — ${end}`;
}

export function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10));
}

export function isSameMonth(date: string, key: string): boolean {
  return date.startsWith(key);
}

export function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/** "Fri 25 Sep 2026" */
export function formatLong(date: string): string {
  if (!date) return "—";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Fri 25 Sep" */
export function formatMedium(date: string): string {
  if (!date) return "—";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** "Sep" — for a date block that shows the day separately. */
export function formatMonthShort(date: string): string {
  if (!date) return "";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "short",
    timeZone: "UTC",
  });
}

/** "Thu" */
export function formatWeekday(date: string): string {
  if (!date) return "";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    timeZone: "UTC",
  });
}

/** "25 Sep" */
export function formatShort(date: string): string {
  if (!date) return "—";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * "in 4 days", "today", "3 days ago" — and nothing at all for a day that is
 * not there.
 *
 * A real sheet has blank date cells in it: a hundred rows of the
 * commissioning schedule have no submission date yet. `Date.parse` answers
 * NaN for those, which arithmetic carries all the way to the screen, and the
 * page told somebody a forecast was "NaN days ago". An empty string is the
 * honest reading — the row already shows an em dash where the date would be,
 * and a date nobody has set needs no elaboration.
 *
 * The shape is checked rather than the arithmetic, because `Date.parse` is
 * lenient enough to be dangerous: a Country column with "19 Sept" typed into
 * it parses to a real instant, and a finiteness test waves through
 * "9135 days ago". A calendar day in this domain is YYYY-MM-DD and nothing
 * else is worth a reading.
 */
/**
 * The days something runs, as one phrase.
 *
 * "17 Sept" for a day, "17–19 Sept" when it stays inside a month, and both
 * months written out when it crosses one. A workshop programme keeps ranges
 * and printing only the first day was how the Hub hid the rest of an R&D
 * week; printing "17 Sept – 17 Sept" for the ordinary case would be the
 * other way of getting it wrong.
 */
export function dayRange(startDate: string, endDate?: string): string {
  if (!startDate) return "";
  if (!endDate || endDate === startDate) return formatMedium(startDate);
  /*
   * No weekday once it is a range. "Thu 17 – Sat 19 Sept" is three ideas
   * where one will do, and a weekday earns its place only when there is a
   * single day somebody is deciding whether they can make.
   */
  if (startDate.slice(0, 7) === endDate.slice(0, 7)) {
    return `${dayOfMonth(startDate)}–${formatShort(endDate)}`;
  }
  return `${formatShort(startDate)} – ${formatShort(endDate)}`;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function relativeDays(date: string, today = TODAY): string {
  if (!ISO_DAY.test((date ?? "").trim())) return "";
  const diff = daysBetween(today, date);
  if (!Number.isFinite(diff)) return "";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff > 0) return `in ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

/** Every date in an inclusive range, for laying events onto a calendar. */
export function datesInRange(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${endDate}T00:00:00Z`);
  for (let t = Date.parse(`${startDate}T00:00:00Z`); t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}
