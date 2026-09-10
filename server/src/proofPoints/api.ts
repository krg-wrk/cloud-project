import { Router } from "express";
import { nameId, seesWholeTeam, type Viewer, type ViewerRequest } from "../auth.js";
import type { DataSource } from "../types.js";
import type { ProofPointLibrary } from "./library.js";
import {
  QUALITY_TIERS,
  TIER_MEANING,
  type HubTrends,
  type LibraryQuery,
  type Quality,
} from "./types.js";

/**
 * The proof point library, over HTTP.
 *
 * Filtering happens here rather than in the browser for the reason it always
 * does: ten thousand suggestions carrying 9 MB of rendered markup is not a
 * thing to send to a phone. A page of twenty-four is about 25 KB.
 */

const QUALITIES = new Set(Object.keys(QUALITY_TIERS));

function flag(value: unknown): boolean {
  return value === "1" || value === "true";
}

export function createProofPointRouter(library: ProofPointLibrary, data: DataSource): Router {
  const router = Router();

  /**
   * What the Hub knows about the trends the library has suggestions for.
   *
   * Every one of the library's trends is in the Hub's own trend database
   * under the same id, so this is where title, industries and — the point of
   * it — ownership come from. "My trends" in the library then means exactly
   * what "Mine" means on the Trends page: owned by you, or credited to you.
   * The pipeline's own owner column names an address in a sheet, which is a
   * snapshot and cannot see co-authors at all.
   *
   * `listTrends` is served from the data source's own cache, so this costs a
   * map build rather than a sheet read.
   */
  async function hubTrends(viewer: Viewer): Promise<HubTrends> {
    const mine = new Set([viewer.personId, nameId(viewer.name)].filter(Boolean));
    const out: HubTrends = new Map();
    for (const t of await data.listTrends()) {
      // TREND_ID is not unique on the sheet — an archived earlier version
      // shares it with the live profile — so the live one wins.
      const existing = out.get(t.id);
      if (existing && t.editorStatus === "archived") continue;
      out.set(t.id, {
        id: t.id,
        title: t.title,
        industries: t.industries,
        ownerName: t.ownerName,
        mine: mine.has(t.ownerId) || t.authorIds.some((a) => mine.has(a)),
        profileId: t.profileId,
      });
    }
    return out;
  }

  /** What the library is and what the tiers mean, for the page's own copy. */
  router.get("/proof-points/about", (_req, res) => {
    res.json({
      source: library.source,
      points: library.size,
      trends: library.trendCount,
      tiers: TIER_MEANING,
    });
  });

  /**
   * A page of the library.
   *
   * Every filter is a query parameter, so a filtered library is a link
   * somebody can be sent — which is the whole reason the Hub exists rather
   * than the AppSheet it replaces.
   */
  router.get("/proof-points", async (req: ViewerRequest, res, next) => {
    try {
      const viewer = req.viewer!;
      const q = req.query;
      const quality = String(q.quality ?? "top");

      const query: LibraryQuery = {
        trend: q.trend ? String(q.trend) : undefined,
        /*
         * A forecaster's own trends are the point of the page, so that is
         * where they land; a manager opens on the whole library, because
         * overseeing it is their job. Either way the library has the last
         * word — it downgrades "mine" to everyone's for somebody who owns no
         * trends, rather than showing them an empty page.
         */
        owner:
          q.owner === "mine" || q.owner === "all"
            ? String(q.owner)
            : seesWholeTeam(viewer)
              ? "all"
              : "mine",
        industry: q.industry ? String(q.industry) : undefined,
        forecast: q.forecast ? String(q.forecast) : undefined,
        quality: (QUALITIES.has(quality) ? quality : "top") as Quality,
        approved: flag(q.approved),
        wgsnData: flag(q.wgsnData),
        fresh: flag(q.fresh),
        q: q.q ? String(q.q).slice(0, 120) : undefined,
        page: Number(q.page) > 0 ? Math.floor(Number(q.page)) : 1,
        pageSize: Number(q.pageSize) > 0 ? Math.floor(Number(q.pageSize)) : 24,
      };

      res.json(library.query(query, viewer, viewer.name, await hubTrends(viewer)));
    } catch (err) {
      next(err);
    }
  });

  /** One suggestion, enlarged. Its own address, so it can be sent to someone. */
  router.get("/proof-points/:id", async (req: ViewerRequest, res, next) => {
    try {
      const viewer = req.viewer!;
      const hub = await hubTrends(viewer);
      const row = library.find(req.params.id, viewer, viewer.name, hub);
      if (!row) {
        res.status(404).json({ error: "No proof point with that id." });
        return;
      }
      // The pipeline's own record of the trend, for the figures the Hub does
      // not hold: how many suggestions it has, and how many are top tier.
      const sheet = library.trend(row.trendId);
      const known = hub.get(row.trendId);
      res.json({
        point: row,
        trend: sheet
          ? {
              id: sheet.id,
              // Current where the Hub knows it, the snapshot otherwise.
              title: known?.title ?? sheet.title,
              description: sheet.description,
              industries: known?.industries ?? sheet.industries,
              ownerName: known?.ownerName ?? sheet.ownerName,
              total: sheet.total,
              tierA: sheet.tierA,
              editorUrl: sheet.editorUrl,
              publishedUrl: sheet.publishedUrl,
            }
          : null,
        tierMeaning: TIER_MEANING[row.tier],
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
