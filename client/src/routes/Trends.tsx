import { Link, useSearchParams } from "react-router-dom";
import { useApi, query } from "../lib/api";
import { personName } from "../lib/domain";
import { Icon } from "../lib/icons";
import { useViewer } from "../lib/viewer";
import type { TrendCall, TrendRow } from "../types";
import { ErrorNote, Loading } from "../components/bits";
import { TrendImage } from "../components/TrendImage";
import ShareLink from "../components/ShareLink";

/** The trend types, as the TFDB sheet lists them. A profile can carry several. */
export const TREND_TYPES = ["Design & Aesthetic", "Lifestyle", "Product / Item", "Systemic"];

/** The industries a profile is tagged to and scored for. */
export const INDUSTRIES = [
  "Beauty",
  "Consumer Tech",
  "Fashion",
  "Food & Drink",
  "Interiors",
  "Sports & Outdoor",
  "Overall",
];

/**
 * The strategic call, in the order of how much commitment it asks for. The
 * sheet calls this column MORE_LABELS; it is often not set yet, which the
 * page says rather than guessing.
 */
export const CALLS: { id: TrendCall; blurb: string }[] = [
  { id: "Protect", blurb: "Defend the position you already have" },
  { id: "Test", blurb: "Worth a trial, not yet a commitment" },
  { id: "Expand", blurb: "Working — widen it" },
  { id: "Invest", blurb: "Back it properly" },
];

export function CallPill({ call }: { call?: TrendCall }) {
  if (!call) {
    return (
      <span className="call-pill call-none" title="No strategic call on the profile yet">
        <i />
        No call yet
      </span>
    );
  }
  return (
    <span className={`call-pill call-${call.toLowerCase()}`} title={CALLS.find((c) => c.id === call)?.blurb}>
      <i />
      {call}
    </span>
  );
}

export default function Trends() {
  const [params, setParams] = useSearchParams();
  const { person, people, isManager } = useViewer();

  // A forecaster's own profiles are the point of the page; a manager opens on
  // the whole database, because that is the view they need.
  const owner = params.get("owner") ?? (isManager ? "all" : "mine");
  const type = params.get("type") ?? "";
  const call = params.get("call") ?? "";
  const industry = params.get("industry") ?? "";
  const needsScore = params.get("needsScore") === "1";

  const { data, error, loading } = useApi<TrendRow[]>(
    `/trends${query({
      owner,
      type: type || undefined,
      call: call || undefined,
      industry: industry || undefined,
      needsScore: needsScore ? "1" : undefined,
    })}`,
  );

  function setParam(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  }

  if (error) return <ErrorNote message={error} />;

  const rows = data ?? [];
  const mine = person
    ? rows.filter((t) => t.ownerId === person.id || t.authorIds.includes(person.id)).length
    : 0;
  const awaiting = rows.filter((t) => t.missingScore.length > 0).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {owner === "mine" ? "Profiles you own or are credited on" : "The trend database"}
          </div>
          <h1 className="page-title">Trends</h1>
          <p className="page-sub">
            Published trend profiles from TFDB. Which are yours, what the call is on each,
            which industries are still waiting for a score, and the way straight through to
            the profile in Content Editor or on the live site.
          </p>
        </div>
        <div className="head-figures">
          <div className="figure">
            <b>{rows.length}</b>
            <span>{owner === "mine" ? "Yours" : "Profiles"}</span>
          </div>
          {owner !== "mine" && person && (
            <div className="figure">
              <b>{mine}</b>
              <span>Yours</span>
            </div>
          )}
          <div className={awaiting ? "figure hot" : "figure"}>
            <b>{awaiting}</b>
            <span>Awaiting a score</span>
          </div>
        </div>
      </div>

      <div className="filters">
        <div className="field">
          <label htmlFor="owner">Owner</label>
          <select id="owner" value={owner} onChange={(e) => setParam("owner", e.target.value)}>
            <option value="mine">Mine</option>
            <option value="all">Everyone</option>
            {isManager &&
              people
                .filter((p) => p.role === "forecaster")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="type">Trend type</label>
          <select id="type" value={type} onChange={(e) => setParam("type", e.target.value)}>
            <option value="">All types</option>
            {TREND_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="industry">Industry</label>
          <select
            id="industry"
            value={industry}
            onChange={(e) => setParam("industry", e.target.value)}
          >
            <option value="">All industries</option>
            {INDUSTRIES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Call</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className={call ? "btn" : "btn accent"} onClick={() => setParam("call", "")}>
              Any
            </button>
            {CALLS.map((c) => (
              <button
                key={c.id}
                className={call === c.id ? "btn accent" : "btn"}
                onClick={() => setParam("call", c.id)}
                title={c.blurb}
              >
                {c.id}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Scores</label>
          <button
            className={needsScore ? "btn accent" : "btn"}
            onClick={() => setParam("needsScore", needsScore ? "" : "1")}
            title="Profiles with an industry that has not been scored"
          >
            <Icon name="at-risk" />
            Needs a score
          </button>
        </div>
        <div className="filters-right">
          <ShareLink />
        </div>
      </div>

      {loading || !data ? (
        <Loading what="the trend profiles" />
      ) : rows.length === 0 ? (
        <div className="empty">
          <Icon name="trends" size={22} />
          <p>
            {owner === "mine"
              ? "No trend profiles are owned by you, or credit you as an author."
              : "No profiles match those filters."}
          </p>
        </div>
      ) : (
        <div className="trend-grid">
          {rows.map((trend) => (
            <Link key={trend.id} to={`/trends/${trend.id}`} className="trend-card">
              <TrendImage
                trendId={trend.id}
                name={trend.title}
                imageUrl={trend.coverImageUrl}
              />
              <div className="trend-card-body">
                <div className="trend-card-top">
                  <CallPill call={trend.call} />
                  <span className="trend-season">{trend.activeFrom.slice(0, 4)}–{trend.activeTo.slice(0, 4)}</span>
                </div>
                <h2 className="trend-name">{trend.title}</h2>
                <p className="trend-summary">{trend.description}</p>
                <div className="trend-types">
                  {trend.types.map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </div>
                <div className="trend-meta">
                  <span title="Owner">
                    <Icon name="forecasters" size={13} />
                    {personName(people, trend.ownerId)}
                  </span>
                  <span title="Proof points logged">
                    <Icon name="tier" size={13} />
                    {trend.proofPoints}
                  </span>
                  <span title="Strategies">
                    <Icon name="deadlines" size={13} />
                    {trend.strategies}
                  </span>
                  {trend.missingScore.length > 0 && (
                    <span
                      className="needs-score"
                      title={`No score yet for ${trend.missingScore.join(", ")}`}
                    >
                      <Icon name="at-risk" size={13} />
                      {trend.missingScore.length} to score
                    </span>
                  )}
                  {trend.linkCount > 0 && (
                    <span title="Supporting material added in the Hub">
                      <Icon name="link" size={13} />
                      {trend.linkCount}
                    </span>
                  )}
                  {trend.hasNote && (
                    <span title="The owner has left a note">
                      <Icon name="note" size={13} />
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
