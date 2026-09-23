import { Router } from "express";
import { seesWholeTeam, type ViewerRequest } from "./auth.js";
import { FORECAST_GROUPS, alignment, groupFor, type Alignment } from "./plan.js";
import type { CalendarEvent, ContentItem, DataSource, KnowledgeSession } from "./types.js";
import type { HubStore } from "./store.js";

/**
 * The commissioning plan: what each group is forecasting, month by month, and
 * whether the schedule follows the methodology.
 *
 * A page rather than a studio view because its behaviour is specific — the
 * question is not "show me these rows" but "does this row point at the year
 * its level should be working to", which is arithmetic over a lead time no
 * filter can express.
 *
 * Commissioning managers and admins only. Not a secret, but a planning grid
 * shown to a forecaster answers a question they were not asking and invites
 * one they were: it reads as a judgement on their work when it is a judgement
 * on the shape of the schedule. `seesWholeTeam` is the line the rest of the
 * Hub already draws.
 */
export function createPlanRouter(data: DataSource, store: HubStore): Router {
  const router = Router();

  router.get("/plan", async (req: ViewerRequest, res, next) => {
    try {
      const viewer = req.viewer!;
      if (!viewer.active || !seesWholeTeam(viewer)) {
        res.status(403).json({ error: "The commissioning plan is for commissioning managers." });
        return;
      }

      const q = req.query as Record<string, string | undefined>;
      /*
       * Which date the plan is read against, and it is a real choice rather
       * than a preference. Measured from the submission date the grid says
       * whether work was commissioned to the right horizon; measured from the
       * live date it says whether it reached readers at the right one. A
       * piece delayed in subbing is on plan by the first and late by the
       * second, and both are true.
       */
      const against = q.dateField === "submissionDate" ? "submissionDate" : "publicationDate";

      const [content, sessions, events] = await Promise.all([
        data.listContent(),
        q.layers?.includes("workshops") ? data.listSessions() : Promise.resolve([]),
        q.layers?.includes("holidays") ? data.listEvents() : Promise.resolve([]),
      ]);

      const detailsFor = await store.allDetails();
      const rows = content
        .filter((c) => match(c, q))
        .filter((c) => inWindow(c[against], q.from, q.to))
        .map((item) => {
          const verdict = alignment(
            { ...item, publicationDate: item[against] },
            detailsFor[item.id],
          );
          return {
            id: item.id,
            title: item.title,
            type: item.type,
            vertical: item.vertical,
            category: item.forecastCategory ?? null,
            forecasterId: item.forecasterId,
            date: item[against],
            groupId: groupFor(item.type)?.id ?? null,
            horizon: verdict.horizon?.label ?? null,
            horizonYear: verdict.horizon?.year ?? null,
            source: verdict.source ?? null,
            expected: verdict.expected ?? null,
            alignment: verdict.alignment,
          };
        });

      const tally: Record<Alignment, number> = {
        "on-plan": 0,
        early: 0,
        late: 0,
        untagged: 0,
        "no-lead": 0,
      };
      for (const r of rows) tally[r.alignment] += 1;

      res.json({
        against,
        groups: FORECAST_GROUPS.map((g) => ({ id: g.id, name: g.name })),
        rows,
        tally,
        /*
         * Only the two layers a plan is read against. Leave and activity days
         * were deliberately left out: they answer who is available rather
         * than what the team is forecasting, and on a real sheet they are two
         * thousand rows that would bury the plan they were meant to annotate.
         */
        workshops: sessions.map(thin),
        holidays: events.filter((e) => e.type === "public-holiday").map(thinEvent),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

const thin = (s: KnowledgeSession) => ({
  id: s.id,
  title: s.title,
  kind: s.kind,
  startDate: s.startDate,
  endDate: s.endDate,
});

const thinEvent = (e: CalendarEvent) => ({
  id: e.id,
  title: e.title,
  region: e.region ?? null,
  startDate: e.startDate,
  endDate: e.endDate,
});

/** Every filter the grid offers, each absent unless asked for. */
function match(item: ContentItem, q: Record<string, string | undefined>): boolean {
  if (q.type && item.type !== q.type) return false;
  if (q.vertical && item.vertical !== q.vertical) return false;
  if (q.category && (item.forecastCategory ?? "") !== q.category) return false;
  if (q.forecaster && item.forecasterId !== q.forecaster) {
    // Credited counts as theirs here too, the way it does everywhere else.
    if (!(item.contributorIds ?? []).includes(q.forecaster)) return false;
  }
  if (q.group && (groupFor(item.type)?.id ?? "") !== q.group) return false;
  return true;
}

function inWindow(date: string, from?: string, to?: string): boolean {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}
