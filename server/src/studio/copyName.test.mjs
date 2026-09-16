import assert from "node:assert/strict";
import test from "node:test";
import { copyName } from "./api.js";

/**
 * Naming a duplicate.
 *
 * The rule worth pinning down is the counting: pressing Duplicate three times
 * should give three views, not one view and two errors about the address
 * already being taken.
 */

/** A world where these slugs are already spoken for. */
const taken = (...slugs) => {
  const set = new Set(slugs);
  return async (slug) => !set.has(slug);
};

test("the first copy is just a copy", async () => {
  assert.deepEqual(await copyName("Womenswear deadlines", taken()), {
    label: "Womenswear deadlines copy",
    slug: "womenswear-deadlines-copy",
  });
});

test("the second counts, rather than failing", async () => {
  const out = await copyName("Womenswear deadlines", taken("womenswear-deadlines-copy"));
  assert.equal(out.label, "Womenswear deadlines copy 2");
  assert.equal(out.slug, "womenswear-deadlines-copy-2");
});

test("it keeps counting past a run of copies", async () => {
  const out = await copyName(
    "Deadlines",
    taken("deadlines-copy", "deadlines-copy-2", "deadlines-copy-3"),
  );
  assert.equal(out.label, "Deadlines copy 4");
});

test("the label and the address always agree", async () => {
  const out = await copyName("Trends — S/S 28!", taken());
  assert.equal(out.slug, "trends-s-s-28-copy");
  assert.ok(out.label.endsWith(" copy"));
});

test("a reserved address is skipped like any other taken one", async () => {
  // The route passes a check that folds in the reserved list, so a copy
  // landing on /v/new counts past it rather than being refused.
  const out = await copyName("New", taken("new-copy"));
  assert.equal(out.slug, "new-copy-2");
});

test("it gives up rather than looping forever", async () => {
  assert.equal(await copyName("Deadlines", async () => false), null);
});
