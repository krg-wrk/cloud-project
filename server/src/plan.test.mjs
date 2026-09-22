import assert from "node:assert/strict";
import test from "node:test";
import {
  FORECAST_GROUPS,
  alignment,
  coverage,
  expectedYears,
  groupFor,
  horizonFor,
  leadFor,
  readHorizon,
} from "./plan.js";

/**
 * Whether the schedule follows the methodology.
 *
 * The things that must never happen here are all of one kind: a confident
 * wrong answer. A forecast counted as on-plan because its empty season column
 * was filled in with a guess, a transitional season bucketed under the year it
 * is not waiting for, a format quietly dropped from the page because nobody
 * mapped it — each of those produces a tidy screen that a commissioning
 * manager would plan a year against, and none of them would be reported.
 */

test("a transitional season is bucketed under the later year, so it never sorts before the macro it needs", () => {
  // A/W 28/29 is written once the 2029 macro forecasts exist. Reading it as
  // 2028 — which the bulk of its window is — puts it before its own input.
  assert.equal(readHorizon("A/W 28/29").year, 2029);
  assert.equal(readHorizon("A/W 29/30").year, 2030);
  assert.equal(readHorizon("S/S 29").year, 2029);
  assert.equal(readHorizon("2031/36").year, 2036);
});

test("the window a season really covers is kept, so 2029 does not hide that A/W 28/29 is mostly 2028", () => {
  const autumnWinter = readHorizon("A/W 28/29");
  assert.equal(autumnWinter.from, "2028-08-01");
  assert.equal(autumnWinter.to, "2029-01-31");

  const springSummer = readHorizon("S/S 29");
  assert.equal(springSummer.from, "2029-02-01");
  assert.equal(springSummer.to, "2029-07-31");
});

test("a season is recognised however the sheet happens to write it", () => {
  for (const written of ["A/W 28/29", "AW 28/29", "a/w 2028/29", "Autumn/Winter 28/29"]) {
    assert.equal(readHorizon(written).year, 2029, written);
  }
  for (const written of ["S/S 29", "SS29", "Spring/Summer 2029"]) {
    assert.equal(readHorizon(written).year, 2029, written);
  }
});

test("a season is labelled back the way the team writes it, whatever went in", () => {
  assert.equal(readHorizon("AW 2028/29").label, "A/W 28/29");
  assert.equal(readHorizon("Spring/Summer 2029").label, "S/S 29");
  assert.equal(readHorizon("2031/36").label, "2031–2036");
});

test("nothing in the season column is untagged, never a year", () => {
  assert.equal(readHorizon(""), null);
  assert.equal(readHorizon(undefined), null);
  assert.equal(readHorizon("TBC"), null);
  assert.equal(readHorizon("Annual"), null);
  assert.equal(alignment({ type: "Big Ideas", publicationDate: "2026-07-01" }).alignment, "untagged");
});

test("a year read off a title says so, so an inferred year is never shown as a stated one", () => {
  const stated = horizonFor({ forecastHorizon: "2029", title: "Big Ideas 2030" });
  assert.equal(stated.source, "horizon");
  assert.equal(stated.horizon.year, 2029);

  const inferred = horizonFor({ title: "BIG IDEAS 2029" });
  assert.equal(inferred.source, "title");
  assert.equal(inferred.horizon.year, 2029);

  const typed = horizonFor({ title: "Big Ideas" }, { yearFrom: 2029 });
  assert.equal(typed.source, "details");
});

test("a season inside a title is read as a season, and a word containing 'aw' is not", () => {
  assert.equal(horizonFor({ title: "Seasonal Trends A/W 28/29" }).horizon.year, 2029);
  // "Lawn" contains "aw"; without word boundaries this became A/W 20/21.
  assert.equal(horizonFor({ title: "Lawn Care 2029" }).horizon.year, 2029);
});

test("a format still finds its group with a season stuck on the end", () => {
  assert.equal(groupFor("CMF Forecast A/W 28/29").id, "forecasts");
  assert.equal(groupFor("Big Ideas 2029").id, "macro");
  assert.equal(groupFor("Seasonal Event Forecast 2028 (Summer)").id, "event-forecasts");
});

test("the longest grouping name wins, so a specific format is not taken as a general one", () => {
  assert.equal(leadFor("CMF Seasonal Forecast S/S 29").maxYears, 2.5);
  assert.equal(groupFor("Trend Narratives Store Sets").id, "forecast-update");
  assert.equal(groupFor("Trend Narratives").id, "forecast-update");
});

test("a format in no group is undefined rather than the first group that half-matches", () => {
  assert.equal(groupFor("Ask an Expert"), undefined);
  assert.equal(groupFor(""), undefined);
  assert.equal(groupFor(undefined), undefined);
});

