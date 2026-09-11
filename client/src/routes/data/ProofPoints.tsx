import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { query, useApi } from "../../lib/api";
import { Slot, useCustom } from "../../lib/custom";
import { useDialog } from "../../lib/dialog";
import { Icon } from "../../lib/icons";
import { useRemembered } from "../../lib/remember";
import { useViewer } from "../../lib/viewer";
import type { LibraryPage, ProofPointDetail, ProofPointRow, Quality } from "../../types";
import { ErrorNote, Loading } from "../../components/bits";
import ShareLink from "../../components/ShareLink";

/**
 * The Proof Point Library.
 *
 * A trend profile asserts something; a proof point is the data that backs it
 * up. Finding them by hand is the slowest part of writing a forecast, so the
 * matching is done outside the Hub — every data callout embedded, the closest
 * reranked against the trend's own description, and two models scoring the
 * result independently. This is the read side of that: ten thousand
 * suggestions, filterable, and each one shown exactly as it would appear in a
 * forecast.
 *
 * It started as an Apps Script proof of concept, which is where the controls
 * come from — the three-way match quality and the industry and forecast chips
 * are the ones the team has already learnt.
 */

/** The three-way control, and what each setting actually means. */
const QUALITIES: { id: Quality; label: string; hint: string }[] = [
  { id: "top", label: "Top matches", hint: "Both models scored it high, or one was very sure" },
  { id: "mid", label: "Top + mid", hint: "Everything the two models agreed on" },
  { id: "all", label: "All matches", hint: "Including the ones neither was confident about" },
];

/**
 * A chip's count, at a width that never changes.
 *
 * The exact figure would defeat the point of the chip row holding still:
 * "4,493" is four characters wider than "0", so every chip after it slides
 * along, and a chip at the end of a row hops onto the next one. Three
 * characters at most, tabular, right-aligned — so a chip's width is decided
 * by its label alone. The tooltip carries the real number.
 */
function short(n: number): string {
  if (n < 1000) return String(n);
  return `${Math.round(n / 1000)}k`;
}

/** The filters this page owns, and therefore remembers per person. */
const REMEMBERED = ["owner", "trend", "industry", "forecast", "quality", "approved", "wgsnData", "fresh"];

/** Where a suggestion stands with the trend's owner. */
function DecisionPill({ row }: { row: ProofPointRow }) {
  if (row.decision === "approve") {
    return <span className="pp-state approved">Approved</span>;
  }
  if (row.decision === "reject") {
    return <span className="pp-state rejected">Not used</span>;
  }
  return <span className="pp-state pending">In review</span>;
}

/** The tags under a card: how it matched, and what it is tagged to. */
function Tags({ row }: { row: ProofPointRow }) {
  return (
    <div className="pp-tags">
      <span className={`pp-tag tier-${row.tier.toLowerCase()}`} title={`Tier ${row.tier}`}>
        {row.tier === "A" ? "Top match" : row.tier === "D" ? "One model" : `Tier ${row.tier}`}
      </span>
      {row.industries.slice(0, 3).map((i) => (
        <span className="pp-tag industry" key={i}>
          {i}
        </span>
      ))}
      <span className="pp-tag forecast">{row.forecastTag}</span>
      {row.wgsnData && (
        <span className="pp-tag wgsn" title="WGSN's own data rather than a third party's">
          WGSN data
        </span>
      )}
      {row.alreadyKnown && (
        <span className="pp-tag known" title="Already cited in the profile">
          Already used
        </span>
      )}
    </div>
  );
}

/**
 * Copy the proof point as text.
 *
 * The pipeline writes a plain-text version alongside the rendered one, which
 * is what a forecaster actually wants: it pastes into Content Editor with the
 * figure, the context and the attribution intact.
 */
function CopyButton({ text, id }: { text: string; id: string }) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => setDone(false), 1600);
    return () => window.clearTimeout(timer);
  }, [done]);

  return (
    <button
      className={done ? "btn accent small" : "btn small"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard
          .writeText(text)
          .then(() => setDone(true))
          .catch(() => setDone(false));
      }}
      aria-label={`Copy proof point ${id} as text`}
    >
      <Icon name="copy" size={13} />
      {done ? "Copied" : "Copy as text"}
    </button>
  );
}

