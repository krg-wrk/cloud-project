/**
 * Telling people things they would otherwise have to come and look for.
 *
 * The Hub is a website, and a website only tells you something while you are
 * looking at it. The two things the team actually misses are a deadline
 * creeping up and the week starting without a plan, and both of those are
 * known on the server days in advance. So the Hub works out what each person
 * needs to hear and sends it down whichever channel that person chose.
 *
 * The forecaster chooses. Not the admin, not a global switch: some of this
 * team lives in Google Chat, some in email, and some want the bell in the
 * corner and nothing else. A notification nobody asked for is spam however
 * useful it is, and the fastest way to have a digest ignored is to send it to
 * somebody who told you not to.
 */

/**
 * Where a notice can go.
 *
 * In-app always works — it is a row in the Hub's own database. The other two
 * need configuring, and both say so plainly rather than failing quietly:
 * "nothing is sending email yet" is a useful answer, a silently dropped
 * deadline warning is not.
 */
export type Channel = "inApp" | "email" | "chat";

export const CHANNELS: Channel[] = ["inApp", "email", "chat"];

export const CHANNEL_LABELS: Record<Channel, string> = {
  inApp: "In the Hub",
  email: "Email",
  chat: "Google Chat",
};

/**
 * What a notice is about.
 *
 * Deliberately few. Every kind added is one more reason for somebody to turn
 * the whole thing off, so this is the list that earns its place: the week
 * ahead, a deadline arriving, and a queue with your name on it.
 */
export type NoticeKind = "digest" | "deadline" | "review";

export const NOTICE_KINDS: NoticeKind[] = ["digest", "deadline", "review"];

export const KIND_LABELS: Record<NoticeKind, string> = {
  digest: "The week ahead",
  deadline: "Deadlines coming up",
  review: "Proof points waiting on you",
};

export const KIND_HINTS: Record<NoticeKind, string> = {
  digest: "Monday morning: what is due from you this week, who you are reviewing, what you signed up for",
  deadline: "A forecast of yours due in three days, due today, or overdue",
  review: "When suggestions are waiting on a decision for a trend you own",
};

/**
 * What one person asked for.
 *
 * The shape is a grid — a channel per kind — because "email me about
 * deadlines but not the digest" is a real preference and the alternative is
 * all or nothing. An untouched preference has no row at all, and `DEFAULT`
 * below is what stands until somebody changes it.
 */
export interface NotifyPrefs {
  personId: string;
  /** Which channels carry which kinds. */
  on: Record<NoticeKind, Channel[]>;
  /**
   * A Google Chat incoming webhook for this person's own space, if they made
   * one. Without it, chat falls back to the team space when there is one.
   */
  chatWebhook?: string;
  updatedAt?: string;
}

/**
 * The default: the bell, and nothing that leaves the building.
 *
 * Somebody who has never opened the settings gets the in-app notices, which
 * cost them nothing and cannot arrive at 3am. Email and chat are opt-in, both
 * because they are interruptive and because they are the two that send
 * WGSN's schedule to a third party.
 */
export const DEFAULT_ON: Record<NoticeKind, Channel[]> = {
  digest: ["inApp"],
  deadline: ["inApp"],
  review: ["inApp"],
};

export function defaultPrefs(personId: string): NotifyPrefs {
  return { personId, on: { ...DEFAULT_ON } };
}

/** One thing worth telling one person. */
export interface Notice {
  /**
   * Stable for the thing being said, not for the moment of saying it.
   *
   * "ao:deadline:ss-4013:due-today" is the same notice whether the run
   * happens at 8am or at noon, which is how the Hub avoids telling somebody
   * twice about one deadline. A digest keys on the week, so re-running a
   * Monday sends nothing.
   */
  key: string;
  personId: string;
  kind: NoticeKind;
  /** One line. It is the email subject and the bell's headline. */
  title: string;
  /** A few lines of plain text. Rendered as-is everywhere. */
  body: string;
  /** Where in the Hub to go, as a path — the channels make it absolute. */
  link?: string;
  /** Sorted on: 0 is ordinary, 1 wants attention, 2 is late. */
  urgency: 0 | 1 | 2;
}

/** An in-app notice, once it is in the inbox. */
export interface Inboxed extends Notice {
  id: string;
  at: string;
  readAt?: string;
}

/** What one channel did with one notice. */
export interface Delivery {
  personId: string;
  kind: NoticeKind;
  channel: Channel;
  key: string;
  ok: boolean;
  /** Why not, when it did not go: unconfigured, refused, or already sent. */
  problem?: string;
}

/** Whether a channel can send at all, and what to say if it cannot. */
export interface ChannelState {
  channel: Channel;
  ready: boolean;
  /** Plain words for the settings page. Always set. */
  note: string;
}
