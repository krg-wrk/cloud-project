/**
 * Builds the standalone demo page published as an Artifact: the same schedule
 * and the same views as the app, but with the data inlined and hash routing,
 * so it can be opened and shared as a single file with no server.
 *
 *   npm run build -w server && node demo/build.mjs
 *
 * Writes demo/forecasters-hub.html.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const here = dirname(new URL(import.meta.url).pathname);

/** The source's name reaches the page as markup, so it is escaped. */
const escapeHtml = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/*
 * Two builds from one template.
 *
 * Without a flag this is the shareable page: invented people, an invented
 * schedule, safe to email to anyone. `--live` reads whatever the server is
 * configured to read — the real Smartsheet sheets — and writes a *different
 * file*, because a snapshot of the real commissioning schedule is an internal
 * document and must never be confused with the one that gets sent around.
 *
 *   node demo/build.mjs                 # the sample (default)
 *   DATA_SOURCE=smartsheet SMARTSHEET_TOKEN=… \
 *     node demo/build.mjs --live        # a snapshot of the real thing
 *   … --live --with-emails              # keep addresses in it (see below)
 *
 * Addresses are stripped from a live snapshot unless asked for. The page only
 * ever *displays* them; nothing in it matches on one, so removing them costs
 * the demo nothing and means a file that leaves the building is not a
 * contact list.
 */
const LIVE = process.argv.includes("--live");
const WITH_EMAILS = process.argv.includes("--with-emails");

let people, content, events, sessions, signUps, access, metrics, metricObservations, trends;
let directory;
let sourceName = "the built-in sample";
let takenAt = null;

if (LIVE) {
  const { createDataSource } = await import(join(here, "../server/dist/data/index.js"));
  const source = createDataSource();

  /*
   * Refuse to label the sample as live.
   *
   * `createDataSource()` falls back to the seed when DATA_SOURCE is not set,
   * so without this check `--live` on an unconfigured machine would write a
   * file full of invented people with a banner claiming it is real — which is
   * a worse outcome than any error.
   */
  if (/seed/i.test(source.name)) {
    console.error(
      "--live needs the server's own data settings, and none are set.\n" +
        "DATA_SOURCE=smartsheet, SMARTSHEET_TOKEN and the sheet ids, as in the README.\n" +
        "Nothing was written.",
    );
    process.exit(1);
  }

  sourceName = source.name;
  takenAt = new Date();
  process.stdout.write(`Reading ${sourceName}…\n`);

  [people, content, events, sessions, signUps, access, metrics, metricObservations, trends, directory] =
    await Promise.all([
      source.listPeople(),
      source.listContent(),
      source.listEvents(),
      source.listSessions(),
      source.listSignUps(),
      source.listAccess(),
      source.listMetrics(),
      source.listMetricObservations(),
      source.listTrends(),
      source.listDirectory(),
    ]);

  if (!WITH_EMAILS) {
    const strip = (rows) =>
      rows.map((row) => (row && row.email ? { ...row, email: "" } : row));
    people = strip(people);
    access = strip(access);
    directory = strip(directory);
  }
} else {
  ({
    people,
    content,
    events,
    sessions,
    signUps,
    access,
    metrics,
    metricObservations,
    trends,
  } = await import(join(here, "../server/dist/data/seed.js")));
  /*
   * The directory: the invented rows, read by the Hub's own reader, so the
   * demo carries people rather than rows and the parsing is not written twice.
   */
  const { directoryRows } = await import(join(here, "../server/dist/data/directory.js"));
  const { readDirectory } = await import(join(here, "../server/dist/directory.js"));
  directory = readDirectory(directoryRows);
}
const { CONTENT_TYPES, TIER_MEANINGS, ROLE_BENCHMARKS } = await import(
  join(here, "../server/dist/taxonomy.js")
);
const { ProofPointLibrary } = await import(join(here, "../server/dist/proofPoints/library.js"));
const { TIER_MEANING } = await import(join(here, "../server/dist/proofPoints/types.js"));

/**
 * The proof point library, cut down to fit in one file.
 *
 * All 10,235 suggestions carry 22 MB of rendered markup, and an Artifact has
 * to come in under 16 MB in total — so the demo takes a slice. Every decided
 * one is kept, because the approved filter showing nothing would look broken,
 * and the rest is a fixed stride through the library, which preserves the
 * spread across tiers, trends, industries and forecast years rather than
 * taking the first six hundred alphabetically.
 *
 * The markup is sanitised here, at build time, by the same function the
 * server uses — the demo has no server to do it on the way out.
 */
/**
 * A sample of the library, not the whole of it.
 *
 * Every third suggestion, plus every one somebody has decided on. The whole
 * ten thousand is about 28 MB of rendered markup once it is inlined — past
 * what a single file that gets emailed around should be, and past the
 * artifact size cap. Every third is 3,400-odd, which is enough that the
 * filters, the trend picker and the search all behave as they do against the
 * real thing.
 *
 * It was every seventeenth, which was set against a much earlier guess at the
 * size budget and left 627. Measured properly the cost is nearly all download
 * rather than parse — 18 ms to parse a 5 MB seed, 322 ms to first paint — so
 * the sample could be a good deal denser than it was.
 */
