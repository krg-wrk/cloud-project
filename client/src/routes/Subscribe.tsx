import { useState } from "react";
import { send } from "../lib/api";
import { useViewer } from "../lib/viewer";

/**
 * Getting the Hub into Google Calendar.
 *
 * A subscribed feed rather than an integration: no OAuth, nothing to approve,
 * and it works the same in Outlook or on a phone. One-way and refreshed on
 * Google's schedule — which is the honest trade, so it says so here.
 */
export default function Subscribe() {
  const { me } = useViewer();
  const [feed, setFeed] = useState(me.calendarFeed);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const absolute = feed ? new URL(feed, window.location.origin).toString() : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this address", absolute);
    }
  }

  async function rotate() {
    if (
      !window.confirm(
        "Replace your calendar address? Any calendar already subscribed to the old one will stop updating.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await send<{ calendarFeed: string }>("/my/calendar/rotate", "POST");
      setFeed(res.calendarFeed);
    } finally {
      setBusy(false);
    }
  }

  if (!feed) {
    return (
      <>
        <div className="page-head">
          <div>
            <div className="eyebrow">Calendar</div>
            <h1 className="page-title">Add to your calendar</h1>
            <p className="page-sub">
              This account isn&rsquo;t linked to a forecaster record, so there is no personal
              feed for it.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Google Calendar · Outlook · phone</div>
          <h1 className="page-title">Add to your calendar</h1>
          <p className="page-sub">
            Subscribe once and your deadlines sit alongside your meetings — including on
            your phone. Your feed carries your submission dates, your publication dates,
            peer reviews either side of, sessions you signed up to, your own reminders and
            the holidays for your region.
          </p>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-body">
          <div className="feed-address">
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Your private calendar address
            </div>
            <code className="feed-url">{absolute}</code>
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              <button className="btn solid" onClick={copy}>
                {copied ? "Copied" : "Copy address"}
              </button>
              <a className="btn" href={feed}>
                Download once (.ics)
              </a>
              <button className="btn ghost" onClick={rotate} disabled={busy}>
                {busy ? "Replacing…" : "Replace address"}
              </button>
            </div>
          </div>

          <h2 className="section-title" style={{ margin: "28px 0 10px" }}>
            In Google Calendar
          </h2>
          <ol className="steps-list">
            <li>Copy the address above.</li>
            <li>
              Open Google Calendar on the web. In the left column, next to{" "}
              <strong>Other calendars</strong>, click <strong>+</strong>.
            </li>
            <li>
              Choose <strong>From URL</strong>, paste the address, and click{" "}
              <strong>Add calendar</strong>.
            </li>
            <li>
              It appears under Other calendars. Rename it and give it a colour from its
              three-dot menu.
            </li>
          </ol>

          <h2 className="section-title" style={{ margin: "28px 0 10px" }}>
            In Outlook
          </h2>
          <ol className="steps-list">
            <li>
              Calendar → <strong>Add calendar</strong> → <strong>Subscribe from web</strong>.
            </li>
            <li>Paste the address, name it, and import.</li>
          </ol>

          <div className="callout" style={{ marginTop: 26 }}>
            <strong>Worth knowing.</strong> This is one-way: the Hub fills your calendar,
            and changes you make in Google don&rsquo;t come back. Google also decides how
            often to re-read a subscribed feed — usually hours, occasionally longer — so a
            deadline moved this morning may not show in Google until later today. The Hub
            itself is always current.
          </div>
        </div>

        <aside>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              Keep it to yourself
            </div>
            <p style={{ fontSize: 12.5, color: "var(--ink-70)", margin: 0 }}>
              Anyone with this address can read your calendar without signing in — that is
              how subscribable feeds work everywhere. Don&rsquo;t paste it into a shared
              channel. If it gets out, replace it and the old address stops working
              immediately.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
