import type { PeerReview, PersonalEntry } from "./store.js";
import type { CalendarEvent, ContentItem, KnowledgeSession, Person } from "./types.js";

/**
 * A subscribable calendar feed.
 *
 * This is how the Hub gets into Google Calendar without asking anyone for
 * access to their account: each forecaster subscribes once to their own feed
 * URL ("Other calendars → From URL"), and Google re-reads it from then on.
 * Deadlines then sit alongside their meetings, on their phone, offline.
 *
 * It is one-way by design. Google refreshes subscribed feeds on its own
 * schedule — often hours, sometimes longer — so it is right for deadlines
 * that move occasionally and wrong for anything that must appear instantly.
 * Two-way sync needs the Calendar API and per-user OAuth; see the README.
 */

export interface FeedInput {
  person: Person;
  content: ContentItem[];
  events: CalendarEvent[];
  sessions: KnowledgeSession[];
  /** Session ids this person is signed up to. */
  signedUpTo: Set<string>;
  entries: PersonalEntry[];
  /** Reviews where this person is the author or the reviewer. */
  peerReviews: { review: PeerReview; item: ContentItem; counterpart?: Person }[];
  /** Absolute base URL, so events can link back into the Hub. */
  baseUrl: string;
}

/** RFC 5545 folds long lines at 75 octets, continued with a leading space. */
function fold(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length > 72) {
    parts.push(` ${rest.slice(0, 72)}`);
    rest = rest.slice(72);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join("\r\n");
}

function esc(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

const compact = (date: string) => date.replace(/-/g, "");

/** All-day events are half-open: DTEND is the morning after. */
function dayAfter(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`) + 86_400_000;
  return compact(new Date(t).toISOString().slice(0, 10));
}

function stamp(iso: string): string {
  return `${iso.slice(0, 19).replace(/[-:]/g, "")}Z`;
}

interface Entry {
  uid: string;
  summary: string;
  date: string;
  endDate?: string;
  /** "HH:MM" pair for a timed event; omitted for an all-day one. */
  startTime?: string;
  endTime?: string;
  description?: string;
  location?: string;
  url?: string;
}

function toVEvent(entry: Entry, dtstamp: string): string {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${entry.uid}`,
    `DTSTAMP:${dtstamp}`,
  ];

  if (entry.startTime && entry.endTime) {
    // Sessions are booked in UK time; TZID keeps them at the right hour.
    lines.push(
      `DTSTART;TZID=Europe/London:${compact(entry.date)}T${entry.startTime.replace(":", "")}00`,
      `DTEND;TZID=Europe/London:${compact(entry.date)}T${entry.endTime.replace(":", "")}00`,
    );
  } else {
    lines.push(
      `DTSTART;VALUE=DATE:${compact(entry.date)}`,
      `DTEND;VALUE=DATE:${dayAfter(entry.endDate ?? entry.date)}`,
    );
  }

  lines.push(`SUMMARY:${esc(entry.summary)}`);
  if (entry.description) lines.push(`DESCRIPTION:${esc(entry.description)}`);
  if (entry.location) lines.push(`LOCATION:${esc(entry.location)}`);
  if (entry.url) lines.push(`URL:${entry.url}`);
  lines.push("END:VEVENT");

  return lines.map(fold).join("\r\n");
}

/**
 * Everything this person needs in their own calendar: their deadlines, the
 * peer reviews they are either side of, the sessions they signed up to, their
 * own reminders, and the holidays for their region.
 */
export function buildFeed(input: FeedInput): string {
  const { person, baseUrl } = input;
  const dtstamp = stamp(new Date().toISOString());
  const entries: Entry[] = [];

  const mine = input.content.filter((c) => c.forecasterId === person.id);

  for (const item of mine) {
    entries.push({
      uid: `submission-${item.id}@forecasters-hub`,
      summary: `Copy due: ${item.title}`,
      date: item.submissionDate,
      description: `${item.type} · ${item.vertical} · ${item.season}\nStatus: ${item.status}`,
      url: `${baseUrl}/content/${item.id}`,
    });
    entries.push({
      uid: `publication-${item.id}@forecasters-hub`,
      summary: `Publishes: ${item.title}`,
      date: item.publicationDate,
      description: `${item.type} · ${item.vertical} · ${item.season}`,
      url: `${baseUrl}/content/${item.id}`,
    });
  }

  // Peer reviews land in both calendars — this person's and their reviewer's.
  for (const { review, item, counterpart } of input.peerReviews) {
    const asReviewer = review.reviewerId === person.id;
    entries.push({
      uid: `peer-review-${item.id}@forecasters-hub`,
      summary: asReviewer
        ? `Peer review: ${item.title}`
        : `Peer review with ${counterpart?.name ?? "a colleague"}: ${item.title}`,
      date: review.reviewDate,
      description: [
        asReviewer
          ? `Reviewing ${counterpart?.name ?? "a colleague"}'s piece.`
          : `${counterpart?.name ?? "A colleague"} is reviewing this.`,
        review.note ?? "",
        `Copy due ${item.submissionDate}, publishes ${item.publicationDate}.`,
      ]
        .filter(Boolean)
        .join("\n"),
      url: `${baseUrl}/content/${item.id}`,
    });
  }

  for (const session of input.sessions) {
    if (!input.signedUpTo.has(session.id)) continue;
    entries.push({
      uid: `session-${session.id}@forecasters-hub`,
      summary: session.title,
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      description: session.summary,
      location: session.location,
      url: `${baseUrl}/workshops/${session.id}`,
    });
  }

  for (const entry of input.entries) {
    entries.push({
      uid: `entry-${entry.id}@forecasters-hub`,
      summary: entry.title,
      date: entry.date,
      endDate: entry.endDate,
      description: entry.note,
    });
  }

  for (const event of input.events) {
    const forThisPerson = event.personId
      ? event.personId === person.id
      : !event.region || event.region === "All" || event.region === person.region;
    if (!forThisPerson) continue;
    entries.push({
      uid: `event-${event.id}@forecasters-hub`,
      summary: event.title,
      date: event.startDate,
      endDate: event.endDate,
      location: event.location,
    });
  }

  const head = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WGSN//Forecasters Hub//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${esc(`Forecasters Hub — ${person.name}`)}`),
    "X-WR-TIMEZONE:Europe/London",
    // Google honours this as a hint for how often to re-read the feed.
    "REFRESH-INTERVAL;VALUE=DURATION:PT2H",
    "X-PUBLISHED-TTL:PT2H",
  ];

  return [...head, ...entries.map((e) => toVEvent(e, dtstamp)), "END:VCALENDAR", ""].join("\r\n");
}
