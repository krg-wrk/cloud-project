import assert from "node:assert/strict";
import test from "node:test";
import { cadenceWords, esc, localDay, mailDue, mailFor, MAIL_ROWS } from "./viewMail.js";

/**
 * A view in somebody's inbox.
 *
 * Two things here are worth pinning down. Whether a mail is owed right now,
 * because getting that wrong means either silence or the same table four
 * times an hour; and what ends up in the HTML, because every word of it came
 * out of a sheet somebody else edits.
 */

const mail = (over = {}) => ({
  id: "m1",
  personId: "ao",
  email: "amara.okafor@wgsn.com",
  viewId: "v1",
  cadence: "daily",
  weekday: 1,
  hour: 8,
  enabled: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

/** A local-time date, so the tests say what they mean whatever TZ they run in. */
const at = (y, m, d, h) => new Date(y, m - 1, d, h, 0, 0);

test("a daily mail is owed at its hour and no other", () => {
  assert.equal(mailDue(mail(), at(2026, 9, 16, 8)), true);
  assert.equal(mailDue(mail(), at(2026, 9, 16, 7)), false);
  assert.equal(mailDue(mail(), at(2026, 9, 16, 9)), false);
});

test("the hour matches rather than being past", () => {
  // The scheduler wakes every fifteen minutes. "Past eight" would send at
  // 08:00, again at 08:15, and again every tick until midnight.
  assert.equal(mailDue(mail({ hour: 8 }), at(2026, 9, 16, 14)), false);
});

test("one a day, however many times the scheduler wakes", () => {
  const today = localDay(at(2026, 9, 16, 8));
  assert.equal(mailDue(mail({ lastSentOn: today }), at(2026, 9, 16, 8)), false);
  // And it comes back tomorrow.
  assert.equal(mailDue(mail({ lastSentOn: today }), at(2026, 9, 17, 8)), true);
});

test("a switched-off subscription is never owed", () => {
  assert.equal(mailDue(mail({ enabled: false }), at(2026, 9, 16, 8)), false);
});

test("weekdays means weekdays", () => {
  const m = mail({ cadence: "weekdays" });
  // 2026-09-16 is a Wednesday; the 19th and 20th are Saturday and Sunday.
  assert.equal(mailDue(m, at(2026, 9, 16, 8)), true);
  assert.equal(mailDue(m, at(2026, 9, 19, 8)), false);
  assert.equal(mailDue(m, at(2026, 9, 20, 8)), false);
});

test("weekly means the one day it was asked for", () => {
  const monday = mail({ cadence: "weekly", weekday: 1 });
  assert.equal(mailDue(monday, at(2026, 9, 21, 8)), true, "Monday the 21st");
  assert.equal(mailDue(monday, at(2026, 9, 22, 8)), false, "Tuesday");
});

test("the day is the local one, not UTC's", () => {
  // The hour check works in local time, so the date it is compared against
  // has to as well — otherwise a schedule either side of midnight UTC
  // records tomorrow and then refuses to send tomorrow.
  const d = at(2026, 3, 1, 23);
  assert.equal(localDay(d), "2026-03-01");
});

test("the schedule reads back in words", () => {
  assert.equal(cadenceWords(mail({ hour: 8 })), "Every day at 08:00");
  assert.equal(cadenceWords(mail({ cadence: "weekly", weekday: 5, hour: 17 })), "Fridays at 17:00");
});

test("markup in a cell stays a cell", () => {
  assert.equal(esc(`<script>alert(1)</script>`), "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(esc(`a & b "c" 'd'`), "a &amp; b &quot;c&quot; &#39;d&#39;");
  assert.equal(esc(null), "");
});

/** A view page, as the runner hands one over. */
const page = (rows, over = {}) => ({
  view: { slug: "late-work", label: "Late work", spec: { layout: "table", fields: {} } },
  fields: [
    { key: "title", name: "Title", type: "text" },
    { key: "who", name: "Forecaster", type: "text" },
  ],
  source: { dataset: "d", connection: "c", kind: "smartsheet" },
  total: over.total ?? rows.length,
  rows,
  ...over,
});

test("the mail carries the rows, the count and a link to the live view", () => {
  const body = mailFor(page([{ title: "Catwalk Report", who: "Amara" }]), "https://hub.example", new Date());
  assert.match(body.subject, /Late work/);
  assert.match(body.subject, /1 row/);
  assert.match(body.html, /Catwalk Report/);
  assert.match(body.text, /Catwalk Report/);
  assert.match(body.html, /https:\/\/hub\.example\/v\/late-work/);
  assert.match(body.text, /https:\/\/hub\.example\/v\/late-work/);
});

test("a cell that looks like markup does not become markup", () => {
  const body = mailFor(page([{ title: `<b>not bold</b>`, who: "x" }]), "https://hub.example", new Date());
  assert.ok(!body.html.includes("<b>not bold</b>"), "the tag was not escaped");
  assert.match(body.html, /&lt;b&gt;not bold&lt;\/b&gt;/);
});

test("a long view becomes a short mail that says so", () => {
  const rows = Array.from({ length: 80 }, (_, i) => ({ title: `Piece ${i}`, who: "x" }));
  const body = mailFor(page(rows), "https://hub.example", new Date());
  assert.match(body.text, new RegExp(`${80 - MAIL_ROWS} more in the view`));
  assert.ok(!body.html.includes("Piece 40"), "row 40 should not be in the mail");
  assert.ok(body.html.includes("Piece 0"), "row 0 should be");
});

test("an empty view says nothing rather than showing an empty table", () => {
  const body = mailFor(page([]), "https://hub.example", new Date());
  assert.match(body.subject, /nothing today/);
  assert.ok(!body.html.includes("<table"), "no table for no rows");
});

test("a source that stopped answering is reported, not swallowed", () => {
  // Somebody who asked for this every morning should hear that the sheet
  // behind it broke, on the morning it broke.
  const body = mailFor(
    page([], { error: "The sheet could not be read: 403", total: 0 }),
    "https://hub.example",
    new Date(),
  );
  assert.match(body.subject, /could not be read/);
  assert.match(body.text, /403/);
});
