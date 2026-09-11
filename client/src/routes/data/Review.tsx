import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { query, send, useApi } from "../../lib/api";
import { Slot } from "../../lib/custom";
import { Icon } from "../../lib/icons";
import { useRemembered } from "../../lib/remember";
import { useViewer } from "../../lib/viewer";
import type { LibraryPage, Quality, ReviewQueue, ReviewRow } from "../../types";
import { ErrorNote, Loading } from "../../components/bits";

/**
 * Deciding about suggested proof points, one at a time.
 *
 * The other half of the proof of concept, and the half that makes the library
 * mean anything: without it every suggestion reads "In review" for ever. The
 * shape is the one the team has already used — one card, the reasoning beside
 * it, approve or reject, and the arrow keys because a reviewer doing forty of
 * these should not be moving a mouse.
 *
 * Two things it does that the proof of concept could not. A decision is
 * written to the Hub rather than to the sheet the pipeline overwrites, so it
 * survives the next extract — nobody reviews the same ten thousand
 * suggestions twice. And who may decide is the same rule as writing anything
 * else against a trend profile, so it is the owner's queue rather than
 * everybody's.
 */

const QUALITIES: { id: Quality; label: string; hint: string }[] = [
  { id: "top", label: "Top matches", hint: "Both models scored it high, or one was very sure" },
  { id: "mid", label: "Top + mid", hint: "Everything the two models agreed on" },
  { id: "all", label: "All matches", hint: "Including the ones neither was confident about" },
];

const REMEMBERED = ["owner", "trend", "quality"];

