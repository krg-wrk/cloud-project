import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { Viewer } from "../auth.js";
import { sanitiseProofPointHtml } from "./sanitise.js";
import {
  QUALITY_TIERS,
  type AlsoMatch,
  type HeldDecisions,
  type HubTrend,
  type HubTrends,
  type LibraryPage,
  type LibraryQuery,
  type ProofPoint,
  type ProofPointRow,
  type ProofPointTrend,
  type Quality,
} from "./types.js";

/**
 * The proof point library.
 *
 * Ten thousand suggestions across three hundred and fifty trends, held in
 * memory and filtered per request. That is the right shape for this: the file
 * is written by a pipeline that runs weekly, nobody edits it through the Hub,
 * and every filter the page offers is a scan over ten thousand small objects
 * — which is microseconds, and far less machinery than a query language.
 *
 * The seed is gzipped because the rendered proof points are 9 MB of markup on
 * their own. It is read and expanded once, at boot.
 */

interface SeedFile {
  source?: string;
  /** When this extract was taken from the workbook. */
  extractedAt?: string;
  trends: ProofPointTrend[];
  points: ProofPoint[];
}

/**
 * Where the seed sits. `import.meta.dirname` is the built file's own folder,
 * so this resolves the same in `src` under tsx and in `dist` under node.
 */
const SEED = path.resolve(import.meta.dirname, "../data/proofPoints.json.gz");

export class ProofPointLibrary {
  readonly source: string;
  /**
   * When the extract was taken.
   *
   * Not when the matching ran — the workbook does not record that — and the
   * Hub says which of the two it is rather than implying the stronger one.
   */
  readonly extractedAt?: string;
  private readonly points: ProofPoint[];
  private readonly trends = new Map<string, ProofPointTrend>();
  /** Lower-cased text per point, built once, for the search box. */
  private readonly haystack = new Map<string, string>();

  constructor(file: string = SEED) {
    let seed: SeedFile;
    try {
      seed = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")) as SeedFile;
    } catch (err) {
      // A missing or unreadable seed leaves an empty library rather than
      // stopping the Hub: every other page still works without it.
      console.error(`Proof points not loaded from ${file}:`, (err as Error).message);
      this.points = [];
      this.source = "not loaded";
      return;
    }

    for (const trend of seed.trends) this.trends.set(trend.id, trend);

    // Sanitising here means it happens once per boot rather than once per
    // request, and — more to the point — that no path exists to the client
    // that skips it.
    this.points = seed.points.map((p) => ({ ...p, html: sanitiseProofPointHtml(p.html) }));

    for (const p of this.points) {
      const trend = this.trends.get(p.trendId);
      this.haystack.set(
        p.id,
        [p.text, trend?.title, p.forecastTitle, p.whyClaude, p.whyGemini]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      );
    }

    this.source = seed.source ?? "seed";
    this.extractedAt = seed.extractedAt;
  }

  get size(): number {
    return this.points.length;
  }

  get trendCount(): number {
    return this.trends.size;
  }

  /**
   * Suggestions whose text carries every one of these words.
   *
   * For the one search box, which needs a cheap answer over ten thousand
   * callouts and does not need the reasoning or the rendered markup — so
   * this reads `text` alone and returns the least it can. Best match first,
   * because that is the only ordering the library has that means anything
   * for a free-text query.
   *
   * Stops as soon as it has `take`, which is what keeps it cheap: a common
   * word like "growth" matches thousands and the box shows four.
   */
  textSearch(
    terms: string[],
    take: number,
  ): { id: string; text: string; trendTitle: string; match: number }[] {
    if (!terms.length) return [];
    const out: { id: string; text: string; trendTitle: string; match: number }[] = [];
    const ranked = [...this.points].sort((a, b) => b.match - a.match);
    for (const p of ranked) {
      if (out.length >= take) break;
      const haystack = p.text.toLowerCase();
      if (!terms.every((t) => haystack.includes(t))) continue;
      out.push({
        id: p.id,
        text: p.text,
        trendTitle: this.trends.get(p.trendId)?.title ?? p.trendId,
        match: p.match,
      });
    }
    return out;
  }

