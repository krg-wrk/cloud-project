/**
 * The proof point library: filtering, faceting and paging.
 *
 * Most of it runs against a small fixture, so a failure points at one
 * behaviour. The last test runs against the real seed — all 10,235 of them —
 * because "it pages" and "it pages ten thousand" are different claims and the
 * team's library is the second one.
 *
 *   node --test server/dist/proofPoints/library.test.mjs
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { ProofPointLibrary } from "./library.js";

const AMARA = {
  email: "amara.chen@wgsn.com",
  name: "Amara Chen",
  personId: "amara-chen",
  role: "forecaster",
  verticals: "all",
  active: true,
};
const OTHER = { ...AMARA, email: "someone.else@wgsn.com", name: "Someone Else" };

/** A library from a fixture, written to a temporary gzipped file. */
function fixture(seed) {
  const dir = mkdtempSync(path.join(tmpdir(), "pp-"));
  const file = path.join(dir, "seed.json.gz");
  writeFileSync(file, gzipSync(Buffer.from(JSON.stringify(seed), "utf8")));
  return new ProofPointLibrary(file);
}

const trend = (id, title, owner, industries) => ({
  id,
  title,
  description: `${title} description`,
  industries,
  total: 0,
  tierA: 0,
  ownerName: owner === AMARA.email ? "Amara Chen" : "Someone Else",
  ownerEmail: owner,
});

const point = (id, over) => ({
  id,
  trendId: "1",
  calloutId: `c-${id}`,
  tier: "A",
  match: 90,
  agreed: true,
  forecastTag: "Forecast 2028",
  alreadyKnown: false,
  wgsnData: false,
  html: '<div class="pp">x</div>',
  text: "some text",
  ...over,
});

const SEED = {
  source: "fixture",
  trends: [
    trend("1", "AI Companions", AMARA.email, ["Consumer Tech"]),
    trend("2", "The Graphic Scarf", OTHER.email, ["Fashion Buying", "Fashion Design"]),
  ],
  points: [
    point("a", { tier: "A", match: 95, wgsnData: true, decision: "approve" }),
    point("b", { tier: "B", match: 78 }),
    point("c", { tier: "C", match: 62, forecastTag: "KPI not met" }),
    point("d", { tier: "D", match: 92, agreed: false }),
    point("e", { trendId: "2", tier: "A", match: 88, text: "scarves grew on the feed" }),
    point("f", { trendId: "2", tier: "B", match: 71, alreadyKnown: true }),
  ],
};

const ids = (page) => page.rows.map((r) => r.id);

test("the markup is sanitised on the way in, not on the way out", () => {
  const lib = fixture({
    ...SEED,
    points: [point("x", { html: '<div class="pp">ok</div><script>alert(1)</script>' })],
  });
  const row = lib.find("x", AMARA);
  assert.ok(!row.html.includes("<script"), "no path to the client skips the gate");
  assert.ok(row.html.includes('<div class="pp">ok</div>'), "and the proof point still renders");
});

test("match quality is a band of tiers, and top is the default", () => {
  const lib = fixture(SEED);
  // Tier D is one model alone but scoring 90+, so it belongs with the top.
  assert.deepEqual(ids(lib.query({}, AMARA)).sort(), ["a", "d", "e"]);
  assert.deepEqual(ids(lib.query({ quality: "mid" }, AMARA)).sort(), ["a", "b", "d", "e", "f"]);
  assert.equal(lib.query({ quality: "all" }, AMARA).total, 6);
  // An unknown quality falls back to the default rather than showing nothing.
  assert.equal(lib.query({ quality: "nonsense" }, AMARA).total, 3);
});

test("best match comes first", () => {
  const lib = fixture(SEED);
  assert.deepEqual(ids(lib.query({ quality: "all" }, AMARA)), ["a", "d", "e", "b", "f", "c"]);
});

test("mine falls back to the sheet's owner when the Hub does not know the trend", () => {
  const lib = fixture(SEED);
  assert.deepEqual(ids(lib.query({ quality: "all", owner: "mine" }, AMARA)).sort(), [
    "a",
    "b",
    "c",
    "d",
  ]);
  assert.deepEqual(ids(lib.query({ quality: "all", owner: "mine" }, OTHER)).sort(), ["e", "f"]);
  // The name is the fallback for a row whose owner address was never filled in.
  const byName = fixture({
    ...SEED,
    trends: [{ ...SEED.trends[0], ownerEmail: "" }, SEED.trends[1]],
  });
  assert.equal(byName.query({ quality: "all", owner: "mine" }, AMARA, "Amara Chen").total, 4);
  // With neither the address nor the name matching, they own nothing — and
  // get everyone's rather than an empty page. See the fallback test below.
  const anon = byName.query({ quality: "all", owner: "mine" }, AMARA, "");
  assert.equal(anon.counts.mineAll, 0);
  assert.equal(anon.owner, "all");
});