test("both kinds of gap between the grouping and the taxonomy are reported", () => {
  const { unknownFormats, ungroupedTypes } = coverage();
  // Named in the grouping sheet, not a format we publish under that name.
  assert.ok(unknownFormats.includes("Advanced CMF"));
  assert.ok(unknownFormats.includes("Seasonal Event Forecast"));
  // Published and in no group. These are the formats being retired, so the
  // list is a retirement register rather than a gap — but it is still
  // reported, because a format quietly dropped from the page is the same
  // screen whether it was retired on purpose or forgotten.
  assert.ok(ungroupedTypes.includes("Design Futures"));
  assert.ok(ungroupedTypes.length > 0);
});

test("Personas is Macro, because it is kept as a version of Future Consumer", () => {
  assert.equal(groupFor("Personas 2029").id, "macro");
  assert.equal(leadFor("Personas").minYears, 2.5);
  assert.equal(
    alignment({ type: "Personas", forecastHorizon: "2029", publicationDate: "2026-07-01" }).alignment,
    "on-plan",
  );
});

test("the event forecast band is not widened to make the current schedule pass", () => {
  // Eighteen months is the aim. Spring 2029 published in March 2027 is two
  // years, and the check is supposed to say so — a band stretched to cover it
  // would report nothing, which is the whole of the value lost.
  assert.equal(leadFor("Seasonal Event Forecast").minYears, 1.5);
  assert.equal(leadFor("Seasonal Event Forecast").maxYears, 1.5);
  assert.equal(
    alignment({
      type: "Seasonal Event Forecast",
      forecastHorizon: "2029",
      publicationDate: "2027-03-01",
    }).alignment,
    "early",
  );
  // The three that do sit at eighteen months still pass, so the band is
  // measuring something rather than refusing everything.
  assert.equal(
    alignment({
      type: "Seasonal Event Forecast",
      forecastHorizon: "2028",
      publicationDate: "2026-09-01",
    }).alignment,
    "on-plan",
  );
});

test("The Vision is Foresight, and its ten-year lead puts the 2036 edition in 2026", () => {
  assert.equal(groupFor("The Vision 2036").id, "foresight");
  assert.equal(leadFor("The Vision").maxYears, 10);
  assert.equal(
    alignment({ type: "The Vision", forecastHorizon: "2036", publicationDate: "2026-08-01" }).alignment,
    "on-plan",
  );
  assert.equal(
    alignment({ type: "The Vision", forecastHorizon: "2037", publicationDate: "2027-08-01" }).alignment,
    "on-plan",
  );
});

test("the expected year is counted in whole months, so a half-year lead lands where the grid says", () => {
  // Big Ideas, published July 2026 at a 2.5 year lead, is a 2029 forecast.
  assert.deepEqual(expectedYears("2026-07-01", { minYears: 2.5, maxYears: 2.5 }), [2029]);
  // The Vision, published August 2026 at ten years, is 2036.
  assert.deepEqual(expectedYears("2026-08-01", { minYears: 10, maxYears: 10 }), [2036]);
  // A band names every year between its ends, not just the two.
  assert.deepEqual(expectedYears("2026-08-01", { minYears: 2, maxYears: 2.5 }), [2028, 2029]);
});

test("a forecast pointed at the year its level works to is on plan", () => {
  assert.equal(
    alignment({ type: "Big Ideas", forecastHorizon: "2029", publicationDate: "2026-07-01" }).alignment,
    "on-plan",
  );
  assert.equal(
    alignment({
      type: "CMF Forecast",
      forecastHorizon: "A/W 28/29",
      publicationDate: "2026-09-01",
    }).alignment,
    "on-plan",
  );
});

test("running ahead of the level and running behind it are told apart", () => {
  const ahead = alignment({
    type: "Big Ideas",
    forecastHorizon: "2031",
    publicationDate: "2026-07-01",
  });
  assert.equal(ahead.alignment, "early");
  assert.deepEqual(ahead.expected, [2029]);

  const behind = alignment({
    type: "Big Ideas",
    forecastHorizon: "2027",
    publicationDate: "2026-07-01",
  });
  assert.equal(behind.alignment, "late");
});

test("a group with no agreed lead cannot be off plan, and says so rather than passing", () => {
  const result = alignment({
    type: "Buyers' Briefing",
    forecastHorizon: "2029",
    publicationDate: "2026-07-01",
  });
  assert.equal(result.alignment, "no-lead");
  assert.equal(result.horizon.year, 2029);
});

test("every group id is unique, because a saved plan and a URL both key on it", () => {
  const ids = FORECAST_GROUPS.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length);
});