  /**
   * How many suggestions each trend has waiting on a decision.
   *
   * Keyed on the trend rather than on a person, because the library has no
   * idea who owns anything — the Hub's own trend database does, and the
   * caller joins the two. `decided` is the set of suggestion ids the Hub
   * holds a decision for, which outranks the extract's own.
   *
   * Counts what the review queue would actually offer: top tiers only,
   * nothing already cited in the profile. A figure counted over the whole
   * extract would tell somebody they had four hundred to get through when
   * the queue will show them twelve.
   */
  waitingByTrend(decided: Set<string>): Record<string, number> {
    const tiers = new Set(QUALITY_TIERS.top);
    const out: Record<string, number> = {};
    for (const p of this.points) {
      if (!tiers.has(p.tier)) continue;
      if (p.alreadyKnown) continue;
      if (decided.has(p.id) || p.decision) continue;
      out[p.trendId] = (out[p.trendId] ?? 0) + 1;
    }
    return out;
  }

  /**
   * A trend as the Hub knows it, falling back to the pipeline's snapshot.
   *
   * The Hub is the authority when it has the trend: its title is current, its
   * industries are current, and — the reason this exists — it knows ownership
   * as person records rather than as an address typed into a sheet, so "my
   * trends" here means the same set as "mine" on the Trends page.
   */
  private facts(
    id: string,
    viewer: Viewer,
    name?: string,
    hub?: HubTrends,
  ): HubTrend & { publishedUrl?: string } {
    const known = hub?.get(id);
    const sheet = this.trends.get(id);
    if (known) return { ...known, publishedUrl: sheet?.publishedUrl };
    return {
      id,
      title: sheet?.title ?? id,
      industries: sheet?.industries ?? [],
      ownerName: sheet?.ownerName ?? "",
      // No Hub record: the sheet's own owner column is all there is. It names
      // an address, which the Hub's accounts are keyed on too.
      mine: Boolean(
        sheet &&
          ((sheet.ownerEmail && sheet.ownerEmail === viewer.email.toLowerCase()) ||
            (name && sheet.ownerName && sheet.ownerName.toLowerCase() === name.toLowerCase())),
      ),
      profileId: "",
      publishedUrl: sheet?.publishedUrl,
    };
  }

  /** A point with its trend's details, and the also-matches given their titles. */
  private row(
    point: ProofPoint,
    viewer: Viewer,
    name?: string,
    hub?: HubTrends,
    held?: HeldDecisions,
  ): ProofPointRow {
    const trend = this.facts(point.trendId, viewer, name, hub);
    const also: AlsoMatch[] | undefined = point.alsoMatches?.map((a) => {
      const other = this.facts(a.trendId, viewer, name, hub);
      return { ...a, title: other.title, url: other.publishedUrl };
    });
    // A decision made in the Hub replaces whatever the extract was carrying.
    const mine = held?.get(point.id);
    return {
      ...point,
      ...(mine
        ? {
            decision: mine.decision,
            decidedAt: mine.decidedAt,
            decidedByOwner: mine.byOwner,
            reason: mine.reason,
            decidedHere: true,
          }
        : {}),
      alsoMatches: also,
      trendTitle: trend.title,
      industries: trend.industries,
      ownerName: trend.ownerName,
      mine: trend.mine,
      profileId: trend.profileId || undefined,
    };
  }

  /** One suggestion, for the enlarged view. */
  find(
    id: string,
    viewer: Viewer,
    name?: string,
    hub?: HubTrends,
    held?: HeldDecisions,
  ): ProofPointRow | undefined {
    const point = this.points.find((p) => p.id === id);
    return point ? this.row(point, viewer, name, hub, held) : undefined;
  }

  /** The extract's own record of a suggestion, for the decide route. */
  point(id: string): ProofPoint | undefined {
    return this.points.find((p) => p.id === id);
  }

