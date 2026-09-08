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
const { CONTENT_TYPES, TIER_MEANINGS, ROLE_BENCHMARKS } = await import(
  join(here, "../server/dist/taxonomy.js")
);

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
    taxonomy: { contentTypes: CONTENT_TYPES, tiers: TIER_MEANINGS, roles: ROLE_BENCHMARKS },
  }),
);

const out = join(here, "forecasters-hub.html");
writeFileSync(out, html);
console.log(
  `${out} — ${people.length} people, ${content.length} forecasts, ${events.length} events, ` +
    `${sessions.length} sessions, ${trends.length} trends, ${metrics.length} metrics, ` +
    `${CONTENT_TYPES.length} formats`,
);