/** The proof point, as the pipeline rendered it. Sanitised on the server. */
function Rendered({ html }: { html: string }) {
  return (
    <div
      className="pp-render"
      // Safe because the server sanitises it on the way out — see above.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default function Review() {
  const [params, setParams] = useSearchParams();
  const { me } = useViewer();

  useRemembered("proof-review", me.email, REMEMBERED, params, setParams);

  const owner = params.get("owner") === "all" ? "all" : "mine";
  const trend = params.get("trend") ?? "";
  const quality = (params.get("quality") as Quality) ?? "top";

  const queue = useApi<ReviewQueue>(
    `/proof-points/review${query({
      owner,
      trend: trend || undefined,
      quality,
      take: "6",
    })}`,
  );
  // The trend picker comes off the library, which already counts per trend.
  const trends = useApi<LibraryPage>(
    `/proof-points${query({ owner, quality, pageSize: "1" })}`,
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  /**
   * What was just decided, so it can be taken back.
   *
   * Only the last one, on purpose: undo is for the card you have just this
   * second got wrong, and a stack of them would need a history the reviewer
   * cannot see.
   */
  const [last, setLast] = useState<{ id: string; decision: string; title: string } | null>(null);

  const rows = queue.data?.rows ?? [];
  const card: ReviewRow | undefined = rows[0];

  function setParam(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
    setAsking(false);
    setLast(null);
  }

  const decide = useCallback(
    async (decision: "approve" | "reject", reason?: string) => {
      if (!card || busy) return;
      setBusy(true);
      setError(null);
      try {
        await send(`/proof-points/${card.id}/decision`, "POST", { decision, reason });
        setLast({ id: card.id, decision, title: card.trendTitle });
        setAsking(false);
        queue.reload();
        trends.reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "It could not be saved.");
      } finally {
        setBusy(false);
      }
    },
    [card, busy, queue, trends],
  );

  const undo = useCallback(async () => {
    if (!last || busy) return;
    setBusy(true);
    setError(null);
    try {
      await send(`/proof-points/${last.id}/decision`, "DELETE");
      setLast(null);
      queue.reload();
      trends.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "It could not be undone.");
    } finally {
      setBusy(false);
    }
  }, [last, busy, queue, trends]);

  /*
   * The keys the team already knows: left rejects, right approves, U undoes.
   * Ignored while a text box has focus, so typing a reason does not decide
   * anything, and ignored with a modifier so browser shortcuts still work.
   * Ignored too when the card in front of you is not yours to decide — the
   * page offers no buttons then, and the keys should not offer more.
   */
  const asked = useRef(asking);
  asked.current = asking;
  const mine = card?.canDecide ?? false;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!mine && !last) return;
      const on = e.target as HTMLElement | null;
      if (on && /^(INPUT|TEXTAREA|SELECT)$/.test(on.tagName)) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        void decide("approve");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        // Left asks for a reason rather than rejecting outright: the reason
        // is the useful half of a rejection and one keypress is too cheap.
        if (asked.current) void decide("reject");
        else setAsking(true);
      } else if (e.key.toLowerCase() === "u") {
        e.preventDefault();
        void undo();
      } else if (e.key === "Escape") {
        setAsking(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, undo, mine, last]);

  if (queue.error) return <ErrorNote message={queue.error} />;

  const total = queue.data?.total ?? 0;
  const cited = queue.data?.cited ?? 0;
  const decided = queue.data?.decided;

  return (
    <>
      <div className="page-head">
        <div>
          <Slot id="review.eyebrow" as="div" className="eyebrow" />
          <Slot id="review.title" as="h1" className="page-title" />
          <Slot id="review.sub" as="p" className="page-sub" />
        </div>
        <div className="head-figures">
          <div className="figure">
            <b>{total.toLocaleString()}</b>
            <span>Waiting</span>
          </div>
          <div className="figure">
            <b>{(decided?.approved ?? 0).toLocaleString()}</b>
            <span>Approved</span>
          </div>
          <div className="figure">
            <b>{(decided?.rejected ?? 0).toLocaleString()}</b>
            <span>Not used</span>
          </div>
          {cited > 0 && (
            /*
             * The queue is smaller than the library and it is worth saying
             * why: these are already cited in the profile, so the answer is
             * yes and has been for a while. Reviewing them would be the first
             * couple of hundred cards and would teach a reviewer that the
             * queue wastes their time.
             */
            <div className="figure" title="Already cited in the trend profile, so there is nothing to decide">
              <b>{cited.toLocaleString()}</b>
              <span>Already cited</span>
            </div>
          )}
        </div>
      </div>

      <div className="pp-controls">
        <div className="field">
          <label htmlFor="rv-owner">Whose trends</label>
          <select
            id="rv-owner"
            className="pp-owner-select"
            value={owner}
            onChange={(e) => setParam("owner", e.target.value)}
          >
            <option value="mine">Mine</option>
            <option value="all">Everyone&rsquo;s</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="rv-trend">Trend</label>
          <select
            id="rv-trend"
            className="pp-trend-select"
            value={trend}
            onChange={(e) => setParam("trend", e.target.value)}
          >
            <option value="">All trends</option>
            {(trends.data?.trends ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Match quality</label>
          <div className="chip-row">
            {QUALITIES.map((q) => (
              <button
                key={q.id}
                className={quality === q.id ? "btn accent" : "btn"}
                onClick={() => setParam("quality", q.id)}
                title={q.hint}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
        <div className="pp-controls-end">
          <Link className="btn" to={`/data/proof-points${query({ owner, quality })}`}>
            <Icon name="proof" size={14} /> The library
          </Link>
        </div>
      </div>

      {error && <ErrorNote message={error} />}

      {/*
        What was just decided, and the way back from it. Shown after the
        decision rather than as a permanent control, because undo is for the
        card you have this second got wrong.
      */}
      {last && (
        <div className="rv-undo">
          <span>
            <Icon name={last.decision === "approve" ? "submitted" : "at-risk"} size={14} />
            {last.decision === "approve" ? "Approved" : "Not used"} for {last.title}.
          </span>
          <button className="btn small" onClick={() => void undo()} disabled={busy}>
            Undo <kbd>U</kbd>
          </button>
        </div>
      )}

      {queue.loading && !queue.data ? (
        <Loading what="the queue" />
      ) : !card ? (
        <div className="empty">
          <Icon name="submitted" size={22} />
          <p>
            {total === 0 && owner === "mine"
              ? "Nothing waiting on you. Either every suggestion for your trends has been decided, or none of the library’s trends are yours — switch to everyone’s above to see."
              : "Nothing left in this queue. Widen the match quality, or pick another trend."}
          </p>
        </div>
      ) : (
        <>
          <div className="rv-card">
            <div className="rv-head">
              <span className="rv-position">
                {total.toLocaleString()} waiting
              </span>
              <span className="rv-match">{card.match}%</span>
              <span className="eyebrow">match</span>
              {card.claudeScore != null && card.geminiScore != null && (
                <span className="muted small">
                  {card.claudeScore} · {card.geminiScore}
                  {card.agreed ? " — both models agreed" : " — one model only"}
                </span>
              )}
              <Link className="rv-trend" to={`/data/proof-points${query({ trend: card.trendId })}`}>
                {card.trendTitle}
              </Link>
            </div>

            <div className="rv-body">
              <div className="rv-figure">
                <Rendered html={card.html} />
              </div>

              <div className="rv-side">
                {(card.whyClaude || card.whyGemini) && (
                  <div className="pp-dialog-block">
                    <div className="eyebrow">Why it was suggested</div>
                    {card.whyClaude && (
                      <p className="pp-why">
                        <b className="pp-why-who">First model</b>
                        {card.whyClaude}
                      </p>
                    )}
                    {card.whyGemini && card.whyGemini !== card.whyClaude && (
                      <p className="pp-why second">
                        <b className="pp-why-who">Second model</b>
                        {card.whyGemini}
                      </p>
                    )}
                  </div>
                )}

                <div className="pp-dialog-block">
                  <div className="eyebrow">Tags</div>
                  <div className="pp-tags">
                    <span className={`pp-tag tier-${card.tier.toLowerCase()}`}>
                      {card.tier === "A"
                        ? "Top match"
                        : card.tier === "D"
                          ? "One model"
                          : `Tier ${card.tier}`}
                    </span>
                    {card.industries.slice(0, 3).map((i) => (
                      <span className="pp-tag industry" key={i}>
                        {i}
                      </span>
                    ))}
                    <span className="pp-tag forecast">{card.forecastTag}</span>
                    {card.wgsnData && <span className="pp-tag wgsn">WGSN data</span>}
                  </div>
                </div>

                {card.alsoMatches && card.alsoMatches.length > 0 && (
                  <div className="pp-dialog-block">
                    <div className="eyebrow">Also matches</div>
                    <ul className="pp-list">
                      {card.alsoMatches
                        .slice()
                        .sort((a, b) => b.match - a.match)
                        .slice(0, 4)
                        .map((a) => (
                          <li key={a.id}>
                            {a.title} <span className="muted small">{a.match}%</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}

                <div className="pp-dialog-block">
                  <div className="eyebrow">Links</div>
                  <ul className="pp-list">
                    {card.forecastUrl && (
                      <li>
                        <a href={card.forecastUrl} target="_blank" rel="noreferrer">
                          {card.forecastTitle ?? "The forecast it came from"}
                        </a>
                      </li>
                    )}
                    {card.sourceUrl && (
                      <li>
                        <a href={card.sourceUrl} target="_blank" rel="noreferrer">
                          Original source
                        </a>
                      </li>
                    )}
                    {card.profileId && (
                      <li>
                        <Link to={`/trends/${card.profileId}`}>{card.trendTitle} in the Hub</Link>
                      </li>
                    )}
                  </ul>
                </div>

                {/*
                  Whose queue this is. Said on the card rather than only when
                  somebody presses Approve and is refused.
                */}
                {!card.canDecide ? (
                  <p className="studio-note bad">
                    <Icon name="lock" size={14} />
                    {card.trendTitle} belongs to {card.ownerName || "somebody else"}. Its owner,
                    anyone credited on it, a manager for its industries or an admin can decide.
                  </p>
                ) : asking ? (
                  <div className="rv-reasons">
                    <div className="eyebrow">Why not? (optional)</div>
                    <div className="chip-row">
                      {(queue.data?.reasons ?? []).map((reason) => (
                        <button
                          key={reason}
                          className="btn small"
                          onClick={() => void decide("reject", reason)}
                          disabled={busy}
                        >
                          {reason}
                        </button>
                      ))}
                    </div>
                    <div className="rv-actions">
                      <button
                        className="btn"
                        onClick={() => void decide("reject")}
                        disabled={busy}
                      >
                        Skip the reason
                      </button>
                      <button className="btn ghost" onClick={() => setAsking(false)}>
                        Cancel <kbd>Esc</kbd>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rv-actions">
                    <button
                      className="btn reject"
                      onClick={() => setAsking(true)}
                      disabled={busy}
                    >
                      <Icon name="at-risk" size={14} /> Not for this trend <kbd>&larr;</kbd>
                    </button>
                    <button
                      className="btn approve"
                      onClick={() => void decide("approve")}
                      disabled={busy}
                    >
                      <Icon name="submitted" size={14} /> Approve <kbd>&rarr;</kbd>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {card.canDecide && (
            <p className="rv-keys muted small">
              <kbd>&larr;</kbd> not for this trend · <kbd>&rarr;</kbd> approve · <kbd>U</kbd> undo
            </p>
          )}
        </>
      )}
    </>
  );
}
