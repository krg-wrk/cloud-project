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
const {
  people,
  content,
  events,
  sessions,
  signUps,
  access,
  metrics,
  metricObservations,
  trends,
} = await import(join(here, "../server/dist/data/seed.js"));
/*
 * The directory: the invented rows, read by the Hub's own reader, so the demo
 * carries people rather than rows and the parsing is not written twice.
 */
const { directoryRows } = await import(join(here, "../server/dist/data/directory.js"));
const { readDirectory } = await import(join(here, "../server/dist/directory.js"));
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
function proofPointSample(every = 17) {
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

const html = readFileSync(join(here, "hub.template.html"), "utf8").replace(
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
    directory: readDirectory(directoryRows),
    taxonomy: { contentTypes: CONTENT_TYPES, tiers: TIER_MEANINGS, roles: ROLE_BENCHMARKS },
    proofPoints,
  }),
);

const out = join(here, "forecasters-hub.html");
writeFileSync(out, html);
const live = trends.filter((t) => t.published === "Published").length;
const decided = proofPoints.points.filter((p) => p.decision).length;
console.log(
  `${out} — ${(html.length / 1e6).toFixed(2)} MB\n` +
    `  ${people.length} people, ${content.length} forecasts, ${events.length} events, ` +
    `${sessions.length} sessions, ${metrics.length} metrics, ${CONTENT_TYPES.length} formats\n` +
    `  ${trends.length} trend profiles from TFDB (${live} live, ${trends.length - live} not published)\n` +
    `  ${proofPoints.points.length} of ${proofPoints.total.toLocaleString()} proof points ` +
    `across ${proofPoints.trends.length} trends (${decided} decided)`,
);
