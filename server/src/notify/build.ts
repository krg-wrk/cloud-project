import type { CalendarEvent, ContentItem, KnowledgeSession, Person } from "../types.js";
import type { PeerReview } from "../store.js";
import type { Notice, NoticeKind } from "./types.js";

/**
 * Working out what each person needs to hear.
 *
 * Pure on purpose: everything it needs is an argument, so the rules about
 * *what* gets said are testable without a database, a clock or a webhook.
 * Delivery is somebody else's problem — see `run.ts`.
 *
 * Two shapes of thing, and the difference matters. A deadline notice is about
 * one forecast at one moment and is sent once, ever, for that moment. A
 * digest is about a week and is sent once for that week whatever changes
 * inside it. Both are expressed as a stable `key`, which is the whole of the
 * don't-say-it-twice mechanism.
 */

/** Everything the rules read. Supplied by the caller, never fetched here. */
export interface World {
  /** Today, as a date string. Passed in so a test can pick a Monday. */
  today: string;
  people: Person[];
  content: ContentItem[];
  events: CalendarEvent[];
  sessions: KnowledgeSession[];
  /** Session id to the people going, as the sign-ups store reports it. */
  goingBySession: Record<string, string[]>;
  peerReviews: PeerReview[];
  /** How many proof point suggestions wait on each person's trends. */
  reviewWaiting: Record<string, number>;
}

const DAY = 86_400_000;

/** Days from `today` to `date`: negative is the past. */
export function daysUntil(today: string, date: string): number {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / DAY);
}

