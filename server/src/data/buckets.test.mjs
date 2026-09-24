import assert from "node:assert/strict";
import test from "node:test";
import { EVENT_TYPES, SESSION_KINDS, normaliseEventType, normaliseSessionKind } from "./smartsheetSource.js";

/**
 * The team's dropdowns, as the Hub's own buckets.
 *
 * The thing that must never happen is the one that was happening: a value
 * nobody had bucketed quietly joining the largest group. Eleven activity
 * types read as "leave", so the calendar told people their colleagues were
 * off when they were at a shoot, on a client call or writing a data brief.
 * Anything unrecognised is now visibly unbucketed instead.
 *
 *   node --test server/dist/data/buckets.test.mjs
 */

test("every value the team listed lands in the bucket they put it in", () => {
  const expected = {
    "Annual Leave": "leave",
    "Sick Leave": "leave",
    "Lieu Day": "leave",
    Travel: "travel",
    Video: "marketing",
    Podcast: "marketing",
    Marketing: "marketing",
    Webinar: "marketing",
    Presentation: "marketing",
    Analyst: "client-call",
    "Freelance Brief": "reminder",
    "Data Brief": "reminder",
    "Retail Shoot": "reminder",
    "Public Holiday": "public-holiday",
    "Trade Show": "conference",
  };
  for (const [value, bucket] of Object.entries(expected)) {
    assert.equal(normaliseEventType(value), bucket, `${value} should be ${bucket}`);
  }
});

test("a dropdown value nobody has bucketed is visibly other, not quietly leave", () => {
  assert.equal(normaliseEventType("Offsite activity"), "other");
  assert.equal(normaliseEventType("Team Meeting at other location"), "other");
  assert.equal(normaliseEventType("Something invented next week"), "other");
  assert.equal(normaliseEventType(""), "other");
  assert.equal(normaliseEventType(undefined), "other");
});

test("the match is whole and case-insensitive, not a substring", () => {
  assert.equal(normaliseEventType("annual leave"), "leave");
  assert.equal(normaliseEventType("  Annual Leave  "), "leave");
  /*
   * The chain this replaced tested `v.includes("show")`, so anything with
   * "show" in it became a trade show — "Retail Shoot" only escaped by luck
   * of spelling.
   */
  assert.equal(normaliseEventType("Showcase prep"), "other");
});

test("the workshop sheet's five kinds are read, and a sixth is other", () => {
  assert.equal(normaliseSessionKind("Workshop"), "workshop");
  assert.equal(normaliseSessionKind("Scoring Session"), "scoring-session");
  assert.equal(normaliseSessionKind("Trend Governance"), "trend-governance");
  assert.equal(normaliseSessionKind("Forecast Forums"), "forecast-forums");
  assert.equal(normaliseSessionKind("Research"), "research");
  assert.equal(normaliseSessionKind("R&D Day"), "other", "a kind the team has not listed");
  assert.equal(normaliseSessionKind(undefined), "other");
});

test("no bucket table maps a value to something outside the Hub's own list", () => {
  const events = new Set(["leave", "public-holiday", "conference", "travel", "marketing", "client-call", "reminder", "other"]);
  const kinds = new Set(["workshop", "scoring-session", "trend-governance", "forecast-forums", "research", "other"]);
  for (const [value, bucket] of Object.entries(EVENT_TYPES)) {
    assert.ok(events.has(bucket), `${value} maps to ${bucket}, which is not an event type`);
    assert.equal(value, value.toLowerCase(), `${value} would never match — the lookup lowercases`);
  }
  for (const [value, bucket] of Object.entries(SESSION_KINDS)) {
    assert.ok(kinds.has(bucket), `${value} maps to ${bucket}, which is not a session kind`);
    assert.equal(value, value.toLowerCase(), `${value} would never match — the lookup lowercases`);
  }
});
