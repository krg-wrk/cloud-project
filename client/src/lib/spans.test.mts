import assert from "node:assert/strict";
import test from "node:test";
import { coversDay } from "./spans.ts";

/**
 * Which days a span runs on.
 *
 * The thing that must never happen is the one that did: every workshop on
 * every day. Drawing a workshop across the days it runs replaced the question
 * "is it on this day" rather than refining it, so a March R&D day sat in the
 * first of September along with five others, and the day reported seven
 * things on when one of them was true.
 */

test("a thing runs on the day it starts", () => {
  assert.equal(coversDay({ from: "2026-09-01", to: "2026-09-01" }, "2026-09-01"), true);
});

test("a one-day thing runs on no other day, however near", () => {
  const day = { from: "2026-09-01", to: "2026-09-01" };
  assert.equal(coversDay(day, "2026-08-31"), false);
  assert.equal(coversDay(day, "2026-09-02"), false);
  assert.equal(coversDay(day, "2026-03-24"), false, "the March one is not in September");
});

test("a thing running several days runs on each of them, and on neither end's neighbour", () => {
  const macro = { from: "2026-07-22", to: "2026-07-23" };
  assert.equal(coversDay(macro, "2026-07-21"), false);
  assert.equal(coversDay(macro, "2026-07-22"), true);
  assert.equal(coversDay(macro, "2026-07-23"), true);
  assert.equal(coversDay(macro, "2026-07-24"), false);
});

test("an end date nobody filled in means the day it starts, not every day since", () => {
  const open = { from: "2026-09-01", to: "" };
  assert.equal(coversDay(open, "2026-09-01"), true);
  assert.equal(coversDay(open, "2026-09-02"), false);
  assert.equal(coversDay(open, "2026-08-31"), false);
});

test("a thing with no start runs on no day, because absent is not always", () => {
  assert.equal(coversDay({ from: "", to: "" }, "2026-09-01"), false);
  assert.equal(coversDay({ from: "", to: "2026-09-01" }, "2026-09-01"), false);
});
