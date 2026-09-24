import assert from "node:assert/strict";
import test from "node:test";
import { dayRange, daysBetween, relativeDays } from "./date.ts";

/**
 * Dates as a real sheet supplies them, which includes not supplying them.
 *
 * A hundred rows of the commissioning schedule have no submission date, and
 * the page told somebody each one was "NaN days ago" — arithmetic on a blank
 * cell, carried the whole way to the screen. What must never happen is the
 * Hub stating something about a date nobody has set.
 */

test("a day that is not there says nothing, rather than saying NaN", () => {
  assert.equal(relativeDays("", "2026-09-23"), "");
  assert.equal(relativeDays("   ", "2026-09-23"), "");
  assert.equal(relativeDays("not a date", "2026-09-23"), "");
  assert.equal(relativeDays("19 Sept", "2026-09-23"), "");
});

test("the ordinary readings are unchanged, because only the blank case moved", () => {
  assert.equal(relativeDays("2026-09-23", "2026-09-23"), "today");
  assert.equal(relativeDays("2026-09-24", "2026-09-23"), "tomorrow");
  assert.equal(relativeDays("2026-09-22", "2026-09-23"), "yesterday");
  assert.equal(relativeDays("2026-09-27", "2026-09-23"), "in 4 days");
  assert.equal(relativeDays("2026-09-19", "2026-09-23"), "4 days ago");
});

test("the gap between two days is counted in whole days, across a month end", () => {
  assert.equal(daysBetween("2026-09-30", "2026-10-01"), 1);
  assert.equal(daysBetween("2026-09-23", "2026-09-23"), 0);
  assert.equal(daysBetween("2026-10-01", "2026-09-30"), -1);
});

test("a session that runs one day reads as one day", () => {
  assert.equal(dayRange("2026-09-17"), "Thu 17 Sept");
  assert.equal(dayRange("2026-09-17", "2026-09-17"), "Thu 17 Sept");
});

test("a range inside a month names the month once, because 17 Sept – 19 Sept says it twice", () => {
  assert.equal(dayRange("2026-09-17", "2026-09-19"), "17–19 Sept");
});

test("a range across a month writes both, since 29–2 Oct would be a riddle", () => {
  assert.equal(dayRange("2026-09-29", "2026-10-02"), "29 Sept – 2 Oct");
});

test("no start is no range, rather than a half-written one", () => {
  assert.equal(dayRange("", "2026-09-19"), "");
});