  /**
   * The next few suggestions waiting on a decision.
   *
   * Deliberately a short window rather than the whole queue. A reviewer is
   * looking at one card and about to look at the next, so the client wants
   * the one it is showing plus enough to make the arrow keys feel instant —
   * not two hundred cards of rendered markup it will mostly never draw.
   *
   * Ordered best match first, which is the order worth spending attention
   * in: a reviewer who does ten of these has done the ten that mattered.
   */
  queue(
    q: { trend?: string; owner?: string; quality?: Quality; take?: number },
    viewer: Viewer,
    name?: string,
    hub?: HubTrends,
    held?: HeldDecisions,
  ): {
    total: number;
    rows: ProofPointRow[];
    decided: { approved: number; rejected: number };
    /** Already cited in the profile, so there is nothing to decide. */
    cited: number;
  } {
    const tiers = new Set(QUALITY_TIERS[(q.quality ?? "top") as Quality] ?? QUALITY_TIERS.top);
    const take = Math.min(Math.max(q.take ?? 6, 1), 24);

    const known = new Map<string, HubTrend>();
    const about = (trendId: string) => {
      let hit = known.get(trendId);
      if (!hit) {
        hit = this.facts(trendId, viewer, name, hub);
        known.set(trendId, hit);
      }
      return hit;
    };
    const decisionOf = (p: ProofPoint) => held?.get(p.id)?.decision ?? p.decision;

    /** In the filters, whatever their state — the denominator. */
    const considered = this.points.filter((p) => {
      if (!tiers.has(p.tier)) return false;
      if (q.trend && p.trendId !== q.trend) return false;
      if (q.owner === "mine" && !about(p.trendId).mine) return false;
      return true;
    });

    /*
     * Already cited in the profile, so there is nothing to decide: the answer
     * is yes and has been for a while. Reviewing them would be the first
     * couple of hundred cards of the queue, and would teach a reviewer that
     * the queue wastes their time. Narrowed from `considered` rather than
     * filtered again, so the two cannot drift apart and the page's arithmetic
     * — waiting plus cited plus decided — holds by construction.
     */
    const inScope = considered.filter((p) => !p.alreadyKnown);

    const waiting = inScope
      .filter((p) => !decisionOf(p))
      .sort(
        (a, b) =>
          b.match - a.match || a.trendId.localeCompare(b.trendId) || a.id.localeCompare(b.id),
      );

    return {
      total: waiting.length,
      rows: waiting.slice(0, take).map((p) => this.row(p, viewer, name, hub, held)),
      cited: considered.filter((p) => p.alreadyKnown).length,
      decided: {
        approved: inScope.filter((p) => decisionOf(p) === "approve").length,
        rejected: inScope.filter((p) => decisionOf(p) === "reject").length,
      },
    };
  }

  /** The trend a suggestion belongs to, for the detail panel. */
  trend(id: string): ProofPointTrend | undefined {
    return this.trends.get(id);
  }

