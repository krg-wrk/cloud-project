import assert from "node:assert/strict";
import test from "node:test";
import { inRegion, regionFor } from "./smartsheetSource.js";

/**
 * Who a regional event reaches.
 *
 * Two failures to prevent, and they pull in opposite directions: a bank
 * holiday shown to a team on the other side of the world, and an event meant
 * for everybody quietly shown to nobody because the tag was typed in capitals.
 */

test("a country becomes the region the team files it under", () => {
  assert.equal(regionFor("UK"), "EMEA");
  assert.equal(regionFor("South Africa"), "EMEA");
  assert.equal(regionFor("Hong Kong"), "APAC");
  assert.equal(regionFor("Korea"), "APAC");
  assert.equal(regionFor("USA"), "NAM");
  assert.equal(regionFor("Brazil"), "LATAM");
});

test("case and stray spaces are not a different country", () => {
  assert.equal(regionFor("  united kingdom "), "EMEA");
  assert.equal(regionFor("SINGAPORE"), "APAC");
});

test("a region written where a country was expected is left as it is", () => {
  assert.equal(regionFor("EMEA"), "EMEA");
  assert.equal(regionFor("apac"), "APAC");
});

test("a country nobody listed is undefined rather than guessed", () => {
  assert.equal(regionFor("Narnia"), undefined);
  // The Country column of one real sheet has dates typed into it.
  assert.equal(regionFor("19 Sept"), undefined);
  assert.equal(regionFor(""), undefined);
  assert.equal(regionFor(undefined), undefined);
});

test("an event with no region reaches everybody, because a holiday with a blank cell still happened", () => {
  assert.equal(inRegion(undefined, "EMEA"), true);
  assert.equal(inRegion("", "APAC"), true);
  assert.equal(inRegion("   ", "APAC"), true);
});

test("all means all, however the team types it", () => {
  assert.equal(inRegion("All", "EMEA"), true);
  assert.equal(inRegion("ALL", "EMEA"), true);
  assert.equal(inRegion("all", "APAC"), true);
  assert.equal(inRegion(" All ", "NAM"), true);
});

test("a region reaches its own region and no other", () => {
  assert.equal(inRegion("EMEA", "EMEA"), true);
  assert.equal(inRegion("emea", "EMEA"), true);
  assert.equal(inRegion("EMEA", "APAC"), false);
});

test("somebody with no region of their own is not swept into every region", () => {
  assert.equal(inRegion("EMEA", undefined), false);
  assert.equal(inRegion("EMEA", ""), false);
});
