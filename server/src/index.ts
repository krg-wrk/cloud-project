import path from "node:path";
import cors from "cors";
import express from "express";
import { createNoteDrafter } from "./ai.js";
import { createApiRouter, createFeedRouter } from "./api.js";
import { readAuthConfig, viewerMiddleware } from "./auth.js";
import { CachedDataSource, createDataSource } from "./data/index.js";
import { SignUps } from "./signUps.js";
import { HubStore } from "./store.js";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

// Read-only schedule from the sheets; everything the team writes goes in the store.
const data = new CachedDataSource(createDataSource());
const store = new HubStore();
const signUps = new SignUps(store);
const drafter = createNoteDrafter();
const auth = readAuthConfig();

store.seedSignUpsIfEmpty(await data.listSignUps());

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
  createApiRouter(data, store, signUps, drafter),
);

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

app.listen(PORT, () => {
  console.log(
    `Forecasters Hub API on http://localhost:${PORT}\n` +
      `  schedule:  ${data.name}\n` +
      `  auth:      ${auth.mode}${auth.mode === "proxy" ? ` (${auth.emailHeader})` : " — switcher enabled"}\n` +
      `  AI notes:  ${drafter.model === "none" ? "off (no GEMINI_API_KEY)" : drafter.model}`,
  );
});
