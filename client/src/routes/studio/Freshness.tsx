import { useState } from "react";
import { send, useApi } from "../../lib/api";
import { Icon } from "../../lib/icons";
import type { FreshnessReport } from "../../types";
import { ErrorNote, Loading } from "../../components/bits";

/**
 * How old is what you are looking at.
 *
 * Three different clocks feed the Hub and none of them was visible anywhere.
 * The schedule is cached for a minute, so a date somebody corrected in
 * Smartsheet can be up to that stale. The trend profiles are an extract that
 * TFDB stamps itself. The proof points are an extract from a workbook a
 * pipeline writes weekly. Silent staleness is the failure mode nobody spots,
 * and "it says the wrong date" is the report you get instead.
 *
 * Admins only to begin with — it is a diagnostic, and the wording will want
 * tuning once somebody has read it in anger. An admin can turn it on for
 * everybody, which is what the switch at the bottom does.
 */

/** "12 seconds", "4 minutes", "2 hours" — the unit that reads naturally. */
export function ago(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}

/** How long ago a date was, or nothing when there is no date to go on. */
export function since(at: string | null): string | null {
  if (!at) return null;
  const then = Date.parse(at);
  if (Number.isNaN(then)) return null;
  return ago(Date.now() - then);
}

export default function Freshness() {
  const report = useApi<FreshnessReport>("/freshness");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (report.error) return <ErrorNote message={report.error} />;
  if (!report.data) return <Loading what="the freshness report" />;

  const r = report.data;

  async function setVisibility(visibleToAll: boolean) {
    setBusy(true);
    setError(null);
    try {
      await send("/freshness/visibility", "PUT", { visibleToAll });
      report.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "It could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <ErrorNote message={error} />}

      <div className="studio-bar">
        <p className="muted small" style={{ margin: 0 }}>
          Reading from <b>{r.source}</b>
          {r.writes ? (
            <>
              , and writing to <b>{r.writes}</b>
            </>
          ) : (
            <>. Nothing here writes to the sheets.</>
          )}
        </p>
        <button className="btn" onClick={() => report.reload()}>
          <Icon name="refresh" /> Check again
        </button>
      </div>

      <div className="studio-item">
        <div className="studio-item-head">
          <div>
            <h2>Cached reads</h2>
            <p className="muted small">
              What the Hub has read this session, oldest first. A read older than its
              cache window will be taken again the next time a page asks for it.
            </p>
          </div>
        </div>

        {r.reads.length === 0 ? (
          <p className="studio-note">
            Nothing read yet since the Hub started. A source nobody has asked for has no
            age &mdash; it will appear here once a page needs it.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="schedule">
              <thead>
                <tr>
                  <th scope="col">What</th>
                  <th scope="col">Last read</th>
                  <th scope="col">Cached for</th>
                  <th scope="col">Due again</th>
                </tr>
              </thead>
              <tbody>
                {r.reads.map((read) => {
                  const stale = read.ageMs > read.cacheMs;
                  return (
                    <tr key={read.key}>
                      <td>{read.label}</td>
                      <td className={stale ? "needs-score" : undefined}>
                        {ago(read.ageMs)} ago
                      </td>
                      <td className="muted">{Math.round(read.cacheMs / 1000)}s</td>
                      <td className="muted">
                        {stale ? "on the next request" : `in ${ago(read.cacheMs - read.ageMs)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="studio-item">
        <div className="studio-item-head">
          <div>
            <h2>Extracts</h2>
            <p className="muted small">
              These are not read live. They are files somebody generates, so their age is
              the age of the last generation &mdash; not of a request.
            </p>
          </div>
        </div>
        <dl className="studio-facts">
          {r.extracts.map((extract) => {
            const old = since(extract.at);
            return (
              <div className="fact" key={extract.label}>
                <dt>{extract.label}</dt>
                <dd>
                  {old ? (
                    <>
                      {old} ago
                      <div className="muted small">
                        {extract.what} · {extract.note}
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="muted">no date recorded</span>
                      <div className="muted small">
                        {extract.what} · {extract.note}
                      </div>
                    </>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      <div className="studio-item" id="freshness-visibility">
        <div className="studio-item-head">
          <div>
            <h2>Who sees this</h2>
            <p className="muted small">
              Shown to admins. Turned on for everybody, a line appears at the foot of
              every page saying how old the schedule is &mdash; useful when the team is
              working against a date that has just moved, noise the rest of the time.
            </p>
          </div>
          <div className="studio-item-actions">
            <button
              className={r.visibleToAll ? "btn accent" : "btn"}
              onClick={() => void setVisibility(!r.visibleToAll)}
              disabled={busy || !r.canChangeVisibility}
            >
              <Icon name={r.visibleToAll ? "eye" : "lock"} />
              {r.visibleToAll ? "Everybody sees it" : "Admins only"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