test("the Hub outranks the pipeline's snapshot on every trend it knows", () => {
  const lib = fixture(SEED);
  // The Hub says the trend has been renamed, retagged, and that Amara is
  // credited on it — none of which the pipeline's sheet can know.
  const hub = new Map([
    [
      "2",
      {
        id: "2",
        title: "The Statement Scarf",
        industries: ["Beauty"],
        ownerName: "Amara Chen",
        mine: true,
        profileId: "abc123",
      },
    ],
  ]);

  const row = lib.find("e", OTHER, "Someone Else", hub);
  assert.equal(row.trendTitle, "The Statement Scarf", "the current title, not the snapshot's");
  assert.deepEqual(row.industries, ["Beauty"]);
  assert.equal(row.ownerName, "Amara Chen");
  assert.equal(row.profileId, "abc123", "so a proof point can link to the profile");
  assert.equal(row.mine, true, "the Hub decides ownership, and it says yes");

  // Ownership follows the Hub for trend 2 and the sheet for trend 1.
  assert.deepEqual(ids(lib.query({ quality: "all", owner: "mine" }, OTHER, "Someone Else", hub)).sort(), [
    "e",
    "f",
  ]);
  assert.deepEqual(ids(lib.query({ quality: "all", owner: "mine" }, AMARA, "Amara Chen", hub)).sort(), [
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
  ]);

  // And the industry filter and its chips read the Hub's tagging.
  const page = lib.query({ quality: "all", industry: "Beauty" }, AMARA, undefined, hub);
  assert.deepEqual(ids(page).sort(), ["e", "f"]);
  assert.ok(!page.industries.includes("Fashion Design"), "the stale tag is gone");
  assert.deepEqual(
    page.trends.map((t) => t.title),
    ["The Statement Scarf"],
    "and the picker shows the current title",
  );
});

test("every other filter narrows on its own", () => {
  const lib = fixture(SEED);
  const q = (extra) => ids(lib.query({ quality: "all", ...extra }, AMARA)).sort();

  assert.deepEqual(q({ trend: "2" }), ["e", "f"]);
  assert.deepEqual(q({ industry: "Fashion Design" }), ["e", "f"], "industry comes off the trend");
  assert.deepEqual(q({ forecast: "KPI not met" }), ["c"]);
  assert.deepEqual(q({ approved: true }), ["a"]);
  assert.deepEqual(q({ wgsnData: true }), ["a"]);
  // "fresh" hides what the profile already cites.
  assert.deepEqual(q({ fresh: true }), ["a", "b", "c", "d", "e"]);
  // The search reads the proof point's text and its trend's title.
  assert.deepEqual(q({ q: "scarves" }), ["e"]);
  assert.deepEqual(q({ q: "graphic scarf" }), ["e", "f"], "the trend title is searchable too");
  assert.deepEqual(q({ q: "NOTHING HERE" }), []);
});

test("the filters combine", () => {
  const lib = fixture(SEED);
  assert.deepEqual(
    ids(lib.query({ quality: "all", trend: "1", wgsnData: true, approved: true }, AMARA)),
    ["a"],
  );
  assert.equal(
    lib.query({ quality: "all", trend: "1", industry: "Fashion Design" }, AMARA).total,
    0,
    "a trend and an industry it is not tagged to is empty, not everything",
  );
});

test("a picker offers what the other filters leave, not what its own does", () => {
  const lib = fixture(SEED);
  // With an industry chosen, the industry chips still show every industry
  // available under the *other* filters — otherwise choosing one would leave
  // a row of a single chip and no way back.
  const chosen = lib.query({ quality: "all", industry: "Consumer Tech" }, AMARA);
  assert.deepEqual(chosen.industries, ["Consumer Tech", "Fashion Buying", "Fashion Design"]);

  // Every *other* picker does narrow, which is what makes them useful: with
  // Consumer Tech chosen there is no point offering a trend that has nothing
  // under it, or a forecast tag with no rows left.
  assert.deepEqual(
    chosen.trends.map((t) => t.id),
    ["1"],
    "the trend picker drops a trend with nothing to show",
  );
  assert.deepEqual(chosen.forecasts, ["Forecast 2028", "KPI not met"]);
  const scarf = lib.query({ quality: "all", industry: "Fashion Design" }, AMARA);
  assert.deepEqual(scarf.trends.map((t) => t.id), ["2"]);
  assert.deepEqual(scarf.forecasts, ["Forecast 2028"], "and a forecast tag with none");

  // Years first, then the ones without a year.
  const all = lib.query({ quality: "all" }, AMARA);
  assert.deepEqual(all.forecasts, ["Forecast 2028", "KPI not met"]);
  assert.deepEqual(
    all.trends.map((t) => `${t.title} ${t.total}${t.mine ? " mine" : ""}`),
    ["AI Companions 4 mine", "The Graphic Scarf 2"],
  );
});

test("counts describe the filtered set, and the whole library", () => {
  const lib = fixture(SEED);
  const page = lib.query({ quality: "all" }, AMARA);
  assert.equal(page.counts.all, 6, "the library's own size, whatever is filtered");
  assert.equal(page.counts.approved, 1);
  assert.equal(page.counts.wgsnData, 1);
  assert.equal(page.counts.mine, 4);
  assert.equal(page.counts.mineAll, 4);
});

