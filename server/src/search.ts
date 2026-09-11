import type { ProofPointLibrary } from "./proofPoints/library.js";
import type { ViewDef } from "./studio/types.js";
import type {
  ContentItem,
  KnowledgeSession,
  Person,
  TrendProfile,
} from "./types.js";

/**
 * One box over everything.
 *
 * The Hub has grown six places to look something up and no place to look
 * everything up. A forecaster who half-remembers a title has to guess which
 * page it lives on first, which is the sort of thing software is supposed to
 * do for you. So: one endpoint, one ranking, everything the Hub knows.
 *
 * Ranked across kinds rather than within them, because the best answer to
 * "collagen" is a trend whatever page it lives on — but capped per kind, so
 * ten thousand proof points cannot crowd out the one forecast somebody meant.
 */

export type Kind = "forecast" | "trend" | "person" | "session" | "proof" | "view";

export const KIND_LABELS: Record<Kind, string> = {
  forecast: "Forecasts",
  trend: "Trends",
  person: "People",
  session: "Learning",
  proof: "Proof points",
  view: "Built views",
};

export interface Hit {
  kind: Kind;
  /** Where to go. A path, so the client makes it a link. */
  to: string;
  title: string;
  /** One line of context: the format, the industries, the role. */
  sub: string;
  /** Why it matched, when the match was in the body rather than the title. */
  why?: string;
  /** Higher is better. Only meaningful against the other hits in one search. */
  score: number;
  /**
   * The date this thing is about, where it has one — a deadline, a session.
   * Breaks a tie in score, since soonest-first beats alphabetical.
   */
  at?: string;
}

export interface SearchResult {
  q: string;
  total: number;
  /** In one ranked list, so the client can offer a keyboard walk through it. */
  hits: Hit[];
  /** How many of each kind matched, including the ones past the cap. */
  counts: Record<Kind, number>;
  /** True when a kind had more than it showed. */
  more: boolean;
}

/** Per kind, so one kind cannot fill the list. */
const CAP: Record<Kind, number> = {
  forecast: 6,
  trend: 6,
  person: 4,
  session: 4,
  proof: 4,
  view: 3,
};

/**
 * Words, lowercased, with the punctuation dropped.
 *
 * Word-wise rather than a raw substring, so "vision womens" finds "The
 * Vision S/S 28: Womenswear Key Items" — which is how people actually
 * half-remember a title. Every word has to appear somewhere, so extra words
 * narrow rather than widen.
 */