  /**
   * Filter, count and page.
   *
   * The counts and the pickers are worked out against everything *except*
   * the filter they describe, which is the difference between a filter row
   * that helps and one that dead-ends: the industry chips stay clickable
   * when a forecast year is already chosen.
   */
  query(
    q: LibraryQuery,
    viewer: Viewer,
    name?: string,
    hub?: HubTrends,
    held?: HeldDecisions,
  ): LibraryPage {
    const pageSize = Math.min(Math.max(q.pageSize ?? 24, 1), 96);
    const page = Math.max(q.page ?? 1, 1);
    const tiers = new Set(QUALITY_TIERS[(q.quality ?? "top") as Quality] ?? QUALITY_TIERS.top);
    const needle = (q.q ?? "").trim().toLowerCase();

    // Resolved once per trend rather than once per suggestion: three hundred
    // and fifty lookups instead of ten thousand.
    const known = new Map<string, HubTrend>();
    const about = (trendId: string) => {
      let hit = known.get(trendId);
      if (!hit) {
        hit = this.facts(trendId, viewer, name, hub);
        known.set(trendId, hit);
      }
      return hit;
    };
    const isMine = (p: ProofPoint) => about(p.trendId).mine;
    /*
     * Where the Hub holds a decision it is the decision. Everything that
     * reads one goes through here — the approved filter, the counts, the
     * review queue — so a decision made in the Hub takes effect everywhere
     * at once rather than only where somebody remembered to look for it.
     */
    const decisionOf = (p: ProofPoint) => held?.get(p.id)?.decision ?? p.decision;

    /*
     * Whether "my trends" can match anything at all.
     *
     * A person who owns no trend with a suggestion against it would land on
     * an empty page every time they opened the library, which reads as a
     * fault rather than as a fact. So they get everyone's instead, and the
     * response says which filter was applied. Somebody who *does* own trends
     * still sees an empty page when their other filters exclude them all —
     * that is a real answer, and the page tells them to widen.
     */
    const mineAll = this.points.filter(isMine).length;
    const owner: "mine" | "all" = q.owner === "mine" && mineAll > 0 ? "mine" : "all";

    /** Every test except the named one, so a facet can count without itself. */
    const passes = (p: ProofPoint, skip?: "industry" | "forecast" | "trend" | "quality") => {
      if (skip !== "quality" && !tiers.has(p.tier)) return false;
      if (skip !== "trend" && q.trend && p.trendId !== q.trend) return false;
      if (owner === "mine" && !isMine(p)) return false;
      if (q.approved && decisionOf(p) !== "approve") return false;
      if (q.wgsnData && !p.wgsnData) return false;
      if (q.fresh && p.alreadyKnown) return false;
      if (skip !== "forecast" && q.forecast && p.forecastTag !== q.forecast) return false;
      if (skip !== "industry" && q.industry && !about(p.trendId).industries.includes(q.industry)) {
        return false;
      }
      if (needle && !(this.haystack.get(p.id) ?? "").includes(needle)) return false;
      return true;
    };

    const matched = this.points.filter((p) => passes(p));
    // Best match first, then the trend, then the suggestion's own order —
    // which is the order the pipeline wrote them, so a trend's proof points
    // stay together and in the sequence its owner reviewed them.
    matched.sort(
      (a, b) => b.match - a.match || a.trendId.localeCompare(b.trendId) || a.id.localeCompare(b.id),
    );

    const start = (page - 1) * pageSize;
    const rows = matched
      .slice(start, start + pageSize)
      .map((p) => this.row(p, viewer, name, hub, held));

    /*
     * The chip filters.
     *
     * Every value the library holds, always, with the count each would leave
     * given the *other* filters. Counting without the chip's own filter is
     * what makes the row usable — with Beauty chosen, the industry chips
     * still say what choosing Interiors instead would give you, rather than
     * all reading zero.
     */
    const industryTotals = new Map<string, number>();
    const forecastTotals = new Map<string, number>();
    for (const p of this.points) {
      for (const industry of about(p.trendId).industries) {
        if (!industryTotals.has(industry)) industryTotals.set(industry, 0);
      }
      if (!forecastTotals.has(p.forecastTag)) forecastTotals.set(p.forecastTag, 0);
    }
    for (const p of this.points.filter((x) => passes(x, "industry"))) {
      for (const industry of about(p.trendId).industries) {
        industryTotals.set(industry, (industryTotals.get(industry) ?? 0) + 1);
      }
    }
    for (const p of this.points.filter((x) => passes(x, "forecast"))) {
      forecastTotals.set(p.forecastTag, (forecastTotals.get(p.forecastTag) ?? 0) + 1);
    }

    const perTrend = new Map<string, number>();
    for (const p of this.points.filter((x) => passes(x, "trend"))) {
      perTrend.set(p.trendId, (perTrend.get(p.trendId) ?? 0) + 1);
    }

    return {
      total: matched.length,
      page,
      pageSize,
      rows,
      owner,
      counts: {
        all: this.points.length,
        approved: matched.filter((p) => decisionOf(p) === "approve").length,
        wgsnData: matched.filter((p) => p.wgsnData).length,
        mine: matched.filter(isMine).length,
        mineAll,
      },
      trends: [...perTrend.entries()]
        .map(([id, total]) => {
          const trend = about(id);
          return { id, title: trend.title, total, mine: trend.mine };
        })
        .sort((a, b) => a.title.localeCompare(b.title)),
      industries: [...industryTotals.entries()]
        .map(([value, total]) => ({ value, total }))
        .sort((a, b) => a.value.localeCompare(b.value)),
      /*
       * The years in order, then everything else alphabetically after them.
       * "Forecasting pre-2028" carries a year but is not one of them — it
       * means "already past" — so matching a bare four digits would file it
       * between 2028 and 2029, which is the wrong end of the row.
       */
      forecasts: [...forecastTotals.entries()]
        .map(([value, total]) => ({ value, total }))
        .sort((a, b) => {
          const year = (s: string) => Number(/^Forecast (\d{4})$/.exec(s)?.[1] ?? 9999);
          return year(a.value) - year(b.value) || a.value.localeCompare(b.value);
        }),
    };
  }
}
