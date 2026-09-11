import type { ProofPointLibrary } from "../proofPoints/library.js";
import type { ContentItem, TrendProfile } from "../types.js";

/**
 * Red-threading: what the Hub already holds on the thing you are building.
 *
 * The Forecast Builder's Pulse step asks this. The question a forecaster
 * actually has when they start is not "write me a forecast" — it is *has
 * anybody already said this, and did they say the opposite?* Nobody wants to
 * publish a Test call on a trend a colleague called Invest three weeks ago,
 * and nobody finds that out from a blank document.
 *
 * So this searches the Hub's own corpus — the trend database, the proof point
 * library, the published forecasts — and reports three things: what supports
 * the idea, what has already argued it, and where the existing calls disagree
 * with each other. It is retrieval and arithmetic over our own data, not
 * generation, which is deliberate: the useful half of this job can be done
 * without a model at all, and doing it without one means the answer can always
 * be walked back to a row somebody can open.
 *
 * The generative half — the prose, the summary, the "here is how these hang
 * together" — is where WGSN's own Pulse would sit. That is not wired up here
 * and the page says so rather than implying it.
 */

/** The strategic calls, ordered by how much commitment each asks for. */
const CALL_ORDER = ["Protect", "Test", "Expand", "Invest"] as const;

export interface WeaveRequest {
  /** The words the canvas is about, gathered from its source nodes. */
  terms: string[];
  /** Narrow to one industry, where the canvas names one. */
  industry?: string;
}

export interface WeaveTrend {
  id: string;
  profileId: string;
  title: string;
  call?: string;
  ownerName: string;
  published: boolean;
  industries: string[];
  /** How many of the search terms this profile carried. */
  matched: number;
}

export interface WeaveProof {
  id: string;
  text: string;
  trendId: string;
  trendTitle: string;
  match: number;
  /** Other trends the same callout is matched to. */
  alsoOn: string[];
}

export interface WeaveForecast {
  id: string;
  title: string;
  format: string;
  vertical: string;
  status: string;
  forecasterId: string;
}

export interface WeaveResult {
  terms: string[];
  trends: WeaveTrend[];
  proofPoints: WeaveProof[];
  forecasts: WeaveForecast[];
  /**
   * Where the existing calls do not agree with each other.
   *
   * The one finding here that a search box cannot give you: two live profiles
   * on overlapping ground, called differently. It is the thing worth knowing
   * before writing, and it is arithmetic rather than judgement.
   */
  tensions: { a: WeaveTrend; b: WeaveTrend; note: string }[];
  counts: { trends: number; proofPoints: number; forecasts: number };
  /**
   * The terms the proof point search actually used.
   *
   * Shorter than `terms` when every word together found nothing and the
   * search was loosened. Reported rather than hidden, so a forecaster reading
   * six proof points knows whether they answer the whole canvas or one word
   * of it — which is the difference between evidence and a coincidence.
   */
  proofTerms: string[];
  /** How many terms a row had to carry to be counted here. */
  threshold: number;
}

/** Lower-cased words of two characters or more, de-duplicated. */
export function termsOf(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9&']+/)) {
    if (raw.length >= 2 && !STOP.has(raw)) seen.add(raw);
  }
  return [...seen];
}

/**
 * Words too common to narrow anything, so a canvas mentioning "the consumer"
 * does not match the entire database on "the".
 */
const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "are", "was", "were",
  "has", "have", "had", "will", "would", "can", "could", "its", "their", "our",
  "into", "onto", "over", "under", "more", "most", "less", "than", "then",
  "but", "not", "all", "any", "how", "why", "what", "when", "who",
  /*
   * The short ones matter as much as the long ones, and for a second reason
   * beyond matching noise: every junk term raises the threshold, because the
   * bar is a fraction of how many terms there are. "Collagen stacking in APAC
   * skincare, searches up 44% YoY" scored ten terms, four of which were "in",
   * "up", "44" and "yoy" — so a row had to carry three of the six real ones
   * instead of two, and genuinely relevant forecasts dropped out.
   */
  "in", "on", "at", "to", "of", "as", "by", "up", "out", "off", "it", "is",
  "be", "or", "if", "so", "no", "do", "we", "us", "you", "an", "per", "via",
  "yoy", "vs",
]);

/** How many of `terms` appear anywhere in `text`. */
function hits(text: string, terms: string[]): number {
  const hay = text.toLowerCase();
  return terms.filter((t) => hay.includes(t)).length;
}

