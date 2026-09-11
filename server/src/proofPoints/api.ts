import { Router } from "express";
import {
  canWriteTrend,
  nameId,
  seesWholeTeam,
  type Viewer,
  type ViewerRequest,
} from "../auth.js";
import type { HubStore } from "../store.js";
import type { DataSource, TrendProfile } from "../types.js";
import type { ProofPointLibrary } from "./library.js";
import {
  QUALITY_TIERS,
  REJECTION_REASONS,
  TIER_MEANING,
  type HeldDecisions,
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

export function createProofPointRouter(
  library: ProofPointLibrary,
  data: DataSource,
  store: HubStore,
): Router {
  const router = Router();

  /**
   * The decisions the Hub holds, as the library wants them.
   *
   * Read whole on each request. That sounds wasteful and is not: it is one
   * query returning a few thousand small rows at most, against laying them
   * over ten thousand suggestions — and doing it per request is what makes a
   * decision take effect everywhere the moment it is made.
   */
  function held(): HeldDecisions {
    const out: HeldDecisions = new Map();
    for (const [id, d] of store.proofPointDecisions()) {
      out.set(id, {
        decision: d.decision,
        reason: d.reason,
        byEmail: d.byEmail,
        byOwner: d.byOwner,
        decidedAt: d.decidedAt,
      });
    }
    return out;
  }

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
      extractedAt: library.extractedAt ?? null,
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

      res.json(library.query(query, viewer, viewer.name, await hubTrends(viewer), held()));
    } catch (err) {
      next(err);
    }
  });

  /* --- The review queue --------------------------------------------------
   *
   * The other half of the proof of concept, and the half that makes the
   * library mean anything: without it every suggestion reads "In review"
   * forever. One card at a time, best match first, scoped to the trends the
   * reviewer is responsible for.
   */

  /**
   * Whether this person may decide about this trend's suggestions.
   *
   * The same rule as writing anything else against a trend profile — the
   * owner, anyone credited on it, an admin, or a manager whose verticals
   * overlap the industries it is tagged to. Reusing `canWriteTrend` rather
   * than writing a second rule means the two cannot drift, and it is the rule
   * the team has already agreed to.
   */
  async function trendFor(trendId: string): Promise<TrendProfile | undefined> {
    const all = await data.listTrends();
    return (
      all.find((t) => t.id === trendId && t.editorStatus !== "archived") ??
      all.find((t) => t.id === trendId)
    );
  }

  async function mayDecide(viewer: Viewer, trendId: string): Promise<string | null> {
    const trend = await trendFor(trendId);
    if (!trend) {
      // No profile in the Hub to check against, so there is no owner and no
      // rule to apply. Admins only, rather than nobody or everybody.
      return viewer.role === "admin"
        ? null
        : "The Hub does not hold that trend profile, so only an admin can decide about it.";
    }
    if (canWriteTrend(viewer, trend, viewer.name)) return null;
    return (
      `"${trend.title}" belongs to ${trend.ownerName || "somebody else"}. ` +
      "Its owner, anyone credited on it, a manager for its industries or an admin can decide."
    );
  }

  /** What is waiting, and the first few of them. */
  router.get("/proof-points/review", async (req: ViewerRequest, res, next) => {
    try {
      const viewer = req.viewer!;
      const q = req.query;
      const quality = String(q.quality ?? "top");
      const hub = await hubTrends(viewer);
      const page = library.queue(
        {
          trend: q.trend ? String(q.trend) : undefined,
          // A reviewer's own trends are the point; everything else is
          // deliberate. Unlike the library this does not fall back, because
          // reviewing somebody else's trend is a different act.
          owner: q.owner === "all" ? "all" : "mine",
          quality: (QUALITIES.has(quality) ? quality : "top") as Quality,
          take: Number(q.take) > 0 ? Math.floor(Number(q.take)) : 6,
        },
        viewer,
        viewer.name,
        hub,
        held(),
      );

      /*
       * Which of the trends in front of them they may actually decide about.
       * Sent with the queue so the page can say so on the card rather than
       * only when somebody presses Approve.
       */
      const trends = await data.listTrends();
      const decidable = new Set(
        trends.filter((t) => canWriteTrend(viewer, t, viewer.name)).map((t) => t.id),
      );

      res.json({
        ...page,
        rows: page.rows.map((row) => ({
          ...row,
          canDecide: viewer.role === "admin" || decidable.has(row.trendId),
        })),
        reasons: REJECTION_REASONS,
        /** How many the person has decided in the Hub, ever. */
        yours: store.recentProofPointDecisions(viewer.email, 200).length,
      });
    } catch (err) {
      next(err);
    }
  });

  /** Approve or reject one. */
  router.post("/proof-points/:id/decision", async (req: ViewerRequest, res, next) => {
    try {
      const viewer = req.viewer!;
      const point = library.point(req.params.id);
      if (!point) {
        res.status(404).json({ error: "No proof point with that id." });
        return;
      }
      const body = (req.body ?? {}) as { decision?: unknown; reason?: unknown };
      if (body.decision !== "approve" && body.decision !== "reject") {
        res.status(400).json({ error: "A decision is either approve or reject." });
        return;
      }
      const no = await mayDecide(viewer, point.trendId);
      if (no) {
        res.status(403).json({ error: no });
        return;
      }

      /*
       * A free-typed reason is allowed as well as the offered ones — the
       * offered list is a shortcut, not a vocabulary — but it is capped and
       * stored as text, never interpreted.
       */
      const reason =
        typeof body.reason === "string" && body.reason.trim()
          ? body.reason.trim().slice(0, 300)
          : undefined;

      const trend = await trendFor(point.trendId);
      const mine = new Set([viewer.personId, nameId(viewer.name)].filter(Boolean));
      res.json(
        store.decideProofPoint({
          suggestionId: point.id,
          trendId: point.trendId,
          calloutId: point.calloutId,
          decision: body.decision,
          reason: body.decision === "reject" ? reason : undefined,
          byEmail: viewer.email,
          byPersonId: viewer.personId,
          byOwner: Boolean(trend && mine.has(trend.ownerId)),
        }),
      );
    } catch (err) {
      next(err);
    }
  });

  /** Take a decision back. */
  router.delete("/proof-points/:id/decision", async (req: ViewerRequest, res, next) => {
    try {
      const viewer = req.viewer!;
      const point = library.point(req.params.id);
      if (!point) {
        res.status(404).json({ error: "No proof point with that id." });
        return;
      }
      const no = await mayDecide(viewer, point.trendId);
      if (no) {
        res.status(403).json({ error: no });
        return;
      }
      if (!store.undecideProofPoint(point.id)) {
        /*
         * The extract carries decisions of its own, made before the Hub
         * existed. There is nothing here to take back, and quietly appearing
         * to succeed would be worse than saying so.
         */
        res.status(409).json({
          error: point.decision
            ? "That decision came with the extract rather than being made here, so it cannot be undone in the Hub."
            : "Nothing to undo — no decision has been made about that one.",
        });
        return;
      }
      res.json({ undone: point.id });
    } catch (err) {
      next(err);
    }
  });

  /** One suggestion, enlarged. Its own address, so it can be sent to someone. */
  router.get("/proof-points/:id", async (req: ViewerRequest, res, next) => {
    try {
      const viewer = req.viewer!;
      const hub = await hubTrends(viewer);
      const row = library.find(req.params.id, viewer, viewer.name, hub, held());
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
