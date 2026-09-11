import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getJson, send } from "../lib/api";
import { Icon } from "../lib/icons";
import type { Inbox, Inboxed } from "../types";
import { ago } from "../routes/studio/Freshness";

/**
 * The bell: what the Hub has told you, and how much of it is new.
 *
 * It polls, because the alternative is a socket the Hub does not need for
 * two notices a day and because a browser tab left open all week should
 * still be right by Monday lunchtime. Two minutes is slow enough to be free
 * and fast enough that somebody who has just pressed "send me a test" does
 * not think it failed.
 *
 * Opening the panel marks nothing read. Reading is what you did with the
 * notice, and "mark all read" is a decision people want to make on purpose —
 * a panel that clears itself the moment it opens loses the one thing you
 * came to look at.
 */

const EVERY_MS = 120_000;

export default function NotificationBell() {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async () => {
    try {
      setInbox(await getJson<Inbox>("/notifications"));
    } catch {
      /*
       * An account with no forecaster record has no inbox, which is a 403
       * rather than a fault. There is nothing useful to say about it in the
       * corner of every page, so the bell simply does not appear.
       */
      setInbox(null);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), EVERY_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Click away and Escape both close it, as they do any menu.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const on = e.target as Node;
      if (box.current?.contains(on) || button.current?.contains(on)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  if (!inbox) return null;

  async function act(path: string, method: "POST" | "DELETE", body?: unknown) {
    setBusy(true);
    try {
      await send(path, method, body);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const unread = inbox.unread;

  return (
    <div className="bell-wrap">
      <button
        ref={button}
        className={unread ? "bell has-unread" : "bell"}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      >
        <Icon name="bell" size={17} />
        {unread > 0 && <span className="bell-count">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="bell-panel" ref={box} role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <b>Notifications</b>
            <div className="bell-head-actions">
              {unread > 0 && (
                <button
                  className="btn small"
                  disabled={busy}
                  onClick={() => void act("/notifications/read", "POST")}
                >
                  Mark all read
                </button>
              )}
              <Link className="btn small" to="/notifications" onClick={() => setOpen(false)}>
                Settings
              </Link>
            </div>
          </div>

          {inbox.rows.length === 0 ? (
            <p className="bell-none">
              Nothing yet. Deadlines and the Monday digest appear here &mdash; and by email or
              Google Chat if you ask for them in <Link to="/notifications">settings</Link>.
            </p>
          ) : (
            <ul className="bell-list">
              {inbox.rows.map((row) => (
                <Notice
                  key={row.id}
                  row={row}
                  busy={busy}
                  onRead={() => void act("/notifications/read", "POST", { id: row.id })}
                  onDrop={() => void act(`/notifications/${row.id}`, "DELETE")}
                  onGo={() => setOpen(false)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Notice({
  row,
  busy,
  onRead,
  onDrop,
  onGo,
}: {
  row: Inboxed;
  busy: boolean;
  onRead: () => void;
  onDrop: () => void;
  onGo: () => void;
}) {
  const unread = !row.readAt;
  return (
    <li className={`bell-item u${row.urgency}${unread ? " unread" : ""}`}>
      <div className="bell-item-head">
        {/* Following the link is reading it, so it marks itself. */}
        {row.link ? (
          <Link
            to={row.link}
            className="bell-title"
            onClick={() => {
              if (unread) onRead();
              onGo();
            }}
          >
            {row.title}
          </Link>
        ) : (
          <span className="bell-title">{row.title}</span>
        )}
        <span className="bell-when">{ago(Date.now() - Date.parse(row.at))} ago</span>
      </div>
      <p className="bell-body">{row.body}</p>
      <div className="bell-item-actions">
        {unread && (
          <button className="link-button" disabled={busy} onClick={onRead}>
            Mark read
          </button>
        )}
        <button className="link-button" disabled={busy} onClick={onDrop}>
          Dismiss
        </button>
      </div>
    </li>
  );
}
