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
  /** Added by the API: how many notes the piece has, and its peer review. */
  noteCount?: number;
  peerReview?: PeerReview | null;
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

export type SessionKind =
  | "workshop"
  | "masterclass"
  | "lunch-and-learn"
  | "critique"
  | "training";

export interface KnowledgeSession {
  id: string;
  title: string;
  kind: SessionKind;
  hostId?: string;
  hostExternal?: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  online: boolean;
  capacity: number | null;
  signUpsOpen: boolean;
  required?: boolean;
  summary: string;
  topics: string[];
  recapUrl?: string;
}

/** A session as the API returns it, with its sign-ups attached. */
export interface SessionWithSignUps extends KnowledgeSession {
  going: string[];
  waiting: string[];
  placesLeft: number | null;
  full: boolean;
}

export type Role = "forecaster" | "commissioning-manager" | "admin";

/** The signed-in account, as /api/me returns it. */
export interface Me {
  email: string;
  name: string;
  personId: string | null;
  role: Role;
  verticals: string[] | "all";
  active: boolean;
  person?: Person;
  seesWholeTeam: boolean;
  aiNotes: boolean;
  calendarFeed: string | null;
}

export interface ContentNote {
  id: string;
  contentId: string;
  authorId: string;
  body: string;
  source: "human" | "ai";
  model?: string;
  createdAt: string;
  updatedAt: string;
}

export type EntryKind = "reminder" | "focus-time" | "personal" | "milestone";

export interface PersonalEntry {
  id: string;
  personId: string;
  title: string;
  kind: EntryKind;
  date: string;
  endDate: string;
  note?: string;
  contentId?: string;
}

export interface PeerReview {
  contentId: string;
  reviewerId: string;
  reviewDate: string;
  arrangedBy: string;
  note?: string;
}

/** A peer review with the piece it belongs to, and which side you are on. */
export interface MyPeerReview extends PeerReview {
  item: ContentItem | null;
  iAmReviewer: boolean;
}

export interface Schedule {
  people: Person[];
  content: ContentItem[];
  events: CalendarEvent[];
  /** The signed-in person's own reminders — never a colleague's. */
  entries: PersonalEntry[];
  peerReviews: MyPeerReview[];
}
