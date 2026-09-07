/**
 * Client-side view of the domain model. Kept in step with server/src/types.ts
 * by hand for now; worth promoting to a shared workspace package once the
 * shape settles.
 */

export type Status =
  | "not-started"
  | "in-progress"
  | "submitted"
  | "in-review"
  | "published"
  | "at-risk";

export type EventType =
  | "leave"
  | "public-holiday"
  | "workshop"
  | "training"
  | "conference";

export interface Person {
  id: string;
  name: string;
  email: string;
  role: "forecaster" | "commissioning-manager";
  vertical?: string;
  region: string;
}

export interface ContentItem {
  id: string;
  title: string;
  type: string;
  vertical: string;
  season: string;
  forecasterId: string;
  managerId: string;
  submissionDate: string;
  publicationDate: string;
  status: Status;
  notes?: string;
}

export interface CalendarEvent {
  id: string;
  type: EventType;
  title: string;
  personId?: string;
  region?: string;
  startDate: string;
  endDate: string;
  location?: string;
  notes?: string;
}

export interface Schedule {
  people: Person[];
  content: ContentItem[];
  events: CalendarEvent[];
}
