import { Link, useSearchParams } from "react-router-dom";
import { useApi, query } from "../lib/api";
import { Slot, useCustom } from "../lib/custom";
import { useRemembered } from "../lib/remember";
import { Icon } from "../lib/icons";
import { useViewer } from "../lib/viewer";
import type { TrendCall, TrendList } from "../types";
import { ErrorNote, Loading } from "../components/bits";
import { TrendImage } from "../components/TrendImage";
import ShareLink from "../components/ShareLink";

/** The trend types, as the TFDB sheet lists them. A profile can carry several. */
export const TREND_TYPES = ["Design & Aesthetic", "Lifestyle", "Product / Item", "Systemic"];

/** The industries a profile is tagged to and scored for. */
export const INDUSTRIES = [
  "Beauty",
  "Consumer Tech",
  "Fashion Buying",
  "Fashion Design",
  "Food & Drink",
  "Insight",
  "Interiors",
  "Sports & Outdoor",
];

/**
 * The strategic call, in the order of how much commitment it asks for. The
 * sheet calls this column MORE_LABELS; a fifth of the profiles have none yet,
 * which the page says rather than guessing.
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
    <span
      className={`call-pill call-${call.toLowerCase()}`}
      title={CALLS.find((c) => c.id === call)?.blurb}
    >
      <i />
      {call}
    </span>
  );
}

/** Where a profile is: live on the platform, or still in Content Editor. */
export function StatePill({
  published,
  editorStatus,
}: {
  published?: string;
  editorStatus?: string;
}) {
  if (editorStatus === "archived") {
    return <span className="tag state-archived">Archived</span>;
  }
  if (published === "Published") {
    return <span className="tag state-live">Live</span>;
  }
  return (
    <span className="tag state-draft">
      {editorStatus === "review" ? "In review" : "Draft"}
    </span>
  );
}

/** The filters this page owns, and therefore remembers per person. */
const REMEMBERED = ["owner", "type", "industry", "state", "call", "needsScore"];

export default function Trends() {
  const [params, setParams] = useSearchParams();
  const { isManager, me } = useViewer();
  const custom = useCustom();

  // What this person last looked at, when the address carries no filters of
  // its own. A link someone was sent always wins over what is remembered.
  useRemembered("trends", me.email, REMEMBERED, params, setParams);

  /*
   * A forecaster's own profiles are the point of the page, so that is where
   * they land. A manager opens on the whole database, because overseeing it
   * is their job. Either way, whatever they last chose is what comes back
   * next time — see useRemembered above.
   */
  const owner = params.get("owner") ?? (isManager ? "all" : "mine");
  const type = params.get("type") ?? "";
  const call = params.get("call") ?? "";
  const industry = params.get("industry") ?? "";
  const state = params.get("state") ?? "";
  const needsScore = params.get("needsScore") === "1";

  const { data, error, loading } = useApi<TrendList>(
    `/trends${query({
      owner,
      type: type || undefined,
      call: call || undefined,
      industry: industry || undefined,
      state: state || undefined,
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

  const rows = data?.rows ?? [];
  const mine = rows.filter((t) => t.mine).length;
  const awaiting = rows.filter((t) => t.missingScore.length > 0).length;
  const live = rows.filter((t) => t.published === "Published").length;

  return (
    <>
      <div className="page-head">
        <div>
          <Slot
            id={owner === "mine" ? "trends.eyebrow.mine" : "trends.eyebrow.all"}
            as="div"
            className="eyebrow"
          />
          <Slot id="trends.title" as="h1" className="page-title" />
          <Slot id="trends.sub" as="p" className="page-sub" />
        </div>
        <div className="head-figures">
          {/* Which figures, in what order, called what — the admin's. */}
          {custom.group("trends.figure").map((slot) => {
            const figures: Record<string, { n: number; hot?: boolean; when?: boolean }> = {
              "trends.figure.showing": { n: rows.length },
              "trends.figure.mine": { n: mine, when: owner !== "mine" },
              "trends.figure.live": { n: live },
              "trends.figure.awaiting": { n: awaiting, hot: awaiting > 0 },
            };
            const figure = figures[slot.id];
            if (!figure || figure.when === false) return null;
            return (
              <div className={figure.hot ? "figure hot" : "figure"} key={slot.id}>
                <b>{figure.n}</b>
                <Slot
                  id={slot.id}
                  fallback={
                    slot.id === "trends.figure.showing" && owner === "mine" ? "Yours" : undefined
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="filters">
        <div className="field">
          <Slot id="trends.filter.owner" as="label" />
          <select id="owner" value={owner} onChange={(e) => setParam("owner", e.target.value)}>
            <option value="mine">Mine</option>
            <option value="all">Everyone</option>
            {(data?.owners ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <Slot id="trends.filter.type" as="label" />
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
          <Slot id="trends.filter.industry" as="label" />
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
          <Slot id="trends.filter.state" as="label" />
          <select id="state" value={state} onChange={(e) => setParam("state", e.target.value)}>
            <option value="">Any state</option>
            <option value="published">Live</option>
            <option value="unpublished">Not published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="field">
          <Slot id="trends.filter.call" as="label" />
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
          <Slot id="trends.filter.scores" as="label" />
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
              ? "No trend profiles on the sheet are owned by you, or credit you as an author. Pick an owner above to see a forecaster’s own."
              : "No profiles match those filters."}
          </p>
        </div>
      ) : (
        <div className="trend-grid">
          {/* TREND_ID is the number the team quotes and is not unique on the
              sheet — an archived earlier version shares it with the live
              profile — so the link and the key use the Content Editor
              document id, which is. */}
          {rows.map((trend) => (
            <Link key={trend.profileId} to={`/trends/${trend.profileId}`} className="trend-card">
              <TrendImage
                trendId={trend.id}
                name={trend.title}
                imageUrl={trend.coverImageUrl}
              />
              <div className="trend-card-body">
                <div className="trend-card-top">
                  <CallPill call={trend.call} />
                  <StatePill published={trend.published} editorStatus={trend.editorStatus} />
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
                  {trend.ownerName && (
                    <span title="Owner">
                      <Icon name="forecasters" size={13} />
                      {trend.ownerName}
                    </span>
                  )}
                  {trend.proofPoints > 0 && (
                    <span title="Proof points logged">
                      <Icon name="tier" size={13} />
                      {trend.proofPoints}
                    </span>
                  )}
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