function proofPointSample(every = 3) {
  const library = new ProofPointLibrary();
  const admin = { email: "", name: "", personId: null, role: "admin", verticals: "all", active: true };
  const all = library.query({ quality: "all", pageSize: 96, page: 1 }, admin);
  // query() pages, so walk it rather than reaching inside.
  const rows = [];
  for (let page = 1; rows.length < all.total; page++) {
    const chunk = library.query({ quality: "all", pageSize: 96, page }, admin).rows;
    if (chunk.length === 0) break;
    rows.push(...chunk);
  }
  const keep = rows.filter((r, i) => i % every === 0 || r.decision);
  // The trends the sample actually needs, and only those.
  const wanted = new Set(keep.map((r) => r.trendId));
  for (const r of keep) for (const a of r.alsoMatches ?? []) wanted.add(a.trendId);
  const trendRows = [...wanted]
    .map((id) => library.trend(id))
    .filter(Boolean)
    .map((t) => ({ id: t.id, title: t.title, description: t.description, industries: t.industries, total: t.total, tierA: t.tierA, ownerName: t.ownerName, ownerEmail: t.ownerEmail, publishedUrl: t.publishedUrl }));

  return {
    total: library.size,
    trendTotal: library.trendCount,
    tiers: TIER_MEANING,
    trends: trendRows,
    // `mine`, `trendTitle` and the rest are re-derived in the demo against
    // its own TFDB seed, exactly as the server does it.
    points: keep.map((r) => ({
      id: r.id,
      trendId: r.trendId,
      tier: r.tier,
      match: r.match,
      claudeScore: r.claudeScore,
      geminiScore: r.geminiScore,
      agreed: r.agreed,
      forecastTag: r.forecastTag,
      kpiStatus: r.kpiStatus,
      alreadyKnown: r.alreadyKnown,
      wgsnData: r.wgsnData,
      whyClaude: r.whyClaude,
      whyGemini: r.whyGemini,
      html: r.html,
      text: r.text,
      sourceUrl: r.sourceUrl,
      forecastUrl: r.forecastUrl,
      forecastTitle: r.forecastTitle,
      reportTitles: r.reportTitles,
      alsoMatches: (r.alsoMatches ?? []).map((a) => ({ id: a.id, trendId: a.trendId, match: a.match })),
      decision: r.decision,
      decidedAt: r.decidedAt,
      decidedByOwner: r.decidedByOwner,
    })),
  };
}

const proofPoints = proofPointSample();

/*
 * The first line of the page, on the one build that needs one.
 *
 * A live snapshot says whose data it is, when it was taken, and that it is
 * frozen — because somebody handed this file next week will otherwise read a
 * fortnight-old schedule as today's. That is a safety label, not a caption,
 * and it stays.
 *
 * The sample build has no banner. It used to explain that the data was made
 * up and that the address bar was real, which is a caption for a page nobody
 * was going to be walked through. It is demonstrated out loud instead, and
 * the forty pixels go back to the work.
 */
const banner = LIVE
  ? `<strong>Internal snapshot</strong><span>Real data from ${escapeHtml(sourceName)}, ` +
    `frozen at ${takenAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}. ` +
    `It does not update — the Hub itself does. ${
      WITH_EMAILS
        ? "It carries email addresses."
        : "Email addresses have been removed."
    } Do not share it outside WGSN.</span>`
  : null;

const html = readFileSync(join(here, "hub.template.html"), "utf8")
  // The whole element goes when there is nothing to say, rather than leaving
  // an empty black strip across the top of the page.
  .replace(
    '<div class="demo-note">__BANNER__</div>',
    () => (banner ? `<div class="demo-note">${banner}</div>` : ""),
  )
  .replace(
  "__SEED__",
  JSON.stringify({
    people,
    content,
    events,
    sessions,
    signUps,
    access,
    metrics,
    trends,
    observations: metricObservations,
    directory,
    taxonomy: { contentTypes: CONTENT_TYPES, tiers: TIER_MEANINGS, roles: ROLE_BENCHMARKS },
    proofPoints,
  }),
);

/*
 * Does the page's own script actually parse?
 *
 * The demo is one file with half a megabyte of hand-written JavaScript inside
 * a <script> tag, and a browser answers a syntax error in it with a blank
 * page and one line in a console nobody has open. This catches it here, where
 * the message says which line — the failure it was written for was a backtick
 * inside an HTML comment inside a template literal, which ended the string
 * three hundred lines early and broke everything after it.
 *
 * `new Function` parses without running: no page, no DOM, nothing executed.
 */
const scriptOf = (page) => {
  const seed = page.indexOf('<script id="seed"');
  const after = page.indexOf("</script>", seed) + "</script>".length;
  const start = page.indexOf("<script>", after) + "<script>".length;
  return page.slice(start, page.indexOf("</script>", start));
};

try {
  new Function(scriptOf(html));
} catch (err) {
  console.error(`The demo's script does not parse: ${err.message}`);
  console.error("Nothing was written. Fix the template and build again.");
  process.exit(1);
}

const out = join(here, LIVE ? "forecasters-hub-live.html" : "forecasters-hub.html");
writeFileSync(out, html);
const live = trends.filter((t) => t.published === "Published").length;
const decided = proofPoints.points.filter((p) => p.decision).length;
console.log(
  `${out} — ${(html.length / 1e6).toFixed(2)} MB${LIVE ? "  [INTERNAL — real data]" : ""}\n` +
    `  ${people.length} people, ${content.length} forecasts, ${events.length} events, ` +
    `${sessions.length} sessions, ${metrics.length} metrics, ${CONTENT_TYPES.length} formats\n` +
    `  ${trends.length} trend profiles from TFDB (${live} live, ${trends.length - live} not published)\n` +
    `  ${proofPoints.points.length} of ${proofPoints.total.toLocaleString()} proof points ` +
    `across ${proofPoints.trends.length} trends (${decided} decided)`,
);