/**
 * How many terms a row has to carry to count as a match.
 *
 * Two, once there are two to have. One term is not a match when there are
 * several: a canvas about "collagen barrier skincare" matched 183 trend
 * profiles on the word "beauty" alone, which is a list of the department
 * rather than an answer.
 *
 * Asking for *half* the terms was the first try and it overcorrected as soon
 * as the stop words were cleaned up: six specific words meant a profile had
 * to carry three of them, and the same canvas fell from 183 profiles to one.
 * A forecaster writing a fuller canvas should not get fewer answers for it.
 *
 * So the bar is flat, and the ranking does the rest — title matches first,
 * then how much of the canvas each row carries. Flooding is a problem of what
 * is *shown*, and only eight are ever shown.
 */
function bar(terms: number): number {
  return Math.min(2, terms);
}

/**
 * Proof points for these terms, loosening until something comes back.
 *
 * The library's own search asks for every word, which is right for a search
 * box — you typed them, you meant them — and wrong here, where the terms were
 * scraped off a canvas and nothing wrote them to be a query. Every word
 * together usually finds nothing, so the loosening is the normal path rather
 * than the exception, and it has to loosen *well*.
 *
 * Longest-word-first was the first attempt and it was poor: on a canvas about
 * "collagen barrier skincare" it fell back to "ingredient", the longest word
 * and very nearly the least distinctive, and returned six proof points about
 * textured snacks. Length is not rarity.
 *
 * So instead: search each term separately, pool what comes back, and rank the
 * pool by how much of the canvas each proof point actually carries — how many
 * terms are in its text, and whether it belongs to a trend the canvas already
 * matched. A proof point on a trend we are looking at, carrying three of the
 * words, beats one that carries a long word and nothing else.
 */
function proofsFor(
  library: { textSearch: (t: string[], n: number) => ProofHit[] },
  terms: string[],
  take: number,
  /** Titles of the trends this canvas matched, which the pool is ranked against. */
  matchedTrendTitles: Set<string>,
): { hits: ProofHit[]; usedTerms: string[] } {
  const all = library.textSearch(terms, take);
  if (all.length) return { hits: all, usedTerms: terms };

  const pool = new Map<string, ProofHit>();
  const used: string[] = [];
  for (const term of terms) {
    const found = library.textSearch([term], take * 2);
    if (found.length) used.push(term);
    for (const hit of found) if (!pool.has(hit.id)) pool.set(hit.id, hit);
  }

  const scored = [...pool.values()]
    .map((hit) => ({
      hit,
      carries: hits(hit.text, terms),
      onTopic: matchedTrendTitles.has(hit.trendTitle) ? 1 : 0,
    }))
    .sort(
      (a, b) => b.onTopic - a.onTopic || b.carries - a.carries || b.hit.match - a.hit.match,
    );

  return { hits: scored.slice(0, take).map((s) => s.hit), usedTerms: used };
}

type ProofHit = { id: string; text: string; trendTitle: string; match: number };

