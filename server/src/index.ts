import path from "node:path";
import compression from "compression";
import cors from "cors";
import express from "express";
import { createAccountsRouter } from "./accounts.js";
import { createNoteDrafter } from "./ai.js";
import { createApiRouter, createFeedRouter } from "./api.js";
import { readAuthConfig, viewerMiddleware } from "./auth.js";
import { CachedDataSource, createDataSource } from "./data/index.js";
import { openDb } from "./db.js";
import { MirrorSource, syncEveryMs } from "./data/mirrorSource.js";
import { createNotifyRouter } from "./notify/api.js";
import { startSchedule } from "./notify/schedule.js";
import { createProofPointRouter } from "./proofPoints/api.js";
import { createAppearanceRouter } from "./appearance.js";
import { createDirectoryRouter } from "./directory.js";
import { createLabRouter } from "./lab/api.js";
import { createResourcesRouter } from "./resources.js";
import { createPlanRouter } from "./planApi.js";
import { createSearchRouter } from "./searchApi.js";
import { ProofPointLibrary } from "./proofPoints/library.js";
import { SignUps } from "./signUps.js";
import { HubStore } from "./store.js";
import { createStudioRouter } from "./studio/api.js";
import { ViewRunner } from "./studio/run.js";
import { StudioStore } from "./studio/store.js";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

/*
 * SQLite by default; Postgres when HUB_DB_URL says so. The same SQL runs on
 * both — see db.ts for the two words of difference.
 *
 * Opened before the source rather than after it, which is the order it used
 * to be in: `DATA_SOURCE=mirror` keeps its copy of the schedule in this same
 * database, so the source cannot be built until there is one.
 */
const db = openDb();
/*
 * The schedule, from the sheets. Read-only unless the deployment turned
 * writing on below; everything else the team writes goes in the store.
 */
const source = createDataSource(db);
const data = new CachedDataSource(source);
const store = new HubStore(db);
// Connections, datasets and views: configuration, in the same database.
const studio = new StudioStore(db);
const signUps = new SignUps(store);
/*
 * One view runner, shared.
 *
 * Both the studio's routes and the scheduler that emails views hold this
 * same object. Two would mean two dataset caches, and so two answers to
 * "what does this sheet say" — with the table in somebody's inbox quietly
 * disagreeing with the one on their screen.
 */
const viewRunner = new ViewRunner(studio, data);
const drafter = createNoteDrafter();
const auth = readAuthConfig();
// Read once at boot: the pipeline writes it weekly and nothing edits it here.
const proofPoints = new ProofPointLibrary();

// The tables, if they are not there yet. Both stores share one database.
await store.init();
await studio.init();

/*
 * Fill the mirror before anything is served from it.
 *
 * Before `seedSignUpsIfEmpty` below, which reads the schedule, and before the
 * first request for the same reason: the mirror refuses to answer for a kind
 * it has never pulled rather than reporting an empty schedule, and an empty
 * schedule that renders as a real one is the failure worth going to this
 * trouble to avoid.
 *
 * A failed pull is only fatal when there is nothing to fall back on. With a
 * previous copy in the database the Hub starts and serves it, because
 * carrying on with data of a stated age is the whole point of keeping a copy
 * — a Smartsheet outage should not be a Hub outage. The banner says which of
 * the two happened.
 */
let mirrorNote = "";
if (source instanceof MirrorSource) {
  await source.init();
  const results = await source.sync();
  const failed = results.filter((r) => !r.ok);
  const held = new Set(await source.synced());
  const missing = failed.filter((r) => !held.has(r.kind));
  if (missing.length > 0) {
    throw new Error(
      `The mirror could not read ${missing.map((r) => r.kind).join(", ")} and has no earlier copy to serve. ` +
        `First reason given: ${missing[0].why}`,
    );
  }
  const every = Math.round(syncEveryMs() / 60_000);
  mirrorNote =
    failed.length > 0
      ? `every ${every}m — ${failed.length} of ${results.length} could not be read just now, serving the previous copy`
      : `every ${every}m — ${results.reduce((n, r) => n + r.rows, 0)} rows`;
  /*
   * `unref` so the timer is not a reason the process stays alive. A Hub told
   * to shut down should shut down rather than wait out the interval.
   */
  setInterval(() => {
    void source.sync().catch((err) => {
      // Never thrown: a sync that fails leaves the previous copy serving, and
      // an unhandled rejection here would take the whole server down over it.
      console.error("The mirror could not sync:", (err as Error).message);
    });
  }, syncEveryMs()).unref();
}

await store.seedSignUpsIfEmpty(await data.listSignUps());

/*
 * Turn writing on, if this deployment asked for it.
 *
 * Done here rather than lazily so that a write flag set against a sheet the
 * token cannot see fails at startup with a message, instead of the first time
 * a manager presses Apply on a change they thought they had made.
 */
let writeTarget = "off";
/*
 * Asked as a capability, not as a type.
 *
 * This read `source instanceof SmartsheetSource`, which is true of exactly
 * one class — so wrapping the source, as `DATA_SOURCE=mirror` does, turned
 * writing off at boot and took the Change button away with nothing logged.
 * `enableWrites` is on the DataSource contract for that reason.
 */
if (source.enableWrites) {
  try {
    writeTarget = await source.enableWrites();
  } catch (err) {
    console.error(
      "SMARTSHEET_WRITE=1 but the commissioning sheet could not be opened for writing:",
      (err as Error).message,
    );
    writeTarget = "off — the sheet could not be opened";
  }
} else if (source.writes) {
  // The seed source's stand-in, under SEED_WRITES=1. It names itself as
  // something obviously not real, and that is what the line should say.
  writeTarget = source.writes.target;
}

