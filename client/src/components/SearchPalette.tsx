import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getJson, query } from "../lib/api";
import { Icon } from "../lib/icons";
import type { SearchHit, SearchKind, SearchResult } from "../types";

/**
 * One box over everything.
 *
 * ⌘K, or the box in the sidebar. Type, walk the results with the arrow keys,
 * Enter to go. No page of its own: a search is a way to get somewhere rather
 * than a destination, and a results page that you then have to leave is one
 * step more than anybody wants.
 *
 * Grouped headings over a single ranked list, which is the arrangement that
 * lets the keyboard walk work: the headings are labels on a flat list, not
 * separate lists to tab between.
 */

const ICON: Record<SearchKind, string> = {
  forecast: "deadlines",
  trend: "trends",
  person: "people",
  session: "learning",
  proof: "proof",
  view: "eye",
};

/** Long enough that a keystroke does not cost a request, short enough to feel live. */
const WAIT_MS = 160;

export default function SearchPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const navigate = useNavigate();
  const box = useRef<HTMLInputElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  /** Where focus was before this opened, so Escape puts it back. */
  const cameFrom = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    cameFrom.current = document.activeElement;
    /*
     * Opens empty, every time.
     *
     * The component stays mounted between openings, so without this the box
     * still holds the last search and the next keystroke lands on the end of
     * it — you press ⌘K, type "collagen", and search for "catwalkcollagen".
     */
    setQ("");
    setResult(null);
    setAt(0);
    box.current?.focus();
    return () => {
      (cameFrom.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  // Debounced, and the older answer is dropped if a newer one has been asked
  // for — otherwise a slow request for "col" lands after "collagen".
  useEffect(() => {
    if (!open) return;
    const asked = q.trim();
    if (asked.length < 2) {
      setResult(null);
      setError(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      setBusy(true);
      getJson<SearchResult>(`/search${query({ q: asked })}`)
        .then((r) => {
          if (!alive) return;
          setResult(r);
          setError(null);
          setAt(0);
        })
        .catch((err: Error) => {
          if (!alive) return;
          setError(err.message);
        })
        .finally(() => alive && setBusy(false));
    }, WAIT_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, open]);

  const hits = result?.hits ?? [];

  const go = useCallback(
    (hit: SearchHit) => {
      onClose();
      navigate(hit.to);
    },
    [navigate, onClose],
  );

  /*
   * The keys, on the dialog rather than the window: while this is open it
   * owns the arrows and Enter, and when it is not there is nothing to
   * listen for. Tab is trapped because a dialog that lets you tab into the
   * page behind it is a dialog somebody will get lost in.
   */
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Tab") {
      // One field and a list of links: nothing to move between.
      e.preventDefault();
      box.current?.focus();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAt((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAt((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home" && hits.length) {
      e.preventDefault();
      setAt(0);
    } else if (e.key === "End" && hits.length) {
      e.preventDefault();
      setAt(hits.length - 1);
    } else if (e.key === "Enter" && hits[at]) {
      e.preventDefault();
      go(hits[at]);
    }
  }

  // Keep the chosen row on screen when the arrows walk past the fold.
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [at]);

  if (!open) return null;

  /*
   * Headings over a flat list.
   *
   * A hit gets a heading when its kind differs from the one before it, which
   * works because the list is already ranked and the ranking keeps kinds
   * mostly together — and where it does not, a kind appearing twice is
   * honest about what the ranking did.
   */
  let last: SearchKind | null = null;

  return (
    <>
      <button className="palette-scrim" onClick={onClose} aria-label="Close search" tabIndex={-1} />
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search the Hub"
        onKeyDown={onKey}
      >
        <div className="palette-box">
          <Icon name="search" size={17} />
          <input
            ref={box}
            type="search"
            value={q}
            placeholder="Forecasts, trends, people, sessions, proof points…"
            aria-label="Search the Hub"
            aria-autocomplete="list"
            aria-controls="palette-results"
            aria-activedescendant={hits[at] ? `hit-${at}` : undefined}
            onChange={(e) => setQ(e.target.value)}
          />
          {busy && <span className="palette-busy" aria-hidden="true" />}
          <kbd>Esc</kbd>
        </div>

        <div className="palette-results" id="palette-results" role="listbox" ref={list}>
          {error && <p className="palette-none">{error}</p>}

          {!error && q.trim().length < 2 && (
            <p className="palette-none">
              Two letters is enough. This looks in forecast titles and notes, trend profiles and
              their descriptions, people, sessions and the proof point library at once.
            </p>
          )}

          {!error && q.trim().length >= 2 && result && hits.length === 0 && (
            <p className="palette-none">
              Nothing matches &ldquo;{result.q}&rdquo;. Every word has to appear somewhere, so
              fewer words finds more.
            </p>
          )}

          {hits.map((hit, i) => {
            const heading = hit.kind !== last ? result?.labels[hit.kind] : null;
            last = hit.kind;
            const count = result?.counts[hit.kind] ?? 0;
            const shown = hits.filter((h) => h.kind === hit.kind).length;
            return (
              <div key={`${hit.kind}-${hit.to}-${i}`}>
                {heading && (
                  <div className="palette-group">
                    {heading}
                    {count > shown && <span className="muted"> · {count} in all</span>}
                  </div>
                )}
                <button
                  id={`hit-${i}`}
                  role="option"
                  aria-selected={i === at}
                  className={i === at ? "palette-hit on" : "palette-hit"}
                  onClick={() => go(hit)}
                  onMouseMove={() => setAt(i)}
                >
                  <Icon name={ICON[hit.kind]} size={15} />
                  <span className="palette-text">
                    <b>{hit.title}</b>
                    <span className="palette-sub">{hit.sub}</span>
                    {hit.why && <span className="palette-why">{hit.why}</span>}
                  </span>
                  <Icon name="back" size={14} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="palette-foot">
          <span>
            <kbd>&uarr;</kbd> <kbd>&darr;</kbd> to move · <kbd>&crarr;</kbd> to open
          </span>
          {result && result.total > 0 && (
            <span className="muted">
              {result.total} {result.total === 1 ? "match" : "matches"}
              {result.more && ", showing the best of each"}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * ⌘K anywhere, and the shortcut that opens it.
 *
 * A hook rather than a component so the dialog can live at the top of the
 * tree while the button that opens it lives in the sidebar.
 */
export function useSearchShortcut(open: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
        return;
      }
      /*
       * Plain "/" too, as every search box on the web does — but not while
       * somebody is typing into something, where it is a character.
       */
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const on = e.target as HTMLElement | null;
        if (on && /^(INPUT|TEXTAREA|SELECT)$/.test(on.tagName)) return;
        if (on?.isContentEditable) return;
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}
