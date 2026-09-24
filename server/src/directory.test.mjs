import assert from "node:assert/strict";
import test from "node:test";
import {
  countsOf,
  facetValues,
  groupBy,
  matches,
  multi,
  passesFilters,
  readFilters,
  readDirectory,
} from "./directory.js";

/**
 * Reading the Content Directory.
 *
 * The tests are about the sheet's awkwardnesses — cells holding several
 * values, spacer rows, blank columns, two people with one name — and about
 * the one rule that is not a display choice: why somebody is away never
 * leaves the server.
 */

const rows = [
  {
    Status: "Full-Time",
    Name: "Maren Ashdown",
    Email: "Maren.Ashdown@WGSN.com",
    Role: "Senior",
    Team: "Fashion Design",
    "Secondary Team Tags": "Womenswear\nApparel",
    "Knowledge Network": "Signals\nMacro",
    "Feed Lead": "True",
    "Regional Lens": "EMEA",
    "DEI Board": "",
    CM: "Graham Krag",
    "Senior + above": "Maren Ashdown",
  },
  { Status: "Maternity Leave", Name: "Iolo Vance", Team: "Interiors", "Regional Lens": "EMEA" },
  { Status: "Medical Leave", Name: "Runa Okonjo", Team: "Beauty", "Regional Lens": "NAM" },
  { Status: "Inactive", Name: "Tadeo Lindqvist", Team: "Insight" },
  // A spacer row, which the sheet has a few of.
  { Status: "", Name: "", Team: "" },
  { Status: "Full-Time", Name: "Maren Ashdown", Team: "Insight", "Regional Lens": "APAC" },
];

const people = readDirectory(rows);

test("a spacer row is not a person", () => {
  assert.equal(people.length, 5);
});

test("cells holding several values become several values", () => {
  const maren = people.find((p) => p.id === "maren-ashdown");
  assert.deepEqual(maren.tags, ["Womenswear", "Apparel"]);
  assert.deepEqual(maren.knowledge, ["Signals", "Macro"]);
});

test("semicolons split too, commas do not", () => {
  assert.deepEqual(multi("Macro; Signals"), ["Macro", "Signals"]);
  assert.deepEqual(multi("Decor / DIY & Hardware, to include lighting"), [
    "Decor / DIY & Hardware, to include lighting",
  ]);
  assert.deepEqual(multi(""), []);
  assert.deepEqual(multi(null), []);
});

test("two people with one name both keep an address", () => {
  const ids = people.filter((p) => p.name === "Maren Ashdown").map((p) => p.id);
  assert.deepEqual(ids.sort(), ["maren-ashdown", "maren-ashdown-2"]);
});

test("why somebody is away does not leave the server", () => {
  const away = people.filter((p) => p.availability === "away");
  assert.deepEqual(
    away.map((p) => p.name).sort(),
    ["Iolo Vance", "Runa Okonjo"],
    "both kinds of leave read as away",
  );
  const said = JSON.stringify(people).toLowerCase();
  assert.ok(!said.includes("maternity"), "the reason is not in what is served");
  assert.ok(!said.includes("medical"), "the reason is not in what is served");
});

test("somebody who has left is marked gone rather than dropped here", () => {
  const tadeo = people.find((p) => p.name === "Tadeo Lindqvist");
  assert.equal(tadeo.availability, "gone");
});

test("an address is lower-cased, because people type them how they like", () => {
  assert.equal(people.find((p) => p.id === "maren-ashdown").email, "maren.ashdown@wgsn.com");
});

test("a tick box is ticked however it was typed", () => {
  assert.equal(people.find((p) => p.id === "maren-ashdown").feedLead, true);
  assert.equal(people.find((p) => p.name === "Iolo Vance").feedLead, false);
});

test("somebody with three tags is under all three", () => {
  const groups = groupBy(people, "tag");
  const names = groups.map((g) => g.name);
  assert.ok(names.includes("Womenswear"));
  assert.ok(names.includes("Apparel"));
});

