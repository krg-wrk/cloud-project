import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * What a thing is, without opening it.
 *
 * A calendar chip has room for a title and nothing else, so the month view
 * answers "what is on the 14th" and refuses to answer "what *is* that". The
 * alternative to this is clicking through to a page and coming back, which is
 * the thing a calendar exists to save you.
 *
 * Four decisions worth keeping:
 *
 * **It waits.** 420ms, because a preview that appears the instant a pointer
 * crosses something turns a scan across a month into a strobe. Long enough to
 * be a decision, short enough not to feel broken.
 *
 * **A keyboard gets it too.** Focus opens it with no delay — somebody tabbing
 * has already committed — and Escape closes it. A preview only a mouse can
 * reach is a feature half the team does not have.
 *
 * **It is fixed, and it is a portal.** The calendar scrolls sideways inside
 * `overflow: auto`, so an absolutely positioned panel would be clipped by it;
 * fixed coordinates off `getBoundingClientRect` escape that. But `.main`
 * carries a z-index of its own — it sits above the page wash — which makes it
 * a stacking context, and the sidebar above it paints over *everything*
 * inside no matter what z-index the panel claims. The first version of this
 * lost the first letter of every preview behind the sidebar. So it renders
 * into `document.body` instead, where its z-index means what it says.
 *
 * **It never covers what you are pointing at.** Below the chip normally,
 * above it when there is no room below, and nudged sideways to stay on
 * screen — measured after it renders, because its height depends on what is
 * in it.
 */

const OPEN_AFTER_MS = 420;

/** Clear of the pointer, and clear of the chip's own hover state. */
const GAP = 10;

/** Never nearer the window edge than this. */
const MARGIN = 12;

interface At {
  /** The trigger's box, in viewport coordinates. */
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export function useHoverPreview() {
  const [at, setAt] = useState<At | null>(null);
  const timer = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const close = useCallback(() => {
    cancel();
    setAt(null);
  }, [cancel]);

  const boxOf = (el: HTMLElement): At => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, width: r.width };
  };

  /** Spread onto the element the preview is about. */
  const handlers = useCallback(
    (): {
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => void;
      onMouseLeave: () => void;
      onFocus: (e: React.FocusEvent<HTMLElement>) => void;
      onBlur: () => void;
    } => ({
      onMouseEnter: (e) => {
        const el = e.currentTarget;
        cancel();
        timer.current = window.setTimeout(() => setAt(boxOf(el)), OPEN_AFTER_MS);
      },
      onMouseLeave: close,
      // No wait on focus: tabbing to something is already a deliberate act.
      onFocus: (e) => {
        cancel();
        setAt(boxOf(e.currentTarget));
      },
      onBlur: close,
    }),
    [cancel, close],
  );

  // Scrolling or resizing moves the thing the panel is pointing at, and a
  // panel left behind is worse than no panel.
  useEffect(() => {
    if (!at) return;
    const away = () => close();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", away);
    document.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", away);
      document.removeEventListener("keydown", key);
    };
  }, [at, close]);

  useEffect(() => cancel, [cancel]);

  return { at, open: Boolean(at), handlers, close };
}

/**
 * The panel itself.
 *
 * `aria-hidden`, and never focusable: everything in it is already in the
 * chip's own accessible name or on the page it links to, so a screen reader
 * announcing it again would be repetition rather than help. It is a
 * convenience for the eye.
 */
export function HoverPreview({ at, children }: { at: At | null; children: ReactNode }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!at || !box.current) {
      setPlace(null);
      return;
    }
    const size = box.current.getBoundingClientRect();
    const below = at.bottom + GAP;
    const fitsBelow = below + size.height <= window.innerHeight - MARGIN;
    const top = fitsBelow ? below : Math.max(MARGIN, at.top - GAP - size.height);

    /*
     * Centred on the chip, then pulled back inside the content column.
     *
     * The left bound is the column's own edge rather than the window's, so a
     * preview of something in Monday's cell does not lie across the menu.
     * Falls back to the window on a phone, where there is no sidebar and
     * `#main` starts at nought anyway.
     */
    const column = document.getElementById("main")?.getBoundingClientRect();
    const leftBound = Math.max(MARGIN, (column?.left ?? 0) + MARGIN);
    const rightBound = Math.max(leftBound, window.innerWidth - size.width - MARGIN);
    const wanted = at.left + at.width / 2 - size.width / 2;
    const left = Math.min(Math.max(leftBound, wanted), rightBound);
    setPlace({ top, left });
  }, [at]);

  if (!at) return null;

  return createPortal(
    <div
      className="hover-preview"
      ref={box}
      aria-hidden="true"
      style={{
        top: place?.top ?? at.bottom + GAP,
        left: place?.left ?? at.left,
        // Measured before it is shown, so it never appears in the wrong place
        // first and then jumps to the right one.
        visibility: place ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
