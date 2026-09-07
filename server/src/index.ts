import path from "node:path";
import cors from "cors";
import express from "express";
import { createApiRouter } from "./api.js";
import { CachedDataSource, createDataSource } from "./data/index.js";
import { SignUpStore } from "./signUps.js";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

const data = new CachedDataSource(createDataSource());
// Sign-ups are the one thing the Hub writes, so they get their own store.
const signUps = new SignUpStore(await data.listSignUps());

app.use(cors());
app.use(express.json());
app.use("/api", createApiRouter(data, signUps));

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
  console.log(`Forecasters Hub API on http://localhost:${PORT} (data source: ${data.name})`);
});
