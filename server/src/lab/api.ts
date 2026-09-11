import { Router } from "express";
import { canRead, type ViewerRequest } from "../auth.js";
import type { ProofPointLibrary } from "../proofPoints/library.js";
import type { DataSource } from "../types.js";
import { termsOf, weave } from "./weave.js";

/** How much text the canvas may send. A canvas is notes, not a manuscript. */
const MAX_TEXT = 4000;
/** And how many words are worth searching on once it is split up. */
const MAX_TERMS = 24;

/**
 * The Forecast Lab's one endpoint.
 *
 * Read-only and derived entirely from data the caller can already see on
 * other pages — the trend database, the proof point library, the schedule —
 * so it needs no permission of its own beyond being able to read the Hub.
 * Nothing here writes, and nothing here leaves the building.
 */
export function createLabRouter(data: DataSource, library: ProofPointLibrary): Router {
  const router = Router();

  router.post("/lab/weave", async (req: ViewerRequest, res, next) => {
    try {
      const viewer = req.viewer!;
      if (!canRead(viewer)) {
        res.status(403).json({ error: "This account does not have access to the Hub." });
        return;
      }

      const body = (req.body ?? {}) as { text?: unknown; terms?: unknown };
      /*
       * Either shape: the canvas sends its text and we pull the words out, or
       * a caller sends words directly. Bounded before it is split rather than
       * after, so a huge body is refused instead of tokenised.
       */
      let terms: string[] = [];
      if (typeof body.text === "string") {
        terms = termsOf(body.text.slice(0, MAX_TEXT));
      } else if (Array.isArray(body.terms)) {
        terms = body.terms
          .filter((t): t is string => typeof t === "string")
          .flatMap((t) => termsOf(t.slice(0, 200)));
      }
      terms = [...new Set(terms)].slice(0, MAX_TERMS);

      const [trends, content] = await Promise.all([data.listTrends(), data.listContent()]);
      res.json(weave({ terms }, { trends, content, library }));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
