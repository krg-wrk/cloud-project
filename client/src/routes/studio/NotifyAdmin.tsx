import { useState } from "react";
import { send, useApi } from "../../lib/api";
import { Icon } from "../../lib/icons";
import type { NotifyLog, RunResult } from "../../types";
import { ErrorNote, Loading } from "../../components/bits";
import { since } from "./Freshness";

/**
 * Notifications, from the sending end.
 *
 * The dry run is the point of this page. A feature whose failure mode is two
 * hundred people getting an email at three in the morning needs a way to
 * find out what it is about to do, and pressing a button labelled "send" to
 * find out is not it. So the preview is the default and the real send is a
 * second, differently coloured press with the count in front of you.
 *
 * The log underneath answers the other question an admin gets asked: "I
 * ticked Google Chat and nothing arrived." The reason is a row in here.
 */

const KIND_LABEL: Record<string, string> = {
  digest: "The week ahead",
  deadline: "Deadline",
  review: "Proof points",
};

const CHANNEL_LABEL: Record<string, string> = {
  inApp: "In the Hub",
  email: "Email",
  chat: "Google Chat",
};

export default function NotifyAdmin() {
  const log = useApi<NotifyLog>("/notifications/log");
  const [preview, setPreview] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState("");

  if (log.error) return <ErrorNote message={log.error} />;
  if (!log.data) return <Loading what="the notification log" />;

  const l = log.data;

  async function run(send_: boolean) {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (send_) params.set("send", "1");
      if (date) params.set("date", date);
      const query = params.toString();
      const result = await send<RunResult>(
        `/notifications/run${query ? `?${query}` : ""}`,
        "POST",
      );
      setPreview(result);
      if (send_) log.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The run failed.");
    } finally {
      setBusy(false);
    }
  }

  const waiting = preview?.deliveries.filter((d) => d.ok && d.problem === "dry run — nothing sent");

  return (
    <>
      {error && <ErrorNote message={error} />}

      <div className="studio-bar">
        <p className="muted small" style={{ margin: 0 }}>
          {l.scheduled
            ? "The schedule is on: deadline notices daily, the digest on Mondays."
            : "Nothing sends itself. The schedule is off, so notices only go out when somebody presses the button below."}{" "}
          {l.chose} of {l.team} have chosen their own settings; the rest get the default, which is
          the bell and nothing else.
        </p>
        <button className="btn" onClick={() => log.reload()}>
          <Icon name="refresh" /> Refresh
        </button>
      </div>

      <div className="studio-item">
        <div className="studio-item-head">
          <div>
            <h2>Channels</h2>
            <p className="muted small">
              In-app always works. The other two need pointing at something, and neither sends a
              byte until they are &mdash; a forecaster who ticks email before that gets nothing
              and is told so on their own settings page.
            </p>
          </div>
        </div>
        <dl className="studio-facts">
          {l.channels.map((c) => (
            <div className="fact" key={c.channel}>
              <dt>{CHANNEL_LABEL[c.channel] ?? c.channel}</dt>
              <dd>
                <span className={c.ready ? "ok-text" : "needs-score"}>
                  {c.ready ? "ready" : "not set up"}
                </span>
                <div className="muted small">{c.note}</div>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="studio-item" id="notify-run">
        <div className="studio-item-head">
          <div>
            <h2>Run it</h2>
            <p className="muted small">
              The preview builds every notice and works out where each would go, and sends
              nothing. Read it before you send: a mistake here reaches the whole team at once.
            </p>
          </div>
          <div className="studio-item-actions">
            <label className="field small">
              <span>As if it were</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Run as if it were this date"
              />
            </label>
            <button className="btn" onClick={() => void run(false)} disabled={busy}>
              <Icon name="eye" /> Preview
            </button>
          </div>
        </div>

        {preview && (
          <>
            <p className="studio-note">{preview.summary}</p>
            {preview.built === 0 ? (
              <p className="muted small">
                Nothing is waiting. No deadline is at three days, due today or overdue, and the
                digest only builds on a Monday &mdash; pick a Monday above to see one.
              </p>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="schedule">
                    <thead>
                      <tr>
                        <th>Who</th>
                        <th>What</th>
                        <th>Where</th>
                        <th>Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.deliveries.map((d) => (
                        <tr key={`${d.key}-${d.channel}`}>
                          <td>{preview.names?.[d.personId] ?? d.personId}</td>
                          <td>{KIND_LABEL[d.kind] ?? d.kind}</td>
                          <td>{CHANNEL_LABEL[d.channel] ?? d.channel}</td>
                          <td className={d.ok ? "said" : "said needs-score"}>
                            {d.problem ?? "sent"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {preview.dry && (
                  <div className="studio-item-actions" style={{ marginTop: 14 }}>
                    <button
                      className="btn danger"
                      onClick={() => void run(true)}
                      disabled={busy || !waiting?.length}
                    >
                      <Icon name="send" /> Send {waiting?.length ?? 0} for real
                    </button>
                    <span className="muted small">
                      Anything already sent is skipped, so this cannot repeat itself.
                    </span>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div className="studio-item" id="notify-log">
        <div className="studio-item-head">
          <div>
            <h2>What went out</h2>
            <p className="muted small">
              The last hundred attempts, newest first. Failures are kept and retried on the next
              run; a success is never repeated.
            </p>
          </div>
        </div>

        {l.sends.length === 0 ? (
          <p className="studio-note">Nothing has been sent yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="schedule">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                  <th>Where</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {l.sends.map((row) => (
                  <tr key={`${row.key}-${row.channel}`}>
                    <td className="muted">{since(row.at)} ago</td>
                    <td>{l.names[row.personId] ?? row.personId}</td>
                    <td>{KIND_LABEL[row.kind] ?? row.kind}</td>
                    <td>{CHANNEL_LABEL[row.channel] ?? row.channel}</td>
                    <td className={row.ok ? "said" : "said needs-score"}>
                      {row.ok ? "sent" : (row.problem ?? "failed")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
