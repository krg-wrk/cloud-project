import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getJson, query } from "../lib/api";
import { useDialog } from "../lib/dialog";
import { Icon } from "../lib/icons";
import type { SearchHit, SearchKind, SearchResult } from "../types";

/**
 * One box over everything.
 *
 * ⌘K, or the box in the sidebar. Type, walk the results with the arrow keys,
 * Enter to go. No page of its own: a search is a way to get somewhere rather
 * than a destination, and a results page that you then have to leave is one
 * step more than anybody wants.
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

/**
 * Mounted only while open, which is what makes the rest simple: the state
 * starts fresh every time, so the box cannot still hold the last search, and
 * `useDialog` can do focus and Escape on mount and unmount as it does for
 * every other dialog.
 */
export default function SearchPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return open ? <Palette onClose={onClose} /> : null;
}

function Palette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const navigate = useNavigate();
  const box = useRef<HTMLInputElement | null>(null);
  const shell = useRef<HTMLDivElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);

  // Escape closes, Tab stays inside, focus goes back where it came from.
  useDialog(shell, onClose);

  // Debounced, and the older answer is dropped if a newer one has been asked
  // for — otherwise a slow request for "col" lands after "collagen".
  useEffect(() => {
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
  }, [q]);

  const hits = result?.hits ?? [];

  const go = useCallback(
    (hit: SearchHit) => {
      onClose();
      navigate(hit.to);
    },
    [navigate, onClose],
  );

  /*
   * The arrows and Enter, on the dialog itself.
   *
   * The list is walked rather than tabbed: focus stays in the box, and
   * `aria-activedescendant` is what tells a screen reader which row is
   * chosen. Tabbing through a hundred results to reach the fourth is not
   * navigation.
   */
  function onKey(e: React.KeyboardEvent) {
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

  /*
   * One group per kind, carrying its own heading.
   *
   * A listbox may only hold options and groups, so the headings cannot be
   * loose children of it. The server already returns the hits in blocks of
   * one kind, so walking them in order and starting a group whenever the
   * kind changes reproduces those blocks exactly.
   */
  const groups: { kind: SearchKind; from: number; hits: SearchHit[] }[] = [];
  hits.forEach((hit, i) => {
    const open = groups[groups.length - 1];
    if (open && open.kind === hit.kind) open.hits.push(hit);
    else groups.push({ kind: hit.kind, from: i, hits: [hit] });
  });

  return (
    <>
      <button className="palette-scrim" onClick={onClose} aria-label="Close search" tabIndex={-1} />
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search the Hub"
        ref={shell}
        onKeyDown={onKey}
      >
        <div className="palette-box">
          <Icon name="search" size={17} />
          <input
            ref={box}
            type="search"
            value={q}
            /*
             * No autoFocus: React applies it during commit, before effects,
             * so useDialog would then record the box itself as "where focus
             * came from" and have nowhere to put it back. The hook focuses
             * the first thing in here, which is this.
             */
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

        <div
          className="palette-results"
          id="palette-results"
          role="listbox"
          aria-label="Results"
          ref={list}
        >
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

          {groups.map((group) => {
            const all = result?.counts[group.kind] ?? 0;
            return (
              <div
                key={group.kind}
                role="group"
                aria-labelledby={`palette-group-${group.kind}`}
              >
                <div className="palette-group" id={`palette-group-${group.kind}`}>
                  {result?.labels[group.kind]}
                  {all > group.hits.length && <span className="muted"> · {all} in all</span>}
                </div>
                {group.hits.map((hit, j) => {
                  const i = group.from + j;
                  return (
                    <button
                      key={`${hit.to}-${i}`}
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
                  );
                })}
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