export function weave(
  req: WeaveRequest,
  corpus: { trends: TrendProfile[]; content: ContentItem[]; library: ProofPointLibrary },
): WeaveResult {
  const terms = req.terms.map((t) => t.toLowerCase()).filter((t) => t.length >= 2);
  if (!terms.length) {
    return {
      terms,
      trends: [],
      proofPoints: [],
      forecasts: [],
      tensions: [],
      counts: { trends: 0, proofPoints: 0, forecasts: 0 },
      proofTerms: [],
      threshold: 0,
    };
  }

  /* ---- Trend profiles -------------------------------------------------- */

  const need = bar(terms.length);
  const scoredTrends = corpus.trends
    .map((t) => ({
      trend: t,
      /*
       * Distinct terms, counted over the whole profile at once.
       *
       * Scoring the title and the body separately and adding them was the
       * first try, and it let one word clear a threshold of two: "Beauty
       * Thing" has "beauty" in its title *and* in its industries, which
       * scored 2 for a single term the canvas mentioned once. The threshold
       * is about how much of the canvas a profile covers, so it has to count
       * terms, not occurrences.
       */
      matched: hits(
        [t.title, t.description, t.needToKnow, t.types.join(" "), t.industries.join(" ")].join(" "),
        terms,
      ),
      /* Ranking only: a profile *called* "Collagen Stacking" is more about
         collagen than one that mentions it in paragraph four. */
      titleHits: hits(t.title, terms),
    }))
    .filter((s) => s.matched >= need)
    .sort(
      (a, b) =>
        b.titleHits - a.titleHits ||
        b.matched - a.matched ||
        a.trend.title.localeCompare(b.trend.title),
    );

  const asWeaveTrend = (s: { trend: TrendProfile; matched: number }): WeaveTrend => ({
    id: s.trend.id,
    profileId: s.trend.profileId,
    title: s.trend.title,
    call: s.trend.call,
    ownerName: s.trend.ownerName,
    /*
     * Anchored, because "Unpublished" contains "published" — an unanchored
     * test marked every draft as live, which would have had the tension
     * finder interrupting people over profiles nobody can read.
     */
    published: /^\s*published\s*$/i.test(s.trend.published ?? ""),
    industries: s.trend.industries,
    matched: s.matched,
  });

  const trends = scoredTrends.slice(0, 8).map(asWeaveTrend);

  /* ---- Where the existing calls disagree -------------------------------- */

  /*
   * Only live profiles, and only pairs that share an industry: two trends
   * called differently in unrelated categories is not a tension, it is just
   * two trends. Capped at three, because the point is to raise the question
   * rather than to produce a report nobody reads.
   */
  const tensions: WeaveResult["tensions"] = [];
  const live = scoredTrends.map(asWeaveTrend).filter((t) => t.published && t.call);
  for (let i = 0; i < live.length && tensions.length < 3; i++) {
    for (let j = i + 1; j < live.length && tensions.length < 3; j++) {
      const a = live[i];
      const b = live[j];
      if (a.call === b.call) continue;
      const shared = a.industries.filter((x) => b.industries.includes(x));
      if (!shared.length) continue;
      const gap = Math.abs(
        CALL_ORDER.indexOf(a.call as (typeof CALL_ORDER)[number]) -
          CALL_ORDER.indexOf(b.call as (typeof CALL_ORDER)[number]),
      );
      // Adjacent calls are a nuance; two steps apart is a disagreement.
      if (gap < 2) continue;
      tensions.push({
        a,
        b,
        note: `Both live in ${shared[0]}, called ${a.call} and ${b.call}.`,
      });
    }
  }

  /* ---- Proof points ----------------------------------------------------- */

  /*
   * Asked for more than are shown, because the same callout is matched to
   * several trends and arrives as several rows. Six results that are really
   * three facts said twice reads as a bug, so they are collapsed on their
   * text and the extra trends are named on the one that survives — which is
   * more useful anyway: "this figure is already cited against three of your
   * trends" is the interesting version.
   */
  const proof = proofsFor(
    corpus.library,
    terms,
    18,
    new Set(scoredTrends.map((s) => s.trend.title)),
  );

  const bySame = new Map<string, WeaveProof>();
  for (const p of proof.hits) {
    const key = p.text.trim().toLowerCase();
    const already = bySame.get(key);
    if (already) {
      if (!already.alsoOn.includes(p.trendTitle)) already.alsoOn.push(p.trendTitle);
      continue;
    }
    bySame.set(key, {
      id: p.id,
      text: p.text,
      trendId: "",
      trendTitle: p.trendTitle,
      match: p.match,
      alsoOn: [],
    });
  }
  const proofPoints: WeaveProof[] = [...bySame.values()].slice(0, 6);

  /* ---- Forecasts that have already covered this ground ------------------ */

  const scoredForecasts = corpus.content
    .map((c) => ({
      item: c,
      matched: hits([c.title, c.type, c.vertical, c.season].join(" "), terms),
      titleHits: hits(c.title, terms),
    }))
    .filter((s) => s.matched >= need)
    .sort(
      (a, b) =>
        b.titleHits - a.titleHits ||
        b.matched - a.matched ||
        a.item.title.localeCompare(b.item.title),
    );

  const forecasts: WeaveForecast[] = scoredForecasts.slice(0, 6).map((s) => ({
    id: s.item.id,
    title: s.item.title,
    format: s.item.type,
    vertical: s.item.vertical,
    status: s.item.status,
    forecasterId: s.item.forecasterId,
  }));

  return {
    terms,
    trends,
    proofPoints,
    forecasts,
    tensions,
    counts: {
      trends: scoredTrends.length,
      // Distinct callouts, matching what the page lists.
      proofPoints: bySame.size,
      forecasts: scoredForecasts.length,
    },
    proofTerms: proof.usedTerms,
    threshold: need,
  };
}
