import assert from "node:assert/strict";
import test from "node:test";
import { search } from "./search.js";

/**
 * What comes first.
 *
 * A search box is judged entirely on its first three results, so the tests
 * are about ordering rather than about whether a match was found at all. The
 * failure that matters is the right answer being fourth.
 */

const people = [
  { id: "ao", name: "Amara Okafor", email: "amara.okafor@wgsn.com", role: "forecaster", region: "UK", vertical: "Womenswear", forecasterRole: "Senior Strategist" },
  { id: "pr", name: "Priya Raman", email: "priya.raman@wgsn.com", role: "forecaster", region: "UK", vertical: "Interiors & Lifestyle" },
];

const content = [
  {
    id: "ss-1",
    title: "Quiet Kitchens: Interiors Materials Update",
    type: "Retail Analysis",
    vertical: "Interiors & Lifestyle",
    season: "S/S 28",
    forecasterId: "pr",
    managerId: "gk",
    submissionDate: "2026-09-09",
    publicationDate: "2026-09-22",
    status: "at-risk",
    notes: "Waiting on the Milan gallery",
  },
  {
    id: "ss-2",
    title: "Big Ideas S/S 28",
    type: "Big Ideas",
    vertical: "Womenswear",
    season: "S/S 28",
    forecasterId: "ao",
    managerId: "gk",
    submissionDate: "2026-10-01",
    publicationDate: "2026-11-01",
    status: "in-progress",
    notes: "Mentions quiet kitchens in passing",
  },
];

const trends = [
  {
    id: "482",
    profileId: "doc-482",
    title: "Collagen Stacking",
    description: "Layered collagen across formats, from masks to supplements.",
    needToKnow: "Innovator brands are stacking collagen.",
    industries: ["Beauty"],
    hashtags: ["#skin"],
    types: ["Product"],
    ownerId: "ao",
    ownerName: "Amara Okafor",
    authorIds: [],
    authorNames: [],
    published: "Published",
    needingScore: [],
    scored: [],
    missingScore: [],
    labels: {},
    strategies: 0,
    proofPoints: 0,
    publishedOn: "",
    activeFrom: "",
    activeTo: "",
    editorUrl: "",
    publishedUrl: "",
    opportunity: "",
  },
  {
    id: "300",
    profileId: "doc-300",
    title: "Quiet Kitchens",
    description: "Calm, material-led kitchens.",
    needToKnow: "",
    industries: ["Interiors & Lifestyle"],
    hashtags: [],
    types: ["Lifestyle"],
    ownerId: "pr",
    ownerName: "Priya Raman",
    authorIds: [],
    authorNames: [],
    published: "Published",
    needingScore: [],
    scored: [],
    missingScore: [],
    labels: {},
    strategies: 0,
    proofPoints: 0,
    publishedOn: "",
    activeFrom: "",
    activeTo: "",
    editorUrl: "",
    publishedUrl: "",
    opportunity: "",
  },
  {
    id: "300",
    profileId: "doc-300-old",
    title: "Quiet Kitchens",
    description: "An earlier version.",
    needToKnow: "",
    industries: [],
    hashtags: [],
    types: [],
    ownerId: "pr",
    ownerName: "Priya Raman",
    authorIds: [],
    authorNames: [],
    editorStatus: "archived",
    needingScore: [],
    scored: [],
    missingScore: [],
    labels: {},
    strategies: 0,
    proofPoints: 0,
    publishedOn: "",
    activeFrom: "",
    activeTo: "",
    editorUrl: "",
    publishedUrl: "",
    opportunity: "",
  },
];

const sessions = [
  {
    id: "ws-1",
    title: "S/S 28 Colour Workshop",
    kind: "workshop",
    hostId: "ao",
    date: "2026-09-17",
    startTime: "10:00",
    endTime: "12:00",
    location: "London studio",
    online: false,
    capacity: 12,
    signUpsOpen: true,
    summary: "Building a palette from the Coloro system.",
    topics: ["colour", "coloro"],
  },
];

/** A stand-in library: the same shape the real one's textSearch returns. */
const library = {
  rows: [
    { id: "pp-1", text: "35% of innovator brands mention collagen", trendTitle: "Collagen Stacking", match: 98 },
    { id: "pp-2", text: "Kitchen renovations fell 4% year on year", trendTitle: "Quiet Kitchens", match: 71 },
  ],
  textSearch(terms, take) {
    return this.rows
      .filter((r) => terms.every((t) => r.text.toLowerCase().includes(t)))
      .slice(0, take);
  },
};