function words(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

const norm = (s: string) => s.toLowerCase();

/**
 * How well a candidate matches, or 0 for not at all.
 *
 * The title is worth much more than the body — somebody typing "quiet
 * kitchens" wants the forecast called that, not the four others that mention
 * it — and a match at the start of the title beats one in the middle.
 */
function rank(terms: string[], title: string, body: string, boost = 0): number {
  const t = norm(title);
  const b = norm(body);
  let score = 0;
  for (const term of terms) {
    const at = t.indexOf(term);
    if (at === 0) score += 12;
    else if (at > 0) score += t[at - 1] === " " ? 9 : 6;
    else if (b.includes(term)) score += 2;
    else return 0;
  }
  // The whole query as one phrase in the title is what somebody pasted in.
  if (terms.length > 1 && t.includes(terms.join(" "))) score += 8;
  return score + boost;
}

/** The first line of the body that carries a term, trimmed to a phrase. */
function context(terms: string[], body: string): string | undefined {
  const b = body.replace(/\s+/g, " ").trim();
  if (!b) return undefined;
  const low = norm(b);
  const at = Math.min(...terms.map((t) => low.indexOf(t)).filter((i) => i >= 0));
  if (!Number.isFinite(at)) return undefined;
  const from = Math.max(0, at - 40);
  const cut = b.slice(from, from + 140).trim();
  return `${from > 0 ? "…" : ""}${cut}${from + 140 < b.length ? "…" : ""}`;
}

export interface Corpus {
  content: ContentItem[];
  people: Person[];
  sessions: KnowledgeSession[];
  trends: TrendProfile[];
  /** Views this viewer may actually open, already filtered by the caller. */
  views: ViewDef[];
  library: ProofPointLibrary;
}

export function search(q: string, corpus: Corpus): SearchResult {
  const terms = words(q);
  const counts: Record<Kind, number> = {
    forecast: 0,
    trend: 0,
    person: 0,
    session: 0,
    proof: 0,
    view: 0,
  };
  if (!terms.length) return { q, total: 0, hits: [], counts, more: false };

  const byKind: Record<Kind, Hit[]> = {
    forecast: [],
    trend: [],
    person: [],
    session: [],
    proof: [],
    view: [],
  };
  const name = new Map(corpus.people.map((p) => [p.id, p.name]));

  for (const item of corpus.content) {
    const body = [
      item.type,
      item.vertical,
      item.season,
      item.status,
      name.get(item.forecasterId) ?? "",
      item.notes ?? "",
    ].join(" ");
    const score = rank(terms, item.title, body);
    if (!score) continue;
    counts.forecast++;
    byKind.forecast.push({
      kind: "forecast",
      to: `/content/${item.id}`,
      title: item.title,
      sub: `${item.type} · ${item.vertical} · ${name.get(item.forecasterId) ?? "unassigned"} · due ${item.submissionDate}`,
      why: context(terms, item.notes ?? ""),
      score,
      at: item.submissionDate,
    });
  }

  for (const trend of corpus.trends) {
    // An archived earlier version of a live profile is noise in a search box.
    if (trend.editorStatus === "archived") continue;
    const body = [
      trend.description,
      trend.needToKnow,
      trend.industries.join(" "),
      trend.hashtags.join(" "),
      trend.types.join(" "),
      trend.ownerName,
      trend.authorNames.join(" "),
    ].join(" ");
    const score = rank(terms, trend.title, body, trend.published === "Published" ? 1 : 0);
    if (!score) continue;
    counts.trend++;
    byKind.trend.push({
      kind: "trend",
      to: `/trends/${trend.profileId}`,
      title: trend.title,
      sub: [
        trend.industries.slice(0, 3).join(", ") || "no industries",
        trend.ownerName || "unowned",
        trend.published === "Published" ? "live" : "not published",
      ].join(" · "),
      why: context(terms, `${trend.description} ${trend.needToKnow}`),
      score,
    });
  }

  for (const person of corpus.people) {
    const body = [person.email, person.role, person.vertical ?? "", person.department ?? "", person.forecasterRole ?? ""].join(" ");
    const score = rank(terms, person.name, body);
    if (!score) continue;
    counts.person++;
    byKind.person.push({
      kind: "person",
      to: `/team/${person.id}`,
      title: person.name,
      sub: [person.forecasterRole ?? person.role, person.vertical, person.region]
        .filter(Boolean)
        .join(" · "),
      score,
    });
  }

  for (const session of corpus.sessions) {
    const body = [
      session.summary,
      session.topics.join(" "),
      session.kind,
      session.location,
      session.hostExternal ?? name.get(session.hostId ?? "") ?? "",
    ].join(" ");
    const score = rank(terms, session.title, body);
    if (!score) continue;
    counts.session++;
    byKind.session.push({
      kind: "session",
      to: `/workshops/${session.id}`,
      title: session.title,
      sub: `${session.kind.replace(/-/g, " ")} · ${session.date} · ${session.location}`,
      why: context(terms, session.summary),
      score,
      at: session.date,
    });
  }

  for (const view of corpus.views) {
    const score = rank(terms, view.label, `${view.description ?? ""} ${view.section}`);
    if (!score) continue;
    counts.view++;
    byKind.view.push({
      kind: "view",
      to: `/v/${view.slug}`,
      title: view.label,
      sub: `${view.section} · built in the studio`,
      score,
    });
  }

  /*
   * Proof points last and ranked down, deliberately.
   *
   * They have no titles — the "title" is the callout's own sentence — so
   * every match is a body match, and there are ten thousand of them. Ranked
   * as found rather than as the answer: somebody searching for a trend name
   * wants the trend first and the evidence under it second.
   */
  for (const hit of corpus.library.textSearch(terms, CAP.proof * 3)) {
    counts.proof++;
    if (byKind.proof.length >= CAP.proof * 3) continue;
    // A callout is a headline, a figure and a caption on separate lines; one
    // row of a list is one line, so the breaks become spaces.
    const flat = hit.text.replace(/\s+/g, " ").trim();
    byKind.proof.push({
      kind: "proof",
      to: `/data/proof-points?q=${encodeURIComponent(q)}&open=${encodeURIComponent(hit.id)}`,
      title: flat.length > 90 ? `${flat.slice(0, 90).trim()}…` : flat,
      sub: `${hit.trendTitle} · ${hit.match}% match`,
      score: 1 + hit.match / 100,
    });
  }

  /*
   * Ties broken by `at`, not alphabetically.
   *
   * Searching a forecaster's name matches every forecast they write equally
   * — a body match is a body match — and "Big Idea" before "Catwalk Report"
   * tells nobody anything. The one closest to its deadline is the one most
   * likely to be the reason you typed the name.
   */
  let more = false;
  const order = (a: Hit, b: Hit) =>
    b.score - a.score ||
    (a.at ?? "9999").localeCompare(b.at ?? "9999") ||
    a.title.localeCompare(b.title);

  /*
   * Blocks of one kind, the blocks ordered by their best hit.
   *
   * Not one flat sort. A flat sort interleaves kinds wherever scores tie —
   * a session between two forecasts — and the page then draws the heading
   * "Forecasts" twice, which reads as a bug however honest it is about the
   * ranking. So the best thing still decides which kind leads, and once a
   * kind starts it finishes.
   */
  const blocks = (Object.keys(byKind) as Kind[])
    .map((kind) => {
      const sorted = byKind[kind].sort(order);
      if (sorted.length > CAP[kind]) more = true;
      return sorted.slice(0, CAP[kind]);
    })
    .filter((block) => block.length > 0)
    .sort((a, b) => order(a[0], b[0]));

  return {
    q,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    hits: blocks.flat(),
    counts,
    more,
  };
}
