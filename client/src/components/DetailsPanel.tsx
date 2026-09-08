import { useState } from "react";
import { send, useApi } from "../lib/api";
import { formatLong } from "../lib/date";
import { personName } from "../lib/domain";
import type { ContentItem, ForecastDetails, Person, ResearchLink } from "../types";

interface DetailsResponse {
  details: ForecastDetails | null;
  canWrite: boolean;
}

/** Years being forecast: "2028" on its own, or "2028–2029" for a span. */
function yearLabel(details: ForecastDetails): string | null {
  if (!details.yearFrom) return null;
  if (!details.yearTo || details.yearTo === details.yearFrom) return String(details.yearFrom);
  return `${details.yearFrom}–${details.yearTo}`;
}

/**
 * The details the team fills in on a forecast: what format it is, the years
 * it forecasts, where the research sits, and its Content Editor reference.
 *
 * The schedule comes from Smartsheet; this is the part the Hub owns, and
 * either the forecaster or their commissioning manager can fill it in.
 */
export default function DetailsPanel({
  item,
  people,
  contentTypes,
}: {
  item: ContentItem;
  people: Person[];
  contentTypes: string[];
}) {
  const loaded = useApi<DetailsResponse>(`/content/${item.id}/details`);
  const [details, setDetails] = useState<ForecastDetails | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  // Form state, seeded when the panel opens for editing.
  const [contentType, setContentType] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [editorId, setEditorId] = useState("");
  const [editorUrl, setEditorUrl] = useState("");
  const [links, setLinks] = useState<ResearchLink[]>([]);

  const current = details ?? loaded.data?.details ?? null;
  const canWrite = loaded.data?.canWrite ?? false;

  function open() {
    setContentType(current?.contentType ?? item.type);
    setYearFrom(current?.yearFrom ? String(current.yearFrom) : "");
    setYearTo(current?.yearTo ? String(current.yearTo) : "");
    setEditorId(current?.editorId ?? "");
    setEditorUrl(current?.editorUrl ?? "");
    setLinks(current?.researchLinks ?? []);
    setProblem(undefined);
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setProblem(undefined);
    try {
      const saved = await send<ForecastDetails>(`/content/${item.id}/details`, "PUT", {
        contentType: contentType.trim() || undefined,
        yearFrom: yearFrom || undefined,
        yearTo: yearTo || undefined,
        editorId: editorId.trim() || undefined,
        editorUrl: editorUrl.trim() || undefined,
        researchLinks: links.filter((l) => l.url.trim()),
      });
      setDetails(saved);
      setEditing(false);
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Forecast details</h2>
        </div>
        <div className="details-form">
          <div className="details-row">
            <label className="field">
              <label>Content type</label>
              <input
                list="content-types"
                value={contentType}
                onChange={(e) => setContentType(e.target.value)}
                placeholder="Season Forecast"
              />
              <datalist id="content-types">
                {contentTypes.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <label>Forecasting year</label>
              <input
                type="number"
                min={2000}
                max={2100}
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value)}
                placeholder="2028"
              />
            </label>
            <label className="field">
              <label>Through to (optional)</label>
              <input
                type="number"
                min={2000}
                max={2100}
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value)}
                placeholder="2029"
              />
            </label>
          </div>

          <div className="details-row">
            <label className="field">
              <label>Content Editor ID</label>
              <input
                value={editorId}
                onChange={(e) => setEditorId(e.target.value)}
                placeholder="CE-88214"
              />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <label>Content Editor link</label>
              <input
                value={editorUrl}
                onChange={(e) => setEditorUrl(e.target.value)}
                placeholder="https://editor.wgsn.com/docs/…"
                style={{ width: "100%" }}
              />
            </label>
          </div>

          <div>
            <label className="details-legend">Research links</label>
            {links.map((link, i) => (
              <div className="details-row" key={i}>
                <input
                  placeholder="What it is"
                  value={link.label}
                  onChange={(e) =>
                    setLinks(links.map((l, j) => (i === j ? { ...l, label: e.target.value } : l)))
                  }
                />
                <input
                  placeholder="https://…"
                  value={link.url}
                  style={{ flex: 1 }}
                  onChange={(e) =>
                    setLinks(links.map((l, j) => (i === j ? { ...l, url: e.target.value } : l)))
                  }
                />
                <button
                  className="btn ghost"
                  onClick={() => setLinks(links.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="btn"
              style={{ marginTop: 6 }}
              onClick={() => setLinks([...links, { label: "", url: "" }])}
            >
              Add a research link
            </button>
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <button className="btn solid" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save details"}
            </button>
            <button className="btn ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>

          {problem && <div className="callout warn">{problem}</div>}
        </div>
      </section>
    );
  }

  const years = current ? yearLabel(current) : null;
  const hasAnything =
    current &&
    (current.contentType || years || current.editorId || current.editorUrl || current.researchLinks.length);

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">Forecast details</h2>
        {canWrite && (
          <button className="btn" onClick={open}>
            {hasAnything ? "Edit" : "Fill these in"}
          </button>
        )}
      </div>

      {!hasAnything ? (
        <div className="empty">
          {canWrite
            ? "Content type, the years being forecast, research links and the Content Editor reference all go here."
            : "Nothing filled in yet."}
        </div>
      ) : (
        <div className="details-view">
          <dl className="details-facts">
            <div className="fact">
              <dt>Content type</dt>
              <dd>{current!.contentType ?? item.type}</dd>
            </div>
            {years && (
              <div className="fact">
                <dt>Forecasting</dt>
                <dd>{years}</dd>
              </div>
            )}
            <div className="fact">
              <dt>Season</dt>
              <dd>{item.season}</dd>
            </div>
            {(current!.editorId || current!.editorUrl) && (
              <div className="fact">
                <dt>Content Editor</dt>
                <dd>
                  {current!.editorUrl ? (
                    <a
                      href={current!.editorUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="link-out"
                    >
                      {current!.editorId ?? "Open in Content Editor"}
                    </a>
                  ) : (
                    current!.editorId
                  )}
                </dd>
              </div>
            )}
          </dl>

          {current!.researchLinks.length > 0 && (
            <div className="research">
              <div className="details-legend">Research</div>
              <ul className="research-list">
                {current!.researchLinks.map((link) => (
                  <li key={link.url}>
                    <a href={link.url} target="_blank" rel="noreferrer noopener" className="link-out">
                      {link.label}
                    </a>
                    <span className="research-host">{safeHost(link.url)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="signup-note" style={{ marginTop: 10 }}>
            Last updated by {personName(people, current!.updatedBy)} on{" "}
            {formatLong(current!.updatedAt.slice(0, 10))}.
          </p>
        </div>
      )}
    </section>
  );
}

/** The server only stores http(s), but never trust a stored string blindly. */
function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
