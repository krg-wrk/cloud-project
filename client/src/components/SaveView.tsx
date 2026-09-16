import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { send, useApi } from "../lib/api";
import { Icon } from "../lib/icons";
import { useDialog } from "../lib/dialog";
import type { SavedView } from "../types";

/**
 * Save the page you are looking at, and get back to it later.
 *
 * What is saved is the address and nothing else — no copy of the rows, no
 * snapshot — which is what makes this cheap and what makes it honest: a saved
 * view opens whatever is true today. It is the same string the Copy link
 * button hands you, with a name on it.
 *
 * On the server rather than in this browser, because the point is that it
 * follows you: the cut you saved at your desk is the one on your phone.
 */

/** So every mounted copy of this refreshes when one of them saves. */
const SAVED_CHANGED = "forecasters-hub:saved-views";

export function announceSavedChange(): void {
  window.dispatchEvent(new Event(SAVED_CHANGED));
}

export function useSavedViews() {
  const saved = useApi<SavedView[]>("/saved-views");
  useEffect(() => {
    const onChange = () => saved.reload();
    window.addEventListener(SAVED_CHANGED, onChange);
    return () => window.removeEventListener(SAVED_CHANGED, onChange);
  });
  return saved;
}

export default function SaveView({ suggest }: { suggest?: string }) {
  const location = useLocation();
  const path = `${location.pathname}${location.search}`;
  const saved = useSavedViews();
  const [open, setOpen] = useState(false);

  const rows = saved.data ?? [];
  const already = rows.find((v) => v.path === path);

  return (
    <span className="saveview">
      <button
        className={already ? "btn small on" : "btn small"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={already ? `Saved as “${already.label}”` : "Save this filtered view"}
      >
        <Icon name="score" size={14} />
        {already ? "Saved" : "Save this view"}
      </button>
      {open && (
        <SaveMenu
          path={path}
          suggest={suggest}
          rows={rows}
          already={already}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}

function SaveMenu({
  path,
  suggest,
  rows,
  already,
  onClose,
}: {
  path: string;
  suggest?: string;
  rows: SavedView[];
  already?: SavedView;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState(already?.label ?? suggest ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useDialog(box, onClose);

  // Anywhere else closes it, the way every other small menu here behaves.
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    // Next tick, or the click that opened it closes it again.
    const id = setTimeout(() => document.addEventListener("mousedown", away));
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", away);
    };
  }, [onClose]);

  async function act(run: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await run();
      announceSavedChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save.");
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  return (
    <div className="saveview-menu" ref={box} role="dialog" aria-label="Saved views">
      <form
        className="saveview-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim() || busy) return;
          void act(async () => {
            if (already) await send(`/saved-views/${already.id}`, "PUT", { label: label.trim() });
            else await send("/saved-views", "POST", { label: label.trim(), path });
            onClose();
          });
        }}
      >
        <label className="field">
          <span className="field-label">
            {already ? "Rename this saved view" : "Save this view as"}
          </span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Womenswear, at risk"
            maxLength={80}
            autoFocus
          />
        </label>
        <div className="saveview-actions">
          <button className="btn accent small" disabled={busy || !label.trim()}>
            {already ? "Rename" : "Save"}
          </button>
          {already && (
            <button
              type="button"
              className="btn small danger"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await send(`/saved-views/${already.id}`, "DELETE");
                  onClose();
                })
              }
            >
              Remove
            </button>
          )}
        </div>
        {/* The address, so it is obvious a saved view is a link rather than a
            copy of what is on screen. */}
        <p className="saveview-path">{path}</p>
        {error && <p className="studio-note bad">{error}</p>}
      </form>

      {rows.length > 0 && (
        <div className="saveview-list">
          <div className="eyebrow">Your saved views</div>
          {rows.map((v) => (
            <Link key={v.id} to={v.path} className="saveview-link" onClick={onClose}>
              <Icon name="score" size={12} />
              <span>{v.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
