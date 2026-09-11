import assert from "node:assert/strict";
import test from "node:test";
import { termsOf, weave } from "./weave.js";

/**
 * The red-threading step, which is retrieval and arithmetic over our own
 * data. Every assertion here is about *not* drowning the forecaster: the
 * failures this catches are all the same failure — returning the whole
 * department instead of the handful of rows that are actually about this.
 */

const trend = (title, over = {}) => ({
  id: title.toLowerCase().replace(/\W+/g, "-"),
  profileId: `p-${title.length}`,
  title,
  slug: "",
  ownerId: "",
  ownerName: "Someone",
  authorIds: [],
  authorNames: [],
  published: "Published",
  types: [],
  publishedOn: "",
  activeFrom: "",
  activeTo: "",
  editorUrl: "",
  publishedUrl: "",
  description: "",
  needToKnow: "",
  opportunity: "",
  strategies: 0,
  proofPoints: 0,
  industries: ["Beauty"],
  needingScore: [],
  scored: [],
  missingScore: [],
  hashtags: [],
  labels: {},
  ...over,
});

const item = (title, over = {}) => ({
  id: title.toLowerCase().replace(/\W+/g, "-"),
  title,
  type: "Big Ideas",
  vertical: "Beauty",
  season: "S/S 28",
  forecasterId: "ao",
  managerId: "gk",
  submissionDate: "2026-01-01",
  publicationDate: "2026-02-01",
  status: "published",
  ...over,
});

/** A stand-in library: the real one is 10,000 rows behind a gzip. */
const libraryOf = (points) => ({
  textSearch(terms, take) {
    return points
      .filter((p) => terms.every((t) => p.text.toLowerCase().includes(t)))
      .slice(0, take);
  },
});

const EMPTY = libraryOf([]);

test("a single common word does not match the whole database", () => {
  /*
   * The bug this pins. "collagen barrier skincare" once matched 183 trend
   * profiles, because "beauty" appears in most of them — a list of the
   * department rather than an answer.
   */
  const trends = [
    trend("Barrier-first Beauty", { description: "collagen skincare barrier" }),
    ...Array.from({ length: 40 }, (_, i) => trend(`Beauty Thing ${i}`)),
  ];
  const out = weave(
    { terms: ["collagen", "barrier", "skincare", "beauty"] },
    { trends, content: [], library: EMPTY },
  );
  assert.equal(out.threshold, 2, "half the terms, so one common word is not enough");
  assert.deepEqual(
    out.trends.map((t) => t.title),
    ["Barrier-first Beauty"],
  );
  assert.equal(out.counts.trends, 1);
});

test("a title match outranks the same words buried in the body", () => {
  const trends = [
    trend("Something Else", { description: "collagen collagen collagen skincare" }),
    trend("Collagen Skincare"),
  ];
  const out = weave({ terms: ["collagen", "skincare"] }, { trends, content: [], library: EMPTY });
  assert.equal(out.trends[0].title, "Collagen Skincare", "the profile that is *about* it comes first");
});

test("disagreeing calls on shared ground are raised, agreeing ones are not", () => {
  const trends = [
    trend("Collagen A", { call: "Invest" }),
    trend("Collagen B", { call: "Protect" }),
    trend("Collagen C", { call: "Invest" }),
  ];
  const out = weave({ terms: ["collagen"] }, { trends, content: [], library: EMPTY });
  assert.equal(out.tensions.length, 2, "A-vs-B and B-vs-C; A and C agree so are not a tension");
  for (const t of out.tensions) {
    assert.notEqual(t.a.call, t.b.call);
    assert.match(t.note, /Beauty/);
  }
});

test("calls one step apart are a nuance rather than a disagreement", () => {
  const trends = [trend("Collagen A", { call: "Test" }), trend("Collagen B", { call: "Expand" })];
  const out = weave({ terms: ["collagen"] }, { trends, content: [], library: EMPTY });
  assert.deepEqual(out.tensions, [], "adjacent calls are not worth interrupting somebody for");
});

test("trends in unrelated industries are not a tension", () => {
  const trends = [
    trend("Collagen A", { call: "Invest", industries: ["Beauty"] }),
    trend("Collagen B", { call: "Protect", industries: ["Interiors"] }),
  ];
  const out = weave({ terms: ["collagen"] }, { trends, content: [], library: EMPTY });
  assert.deepEqual(out.tensions, [], "different calls in different categories is just two trends");
});

test("an unpublished profile is not held against a live one", () => {
  const trends = [
    trend("Collagen A", { call: "Invest" }),
    trend("Collagen B", { call: "Protect", published: "Unpublished" }),
  ];
  const out = weave({ terms: ["collagen"] }, { trends, content: [], library: EMPTY });
  assert.deepEqual(out.tensions, [], "a draft nobody can read cannot contradict anything");
});

test("proof points loosen to the terms that are actually distinctive", () => {
  /*
   * The second bug this pins. Falling back to the *longest* word sent a
   * canvas about collagen to six proof points about snacks, because
   * "ingredient" is longer than "collagen" and very nearly meaningless.
   */
  const library = libraryOf([
    { id: "p1", text: "Collagen supplements grew 12%", trendTitle: "Collagen Stacking", match: 90 },
    { id: "p2", text: "An ingredient nobody asked about", trendTitle: "Textured Eats", match: 95 },
  ]);
  const trends = [trend("Collagen Stacking", { description: "collagen ingredient" })];
  const out = weave(
    { terms: ["collagen", "ingredient"] },
    { trends, content: [], library },
  );
  assert.equal(out.proofPoints[0].id, "p1", "the one on a trend the canvas matched comes first");
  assert.equal(out.proofPoints.length, 2, "the other is still offered, just below it");
});

test("nothing in, nothing out", () => {
  const out = weave({ terms: [] }, { trends: [trend("Anything")], content: [], library: EMPTY });
  assert.deepEqual(out.trends, []);
  assert.deepEqual(out.proofPoints, []);
  assert.deepEqual(out.forecasts, []);
  assert.equal(out.counts.trends, 0);
});

test("forecasts that already covered the ground come back, best first", () => {
  const content = [
    item("Trainers as Formalwear", { vertical: "Footwear" }),
    // Same vertical, so it matches on "beauty" alone — weakly relevant, and
    // it should be behind the one that is actually about the subject.
    item("Colour Forecast"),
    item("Beauty Big Idea: The Barrier Obsession"),
  ];
  const out = weave({ terms: ["barrier", "beauty"] }, { trends: [], content, library: EMPTY });
  assert.equal(out.forecasts[0].title, "Beauty Big Idea: The Barrier Obsession");
  assert.equal(out.forecasts[0].format, "Big Ideas", "the sheet calls it type; the page says format");
  assert.ok(
    !out.forecasts.some((f) => f.title === "Trainers as Formalwear"),
    "nothing in common at all stays out",
  );
});

test("terms are lower-cased, de-duplicated and stripped of filler", () => {
  const got = termsOf("The collagen AND the Collagen barrier, with that ingredient!");
  assert.ok(got.includes("collagen"));
  assert.ok(got.includes("barrier"));
  assert.equal(got.filter((t) => t === "collagen").length, 1, "de-duplicated");
  for (const stop of ["the", "and", "with", "that"]) {
    assert.ok(!got.includes(stop), `"${stop}" narrows nothing and is dropped`);
  }
  assert.ok(!got.some((t) => t.length < 2), "single letters narrow nothing either");
});
