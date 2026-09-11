import { useEffect, useRef, type RefObject } from "react";

/**
 * The four things a modal dialog owes a keyboard.
 *
 * Move focus in when it opens, keep Tab inside while it is open, close on
 * Escape, and put focus back where it came from when it goes. Miss the last
 * one and somebody who opened a dialog from the fortieth row of a table is
 * returned to the top of the document; miss the second and they tab
 * straight into a page they cannot see, which is the worst of the four
 * because nothing on screen tells them it happened.
 *
 * A hook rather than a component because the Hub's dialogs are all different
 * shapes — an enlarged proof point, a palette, a menu sheet — and only this
 * part of them is the same.
 */

/** Everything inside that a keyboard can reach, in document order. */
const REACHABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialog(
  box: RefObject<HTMLElement | null>,
  onClose: () => void,
  options: { focus?: boolean } = {},
): void {
  const cameFrom = useRef<Element | null>(null);
  const shouldFocus = options.focus !== false;

  useEffect(() => {
    cameFrom.current = document.activeElement;
    if (shouldFocus) {
      // The first thing you would have tabbed to, or the dialog itself when
      // it holds nothing to tab to at all.
      const first = box.current?.querySelector<HTMLElement>(REACHABLE);
      if (first) first.focus();
      else box.current?.focus();
    }
    return () => {
      const back = cameFrom.current as HTMLElement | null;
      // Only if it is still on the page: the thing that opened the dialog may
      // have been the row the dialog then replaced.
      if (back?.isConnected) back.focus?.();
    };
  }, [box, shouldFocus]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const inside = [...(box.current?.querySelectorAll<HTMLElement>(REACHABLE) ?? [])].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (!inside.length) {
        e.preventDefault();
        return;
      }
      const first = inside[0];
      const last = inside[inside.length - 1];
      const on = document.activeElement;
      // Wrap at both ends, and catch the case where focus has somehow got
      // outside — which is what makes this a trap rather than two edge cases.
      if (e.shiftKey && (on === first || !box.current?.contains(on))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (on === last || !box.current?.contains(on))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [box, onClose]);
}
