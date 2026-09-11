import { useEffect } from "react";
import { useApi } from "./api";

/**
 * The colours and icons an admin has changed, applied to the running app.
 *
 * Every colour in the Hub comes from a CSS custom property, so an override is
 * one `setProperty` on the root element rather than a stylesheet of its own.
 * That also means the dark theme still works: the variables it redefines are
 * the same ones, and an inline value on `:root` wins over both, which is what
 * an admin asking for a particular colour means.
 *
 * Read by everybody — it is the look of the app, not a setting about a person
 * — and applied in one place, the layout, so no page has to know about it.
 */

export interface Token {
  id: string;
  css: string;
  label: string;
  group: string;
  fallback: string;
}

export interface Appearance {
  colours: Record<string, string>;
  icons: Record<string, string>;
  tokens?: Token[];
}

export const NO_APPEARANCE: Appearance = { colours: {}, icons: {} };

/**
 * Put a set of colours on the page.
 *
 * A token nobody has chosen has its property *removed* rather than set to the
 * fallback, so the stylesheet's own value comes back — including the one the
 * dark theme sets, which an inline copy of the light value would hide.
 *
 * Shared with the studio's editor, which calls it on every keystroke so an
 * admin sees the colour on the real thing rather than in a swatch.
 */
export function applyColours(tokens: Token[], colours: Record<string, string>): void {
  const root = document.documentElement;
  for (const token of tokens) {
    const chosen = colours[token.id];
    if (chosen) root.style.setProperty(token.css, chosen);
    else root.style.removeProperty(token.css);
  }
}

/**
 * Said when an admin saves, so the sidebar's own copy stops being stale.
 *
 * The colours are one `setProperty` away and the editor paints them as it
 * goes, but the icons are rendered by the sidebar from its own read — and a
 * changed icon that only appears after a refresh reads as "it did not work".
 */
export const APPEARANCE_CHANGED = "hub:appearance";

export function useAppearance(): Appearance {
  const stored = useApi<Appearance>("/appearance");
  const look = stored.data ?? NO_APPEARANCE;
  const tokens = look.tokens ?? [];
  // The colours as a string, so the effect runs when what was chosen actually
  // changes rather than on every render of the layout.
  const key = JSON.stringify(look.colours);

  useEffect(() => {
    if (tokens.length) applyColours(tokens, look.colours);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tokens.length]);

  const { reload } = stored;
  useEffect(() => {
    window.addEventListener(APPEARANCE_CHANGED, reload);
    return () => window.removeEventListener(APPEARANCE_CHANGED, reload);
  }, [reload]);

  return look;
}
