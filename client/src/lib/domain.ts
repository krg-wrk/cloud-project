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
  if (session.date < today) return "past";
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

/** Work is done once it is with the commissioning manager. */
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
 * Leave and holidays that collide with a submission deadline. Holidays are
 * regional, so a Singapore holiday is not a clash for a forecaster in London.
 */
export function clashesFor(
  item: ContentItem,
  events: CalendarEvent[],
  people: Person[] = [],
): CalendarEvent[] {
  const region = people.find((p) => p.id === item.forecasterId)?.region;
  return events.filter((event) => {
    if (event.type !== "leave" && event.type !== "public-holiday") return false;
    if (!eventCovers(event, item.submissionDate)) return false;
    if (event.personId) return event.personId === item.forecasterId;
    // An unassigned event applies by region; "All" covers everyone.
    if (!event.region || event.region === "All") return true;
    return region === undefined || event.region === region;
  });
}
