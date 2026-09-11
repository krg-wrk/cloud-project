import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { send, useApi } from "../lib/api";
import { Icon } from "../lib/icons";
import { Slot } from "../lib/custom";
import type {
  ChannelState,
  Inbox as InboxData,
  NoticeChannel,
  NoticeKind,
  NotifySettings,
  RunResult,
} from "../types";
import { ErrorNote, Loading } from "../components/bits";
import { ago } from "./studio/Freshness";

/**
 * What the Hub tells you, and where.
 *
 * A grid: the three kinds of notice down the side, the three channels
 * across. Tick the cells you want. The alternative designs — one switch per
 * channel, or one per kind — both fail the same way, because "email me about
 * deadlines but leave the digest in the Hub" is the preference most people
 * actually have.
 *
 * The channels say what they can do. An unconfigured one is still tickable,
 * because a forecaster's preference is worth recording before an admin wires
 * the relay up, but it says plainly that nothing will arrive yet — which is
 * the difference between a setting and a promise.
 */

const CHANNEL_ICON: Record<NoticeChannel, string> = {
  inApp: "bell",
  email: "mail",
  chat: "chat",
};

export default function Notifications() {
  const settings = useApi<NotifySettings>("/notifications/settings");
  const [on, setOn] = useState<Record<NoticeKind, NoticeChannel[]> | null>(null);
  const [webhook, setWebhook] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<RunResult | null>(null);

  // The server's answer is the starting point; edits are local until saved.
  useEffect(() => {
    if (!settings.data) return;
    setOn(settings.data.prefs.on);
    setWebhook(settings.data.prefs.chatWebhook ?? "");
    setDirty(false);
  }, [settings.data]);

  if (settings.error) return <ErrorNote message={settings.error} />;
  if (!settings.data || !on) return <Loading what="your notification settings" />;

  const s = settings.data;

  function toggle(kind: NoticeKind, channel: NoticeChannel) {
    setOn((current) => {
      if (!current) return current;
      const had = current[kind] ?? [];
      const next = had.includes(channel)
        ? had.filter((c) => c !== channel)
        : [...had, channel];
      return { ...current, [kind]: next };
    });
    setDirty(true);
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await send("/notifications/settings", "PUT", { on, chatWebhook: webhook.trim() || null });
      setSaved(true);
      setDirty(false);
      settings.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "It could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setError(null);
    setTest(null);
    try {
      setTest(await send<RunResult>("/notifications/test", "POST"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The test could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  const anythingOn = Object.values(on).some((cs) => cs.length > 0);

  return (
    <>
      <div className="page-head">
        <div>
          <Slot id="notifications.eyebrow" as="div" className="eyebrow" />
          <Slot id="notifications.title" as="h1" className="page-title" />
          <p className="page-sub">
            The Hub is a website, so it can only tell you something while you are looking at it.
            These are the things worth knowing when you are not &mdash; and you choose which of
            them reach you, and how.
          </p>
        </div>
      </div>

      {error && <ErrorNote message={error} heading="That could not be saved." />}

      {/* The same inbox the bell shows, in full — which is how somebody on a
          phone reads it, where there is no sidebar to hang a bell off. */}
      <Inbox />

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Where to send what</h2>
          <span className="muted small">
            {s.saved ? "Your own settings" : "Nobody has changed these yet — this is the default"}
          </span>
        </div>
        <div className="notify-grid" role="group" aria-label="What to be told, and where">
          <div className="notify-row notify-head">
            <div />
            {s.channels.map((c) => (
              <div key={c.channel} className="notify-channel">
                <Icon name={CHANNEL_ICON[c.channel]} size={15} />
                <b>{s.channelLabels[c.channel]}</b>
                {!c.ready && <span className="notify-off">not set up</span>}
              </div>
            ))}
          </div>

          {s.kinds.map((k) => (
            <div className="notify-row" key={k.kind}>
              <div className="notify-kind">
                <b>{k.label}</b>
                <span className="muted small">{k.hint}</span>
              </div>
              {s.channels.map((c) => {
                const ticked = (on[k.kind] ?? []).includes(c.channel);
                return (
                  <label
                    key={c.channel}
                    className={ticked ? "notify-cell on" : "notify-cell"}
                    title={`${k.label} — ${s.channelLabels[c.channel]}`}
                  >
                    <input
                      type="checkbox"
                      checked={ticked}
                      onChange={() => toggle(k.kind, c.channel)}
                    />
                    <span className="notify-tick" aria-hidden="true">
                      {ticked ? <Icon name="published" size={14} /> : null}
                    </span>
                    <span className="sr-only">
                      {s.channelLabels[c.channel]} for {k.label}
                    </span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>

        <div className="notify-notes">
          {s.channels.map((c) => (
            <p key={c.channel} className={c.ready ? "muted small" : "small notify-warn"}>
              <b>{s.channelLabels[c.channel]}.</b> {c.note}
            </p>
          ))}
        </div>

        {!anythingOn && (
          <p className="studio-note">
            Everything is off. Nothing will reach you, including the bell &mdash; which is a
            perfectly reasonable choice, and this is the only place that will mention it.
          </p>
        )}

        <div className="notify-actions">
          <button className="btn accent" onClick={() => void save()} disabled={busy || !dirty}>
            {dirty ? "Save" : saved ? "Saved" : s.saved ? "Saved" : "This is the default"}
          </button>
          <button className="btn" onClick={() => void sendTest()} disabled={busy}>
            <Icon name="send" /> Send me one now
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Your own Google Chat space</h2>
        <p className="muted small">
          Chat&rsquo;s webhooks belong to a space rather than to a person, so a notice goes to
          whichever space the webhook came from. Leave this empty to use the team&rsquo;s space;
          fill it in to have yours arrive somewhere only you read. In the space, open{" "}
          <b>Apps &amp; integrations &rarr; Webhooks</b> and copy the URL.
        </p>
        <div className="notify-webhook">
          <input
            type="url"
            value={webhook}
            placeholder="https://chat.googleapis.com/v1/spaces/…"
            aria-label="Your Google Chat webhook"
            onChange={(e) => {
              setWebhook(e.target.value);
              setDirty(true);
              setSaved(false);
            }}
          />
          {webhook && !webhook.startsWith("https://chat.googleapis.com/") && (
            <p className="small notify-warn">
              That does not look like a Google Chat webhook. It should start
              https://chat.googleapis.com/ &mdash; the Hub will not save anything else, because
              this field decides where your team&rsquo;s schedule gets posted.
            </p>
          )}
        </div>
      </div>

      {test && <TestResult result={test} channels={s.channels} labels={s.channelLabels} />}
    </>
  );
}

/** Everything the Hub has told you, newest first. */
function Inbox() {
  const inbox = useApi<InboxData>("/notifications");
  const [busy, setBusy] = useState(false);

  if (inbox.error || !inbox.data) return null;
  const rows = inbox.data.rows;

  async function act(path: string, method: "POST" | "DELETE", body?: unknown) {
    setBusy(true);
    try {
      await send(path, method, body);
      inbox.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          What you have been told
          {inbox.data.unread > 0 && <span className="count">{inbox.data.unread} new</span>}
        </h2>
        {inbox.data.unread > 0 && (
          <button
            className="btn small"
            disabled={busy}
            onClick={() => void act("/notifications/read", "POST")}
          >
            Mark all read
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="studio-note">
          Nothing yet. A deadline three days out, the Monday digest, and a review queue with
          something in it all appear here.
        </p>
      ) : (
        <ul className="inbox">
          {rows.map((row) => (
            <li key={row.id} className={`inbox-item u${row.urgency}${row.readAt ? "" : " unread"}`}>
              <div className="inbox-head">
                {row.link ? (
                  <Link to={row.link} className="inbox-title">
                    {row.title}
                  </Link>
                ) : (
                  <span className="inbox-title">{row.title}</span>
                )}
                <span className="muted small">{ago(Date.now() - Date.parse(row.at))} ago</span>
              </div>
              <p className="inbox-body">{row.body}</p>
              <div className="inbox-actions">
                {!row.readAt && (
                  <button
                    className="link-button"
                    disabled={busy}
                    onClick={() => void act("/notifications/read", "POST", { id: row.id })}
                  >
                    Mark read
                  </button>
                )}
                <button
                  className="link-button"
                  disabled={busy}
                  onClick={() => void act(`/notifications/${row.id}`, "DELETE")}
                >
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * What the test actually did.
 *
 * Including the nothings. "Nothing was waiting to be sent" is the most
 * likely outcome on a quiet Wednesday and it is not a failure, so it says so
 * rather than leaving a blank panel that reads as broken.
 */
function TestResult({
  result,
  channels,
  labels,
}: {
  result: RunResult;
  channels: ChannelState[];
  labels: Record<NoticeChannel, string>;
}) {
  const went = result.deliveries.filter((d) => d.ok && !d.problem);
  const held = result.deliveries.filter((d) => d.problem);

  return (
    <div className="card">
      <h2 className="card-title">The test</h2>
      {result.built === 0 ? (
        <p className="studio-note">
          Nothing was waiting to be sent. No deadline of yours is three days out, due today or
          overdue, and the digest only goes on a Monday &mdash; so there was genuinely nothing to
          tell you. Not a fault: try again when something is due.
        </p>
      ) : (
        <>
          <p className="muted small">
            {result.built} {result.built === 1 ? "notice" : "notices"} were waiting, and went
            down the channels you chose.
          </p>
          {went.length > 0 && (
            <ul className="notify-log">
              {went.map((d) => (
                <li key={`${d.key}-${d.channel}`}>
                  <Icon name="published" size={14} /> {labels[d.channel]} &mdash; {d.kind}
                </li>
              ))}
            </ul>
          )}
          {held.length > 0 && (
            <ul className="notify-log bad">
              {held.map((d) => (
                <li key={`${d.key}-${d.channel}`}>
                  <Icon name="at-risk" size={14} /> {labels[d.channel]} &mdash; {d.problem}
                  {d.problem === "channel not configured" && (
                    <>
                      {" "}
                      <span className="muted">
                        {channels.find((c) => c.channel === d.channel)?.note}
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