/**
 * The proof point itself.
 *
 * The markup comes from the matching pipeline and is sanitised on the server
 * — rebuilt from an allowlist of the ten tags and twenty-one classes a proof
 * point is made of — so there is no path to here that has not been through
 * that gate. Injecting it is what makes the library worth having: a
 * forecaster is looking at the thing as it would appear in the forecast, not
 * a description of it.
 */
function Rendered({ html, scale }: { html: string; scale?: boolean }) {
  return (
    <div
      className={scale ? "pp-render scaled" : "pp-render"}
      // Safe because the server sanitises it on the way out — see above.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** One card in the grid. */
function Card({ row, onOpen }: { row: ProofPointRow; onOpen: () => void }) {
  return (
    <div className="pp-card">
      <button className="pp-card-open" onClick={onOpen} aria-label={`Enlarge ${row.trendTitle}`}>
        <div className="pp-card-figure">
          <Rendered html={row.html} scale />
          <span className="pp-card-badges">
            <DecisionPill row={row} />
          </span>
        </div>
      </button>
      <div className="pp-card-body">
        <div className="pp-card-trend">
          <Link to={`/data/proof-points${query({ trend: row.trendId })}`}>{row.trendTitle}</Link>
          <span className="pp-match" title={`${row.match}% match`}>
            {row.match}%
          </span>
        </div>
        {row.alsoMatches && row.alsoMatches.length > 0 && (
          <p className="pp-also muted small">
            + {row.alsoMatches.length} other{row.alsoMatches.length === 1 ? " trend" : " trends"}
          </p>
        )}
        <Tags row={row} />
        {row.forecastUrl && row.forecastTitle && (
          <a className="pp-forecast" href={row.forecastUrl} target="_blank" rel="noreferrer">
            {row.forecastTitle}
          </a>
        )}
        <CopyButton text={row.text} id={row.id} />
      </div>
    </div>
  );
}

/**
 * A proof point enlarged.
 *
 * Its own address — `?open=s000123` — so it can be sent to someone, and so
 * the back button closes it rather than leaving the page.
 */
function Enlarged({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error, loading } = useApi<ProofPointDetail>(`/proof-points/${id}`);

  // Focus in, Tab trapped, Escape closes, focus back where it came from.
  const box = useRef<HTMLDivElement | null>(null);
  useDialog(box, onClose);

  return (
    <>
      <button className="pp-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <div
        className="pp-dialog"
        role="dialog"
        aria-label="Proof point"
        aria-modal="true"
        ref={box}
        tabIndex={-1}
      >
        <div className="pp-dialog-head">
          <div>
            {data && (
              <>
                <div className="eyebrow">{data.point.trendTitle}</div>
                <h2>{data.point.match}% match</h2>
                <p className="muted small pp-dialog-tier">{data.tierMeaning}</p>
              </>
            )}
          </div>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>

        {error && <ErrorNote message={error} />}
        {loading && !data && <Loading what="the proof point" />}

        {data && (
          <div className="pp-dialog-body">
            <div className="pp-dialog-figure">
              <Rendered html={data.point.html} />
              <CopyButton text={data.point.text} id={data.point.id} />
            </div>

            <div className="pp-dialog-side">
              <div className="pp-dialog-block">
                <div className="eyebrow">Where it stands</div>
                <DecisionPill row={data.point} />
                {data.point.decidedAt && (
                  <p className="muted small">
                    {data.point.decision === "approve" ? "Approved" : "Rejected"} on{" "}
                    {data.point.decidedAt.slice(0, 10)}
                    {data.point.decidedByOwner ? " by the trend's owner" : ""}
                  </p>
                )}
              </div>

              {(data.point.whyClaude || data.point.whyGemini) && (
                <div className="pp-dialog-block">
                  <div className="eyebrow">Why it was suggested</div>
                  {/*
                    Two reasons, because two models read the same callout
                    against the same trend without seeing each other's answer.
                    They are labelled: unlabelled, near-identical paragraphs
                    read as a duplicate rather than as agreement, which is the
                    one thing the method is trying to show.
                  */}
                  {data.point.whyClaude && (
                    <p className="pp-why">
                      {data.point.claudeScore != null && (
                        <b className="pp-why-who">First model · {data.point.claudeScore}</b>
                      )}
                      {data.point.whyClaude}
                    </p>
                  )}
                  {data.point.whyGemini && data.point.whyGemini !== data.point.whyClaude && (
                    <p className="pp-why second">
                      {data.point.geminiScore != null && (
                        <b className="pp-why-who">Second model · {data.point.geminiScore}</b>
                      )}
                      {data.point.whyGemini}
                    </p>
                  )}
                  <p className="muted small">
                    {data.point.agreed
                      ? "Both scored it independently and agreed."
                      : "Only one of the two was confident about this one."}
                  </p>
                </div>
              )}

              <div className="pp-dialog-block">
                <div className="eyebrow">Tags</div>
                <Tags row={data.point} />
              </div>

              {data.point.alsoMatches && data.point.alsoMatches.length > 0 && (
                <div className="pp-dialog-block">
                  <div className="eyebrow">Also matches</div>
                  <ul className="pp-list">
                    {data.point.alsoMatches
                      .slice()
                      .sort((a, b) => b.match - a.match)
                      .map((a) => (
                        <li key={a.id}>
                          <Link
                            to={`/data/proof-points${query({ trend: a.trendId, open: a.id, quality: "all" })}`}
                          >
                            {a.title}
                          </Link>
                          <span className="muted small"> {a.match}%</span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              <div className="pp-dialog-block">
                <div className="eyebrow">Links</div>
                <ul className="pp-list">
                  {data.point.forecastUrl && (
                    <li>
                      <a href={data.point.forecastUrl} target="_blank" rel="noreferrer">
                        {data.point.forecastTitle ?? "The forecast it came from"}
                      </a>
                    </li>
                  )}
                  {(data.point.reportTitles ?? []).map((t) => (
                    <li className="muted small" key={t}>
                      {t}
                    </li>
                  ))}
                  {data.point.sourceUrl && (
                    <li>
                      <a href={data.point.sourceUrl} target="_blank" rel="noreferrer">
                        Original source
                      </a>
                    </li>
                  )}
                  {data.trend?.publishedUrl && (
                    <li>
                      <a href={data.trend.publishedUrl} target="_blank" rel="noreferrer">
                        {data.trend.title} on the platform
                      </a>
                    </li>
                  )}
                  {data.point.profileId && (
                    <li>
                      <Link to={`/trends/${data.point.profileId}`}>
                        {data.point.trendTitle} in the Hub
                      </Link>
                    </li>
                  )}
                </ul>
              </div>

              {data.trend && (
                <div className="pp-dialog-block">
                  <div className="eyebrow">The trend</div>
                  <p className="pp-why">{data.trend.description}</p>
                  <p className="muted small">
                    {data.trend.ownerName} · {data.trend.total} suggestions,{" "}
                    {data.trend.tierA} top tier
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function ProofPoints() {
  const [params, setParams] = useSearchParams();
  const { me } = useViewer();
  const custom = useCustom();

  useRemembered("proof-points", me.email, REMEMBERED, params, setParams);

  /*
   * Whether the extra filters are showing.
   *
   * Not in the address: it is a preference about this person's own screen
   * rather than part of the view, so a link someone is sent opens the library
   * they were meant to see and not somebody else's idea of a tidy panel. It
   * does persist per person, because someone who works in the chips wants
   * them there every morning.
   */
  const [more, setMore] = useState(() => {
    try {
      return localStorage.getItem("forecasters-hub.proof-points.more") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("forecasters-hub.proof-points.more", more ? "1" : "0");
    } catch {
      // Blocked storage: the panel just forgets between visits.
    }
  }, [more]);

  // Left out of the address, the server chooses: a forecaster's own trends, a
  // manager's whole library — and everyone's for somebody who owns none,
  // rather than an empty page. Whatever they pick is remembered above.
  const owner = params.get("owner") ?? "";
  const trend = params.get("trend") ?? "";
  const industry = params.get("industry") ?? "";
  const forecast = params.get("forecast") ?? "";
  const quality = (params.get("quality") as Quality) ?? "top";
  const approved = params.get("approved") === "1";
  const wgsnData = params.get("wgsnData") === "1";
  const fresh = params.get("fresh") === "1";
  const search = params.get("q") ?? "";
  const page = Math.max(Number(params.get("page") ?? 1) || 1, 1);
  const open = params.get("open");

  const { data, error, loading } = useApi<LibraryPage>(
    `/proof-points${query({
      owner: owner || undefined,
      trend: trend || undefined,
      industry: industry || undefined,
      forecast: forecast || undefined,
      quality,
      approved: approved ? "1" : undefined,
      wgsnData: wgsnData ? "1" : undefined,
      fresh: fresh ? "1" : undefined,
      q: search || undefined,
      page: page > 1 ? String(page) : undefined,
    })}`,
  );

  /**
   * Change one thing in the address.
   *
   * Two behaviours, and the difference matters:
   *
   * - A **filter** replaces the history entry and resets the page, because
   *   the enlarged card and whatever page you were on both belonged to the
   *   old filters — and because typing six letters in the search box should
   *   not put six entries behind you to press back through.
   * - A **step** — turning a page, opening a card — pushes an entry and keeps
   *   the filters, so the browser's own back button turns the page back and
   *   closes the enlarged card. That is what people press, and it was going
   *   straight past the library to whatever came before it.
   */
  function setParam(name: string, value: string, kind: "filter" | "step" = "filter") {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    if (kind === "filter") {
      next.delete("page");
      next.delete("open");
    }
    setParams(next, { replace: kind === "filter" });
  }

  /** A chip toggles: clicking the one that is on clears it. */
  const toggle = (name: string, value: string, current: string) =>
    setParam(name, current === value ? "" : value);

  /** Everything the panel holds, off in one go. */
  function clearAll() {
    const next = new URLSearchParams(params);
    for (const key of ["industry", "forecast", "approved", "wgsnData", "fresh", "q", "page", "open"]) {
      next.delete(key);
    }
    setParams(next, { replace: true });
  }

  if (error) return <ErrorNote message={error} />;

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  // What the server settled on, which is not always what was asked for.
  const applied = data?.owner ?? owner ?? "all";
  const ownsNone = data ? data.counts.mineAll === 0 : false;
  const pageSize = data?.pageSize ?? 24;
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  /*
   * Whatever is narrowing the page, as a pill with its own way off.
   *
   * The trend and the match quality are not here: they are the two controls
   * always on screen, and match quality is never *not* set. These are the
   * ones that can be on while the panel that holds them is shut.
   */
  const active: { label: string; clear: () => void }[] = [
    industry && { label: industry, clear: () => setParam("industry", "") },
    forecast && { label: forecast, clear: () => setParam("forecast", "") },
    approved && { label: "Approved only", clear: () => setParam("approved", "") },
    wgsnData && { label: "WGSN data", clear: () => setParam("wgsnData", "") },
    fresh && { label: "Not yet used", clear: () => setParam("fresh", "") },
    search && { label: `“${search}”`, clear: () => setParam("q", "") },
  ].filter((x): x is { label: string; clear: () => void } => Boolean(x));
  const narrowed = active.length;

  return (
    <>
      <div className="page-head">
        <div>
          <Slot id="proof.eyebrow" as="div" className="eyebrow" />
          <Slot id="proof.title" as="h1" className="page-title" />
          <Slot id="proof.sub" as="p" className="page-sub" />
        </div>
        <div className="head-figures">
          {custom.group("proof.figure").map((slot) => {
            const figures: Record<string, { n: number; when?: boolean }> = {
              "proof.figure.showing": { n: total },
              "proof.figure.mine": {
                n: data?.counts.mine ?? 0,
                // Not worth a figure when it is the whole page, or is nil
                // because none of the trends are theirs.
                when: applied !== "mine" && !ownsNone,
              },
              "proof.figure.approved": { n: data?.counts.approved ?? 0 },
              "proof.figure.wgsn": { n: data?.counts.wgsnData ?? 0 },
            };
            const figure = figures[slot.id];
            if (!figure || figure.when === false) return null;
            /*
             * "5,246" on its own reads as "that is all there is", and the
             * default quality band hides half the library — so the figure
             * says what it is a part of. The question it answers is the one
             * that gets asked: where are the other five thousand.
             */
            const whole = slot.id === "proof.figure.showing" ? (data?.counts.all ?? 0) : 0;
            return (
              <div className="figure" key={slot.id}>
                <b>{figure.n.toLocaleString()}</b>
                <Slot id={slot.id} />
                {whole > figure.n && (
                  <em className="figure-of">of {whole.toLocaleString()}</em>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/*
        The controls, in two tiers.

        Everything used to sit in one wrapping bar: seven groups, fifteen
        chips, two hundred and sixty pixels of controls before a single proof
        point. Worse, the chip rows were faceted down to what had results, so
        clicking one changed how many chips there were and the row reflowed
        under the cursor — the next chip you were about to click had moved.

        Now the four controls people reach for are one fixed row, the rest is
        behind a disclosure that says how many are on, and whatever is set
        shows as removable pills above the results. The chip rows carry every
        value the library holds with its count, so they never change size.
      */}
      <div className="pp-controls">
        <div className="field">
          <Slot id="proof.filter.owner" as="label" labels="owner" />
          <select
            id="owner"
            className="pp-owner-select"
            value={applied}
            onChange={(e) => setParam("owner", e.target.value)}
            // Nothing on their own trends to show, so the choice is not one.
            disabled={ownsNone}
            title={
              ownsNone
                ? "No trend in the library is owned by or credited to you, so there is nothing to narrow to"
                : undefined
            }
          >
            <option value="mine">My trends</option>
            <option value="all">Everyone&rsquo;s</option>
          </select>
        </div>

        <div className="field">
          <Slot id="proof.filter.trend" as="label" labels="trend" />
          {/*
            Fixed width: a select sizes itself to its widest option, and the
            options change with the filters — so left to itself it resized on
            every click and shoved the controls beside it sideways.
          */}
          <select
            id="trend"
            className="pp-trend-select"
            value={trend}
            onChange={(e) => setParam("trend", e.target.value)}
          >
            <option value="">All trends</option>
            {(data?.trends ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>

        <div className="field pp-search">
          <Slot id="proof.filter.search" as="label" labels="pp-q" />
          <input
            id="pp-q"
            type="search"
            value={search}
            placeholder="A figure, a brand, a word"
            onChange={(e) => setParam("q", e.target.value)}
          />
        </div>

        <div className="field">
          <Slot id="proof.filter.quality" as="div" className="field-label" htmlId="pp-quality" />
          <div className="chip-row" role="group" aria-labelledby="pp-quality">
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
          <button
            className={more ? "btn accent pp-more-btn" : "btn pp-more-btn"}
            onClick={() => setMore(!more)}
            aria-expanded={more}
            aria-controls="pp-more"
          >
            <Icon name="studio" size={14} />
            More filters
            {narrowed > 0 && <span className="count">{narrowed}</span>}
          </button>
          <ShareLink label="Copy link" />
        </div>
      </div>

      {more && (
        <div className="pp-more" id="pp-more">
          <div className="field wide">
            <Slot id="proof.filter.industry" as="div" className="field-label" htmlId="pp-industry" />
            <div className="chip-row" role="group" aria-labelledby="pp-industry">
              {(data?.industries ?? []).map((i) => (
                <button
                  key={i.value}
                  className={industry === i.value ? "btn accent" : "btn"}
                  onClick={() => toggle("industry", i.value, industry)}
                  // Nothing under it given the other filters. It stays on the
                  // row so the row does not move, and says so.
                  disabled={i.total === 0 && industry !== i.value}
                  title={
                    i.total === 0
                      ? `Nothing tagged ${i.value} under the other filters`
                      : `${i.total.toLocaleString()} proof points`
                  }
                >
                  {i.value}
                  <span className="pp-chip-n">{short(i.total)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field wide">
            <Slot id="proof.filter.forecast" as="div" className="field-label" htmlId="pp-forecast" />
            <div className="chip-row" role="group" aria-labelledby="pp-forecast">
              {(data?.forecasts ?? []).map((f) => (
                <button
                  key={f.value}
                  className={forecast === f.value ? "btn accent" : "btn"}
                  onClick={() => toggle("forecast", f.value, forecast)}
                  disabled={f.total === 0 && forecast !== f.value}
                  title={
                    f.total === 0
                      ? `Nothing tagged ${f.value} under the other filters`
                      : `${f.total.toLocaleString()} proof points`
                  }
                >
                  {f.value}
                  <span className="pp-chip-n">{short(f.total)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field wide">
            <Slot id="proof.filter.state" as="div" className="field-label" htmlId="pp-state" />
            <div className="chip-row" role="group" aria-labelledby="pp-state">
              <button
                className={approved ? "btn accent" : "btn"}
                onClick={() => setParam("approved", approved ? "" : "1")}
                title="Only the ones a trend&rsquo;s owner has accepted"
              >
                <Icon name="proof" size={13} /> Approved only
                <span className="pp-chip-n">{short(data?.counts.approved ?? 0)}</span>
              </button>
              <button
                className={wgsnData ? "btn accent" : "btn"}
                onClick={() => setParam("wgsnData", wgsnData ? "" : "1")}
                title="WGSN&rsquo;s own data rather than a third party&rsquo;s"
              >
                WGSN data
                <span className="pp-chip-n">{short(data?.counts.wgsnData ?? 0)}</span>
              </button>
              <button
                className={fresh ? "btn accent" : "btn"}
                onClick={() => setParam("fresh", fresh ? "" : "1")}
                title="Hide the ones the profile already cites"
              >
                Not yet used
              </button>
            </div>
          </div>
        </div>
      )}

      {/*
        What is on, and the way off it. With the panel closed this is the only
        thing saying a filter is narrowing the page — which is the failure
        mode of hiding filters behind a button.
      */}
      {active.length > 0 && (
        <div className="pp-active">
          {active.map((a) => (
            <button
              key={a.label}
              className="pp-pill"
              onClick={a.clear}
              title={`Stop filtering by ${a.label}`}
            >
              {a.label}
              <span aria-hidden>&times;</span>
            </button>
          ))}
          <button className="btn ghost small" onClick={clearAll}>
            Clear all
          </button>
        </div>
      )}


      {loading && !data ? (
        <Loading what="the proof point library" />
      ) : rows.length === 0 ? (
        <div className="empty">
          <Icon name="proof" size={22} />
          <p>
            {applied === "mine"
              ? "No proof points have been suggested for the trends you own under these filters. Switch to everyone’s above, or widen the match quality."
              : "Nothing matches those filters. Widening the match quality is usually the one that helps."}
          </p>
        </div>
      ) : (
        <>
          <p className="pp-count muted small">
            {from.toLocaleString()}&ndash;{to.toLocaleString()} of {total.toLocaleString()}
            {data && total < data.counts.all && (
              <> filtered from {data.counts.all.toLocaleString()}</>
            )}{" "}
            &middot; click a proof point to enlarge it
          </p>

          <div className="pp-grid">
            {rows.map((row) => (
              <Card key={row.id} row={row} onOpen={() => setParam("open", row.id, "step")} />
            ))}
          </div>

          {pages > 1 && (
            <div className="pager">
              <button
                className="btn"
                disabled={page <= 1}
                onClick={() => setParam("page", String(page - 1), "step")}
              >
                <Icon name="back" size={14} /> Previous
              </button>
              <span className="muted small">
                Page {page.toLocaleString()} of {pages.toLocaleString()}
              </span>
              <button
                className="btn"
                disabled={page >= pages}
                onClick={() => setParam("page", String(page + 1), "step")}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/*
        Closing replaces rather than pushes, so shutting the card does not
        leave an entry that re-opens it if you then press forward.
      */}
      {open && <Enlarged id={open} onClose={() => setParam("open", "")} />}
    </>
  );
}