test("asking for my trends when you own none shows everyone's, and says so", () => {
  const lib = fixture(SEED);
  const nobody = { ...AMARA, email: "new.starter@wgsn.com", name: "New Starter" };

  // Somebody who owns nothing would otherwise open an empty page every time.
  const page = lib.query({ quality: "all", owner: "mine" }, nobody);
  assert.equal(page.owner, "all", "the filter that was actually applied");
  assert.equal(page.counts.mineAll, 0, "and why");
  assert.equal(page.total, 6, "so they see the library rather than nothing");

  // But somebody who does own trends keeps the filter they asked for, even
  // when the rest of their filters leave nothing — that is a real answer.
  const mine = lib.query({ quality: "all", owner: "mine" }, AMARA);
  assert.equal(mine.owner, "mine");
  assert.equal(mine.total, 4);
  const narrowed = lib.query({ quality: "all", owner: "mine", industry: "Fashion Design" }, AMARA);
  assert.equal(narrowed.owner, "mine", "not downgraded just because it came back empty");
  assert.equal(narrowed.total, 0);
  assert.equal(narrowed.counts.mineAll, 4);
});

test("paging is stable and does not run off the end", () => {
  const lib = fixture(SEED);
  const first = lib.query({ quality: "all", pageSize: 2, page: 1 }, AMARA);
  const second = lib.query({ quality: "all", pageSize: 2, page: 2 }, AMARA);
  assert.equal(first.total, 6, "total is the whole result, not the page");
  assert.deepEqual(ids(first), ["a", "d"]);
  assert.deepEqual(ids(second), ["e", "b"]);
  assert.equal(lib.query({ quality: "all", pageSize: 2, page: 99 }, AMARA).rows.length, 0);
  // A nonsense page or size cannot ask for the whole library at once.
  assert.equal(lib.query({ quality: "all", pageSize: 5000 }, AMARA).pageSize, 96);
  assert.equal(lib.query({ quality: "all", page: -3 }, AMARA).page, 1);
});

test("a row carries its trend's details and the also-matches their titles", () => {
  const lib = fixture({
    ...SEED,
    points: [point("a", { alsoMatches: [{ id: "z", trendId: "2", match: 74 }] })],
  });
  const row = lib.find("a", AMARA);
  assert.equal(row.trendTitle, "AI Companions");
  assert.deepEqual(row.industries, ["Consumer Tech"]);
  assert.equal(row.ownerName, "Amara Chen");
  assert.equal(row.mine, true);
  assert.deepEqual(row.alsoMatches, [
    { id: "z", trendId: "2", match: 74, title: "The Graphic Scarf", url: undefined },
  ]);
});

test("a forecast tag that is not a year sorts after the ones that are", () => {
  const lib = fixture({
    ...SEED,
    points: [
      point("a", { forecastTag: "Forecast 2029" }),
      point("b", { forecastTag: "Forecasting pre-2028" }),
      point("c", { forecastTag: "Forecast 2028" }),
      point("d", { forecastTag: "KPI not met" }),
      point("e", { forecastTag: "Forecast 2035" }),
    ],
  });
  // "Forecasting pre-2028" means already past, so filing it between 2028 and
  // 2029 on the strength of its digits would put it at the wrong end.
  assert.deepEqual(lib.query({ quality: "all" }, AMARA).forecasts, [
    "Forecast 2028",
    "Forecast 2029",
    "Forecast 2035",
    "Forecasting pre-2028",
    "KPI not met",
  ]);
});

test("a missing seed leaves an empty library rather than stopping the Hub", () => {
  const lib = new ProofPointLibrary("/no/such/file.json.gz");
  assert.equal(lib.size, 0);
  assert.equal(lib.source, "not loaded");
  assert.equal(lib.query({}, AMARA).total, 0);
  assert.equal(lib.find("a", AMARA), undefined);
});

test("the real library: ten thousand proof points, paged", () => {
  // The default file, as the server loads it.
  const lib = new ProofPointLibrary();
  assert.ok(lib.size > 10000, `expected the whole library, got ${lib.size}`);
  assert.ok(lib.trendCount > 300);

  const page = lib.query({}, AMARA);
  assert.equal(page.pageSize, 24);
  assert.equal(page.rows.length, 24, "a page is a page whatever the library's size");
  assert.ok(page.total > 5000 && page.total < lib.size, "top tier is a slice, not everything");
  assert.equal(page.counts.all, lib.size);

  // Descending by match, all the way through.
  for (let i = 1; i < page.rows.length; i++) {
    assert.ok(page.rows[i - 1].match >= page.rows[i].match, "sorted by match");
  }
  // Nothing unsanitised anywhere in the corpus.
  for (const row of lib.query({ quality: "all", pageSize: 96 }, AMARA).rows) {
    assert.ok(!/<script|\son[a-z]+=|javascript:/i.test(row.html), `unsafe html in ${row.id}`);
  }

  // The last page holds the remainder and stops.
  const last = Math.ceil(page.total / 24);
  assert.ok(lib.query({ page: last }, AMARA).rows.length > 0);
  assert.equal(lib.query({ page: last + 1 }, AMARA).rows.length, 0);
});