const corpus = { content, people, sessions, trends, views: [], library };

const run = (q, over = {}) => search(q, { ...corpus, ...over });
const titles = (r) => r.hits.map((h) => `${h.kind}:${h.title}`);

test("a query shorter than two letters finds nothing", () => {
  assert.equal(run("a").total, 0);
  assert.equal(run("").total, 0);
  assert.equal(run("   ").total, 0);
});

test("the thing called that comes before the things that mention it", () => {
  const r = run("quiet kitchens");
  // A trend and a forecast are both called it; the other forecast only
  // mentions it in a note.
  assert.deepEqual(titles(r).slice(0, 2).sort(), [
    "forecast:Quiet Kitchens: Interiors Materials Update",
    "trend:Quiet Kitchens",
  ]);
  const mentions = titles(r).indexOf("forecast:Big Ideas S/S 28");
  assert.ok(mentions > 1, "the one that only mentions it is further down");
});

test("half a title is enough, in any order", () => {
  assert.ok(titles(run("kitchens interiors")).includes("forecast:Quiet Kitchens: Interiors Materials Update"));
  assert.ok(titles(run("interiors kitchens")).includes("forecast:Quiet Kitchens: Interiors Materials Update"));
});

test("every word has to appear, so more words narrow", () => {
  assert.ok(run("collagen").counts.trend >= 1);
  assert.equal(run("collagen kitchens").counts.trend, 0);
});

test("an archived earlier version of a live profile is not offered", () => {
  const r = run("quiet kitchens");
  const trendHits = r.hits.filter((h) => h.kind === "trend");
  assert.equal(trendHits.length, 1);
  assert.equal(trendHits[0].to, "/trends/doc-300");
});

test("people are found by name, by address and by grade", () => {
  assert.ok(titles(run("priya.raman")).includes("person:Priya Raman"));
  assert.ok(titles(run("senior strategist")).includes("person:Amara Okafor"));
});

test("a person's name finds the person first, then their work", () => {
  /*
   * Searching somebody's name should find their trends and forecasts too —
   * that is most of why you would type it — but the person comes first.
   */
  const found = titles(run("okafor"));
  assert.equal(found[0], "person:Amara Okafor");
  assert.ok(found.includes("trend:Collagen Stacking"), "the trend she owns");
  assert.ok(found.includes("forecast:Big Ideas S/S 28"), "the forecast she writes");
});

test("a forecast is found by its format, its vertical and its forecaster", () => {
  assert.ok(titles(run("retail analysis")).includes("forecast:Quiet Kitchens: Interiors Materials Update"));
  assert.ok(titles(run("big ideas")).includes("forecast:Big Ideas S/S 28"));
  assert.ok(titles(run("amara")).some((t) => t.startsWith("forecast:")));
});

test("a session is found by its topic as well as its title", () => {
  assert.ok(titles(run("coloro")).includes("session:S/S 28 Colour Workshop"));
  assert.ok(titles(run("colour workshop")).includes("session:S/S 28 Colour Workshop"));
});

test("proof points are found, and ranked under the trend they belong to", () => {
  const r = run("collagen");
  const kinds = r.hits.map((h) => h.kind);
  assert.ok(kinds.includes("proof"));
  assert.ok(
    kinds.indexOf("trend") < kinds.indexOf("proof"),
    "the trend comes before the evidence under it",
  );
});

test("a proof point links into the library with itself open", () => {
  const hit = run("collagen").hits.find((h) => h.kind === "proof");
  assert.match(hit.to, /^\/data\/proof-points\?q=collagen&open=pp-1$/);
});

test("a long proof point is trimmed rather than pasted whole", () => {
  const long = "x".repeat(400) + " collagen";
  const r = search("collagen", {
    ...corpus,
    library: { textSearch: () => [{ id: "p", text: long, trendTitle: "T", match: 50 }] },
  });
  const hit = r.hits.find((h) => h.kind === "proof");
  assert.ok(hit.title.length < 100, hit.title.length);
  assert.ok(hit.title.endsWith("…"));
});

test("a body match says where it was found", () => {
  const hit = run("milan").hits.find((h) => h.kind === "forecast");
  assert.match(hit.why, /Milan gallery/);
});

