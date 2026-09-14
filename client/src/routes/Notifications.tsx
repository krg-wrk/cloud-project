import { useState } from "react";
import { Link } from "react-router-dom";
import { send, useApi } from "../lib/api";
import { Icon } from "../lib/icons";
import { Slot } from "../lib/custom";
import type { Inbox as InboxData } from "../types";
import { ago } from "./studio/Freshness";

/**
 * Your alerts: everything the Hub has told you.
 *
 * The reading half only. Choosing which alerts reach you and by which channel
 * is a setting, and settings live together in Settings — this page is the
 * inbox those choices fill, reachable from the bell, from a phone where there
 * is no bell to click, and from the Alerts section of Settings.
 */
export default function Notifications() {
  return (
    <>
      <div className="page-head">
        <div>
          <Slot id="notifications.eyebrow" as="div" className="eyebrow" />
          <Slot id="notifications.title" as="h1" className="page-title" />
          <p className="page-sub">
            Deadlines coming up, the Monday digest, and anything waiting for you to look at
            it. Which of these reach you &mdash; and whether by email, chat or only here
            &mdash; is yours to choose in <Link to="/settings">Settings</Link>.
          </p>
        </div>
        <Link className="btn" to="/settings">
          <Icon name="settings" size={15} /> Alert settings
        </Link>
      </div>

      <Inbox />
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

