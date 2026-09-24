import assert from "node:assert/strict";
import test from "node:test";
import { isDateColumn, isoDate } from "./smartsheetSource.js";

/**
 * Dates off a real sheet.
 *
 * The thing that must never happen is a deadline that is confidently wrong.
 * A UK sheet renders the sixth of January as "06/01/26" and an American
 * parser reads it as the first of June, so every one of these is about
 * refusing to guess — and about a correct date surviving the journey
 * unchanged, which the obvious round trip through Date does not manage.
 */

test("an ISO date comes back exactly as it went in, on any machine's clock", () => {
  assert.equal(isoDate("2026-09-21"), "2026-09-21");
  assert.equal(isoDate("2026-01-06"), "2026-01-06");
  // The old version returned the twentieth here, east of Greenwich.
  assert.equal(isoDate("2026-12-25"), "2026-12-25");
});

test("the day is taken off a datetime rather than the instant being converted", () => {
  assert.equal(isoDate("2026-09-21T09:30:00Z"), "2026-09-21");
  assert.equal(isoDate("2026-09-21T23:30:00+05:00"), "2026-09-21");
  assert.equal(isoDate("2026-09-21 09:30"), "2026-09-21");
});

test("a date written in digits and slashes is refused, because nothing says which half is the month", () => {
  assert.equal(isoDate("06/01/26"), "");
  assert.equal(isoDate("26/04/18"), "");
  assert.equal(isoDate("09/05/2026"), "");
  assert.equal(isoDate("6.1.26"), "");
});

test("a month written in letters is not ambiguous, so it is read", () => {
  assert.equal(isoDate("21 Sep 2026"), "2026-09-21");
  assert.equal(isoDate("Sep 21, 2026"), "2026-09-21");
});

test("nothing in is nothing out, rather than today", () => {
  assert.equal(isoDate(undefined), "");
  assert.equal(isoDate(""), "");
  assert.equal(isoDate("   "), "");
  assert.equal(isoDate("not a date"), "");
});

test("only a date column is read from its value, because elsewhere the display is the readable one", () => {
  assert.equal(isDateColumn("DATE"), true);
  assert.equal(isDateColumn("DATETIME"), true);
  assert.equal(isDateColumn("ABSTRACT_DATETIME"), true);
  assert.equal(isDateColumn("TEXT_NUMBER"), false);
  assert.equal(isDateColumn("CONTACT_LIST"), false);
  assert.equal(isDateColumn("PICKLIST"), false);
  assert.equal(isDateColumn(undefined), false);
});