test("a title match needs no explanation", () => {
  const hit = run("big ideas").hits.find((h) => h.title === "Big Ideas S/S 28");
  assert.equal(hit.why, undefined, "there is nothing to explain about a title match");
});

test("counts cover everything that matched, including what is not shown", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({
    ...content[0],
    id: `x-${i}`,
    title: `Colour Report ${i}`,
  }));
  const r = run("colour", { content: many });
  assert.equal(r.counts.forecast, 30);
  assert.equal(r.hits.filter((h) => h.kind === "forecast").length, 6, "capped");
  assert.equal(r.more, true);
});

test("one kind cannot crowd out the others", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({
    ...content[0],
    id: `x-${i}`,
    title: `Collagen Report ${i}`,
  }));
  const r = run("collagen", { content: many });
  const kinds = new Set(r.hits.map((h) => h.kind));
  assert.ok(kinds.has("trend"), "the trend is still there");
  assert.ok(kinds.has("forecast"));
});

test("punctuation in the query is ignored", () => {
  assert.ok(titles(run("quiet kitchens:")).length > 0);
  assert.ok(titles(run("S/S 28")).length > 0);
});

test("a view is only offered when the caller passed it in", () => {
  const view = {
    id: "v1",
    slug: "beauty-deadlines",
    label: "Beauty deadlines",
    icon: "list",
    section: "Your work",
    order: 1,
    datasetId: "d1",
    description: "Every beauty forecast",
    spec: {},
    audience: { roles: "all", verticals: "all", emails: [] },
  };
  assert.equal(run("beauty deadlines").counts.view, 0);
  assert.equal(run("beauty deadlines", { views: [view] }).counts.view, 1);
  assert.equal(
    run("beauty deadlines", { views: [view] }).hits.find((h) => h.kind === "view").to,
    "/v/beauty-deadlines",
  );
});

test("nothing matches nothing, without throwing", () => {
  const r = run("zzzzqqq");
  assert.equal(r.total, 0);
  assert.deepEqual(r.hits, []);
  assert.equal(r.more, false);
});

test("every hit carries somewhere to go", () => {
  for (const q of ["quiet", "collagen", "amara", "colour", "s/s 28"]) {
    for (const hit of run(q).hits) {
      assert.ok(hit.to.startsWith("/"), `${q} → ${hit.kind}`);
      assert.ok(hit.title, `${q} → ${hit.kind} needs a title`);
    }
  }
});

test("a tie is broken by the date, not the alphabet", () => {
  const many = [
    { ...content[0], id: "a", title: "Zebra Report", notes: "amara", submissionDate: "2026-09-20" },
    { ...content[0], id: "b", title: "Alpha Report", notes: "amara", submissionDate: "2026-12-01" },
  ];
  const found = run("amara", { content: many }).hits.filter((h) => h.kind === "forecast");
  assert.deepEqual(
    found.map((h) => h.title),
    ["Zebra Report", "Alpha Report"],
    "the one closest to its deadline first",
  );
});

test("a callout's line breaks do not become a multi-line row", () => {
  const r = search("collagen", {
    ...corpus,
    library: {
      textSearch: () => [
        { id: "p", text: "Trends to watch\nCollagen banking\nRising 40%", trendTitle: "T", match: 90 },
      ],
    },
  });
  const hit = r.hits.find((h) => h.kind === "proof");
  assert.doesNotMatch(hit.title, /\n/);
  assert.equal(hit.title, "Trends to watch Collagen banking Rising 40%");
});

test("each kind appears once, as one block", () => {
  /*
   * A flat sort interleaves kinds wherever the scores tie, and the page then
   * draws the same heading twice. The best hit still decides which kind
   * leads; once a kind starts it finishes.
   */
  const r = run("amara");
  const seen = [];
  for (const hit of r.hits) {
    if (seen[seen.length - 1] !== hit.kind) seen.push(hit.kind);
  }
  assert.equal(seen.length, new Set(seen).size, `kinds interleaved: ${seen.join(", ")}`);
});

test("the kind with the best hit leads", () => {
  const r = run("okafor");
  assert.equal(r.hits[0].kind, "person", "her own record outranks her work");
  const kinds = r.hits.map((h) => h.kind);
  assert.equal(kinds.indexOf("person"), 0);
});
