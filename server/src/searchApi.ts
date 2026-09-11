import { Router } from "express";
import { canRead, type ViewerRequest } from "./auth.js";
import type { ProofPointLibrary } from "./proofPoints/library.js";
import { KIND_LABELS, search } from "./search.js";
import { canSeeView } from "./studio/query.js";
import type { StudioStore } from "./studio/store.js";
import type { DataSource } from "./types.js";

/**
 * One box, over HTTP.
 *
 * On the server rather than in the browser, because the corpus is 40,000
 * rows once the proof points are counted and none of it belongs on a phone.
 * The answer is a few kilobytes whatever the query.
 *
 * Everything it searches is already readable by anybody on the team, with
 * one exception: a studio view has an audience, so the views are filtered by
 * the same rule the sidebar uses before they reach the ranking. Nobody
 * should be able to discover a view they cannot open.
 */
export function createSearchRouter(
  data: DataSource,
  studio: StudioStore,
  library: ProofPointLibrary,
): Router {
  const router = Router();

  router.get("/search", async (req: ViewerRequest, res, next) => {
    try {
      const viewer = req.viewer!;
      if (!canRead(viewer)) {
        res.status(403).json({ error: "This account does not have access to the Hub." });
        return;
      }
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (q.length < 2) {
        res.json({ q, total: 0, hits: [], counts: {}, more: false, labels: KIND_LABELS });
        return;
      }

      const [content, people, sessions, trends] = await Promise.all([
        data.listContent(),
        data.listPeople(),
        data.listSessions(),
        data.listTrends(),
      ]);

      const result = search(q, {
        content,
        people,
        sessions,
        trends,
        views: (await studio.listViews()).filter((v) => canSeeView(v.audience, v.state, viewer)),
        library,
      });

      res.json({ ...result, labels: KIND_LABELS });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
