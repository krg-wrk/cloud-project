import assert from "node:assert/strict";
import test from "node:test";
import { BULK_CAP, readIds } from "./api.js";

/**
 * What a bulk change is allowed to name.
 *
 * This is the gate in front of the only path in the Hub that edits somebody
 * else's system, and the only one that can do it to many rows at once — so
 * the tests are about the shapes that should never get past it, rather than
 * about the happy list.
 */

test("an ordinary selection comes back as it went in", () => {
  assert.deepEqual(readIds(["c1", "c2", "c3"]), ["c1", "c2", "c3"]);
});

test("nothing selected is refused rather than treated as everything", () => {
  // The dangerous reading of an empty list is "all of them", so it has to be
  // an error and not a default.
  assert.equal(typeof readIds([]), "string");
  assert.equal(typeof readIds(undefined), "string");
  assert.equal(typeof readIds(null), "string");
  assert.equal(typeof readIds("c1"), "string");
  assert.equal(typeof readIds({ ids: ["c1"] }), "string");
});

test("junk in the list is dropped, not passed through", () => {
  assert.deepEqual(readIds(["c1", "", "   ", 7, null, undefined, {}, ["c2"]]), ["c1"]);
});

test("a list of nothing but junk is nothing selected", () => {
  assert.equal(typeof readIds([null, 7, ""]), "string");
});

test("the same piece named twice is written once", () => {
  assert.deepEqual(readIds(["c1", "c1", "c2", "c1"]), ["c1", "c2"]);
});

test("duplicates are folded before the cap is counted", () => {
  // Otherwise a client that sent the same id a hundred times would be told it
  // had selected too much, when it had selected one thing.
  const many = Array.from({ length: BULK_CAP * 3 }, () => "c1");
  assert.deepEqual(readIds(many), ["c1"]);
});

test("the cap holds, and says the real number", () => {
  const under = Array.from({ length: BULK_CAP }, (_, i) => `c${i}`);
  assert.equal(readIds(under).length, BULK_CAP);

  const over = Array.from({ length: BULK_CAP + 1 }, (_, i) => `c${i}`);
  const refusal = readIds(over);
  assert.equal(typeof refusal, "string");
  assert.match(refusal, new RegExp(`${BULK_CAP + 1}`));
  assert.match(refusal, new RegExp(`${BULK_CAP}`));
});