test("a gap in the sheet is visible rather than swallowed", () => {
  const groups = groupBy(people, "knowledge");
  const last = groups[groups.length - 1];
  assert.equal(last.name, "Not recorded");
  assert.ok(last.people.length >= 3);
});

test("the biggest group is first, because that is usually the question", () => {
  const groups = groupBy(people, "lens");
  assert.equal(groups[0].name, "EMEA");
});

/**
 * Where somebody is, and what they know about, are two questions.
 *
 * They were one facet called "Region" showing the Regional Lens column, so a
 * forecaster in London holding the APAC lens read as a forecaster in
 * Singapore. Asked apart, both answer something.
 */
test("the regional lens and where somebody is based are separate facets", () => {
  const byLens = groupBy(people, "lens").map((g) => g.name);
  const byCountry = groupBy(people, "country").map((g) => g.name);
  assert.ok(byLens.length > 0, "a lens groups people");
  assert.ok(byCountry.length > 0, "and so does where they are");
  assert.notDeepEqual(byLens, byCountry, "and they are not the same question");
});

test("search reaches every column a person is described by", () => {
  const maren = people.find((p) => p.id === "maren-ashdown");
  for (const q of ["maren", "womenswear", "signals", "fashion design", "emea", "krag"]) {
    assert.ok(matches(maren, q), `"${q}" finds her`);
  }
  assert.ok(!matches(maren, "knitwear"));
});

test("two words are two conditions", () => {
  const maren = people.find((p) => p.id === "maren-ashdown");
  assert.ok(matches(maren, "emea womenswear"));
  assert.ok(!matches(maren, "apac womenswear"));
});

test("the counts count what the page says they count", () => {
  const counts = countsOf(people);
  assert.equal(counts.people, 5);
  assert.equal(counts.feedLeads, 1);
  assert.equal(counts.away, 2);
  assert.equal(counts.teams, 4);
});

/**
 * Narrowing by facet: the dropdowns.
 *
 * The rule that matters is the AND across facets and the OR inside one —
 * "Fashion Design and Signals" is narrower, but somebody tagged Womenswear
 * *and* Apparel matches either.
 */

test("a dropdown offers the values that feature, commonest first", () => {
  const values = facetValues(people, "lens");
  assert.deepEqual(
    values.map((v) => v.value),
    ["EMEA", "APAC", "NAM"],
  );
  assert.equal(values[0].count, 2);
});

test("a facet nobody has recorded offers nothing rather than an empty option", () => {
  // Only Maren has a knowledge network; "Not recorded" is a group, not a value.
  const values = facetValues(people, "knowledge");
  assert.deepEqual(
    values.map((v) => v.value).sort(),
    ["Macro", "Signals"],
  );
});

test("two facets narrow together", () => {
  const maren = people.find((p) => p.id === "maren-ashdown");
  assert.ok(passesFilters(maren, { team: "Fashion Design", knowledge: "Signals" }));
  // She is in Fashion Design, but Beauty is somebody else's team.
  assert.ok(!passesFilters(maren, { team: "Beauty", knowledge: "Signals" }));
});

test("several values in one cell all match their own facet", () => {
  const maren = people.find((p) => p.id === "maren-ashdown");
  assert.ok(passesFilters(maren, { tag: "Womenswear" }));
  assert.ok(passesFilters(maren, { tag: "Apparel" }));
  assert.ok(!passesFilters(maren, { tag: "Knitwear" }));
});

test("no filter at all keeps everybody", () => {
  assert.equal(people.filter((p) => passesFilters(p, {})).length, people.length);
});

test("the query string only yields filters the directory actually has", () => {
  const filters = readFilters({
    f_team: "Beauty",
    f_knowledge: "  ",
    f_haircut: "Beauty",
    by: "team",
  });
  assert.deepEqual(filters, { team: "Beauty" });
});
