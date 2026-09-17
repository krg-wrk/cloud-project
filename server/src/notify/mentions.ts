import type { ContentItem, Person } from "../types.js";
import type { HubStore } from "../store.js";
import { Channels } from "./channels.js";
import { CHANNELS, defaultPrefs, type Notice } from "./types.js";

/**
 * Naming somebody in a note, and telling them.
 *
 * A note is where the thinking about a forecast goes, and thinking about a
 * forecast is usually about somebody — the person who has the catwalk data,
 * the manager who moved the date. Writing "ask Amara" into a note and then
 * going to find Amara in Chat to say you wrote it is the gap this closes.
 *
 * Nothing is stored about who was mentioned. The names are in the note, and
 * the note is the truth: a mention table would be a second copy that has to be
 * kept in step with an editable body, and the first edit that did not update
 * it would make the two disagree with nobody the wiser. Who was *told* is
 * already recorded, in the notifications table, keyed so that a person is
 * told once about a note however many times it is saved.
 *
 * This is also the first thing in the Hub that sends without anybody pressing
 * a button and without the schedule being on. That is a deliberate departure
 * from "nothing sends itself", made once and for this: a mention that arrives
 * on Monday with the digest is not a mention, it is a summary of one.
 */

/**
 * Who this note names.
 *
 * Matched against the team's own names rather than parsed as a word, because
 * "Amara Okafor" has a space in it and anything clever enough to guess where a
 * name ends is clever enough to guess wrong. So each person's name is looked
 * for after an @, and a name that is not the team's is left as the text
 * somebody typed.
 *
 * Deliberately whole names only. Matching "@Amara" would notify the wrong
 * Amara the week a second one joins, and the picker in the composer writes the
 * whole name, so the ordinary path is unaffected.
 */
export function findMentions(body: string, people: Person[]): Person[] {
  const hay = body.toLowerCase();
  /*
    Longest name first, and each @ can only be claimed once.

    A team with an "Amara" and an "Amara Okafor" is not a hypothetical — WGSN
    has several people whose names begin the same way. Writing "@Amara Okafor"
    also contains "@Amara", so matching each name independently would notify
    somebody who was not named. At any one @, the longest name that fits wins
    and the shorter ones do not get a second look at that position.
  */
  const named = people
    .filter((p) => p.name?.trim())
    .sort((a, b) => b.name.trim().length - a.name.trim().length);

  const claimed = new Set<number>();
  const found = new Map<string, Person>();
  for (const person of named) {
    for (const at of tokenAt(hay, `@${person.name.trim().toLowerCase()}`)) {
      if (claimed.has(at)) continue;
      claimed.add(at);
      found.set(person.id, person);
    }
  }
  // Back into the order the team list has them, so two runs read the same.
  return people.filter((p) => found.has(p.id));
}

/** Every position where `needle` sits in `hay` as a whole token. */
function tokenAt(hay: string, needle: string): number[] {
  const out: number[] = [];
  let at = hay.indexOf(needle);
  while (at !== -1) {
    const before = at === 0 ? "" : hay[at - 1];
    const after = hay[at + needle.length] ?? "";
    // Not inside a longer word, and not the @ of an address — "chase
    // tom.bright@wgsn.com" is not Tom being named.
    if ((before === "" || !/[\w@.]/.test(before)) && (after === "" || !/\w/.test(after))) {
      out.push(at);
    }
    at = hay.indexOf(needle, at + 1);
  }
  return out;
}

/** How much of a note travels with the notice. */
const QUOTE_LIMIT = 220;

/**
 * The notice one person gets.
 *
 * The body quotes the note rather than saying "you were mentioned", because a
 * notice that makes somebody open a page to find out whether it matters is a
 * notice they will start ignoring. It is truncated hard: a notice body is
 * rendered as-is into an email and into Google Chat, and a two-thousand-word
 * note has no business arriving in either.
 *
 * The key carries the note and the person, and nothing about time. So editing
 * a note does not tell the same person again, while adding a name to it does
 * tell the person just added.
 */
export function mentionNotice(
  note: { id: string; body: string },
  item: ContentItem,
  author: Person | undefined,
  person: Person,
): Notice {
  const who = author?.name ?? "Somebody";
  const quote = note.body.trim().replace(/\s+/g, " ");
  return {
    key: `${person.id}:mention:${note.id}`,
    personId: person.id,
    kind: "mention",
    title: `${who} named you in a note on ${item.title}`,
    body: quote.length > QUOTE_LIMIT ? `${quote.slice(0, QUOTE_LIMIT).trimEnd()}…` : quote,
    link: `/content/${item.id}`,
    urgency: 0,
  };
}

/**
 * Tell everyone this note names, down the channels each of them chose.
 *
 * A lighter path than `runNotifications`, on purpose: that one assembles the
 * whole world — every person, every forecast, every event, the proof point
 * library — to decide what is owed, which is the right shape for a scheduled
 * sweep and far too much to do inside a request to save a note.
 *
 * Nothing here throws. A note that saved is saved, and a webhook that would
 * not answer is not a reason to tell somebody their note failed — the problem
 * is recorded where the admin's delivery log reads it.
 *
 * Returns the people actually told, which is what the API hands back so the
 * composer can say so.
 */
export async function tellMentioned(
  store: HubStore,
  note: { id: string; body: string; authorId: string },
  item: ContentItem,
  people: Person[],
): Promise<string[]> {
  const author = people.find((p) => p.id === note.authorId);
  // Naming yourself is a note-taking habit, not a request to be notified.
  const named = findMentions(note.body, people).filter((p) => p.id !== note.authorId);
  if (named.length === 0) return [];

  const channels = new Channels(store);
  const told: string[] = [];

  for (const person of named) {
    const notice = mentionNotice(note, item, author, person);
    const prefs = (await store.notifyPrefs(person.id)) ?? defaultPrefs(person.id);
    const wanted = prefs.on.mention ?? [];
    let anyLanded = false;

    for (const channel of CHANNELS) {
      if (!wanted.includes(channel)) continue;
      // The same don't-say-it-twice ledger the scheduled run consults, so a
      // re-saved note does not email somebody again.
      if (await store.alreadySent(notice.key, channel)) continue;
      const problem = await channels.send(channel, notice, person, prefs);
      await store.logNotification({
        key: notice.key,
        personId: person.id,
        kind: "mention",
        channel,
        ok: !problem,
        problem,
      });
      if (!problem) anyLanded = true;
    }
    if (anyLanded) told.push(person.name ?? person.id);
  }
  return told;
}
