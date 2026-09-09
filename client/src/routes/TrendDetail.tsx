import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { send, useApi } from "../lib/api";
import { formatLong } from "../lib/date";
import { Icon } from "../lib/icons";
import type { ResearchLink, TrendDetail as Trend } from "../types";
import { Avatar, ErrorNote, Loading } from "../components/bits";
import { TrendImage } from "../components/TrendImage";
import ShareLink from "../components/ShareLink";
import { CALLS, CallPill, StatePill } from "./Trends";

/**
 * One trend profile.
 *
 * The profile is authored in Content Editor and read here from the TFDB
 * sheet — its title, types, call, dates, cover image, prose and counts.
 * What the Hub owns is the owner's working note, any supporting material
 * they gather, and a cover image for when the sheet has none.
 */
export default function TrendDetail() {
  const { id } = useParams<{ id: string }>();
  const loaded = useApi<Trend>(`/trends/${id}`);
  const [saved, setSaved] = useState<Trend | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [note, setNote] = useState("");
  const [links, setLinks] = useState<ResearchLink[]>([]);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const trend = saved ?? loaded.data ?? null;

  if (loaded.error) return <ErrorNote message={loaded.error} />;
  if (!trend) return <Loading what="the trend profile" />;

  function open() {
    if (!trend) return;
    setCoverImageUrl(trend.coverFromHub ? (trend.coverImageUrl ?? "") : "");
    setNote(trend.note ?? "");
    setLinks(trend.links ?? []);
    setLinkLabel("");
    setLinkUrl("");
    setProblem(undefined);
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setProblem(undefined);
    // A link half-typed into the two boxes still counts as one they meant.
    const all = linkUrl.trim()
      ? [...links, { label: linkLabel.trim() || linkUrl.trim(), url: linkUrl.trim() }]
      : links;
    try {
      const next = await send<Trend>(`/trends/${trend!.id}`, "PUT", {
        coverImageUrl: coverImageUrl.trim() || undefined,
        note: note.trim() || undefined,
        links: all,
      });
      setSaved(next);
      setEditing(false);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  const callBlurb = CALLS.find((c) => c.id === trend.call)?.blurb;
  const others = trend.authorNames.filter((a) => a !== trend.ownerName);
  const scoreLines = (trend.latestScoreMonth ?? "").split("\n").filter(Boolean);

  return (
    <>
      <div className="breadcrumb">
        <Link to="/trends">Trends</Link> <span>/</span>{" "}
        <span>{trend.industries[0] ?? "TFDB"}</span> <span>/</span> <span>{trend.id}</span>
      </div>

      <div className="page-head">
        <div>
          <div className="eyebrow">
            {trend.types.join(" · ")} · called for {trend.activeFrom.slice(0, 4)}&ndash;
            {trend.activeTo.slice(0, 4)}
          </div>
          <h1 className="page-title">{trend.title}</h1>
          <p className="page-sub">{trend.description}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <StatePill published={trend.published} editorStatus={trend.editorStatus} />
            <CallPill call={trend.call} />
          </div>
          <ShareLink />
        </div>
      </div>

      <div className="detail-grid">
        <div>
          <TrendImage
            trendId={trend.id}
            name={trend.title}
            imageUrl={trend.coverImageUrl}
            imageCredit={trend.coverFromHub ? "Linked in the Hub" : undefined}
            ratio="16 / 7"
            eager
          />

          {trend.missingScore.length > 0 && (
            <div className="callout warn" style={{ marginTop: 16 }}>
              <strong>
                {trend.missingScore.length === 1
                  ? "One industry has no score yet."
                  : `${trend.missingScore.length} industries have no score yet.`}
              </strong>
              <div style={{ marginTop: 4 }}>
                {trend.missingScore.join(", ")} — tagged on the profile but not scored.
              </div>
            </div>
          )}

          {editing ? (
            <section className="card" style={{ marginTop: 20 }}>
              <h2 className="section-title">
                <Icon name="edit" /> What the Hub holds
              </h2>
              <p className="muted" style={{ marginTop: 0 }}>
                The profile itself is authored in Content Editor and comes here from the
                sheet. These are the parts the Hub keeps for you.
              </p>

              <label className="field">
                <span>Working note</span>
                <textarea
                  rows={4}
                  value={note}
                  placeholder="What would move the call on? What is still to chase?"
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>

              <label className="field" style={{ marginTop: 12 }}>
                <span>Cover image address (overrides the sheet)</span>
                <input
                  value={coverImageUrl}
                  placeholder="https://media.wgsn.com/…"
                  onChange={(e) => setCoverImageUrl(e.target.value)}
                />
              </label>

              {links.length > 0 && (
                <ul className="link-edit-list">
                  {links.map((l, i) => (
                    <li key={`${l.url}-${i}`}>
                      <span>{l.label}</span>
                      <button
                        className="btn"
                        onClick={() => setLinks(links.filter((_, j) => j !== i))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="form-row" style={{ marginTop: 12 }}>
                <label className="field grow">
                  <span>Add supporting material</span>
                  <input
                    value={linkLabel}
                    placeholder="What it is"
                    onChange={(e) => setLinkLabel(e.target.value)}
                  />
                </label>
                <label className="field grow">
                  <span>Address</span>
                  <input
                    value={linkUrl}
                    placeholder="https://…"
                    onChange={(e) => setLinkUrl(e.target.value)}
                  />
                </label>
              </div>

              {problem && (
                <div className="callout warn" style={{ marginTop: 12 }}>
                  {problem}
                </div>
              )}

              <div className="form-actions">
                <button className="btn solid" onClick={save} disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </button>
                <button className="btn" onClick={() => setEditing(false)} disabled={busy}>
                  Cancel
                </button>
              </div>
              <p className="muted small">
                Only http and https addresses are kept — the image is rendered and the links
                are links, so anything else is a way in.
              </p>
            </section>
          ) : (
            <>
              {trend.needToKnow && (
                <section className="card" style={{ marginTop: 20 }}>
                  <h2 className="section-title">
                    <Icon name="ai" /> Need to know
                  </h2>
                  <p style={{ margin: 0 }}>{trend.needToKnow}</p>
                </section>
              )}

              {trend.opportunity && (
                <section style={{ marginTop: 24 }}>
                  <h2 className="section-title">
                    <Icon name="trends" /> The opportunity
                  </h2>
                  <div className="prose-long">
                    {trend.opportunity.split(/\n+/).map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                </section>
              )}

              {trend.note && (
                <section className="card" style={{ marginTop: 12 }}>
                  <h2 className="section-title">
                    <Icon name="note" /> Owner&rsquo;s note
                  </h2>
                  <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{trend.note}</p>
                </section>
              )}

              {trend.industries.length > 0 && (
              <section style={{ marginTop: 24 }}>
                <h2 className="section-title">
                  <Icon name="published" /> Industry scores
                </h2>
                <div className="score-grid">
                  {trend.industries.map((industry) => {
                    const done = trend.scored.includes(industry);
                    return (
                      <div key={industry} className={done ? "score done" : "score missing"}>
                        <Icon name={done ? "published" : "at-risk"} size={15} />
                        <span>{industry}</span>
                        <em>{done ? "Scored" : "No score"}</em>
                      </div>
                    );
                  })}
                </div>
              </section>
              )}

              <section style={{ marginTop: 24 }}>
                <h2 className="section-title">
                  <Icon name="link" /> Supporting material
                </h2>
                {trend.links.length === 0 ? (
                  <div className="empty small">
                    <p>
                      {trend.canWrite
                        ? "Nothing linked yet — research, boards and decks go here."
                        : "Nothing linked yet."}
                    </p>
                  </div>
                ) : (
                  <ul className="link-list">
                    {trend.links.map((l, i) => (
                      <li key={`${l.url}-${i}`}>
                        <a href={l.url} target="_blank" rel="noreferrer noopener">
                          <Icon name="link" size={14} />
                          {l.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {Object.keys(trend.labels).length > 0 && (
                <section style={{ marginTop: 24 }}>
                  <h2 className="section-title">
                    <Icon name="tier" /> Labels
                  </h2>
                  <dl className="label-groups">
                    {Object.entries(trend.labels).map(([group, values]) => (
                      <div key={group}>
                        <dt>{group}</dt>
                        <dd>
                          {values.map((v) => (
                            <span key={v} className="tag">
                              {v}
                            </span>
                          ))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
            </>
          )}
        </div>

        <aside>
          <div className="card">
            <div className="card-label">This profile</div>
            <dl className="facts">
              <div className="fact">
                <dt>Owner</dt>
                <dd>
                  {trend.ownerName ? (
                    <span className="who">
                      <Avatar id={trend.ownerId} name={trend.ownerName} />
                      {trend.ownerName}
                    </span>
                  ) : (
                    <span className="muted">Not set on the sheet</span>
                  )}
                </dd>
              </div>
              {others.length > 0 && (
                <div className="fact">
                  <dt>Also credited</dt>
                  <dd>{others.join(", ")}</dd>
                </div>
              )}
              {callBlurb && (
                <div className="fact">
                  <dt>The call</dt>
                  <dd>{callBlurb}</dd>
                </div>
              )}
              {trend.publishedOn && (
                <div className="fact">
                  <dt>Published</dt>
                  <dd>{formatLong(trend.publishedOn)}</dd>
                </div>
              )}
              {trend.editorStatus && (
                <div className="fact">
                  <dt>In Content Editor</dt>
                  <dd>{trend.editorStatus}</dd>
                </div>
              )}
              <div className="fact">
                <dt>Called for</dt>
                <dd>
                  {trend.activeFrom.slice(0, 4)}&ndash;{trend.activeTo.slice(0, 4)}
                </dd>
              </div>
              <div className="fact">
                <dt>Proof points</dt>
                <dd>{trend.proofPoints}</dd>
              </div>
              <div className="fact">
                <dt>Strategies</dt>
                <dd>{trend.strategies}</dd>
              </div>
              {/* The sheet gives one line per industry when a profile is scored
                  per industry, and a single "ALL - …" when it is not, so each
                  line is its own row — and a list takes the full width rather
                  than wrapping in the value column. */}
              {trend.latestScoreMonth && (
                <div className={scoreLines.length > 1 ? "fact stack" : "fact"}>
                  <dt>Latest score</dt>
                  <dd className="score-month">
                    {scoreLines.map((line, i) => (
                      <span key={i}>{line}</span>
                    ))}
                  </dd>
                </div>
              )}
              <div className="fact">
                <dt>Trend ID</dt>
                <dd className="mono">{trend.id}</dd>
              </div>
              {trend.lastSynced && (
                <div className="fact">
                  <dt>Synced</dt>
                  <dd>{formatLong(trend.lastSynced)}</dd>
                </div>
              )}
            </dl>

            {trend.editorUrl && (
              <a
                className="btn solid wide"
                href={trend.editorUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                <Icon name="edit" />
                Open in Content Editor
              </a>
            )}
            {trend.publishedUrl && (
              <a
                className="btn wide"
                href={trend.publishedUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                <Icon name="link" />
                View the published profile
              </a>
            )}

            {trend.canWrite && !editing && (
              <button className="btn wide" onClick={open}>
                <Icon name="note" />
                {trend.note || trend.links.length ? "Edit your note and links" : "Add a note or links"}
              </button>
            )}
          </div>

          {trend.hashtags.length > 0 && (
            <div className="card">
              <div className="card-label">Hashtags</div>
              <div className="trend-types">
                {trend.hashtags.map((h) => (
                  <span key={h} className="tag mono">
                    {h}
                  </span>
                ))}
              </div>
            </div>
          )}

          {trend.updatedBy && trend.updatedAt && (
            <div className="card">
              <div className="card-label">Last change here</div>
              <p className="muted small" style={{ margin: 0 }}>
                {formatLong(trend.updatedAt.slice(0, 10))}
              </p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