/*
 * Compress everything on the way out.
 *
 * Measured rather than assumed: the trend list is 893KB of JSON and the
 * client bundle 542KB, and neither was being compressed. Over a corporate
 * link that is the difference between the Hub feeling instant and feeling
 * like a report. A reverse proxy in front may well do this too — doing it
 * twice costs nothing, because it will not compress what is already
 * compressed, and doing it here means the Hub is fast whatever it is hosted
 * behind rather than only behind the right thing.
 */
app.use(compression());

/*
 * Who may call the API from a browser.
 *
 * In production the client is served from this same origin, so nothing needs
 * cross-origin access at all and the default `*` is a door with nothing
 * behind it. HUB_ORIGIN closes it anyway; in dev it stays open, because the
 * client runs on :5173 and the API on :3001.
 */
const allowedOrigin = process.env.HUB_ORIGIN;
app.use(cors(allowedOrigin ? { origin: allowedOrigin } : {}));

/*
 * Bodies stay small — 100KB, Express's own default — everywhere except the
 * one endpoint that takes an image.
 *
 * A photograph arrives base64 inside JSON, so 96KB of picture is about 130KB
 * of request. Raising the limit for the whole API to suit one route would
 * quietly raise it for every route that takes a note or a filter, so the
 * bigger limit is granted by path and nowhere else. The endpoint still checks
 * the image itself; this only decides what is allowed to reach it.
 */
const body = express.json();
const bodyWithPhoto = express.json({ limit: "200kb" });
app.use((req, res, next) =>
  (req.path === "/api/my/photo" ? bodyWithPhoto : body)(req, res, next),
);

// The feed is fetched by Google, not by a signed-in browser, so it is mounted
// before the identity middleware and authenticates on its URL token instead.
app.use("/api", createFeedRouter(data, store, signUps));

// The dev switcher has to name the accounts before anybody has picked one, so
// it is mounted before the identity middleware too. It answers 404 unless
// AUTH_MODE=dev — see accounts.ts for why that is the whole of the guard.
app.use("/api", createAccountsRouter(auth, data));

app.use(
  "/api",
  viewerMiddleware(auth, async () => ({
    access: await data.listAccess(),
    people: await data.listPeople(),
  })),
  createApiRouter(data, store, signUps, drafter, proofPoints),
  createStudioRouter(studio, data, viewRunner, store),
  createProofPointRouter(proofPoints, data, store),
  createNotifyRouter(data, store, signUps, proofPoints, studio, viewRunner),
  createSearchRouter(data, studio, proofPoints),
  createPlanRouter(data, store),
  createResourcesRouter(store),
  createAppearanceRouter(store),
  createDirectoryRouter(data),
  createLabRouter(data, proofPoints),
);

/*
 * The schedule that sends them, off unless this deployment asked for it.
 *
 * Off by default for the same reason writing to Smartsheet is: it acts on
 * the world without anybody pressing anything, and a POC that mails two
 * hundred people because somebody ran it locally would be the last time the
 * team trusted it. An admin can always run it by hand, dry first.
 */
const schedule = startSchedule(data, store, signUps, proofPoints, studio, viewRunner);

// In production the built client is served from the same origin, and every
// unknown path falls through to index.html so deep links like
// /content/ss-4021 survive a refresh and a paste into Slack.
if (process.env.NODE_ENV === "production") {
  const clientDist = path.resolve(import.meta.dirname, "../../client/dist");
  /*
   * Two kinds of file, two lifetimes.
   *
   * Everything under /assets carries a content hash in its name — change the
   * code and the name changes — so it can be cached for a year and never
   * revalidated. index.html is the opposite: one unchanging name whose
   * contents point at whichever hashed bundle is current, so it must never be
   * cached or a deploy reaches nobody until their browser feels like asking.
   *
   * This was `max-age=0` on everything, which meant a 542KB bundle
   * revalidated on every page load.
   */
  app.use(
    express.static(clientDist, {
      index: false,
      setHeaders(res, filePath) {
        res.setHeader(
          "Cache-Control",
          filePath.endsWith("index.html")
            ? "no-cache"
            : "public, max-age=31536000, immutable",
        );
      },
    }),
  );
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

/*
 * The last word on anything that threw.
 *
 * A fault of ours is a 500; a fault in the request is not. Express's own body
 * parser marks a body that is too large or malformed with a status of its
 * own, and reporting those as 500 sends somebody looking for a broken server
 * when what they have is a file too big to send.
 */
app.use(
  (
    err: Error & { status?: number; statusCode?: number },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const said = err.status ?? err.statusCode;
    const status = typeof said === "number" && said >= 400 && said < 600 ? said : 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message });
  },
);

app.listen(PORT, async () => {
  console.log(
    `Forecasters Hub API on http://localhost:${PORT}\n` +
      `  schedule:  ${data.name}\n` +
      `  database:  ${store.kind}\n` +
      (mirrorNote ? `  mirror:    ${mirrorNote}\n` : "") +
      `  auth:      ${auth.mode}${auth.mode === "proxy" ? ` (${auth.emailHeader})` : " — switcher enabled"}\n` +
      `  AI notes:  ${drafter.model === "none" ? "off (no GEMINI_API_KEY)" : drafter.model}\n` +
      `  studio:    ${(await studio.listConnections()).length} connections, ` +
      `${(await studio.listDatasets()).length} datasets, ${(await studio.listViews()).length} views\n` +
      `  proof pts: ${proofPoints.size.toLocaleString()} across ${proofPoints.trendCount} trends\n` +
      `  writes:    ${writeTarget === "off" ? "off — the Hub only reads the schedule" : writeTarget}\n` +
      `  notify:    ${schedule.note}`,
  );
});
