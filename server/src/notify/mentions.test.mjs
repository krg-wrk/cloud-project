/**
 * Naming somebody in a note.
 *
 * The risk in a mention feature is not that it fails to notify — it is that it
 * notifies the wrong person, or the same person four times, or leaks a note to
 * somebody by quoting it somewhere they should not see it. So these are
 * written as the things that must never happen:
 *
 *   * an address in a note read as somebody being named
 *   * a name inside a longer name matched
 *   * somebody told about their own note
 *   * a whole note sent verbatim to a third party
 *   * a second telling because the note was saved again
 *
 *   node --test server/dist/notify/mentions.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { findMentions, mentionNotice } from "./mentions.js";

const PEOPLE = [
  { id: "ao", name: "Amara Okafor", email: "amara.okafor@wgsn.com", role: "forecaster" },
  { id: "tb", name: "Tom Bright", email: "tom.bright@wgsn.com", role: "commissioning-manager" },
  { id: "am", name: "Amara", email: "amara.n@wgsn.com", role: "forecaster" },
  { id: "nn", name: "", email: "nameless@wgsn.com", role: "forecaster" },
];

const who = (body) => findMentions(body, PEOPLE).map((p) => p.id);

test("a name after an @ is the person", () => {
  assert.deepEqual(who("Worth asking @Amara Okafor about the catwalk data."), ["ao"]);
});

test("the longest name wins, so naming one person does not notify another", () => {
  // The team has an "Amara" and an "Amara Okafor". "@Amara Okafor" contains
  // "@Amara", and telling both would be telling somebody who was not named.
  assert.deepEqual(who("@Amara Okafor"), ["ao"]);
  assert.deepEqual(who("@Amara"), ["am"]);
  // Both, when both are genuinely written.
  assert.deepEqual(who("@Amara Okafor and @Amara"), ["ao", "am"]);
});

test("nobody named is nobody told", () => {
  assert.deepEqual(who("Needs the catwalk data before Friday."), []);
  assert.deepEqual(who(""), []);
});

test("an email address is not somebody being named", () => {
  // The whole reason the character before the @ is checked.
  assert.deepEqual(who("Chase tom.bright@wgsn.com about it"), []);
  assert.deepEqual(who("cc amara.okafor@wgsn.com"), []);
});

test("a name has to end where the name ends", () => {
  // "Amara" is a person here, and "Amara Okafor" is a different one. Matching
  // the short one inside the long one would notify somebody who was not named.
  assert.deepEqual(who("@Amara has the numbers"), ["am"]);
  assert.deepEqual(who("@Amaranth is a plant"), []);
});

test("case and position do not matter", () => {
  assert.deepEqual(who("@tom bright will know"), ["tb"]);
  assert.deepEqual(who("@Tom Bright"), ["tb"]);
  assert.deepEqual(who("(@Tom Bright)"), ["tb"]);
});

test("a person with no name on the sheet is never matched", () => {
  // Otherwise "@" on its own would name them.
  assert.deepEqual(who("@ is not a person"), []);
  assert.deepEqual(who("@"), []);
});

test("the same person named twice is one mention", () => {
  assert.deepEqual(who("@Tom Bright — and again, @Tom Bright"), ["tb"]);
});

/* ---- What the notice says ------------------------------------------------ */

const ITEM = { id: "ss-4013", title: "Big Ideas S/S 28" };
const NOTE = { id: "n1", body: "Worth asking @Amara Okafor about the catwalk data." };

test("the notice names the author and the forecast, and links to it", () => {
  const n = mentionNotice(NOTE, ITEM, PEOPLE[1], PEOPLE[0]);
  assert.equal(n.personId, "ao");
  assert.equal(n.kind, "mention");
  assert.equal(n.title, "Tom Bright named you in a note on Big Ideas S/S 28");
  assert.equal(n.link, "/content/ss-4013");
});

test("an author the team list has lost still produces a sentence", () => {
  const n = mentionNotice(NOTE, ITEM, undefined, PEOPLE[0]);
  assert.match(n.title, /^Somebody named you/);
});

test("the note is quoted, and cut short before it reaches anybody's inbox", () => {
  // A notice body goes out as-is over email and Google Chat, so a long note
  // must not travel whole.
  const long = { id: "n2", body: "x".repeat(900) };
  const n = mentionNotice(long, ITEM, PEOPLE[1], PEOPLE[0]);
  assert.ok(n.body.length < 260, `quoted body was ${n.body.length}`);
  assert.ok(n.body.endsWith("…"), "it says it was cut");
});

test("the quote is flattened, so a notice stays one paragraph", () => {
  const n = mentionNotice({ id: "n3", body: "One.\n\n  Two." }, ITEM, PEOPLE[1], PEOPLE[0]);
  assert.equal(n.body, "One. Two.");
});

test("the key carries the note and the person, and nothing about when", () => {
  // Which is what makes re-saving a note not tell anybody a second time, while
  // adding a name to it does tell the person just added.
  const a = mentionNotice(NOTE, ITEM, PEOPLE[1], PEOPLE[0]).key;
  const b = mentionNotice({ ...NOTE, body: `${NOTE.body} Edited.` }, ITEM, PEOPLE[1], PEOPLE[0]).key;
  assert.equal(a, b);
  assert.equal(a, "ao:mention:n1");

  // And it is unique per person, because the notifications table has one
  // unique index across everybody's keys.
  assert.notEqual(a, mentionNotice(NOTE, ITEM, PEOPLE[1], PEOPLE[1]).key);
});
