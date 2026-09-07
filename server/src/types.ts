/** Domain model for the Forecasters Hub. Mirrors the columns held in Smartsheet. */

export type Status =
  | "not-started"
  | "in-progress"
  | "submitted"
  | "in-review"
  | "published"
  | "at-risk";

export type ContentType =
  | "Big Idea"
  | "Season Forecast"
  | "Catwalk Report"
  | "Colour Forecast"
  | "Consumer Attitudes"
  | "Trend Curve"
  | "Case Study"
  | "Market Report";

export type Vertical =
  | "Womenswear"
  | "Menswear"
  | "Beauty"
  | "Interiors & Lifestyle"
  | "Footwear & Accessories"
  | "Food & Drink"
  | "Consumer Tech"
  | "Kidswear";

export interface Person {
  id: string;
  name: string;
  email: string;
  role: "forecaster" | "commissioning-manager";
  vertical?: Vertical;
  region: string;
}

export interface ContentItem {
  id: string;
  title: string;
  type: ContentType;
  vertical: Vertical;
  season: string;
  /** Person id of the forecaster who writes it. */
  forecasterId: string;
  /** Person id of the commissioning manager who owns the slot. */
  managerId: string;
  /** ISO date (YYYY-MM-DD) the copy is due with the commissioning manager. */
  submissionDate: string;
  /** ISO date (YYYY-MM-DD) it goes live on the platform. */
  publicationDate: string;
  status: Status;
  notes?: string;
}

export type EventType =
  | "leave"
  | "public-holiday"
  | "workshop"
  | "training"
  | "conference";

export interface CalendarEvent {
  id: string;
  type: EventType;
  title: string;
  /** Person id, when the event belongs to one person (e.g. annual leave). */
  personId?: string;
  /** Region the event applies to, for public holidays. */
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

/**
 * A workshop or knowledge-sharing session. Separate from CalendarEvent
 * because these are things people attend and sign up for, rather than
 * blocks of time to plan around.
 */
export interface KnowledgeSession {
  id: string;
  title: string;
  kind: SessionKind;
  /** Person id of an internal host. */
  hostId?: string;
  /** Named guest speaker, when the host is not on the team. */
  hostExternal?: string;
  date: string;
  /** 24h "HH:MM", in UK time. */
  startTime: string;
  endTime: string;
  location: string;
  online: boolean;
  /** null when there is no limit on numbers. */
  capacity: number | null;
  /** False for sessions nobody signs up for — the required ones. */
  signUpsOpen: boolean;
  /** The whole team is expected, so there is nothing to opt into. */
  required?: boolean;
  summary: string;
  topics: string[];
  /** Notes or a recording, once the session has run. */
  recapUrl?: string;
}

/** Who is going to a session, and who is next in line if it is full. */
export interface SessionSignUps {
  going: string[];
  waiting: string[];
}

/**
 * Everything the Hub reads. Implemented by the seed adapter today and by the
 * Smartsheet / Google Sheets adapters against the live sheets.
 */
export interface DataSource {
  readonly name: string;
  listPeople(): Promise<Person[]>;
  listContent(): Promise<ContentItem[]>;
  listEvents(): Promise<CalendarEvent[]>;
  listSessions(): Promise<KnowledgeSession[]>;
  /** Sign-ups keyed by session id. */
  listSignUps(): Promise<Record<string, SessionSignUps>>;
}