/** Monday of the week containing `date`, so a digest keys on the week. */
export function weekOf(date: string): string {
  const at = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return date;
  // getUTCDay is 0 on Sunday, which belongs to the week that just ended.
  const back = (at.getUTCDay() + 6) % 7;
  return new Date(at.getTime() - back * DAY).toISOString().slice(0, 10);
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const shortDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

/**
 * The statuses in the words a person says them in.
 *
 * The Hub's own vocabulary is hyphenated because it is a key, and a notice
 * that reads 'it still reads "in-progress"' reads like a database. The
 * sheet's own picklist words are a third vocabulary again and belong in the
 * write path, not here.
 */
const STATUS_WORDS: Record<string, string> = {
  "not-started": "not started",
  "in-progress": "in progress",
  submitted: "submitted",
  "in-review": "in review",
  published: "published",
  "at-risk": "at risk",
};

/** A forecast is finished, as far as chasing it goes. */
const done = (item: ContentItem) =>
  item.status === "published" || item.status === "submitted" || item.status === "in-review";

/** Everyone credited on a forecast, not only whoever the sheet calls the owner. */
function workingOn(item: ContentItem): string[] {
  return [...new Set([item.forecasterId, ...(item.contributorIds ?? [])])].filter(Boolean);
}

/**
 * Is this person away on this date?
 *
 * A deadline nudge that lands in the middle of somebody's annual leave is
 * worse than none: they cannot act on it, and it teaches them the Hub does
 * not know anything about them. Public holidays count the same way, and a
 * holiday is regional — a UK bank holiday is a working day in New York.
 */
export function awayOn(events: CalendarEvent[], person: Person, date: string): boolean {
  return events.some((e) => {
    if (e.startDate > date || date > e.endDate) return false;
    // Leave belongs to one person; a holiday to a region, or to everybody.
    if (e.type === "leave") return e.personId === person.id;
    if (e.type !== "public-holiday") return false;
    return !e.region || e.region === "All" || e.region === person.region;
  });
}

/**
 * The deadline notices: one per forecast, at three moments.
 *
 * Three and no more. Every extra reminder for the same deadline lowers the
 * value of all of them, and the team already knows what "three days" means —
 * it is the window in which something can still be rescued.
 */
const MOMENTS: { at: number; slug: string; urgency: 0 | 1 | 2; say: (when: string) => string }[] = [
  { at: 3, slug: "in-3", urgency: 0, say: (when) => `due ${when} — three days from now` },
  { at: 0, slug: "today", urgency: 1, say: () => "due today" },
  { at: -1, slug: "late", urgency: 2, say: (when) => `overdue: it was due ${when}` },
];

function deadlineNotices(world: World): Notice[] {
  const out: Notice[] = [];
  const byId = new Map(world.people.map((p) => [p.id, p]));

  for (const item of world.content) {
    if (done(item)) continue;
    if (!item.submissionDate) continue;
    const days = daysUntil(world.today, item.submissionDate);
    if (Number.isNaN(days)) continue;

    /*
     * Late is every day it stays late, not one notice on the first day —
     * being a week overdue is a different fact from being a day overdue, and
     * the key carries the date so each day says it once.
     */
    const moment =
      days < 0
        ? { ...MOMENTS[2], slug: `late-${world.today}` }
        : MOMENTS.find((m) => m.at === days);
    if (!moment) continue;

    for (const personId of workingOn(item)) {
      const person = byId.get(personId);
      if (!person) continue;
      if (awayOn(world.events, person, world.today)) continue;
      const late = days < 0;
      const when = shortDate(item.submissionDate);
      out.push({
        key: `${personId}:deadline:${item.id}:${moment.slug}`,
        personId,
        kind: "deadline",
        title: late
          ? `Overdue: ${item.title}`
          : days === 0
            ? `Due today: ${item.title}`
            : `Due ${when}: ${item.title}`,
        body: [
          late
            ? `${item.title} (${item.type}, ${item.vertical}) is ${moment.say(when)} — ${plural(
                Math.abs(days),
                "day",
              )} ago.`
            : `${item.title} (${item.type}, ${item.vertical}) is ${moment.say(when)}.`,
          late
            ? `It still reads "${STATUS_WORDS[item.status] ?? item.status}". Publication is ${shortDate(
                item.publicationDate,
              )}.`
            : `Publication is ${shortDate(item.publicationDate)}.`,
        ].join("\n"),
        link: `/content/${item.id}`,
        urgency: moment.urgency,
      });
    }
  }
  return out;
}

/**
 * The review notice: suggestions waiting on a trend you own.
 *
 * Sent at most once a week per person, on the digest's own key, because the
 * queue is never empty and a daily reminder about a ten-thousand-row backlog
 * is just noise. It also says nothing at all below a threshold: three
 * suggestions do not need an email.
 */
const REVIEW_FLOOR = 5;

function reviewNotices(world: World): Notice[] {
  const week = weekOf(world.today);
  const out: Notice[] = [];
  for (const person of world.people) {
    const waiting = world.reviewWaiting[person.id] ?? 0;
    if (waiting < REVIEW_FLOOR) continue;
    out.push({
      key: `${person.id}:review:${week}`,
      personId: person.id,
      kind: "review",
      title: `${plural(waiting, "proof point")} waiting on you`,
      body: [
        `${waiting} suggested proof points are waiting on a decision for trends you own.`,
        "The queue takes them best match first, and the arrow keys do the work.",
      ].join("\n"),
      link: "/data/review",
      urgency: 0,
    });
  }
  return out;
}

/**
 * The weekly digest: what this person's week holds.
 *
 * Only sent on a Monday, and only when there is something in it. A digest
 * that reads "nothing this week" every week is the thing people filter to a
 * folder they never open.
 */
function digestNotices(world: World): Notice[] {
  const week = weekOf(world.today);
  if (world.today !== week) return [];

  const end = new Date(Date.parse(`${week}T00:00:00Z`) + 6 * DAY).toISOString().slice(0, 10);
  const out: Notice[] = [];

  for (const person of world.people) {
    const lines: string[] = [];

    const due = world.content
      .filter((i) => !done(i) && workingOn(i).includes(person.id))
      .filter((i) => i.submissionDate >= week && i.submissionDate <= end)
      .sort((a, b) => a.submissionDate.localeCompare(b.submissionDate));
    const overdue = world.content
      .filter((i) => !done(i) && workingOn(i).includes(person.id))
      .filter((i) => i.submissionDate && i.submissionDate < week)
      .sort((a, b) => a.submissionDate.localeCompare(b.submissionDate));
    const publishing = world.content
      .filter((i) => workingOn(i).includes(person.id))
      .filter((i) => i.publicationDate >= week && i.publicationDate <= end)
      .sort((a, b) => a.publicationDate.localeCompare(b.publicationDate));

    if (overdue.length) {
      lines.push(
        `Overdue (${overdue.length}):`,
        ...overdue.map((i) => `  · ${i.title} — was due ${shortDate(i.submissionDate)}`),
      );
    }
    if (due.length) {
      lines.push(
        `Due with your commissioning manager this week (${due.length}):`,
        ...due.map((i) => `  · ${shortDate(i.submissionDate)} — ${i.title}`),
      );
    }
    if (publishing.length) {
      lines.push(
        `Publishing this week (${publishing.length}):`,
        ...publishing.map((i) => `  · ${shortDate(i.publicationDate)} — ${i.title}`),
      );
    }

    // Peer review cuts both ways: what you are reading, and who is reading you.
    const reviewing = world.peerReviews
      .filter((r) => r.reviewerId === person.id && r.reviewDate >= week && r.reviewDate <= end)
      .sort((a, b) => a.reviewDate.localeCompare(b.reviewDate));
    if (reviewing.length) {
      const titles = new Map(world.content.map((i) => [i.id, i.title]));
      lines.push(
        `Peer reviews you are doing (${reviewing.length}):`,
        ...reviewing.map(
          (r) => `  · ${shortDate(r.reviewDate)} — ${titles.get(r.contentId) ?? r.contentId}`,
        ),
      );
    }

    const sessions = world.sessions
      .filter((s) => s.date >= week && s.date <= end)
      .filter((s) => (world.goingBySession[s.id] ?? []).includes(person.id))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (sessions.length) {
      lines.push(
        `You are signed up for (${sessions.length}):`,
        ...sessions.map((s) => `  · ${shortDate(s.date)} — ${s.title}`),
      );
    }

    const waiting = world.reviewWaiting[person.id] ?? 0;
    if (waiting >= REVIEW_FLOOR) {
      lines.push(`${plural(waiting, "proof point")} waiting on a decision for your trends.`);
    }

    if (!lines.length) continue;

    out.push({
      key: `${person.id}:digest:${week}`,
      personId: person.id,
      kind: "digest",
      title: `Your week: ${shortDate(week)} to ${shortDate(end)}`,
      body: lines.join("\n"),
      link: "/",
      urgency: overdue.length ? 2 : 0,
    });
  }
  return out;
}

const BUILDERS: Record<NoticeKind, (world: World) => Notice[]> = {
  digest: digestNotices,
  deadline: deadlineNotices,
  review: reviewNotices,
};

/**
 * Everything worth saying today, most urgent first.
 *
 * `only` narrows it to one kind, which is what the admin's preview uses and
 * what a schedule that runs deadlines daily but the digest weekly needs.
 */
export function buildNotices(world: World, only?: NoticeKind[]): Notice[] {
  const kinds = only ?? (Object.keys(BUILDERS) as NoticeKind[]);
  const out = kinds.flatMap((kind) => BUILDERS[kind](world));
  return out.sort(
    (a, b) => b.urgency - a.urgency || a.personId.localeCompare(b.personId) || a.key.localeCompare(b.key),
  );
}
