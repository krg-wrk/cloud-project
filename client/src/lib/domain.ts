import type {
  CalendarEvent,
  ContentItem,
  EventType,
  Person,
  SessionKind,
  SessionWithSignUps,
  Status,
} from "../types";
import { TODAY, daysBetween } from "./date";

export const STATUS_LABELS: Record<Status, string> = {
  "not-started": "Not started",
  "in-progress": "Writing",
  submitted: "Submitted",
  "in-review": "In review",
  published: "Published",
  "at-risk": "At risk",
};

export const STATUS_ORDER: Status[] = [
  "not-started",
  "in-progress",
  "submitted",
  "in-review",
  "published",
  "at-risk",
];

export const EVENT_LABELS: Record<EventType, string> = {
  leave: "Leave",
  "public-holiday": "Public holiday",
  workshop: "Workshop",
  training: "Training",
  conference: "Show / conference",
};

export const KIND_LABELS: Record<SessionKind, string> = {
  workshop: "Workshop",
  masterclass: "Masterclass",
  "lunch-and-learn": "Lunch & Learn",
  critique: "Critique",
  training: "Training",
};

export const KIND_ORDER: SessionKind[] = [
  "workshop",
  "masterclass",
  "lunch-and-learn",
  "critique",
  "training",
];

/** What the sign-up control should offer this person for this session. */
export type SignUpState =
  | "going"
  | "waiting"
  | "can-sign-up"
  | "full"
  | "closed"
  | "required"
  | "past";

export function signUpState(
  session: SessionWithSignUps,
  personId: string | undefined,
  today = TODAY,
): SignUpState {
  // Past once it has finished, so a session runs all the way through its
  // last day rather than reading as over on the morning of its second.
  if (session.endDate < today) return "past";
  if (personId && session.going.includes(personId)) return "going";
  if (personId && session.waiting.includes(personId)) return "waiting";
  if (session.required) return "required";
  if (!session.signUpsOpen) return "closed";
  if (session.full) return "full";
  return "can-sign-up";
}

/** Calendar cells are narrow — these fit next to a title. */
export const EVENT_LABELS_SHORT: Record<EventType, string> = {
  leave: "Leave",
  "public-holiday": "Holiday",
  workshop: "Workshop",
  training: "Training",
  conference: "Show",
};

/** Work is done once it is with the subbing team. */
export function isOutstanding(item: ContentItem): boolean {
  return item.status === "not-started" || item.status === "in-progress" || item.status === "at-risk";
}

/** A submission deadline that has passed without the copy arriving. */
export function isOverdue(item: ContentItem, today = TODAY): boolean {
  return isOutstanding(item) && item.submissionDate < today;
}

export function daysUntilSubmission(item: ContentItem, today = TODAY): number {
  return daysBetween(today, item.submissionDate);
}

export function personName(people: Person[], id: string | undefined): string {
  if (!id) return "Unassigned";
  return people.find((p) => p.id === id)?.name ?? id;
}

/**
 * Who a calendar entry is for, in the words the sheet uses.
 *
 * Named people first and all of them, then the countries it applies to, then
 * the region as a last resort. The order is the one the entry itself is most
 * specific about: a trade show names the people going, a public holiday names
 * a country, and only the shows sheet records a region at all.
 *
 * It printed the region before, which is worked out from the country on the
 * way in — so a South African public holiday read "EMEA team" and told sixty
 * people it was theirs.
 */
export function eventWho(event: CalendarEvent, people: Person[]): string {
  const named = event.personIds?.length
    ? event.personIds
    : event.personId
      ? [event.personId]
      : [];
  if (named.length) return named.map((id) => personName(people, id)).join(", ");
  if (event.countries?.length) return event.countries.join(", ");
  return event.region ?? "Everyone";
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * A stable hue per person, so the same forecaster keeps the same colour across
 * the calendar, the schedule and their own page.
 */
export function personHue(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

export function eventCovers(event: CalendarEvent, date: string): boolean {
  return event.startDate <= date && event.endDate >= date;
}

/**
 * Leave and holidays that collide with a deadline.
 *
 * A holiday belongs to a country, so a Singapore holiday is not a clash for a
 * forecaster in London. It was being matched on region, which made it one for
 * everybody the Hub files under APAC — the same fault as the calendar's, and
 * worth fixing in both places rather than only where it was noticed.
 *
 * The region stays underneath as a fallback, because the trade shows sheet
 * records one and no country at all.
 */
export function clashesFor(
  item: ContentItem,
  events: CalendarEvent[],
  people: Person[] = [],
): CalendarEvent[] {
  const them = people.find((p) => p.id === item.forecasterId);
  const theirCountry = (them?.country ?? "").trim().toLowerCase();
  return events.filter((event) => {
    if (event.type !== "leave" && event.type !== "public-holiday") return false;
    if (!eventCovers(event, item.submissionDate)) return false;
    const named = event.personIds?.length ? event.personIds : event.personId ? [event.personId] : [];
    if (named.length) return named.includes(item.forecasterId);
    const countries = event.countries ?? [];
    if (countries.length) {
      if (countries.some((c) => /^all$/i.test(c.trim()))) return true;
      /*
       * Nobody has filled the country in for this person, so only the
       * holidays marked All can be theirs. Warning about every country's
       * holidays was the other way round and disagreed with the calendar,
       * which shows them the All ones and nothing else — one of the two had
       * to be wrong, and a clash nobody can act on is the wrong one.
       */
      if (!theirCountry) return false;
      return countries.some((c) => c.trim().toLowerCase() === theirCountry);
    }
    // A region decides nothing here either — see `eventReaches`.
    return false;
  });
}

/**
 * Where a trend gets scored.
 *
 * Scoring is not something the Hub does — it happens in the team's own
 * scoring tool — so where the Hub notices a missing score it offers the way
 * there rather than a form it cannot honour. One constant, because when that
 * address changes it should change in one place.
 */
export const SCORING_TOOL = "https://score.wgsndev.com/";
