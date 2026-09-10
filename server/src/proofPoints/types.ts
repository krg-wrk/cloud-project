/**
 * Proof points: the evidence under a trend.
 *
 * A trend profile asserts something about the world. A proof point is a data
 * callout that backs it up — a survey figure, a search-volume rise, a catwalk
 * count — and finding them by hand is the slowest part of writing a forecast.
 * The matching runs outside the Hub: every callout is embedded, the closest
 * are reranked against the trend's own description, and two models score the
 * result independently. Where they agree, and how strongly, is the tier.
 *
 * What the Hub holds is that output. The library is the read side of it: what
 * was suggested, why, and whether the trend's owner accepted it.
 */

/**
 * How good the match is, as the ensemble judged it.
 *
 * A and B are both models agreeing, at different strengths. C is agreement
 * that neither model was confident about. D is one model alone, but very
 * sure — worth showing, and worth flagging as unconfirmed.
 */
export type ProofPointTier = "A" | "B" | "C" | "D";

export const TIER_MEANING: Record<ProofPointTier, string> = {
  A: "Both models agree, and both scored it high",
  B: "Both models agree",
  C: "Both models agree, but neither scored it high",
  D: "One model only, scoring it very high",
};

/** What the trend's owner decided about a suggestion. */
export type ProofPointDecision = "approve" | "reject";

/** The same data callout, matched against another trend. */
export interface AlsoMatch {
  /** The suggestion id under that trend, so it can be opened there. */
  id: string;
  trendId: string;
  match: number;
  /** Joined from the trend index on the way out. */
  title?: string;
  url?: string;
}

export interface ProofPoint {
  /** The suggestion id — one callout against one trend. */
  id: string;
  trendId: string;
  /** The data callout itself, which may be suggested for several trends. */
  calloutId: string;
  tier: ProofPointTier;
  /** The ensemble's score, 0-100. */
  match: number;
  claudeScore?: number;
  geminiScore?: number;
  agreed: boolean;
  /** "Forecast 2028", "Forecasting pre-2028", "KPI not met". */
  forecastTag: string;
  forecastYear?: number;
  /** READY or REJECTED, where the forecast has a KPI on it. */
  kpiStatus?: string;
  /** Already cited in the profile, so suggesting it again adds nothing. */
  alreadyKnown: boolean;
  /** WGSN's own data rather than a third party's — worth more, and rarer. */
  wgsnData: boolean;
  whyClaude?: string;
  whyGemini?: string;
  /** The rendered proof point. Sanitised before it leaves the server. */
  html: string;
  /** The same thing as text, which is what "copy" copies. */
  text: string;
  /** Where the figure came from, when it is not ours. */
  sourceUrl?: string;
  /** The forecast the callout was published in. */
  forecastUrl?: string;
  forecastTitle?: string;
  /** Other forecasts carrying it, when there is more than one. */
  reportTitles?: string[];
  alsoMatches?: AlsoMatch[];
  decision?: ProofPointDecision;
  decidedAt?: string;
  /** Whether the person who decided owns the trend. */
  decidedByOwner?: boolean;
}

/** A trend, as the matching pipeline sees it. */
export interface ProofPointTrend {
  id: string;
  title: string;
  description: string;
  industries: string[];
  /** How many suggestions it has, and how many are top tier. */
  total: number;
  tierA: number;
  ownerName: string;
  ownerEmail: string;
  editorUrl?: string;
  publishedUrl?: string;
}

/** A proof point with its trend's details filled in, as a page needs it. */
export interface ProofPointRow extends ProofPoint {
  trendTitle: string;
  industries: string[];
  ownerName: string;
  /** Whether the signed-in person owns the trend it is suggested for. */
  mine: boolean;
  /** The Content Editor document id, when the Hub knows the trend profile. */
  profileId?: string;
}

/**
 * What the Hub itself knows about a trend, which outranks the pipeline's copy.
 *
 * All 357 trends in the library are in the Hub's own trend database under the
 * same id, so the Hub is the authority on every one of them: who owns it, who
 * is credited, what industries it is tagged to, and what it is called today.
 * The pipeline's sheet is a snapshot taken when the matching last ran — one
 * of the trends has already been renamed since — and it names owners by
 * address, which is no use for deciding whether *this* viewer owns it.
 *
 * So the library reads the trend through this when it can, and falls back to
 * the sheet only for a trend the Hub has never heard of.
 */
export interface HubTrend {
  id: string;
  title: string;
  industries: string[];
  ownerName: string;
  /** Owned by, or credited on, whoever is signed in. */
  mine: boolean;
  profileId: string;
}

export type HubTrends = Map<string, HubTrend>;

/**
 * Match quality, as the three-way control on the page offers it.
 *
 * The tiers are bands of the same score, so this is a threshold with names
 * people recognise rather than a number to guess at.
 */
export type Quality = "top" | "mid" | "all";

export const QUALITY_TIERS: Record<Quality, ProofPointTier[]> = {
  // Tier D is one model alone, but at 90+ — it belongs with the top.
  top: ["A", "D"],
  mid: ["A", "B", "D"],
  all: ["A", "B", "C", "D"],
};

export interface LibraryQuery {
  trend?: string;
  /** "mine" for the trends this person owns, "all" for the lot. */
  owner?: string;
  industry?: string;
  forecast?: string;
  quality?: Quality;
  /** Only what the owner has approved. */
  approved?: boolean;
  /** Only WGSN's own data. */
  wgsnData?: boolean;
  /** Hide the ones already cited in the profile. */
  fresh?: boolean;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface LibraryPage {
  total: number;
  page: number;
  pageSize: number;
  rows: ProofPointRow[];
  /**
   * Which owner filter was actually applied.
   *
   * "mine" can be asked for and not granted: somebody who owns no trends at
   * all would get an empty page every time, so the library gives them
   * everyone's and says here that it did. The page reads this rather than
   * assuming its own request was honoured.
   */
  owner: "mine" | "all";
  /** Counts for the whole library, so the page can say what it is showing of. */
  counts: {
    all: number;
    approved: number;
    wgsnData: number;
    /** How many of the filtered set are on the signed-in person's trends. */
    mine: number;
    /**
     * How many the person's trends have in the whole library, whatever else
     * is filtered. Zero means "my trends" is a filter that can never match,
     * which is what the fallback above turns on.
     */
    mineAll: number;
  };
  /** The trends with suggestions, for the picker. */
  trends: { id: string; title: string; total: number; mine: boolean }[];
  /**
   * The chip filters, as every value the library holds with the count each
   * would leave.
   *
   * Every value, including the ones at nought — a chip that vanishes when it
   * would return nothing takes the row's other chips with it as the layout
   * reflows, so clicking one moves the next one you were about to click. A
   * chip that stays and reads zero also says something useful: nothing here,
   * rather than no such thing.
   */
  industries: Facet[];
  forecasts: Facet[];
}

export interface Facet {
  value: string;
  /** How many would be left with this one chosen and the rest as they are. */
  total: number;
}
