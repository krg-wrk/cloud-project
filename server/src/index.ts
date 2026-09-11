import path from "node:path";
import cors from "cors";
import express from "express";
import { createNoteDrafter } from "./ai.js";
import { createApiRouter, createFeedRouter } from "./api.js";
import { readAuthConfig, viewerMiddleware } from "./auth.js";
import { CachedDataSource, createDataSource } from "./data/index.js";
import { openDb } from "./db.js";
import { SmartsheetSource } from "./data/smartsheetSource.js";
import { createNotifyRouter } from "./notify/api.js";
import { startSchedule } from "./notify/schedule.js";
import { createProofPointRouter } from "./proofPoints/api.js";
import { createAppearanceRouter } from "./appearance.js";
import { createDirectoryRouter } from "./directory.js";
import { createLabRouter } from "./lab/api.js";
import { createResourcesRouter } from "./resources.js";
import { createSearchRouter } from "./searchApi.js";
import { ProofPointLibrary } from "./proofPoints/library.js";
import { SignUps } from "./signUps.js";
import { HubStore } from "./store.js";
import { createStudioRouter } from "./studio/api.js";
import { StudioStore } from "./studio/store.js";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

/*
 * The schedule, from the sheets. Read-only unless the deployment turned
 * writing on below; everything else the team writes goes in the store.
 */
const source = createDataSource();
const data = new CachedDataSource(source);
/*
 * SQLite by default; Postgres when HUB_DB_URL says so. The same SQL runs on
 * both — see db.ts for the two words of difference.
 */
const db = openDb();
const store = new HubStore(db);
// Connections, datasets and views: configuration, in the same database.
const studio = new StudioStore(db);
const signUps = new SignUps(store);
const drafter = createNoteDrafter();
const auth = readAuthConfig();
// Read once at boot: the pipeline writes it weekly and nothing edits it here.
const proofPoints = new ProofPointLibrary();

// The tables, if they are not there yet. Both stores share one database.
await store.init();
await studio.init();

await store.seedSignUpsIfEmpty(await data.listSignUps());

/*
 * Turn writing on, if this deployment asked for it.
 *
 * Done here rather than lazily so that a write flag set against a sheet the
 * token cannot see fails at startup with a message, instead of the first time
 * a manager presses Apply on a change they thought they had made.
 */
let writeTarget = "off";
if (source instanceof SmartsheetSource) {
  try {
    writeTarget = await source.enableWrites();
  } catch (err) {
    console.error(
      "SMARTSHEET_WRITE=1 but the commissioning sheet could not be opened for writing:",
      (err as Error).message,
    );
    writeTarget = "off — the sheet could not be opened";
  }
}

app.use(cors());
app.use(express.json());

// The feed is fetched by Google, not by a signed-in browser, so it is mounted
// before the identity middleware and authenticates on its URL token instead.
app.use("/api", createFeedRouter(data, store, signUps));

app.use(
  "/api",
  viewerMiddleware(auth, async () => ({
    access: await data.listAccess(),
    people: await data.listPeople(),
  })),
  createApiRouter(data, store, signUps, drafter, proofPoints),
  createStudioRouter(studio, data),
  createProofPointRouter(proofPoints, data, store),
  createNotifyRouter(data, store, signUps, proofPoints),
  createSearchRouter(data, studio, proofPoints),
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
const schedule = startSchedule(data, store, signUps, proofPoints);

// In production the built client is served from the same origin, and every
// unknown path falls through to index.html so deep links like
// /content/ss-4021 survive a refresh and a paste into Slack.
if (process.env.NODE_ENV === "production") {
  const clientDist = path.resolve(import.meta.dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res.status(500).json({ error: err.message });
  },
);

app.listen(PORT, async () => {
  console.log(
    `Forecasters Hub API on http://localhost:${PORT}\n` +
      `  schedule:  ${data.name}\n` +
      `  database:  ${store.kind}\n` +
      `  auth:      ${auth.mode}${auth.mode === "proxy" ? ` (${auth.emailHeader})` : " — switcher enabled"}\n` +
      `  AI notes:  ${drafter.model === "none" ? "off (no GEMINI_API_KEY)" : drafter.model}\n` +
      `  studio:    ${(await studio.listConnections()).length} connections, ` +
      `${(await studio.listDatasets()).length} datasets, ${(await studio.listViews()).length} views\n` +
      `  proof pts: ${proofPoints.size.toLocaleString()} across ${proofPoints.trendCount} trends\n` +
      `  writes:    ${writeTarget === "off" ? "off — the Hub only reads the schedule" : writeTarget}\n` +
      `  notify:    ${schedule.note}`,
  );
});
