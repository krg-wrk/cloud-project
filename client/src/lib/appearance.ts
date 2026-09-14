import { useEffect } from "react";
import { useApi } from "./api";
import { usePreferences } from "./preferences";

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
  /** Whether the pages carry the iridescent wash behind them. */
  gradients: boolean;
  /** Nav group id → wash hue id, with the defaults already filled in. */
  washes: Record<string, string>;
  tokens?: Token[];
}

/** The hues on offer, mirroring `server/src/appearance.ts`. */
export const WASHES = [
  { id: "dusk", label: "Future Dusk", from: "the accent" },
  { id: "magenta", label: "Magenta", from: "the Pulse node, and anything that is yours" },
  { id: "green", label: "Green", from: "an approved proof point" },
  { id: "teal", label: "Teal", from: "a lunch and learn" },
  { id: "rose", label: "Rose", from: "a masterclass" },
  { id: "amber", label: "Amber", from: "a workshop" },
];

/** The groups a wash can be chosen for, in the order the sidebar shows them. */
export const WASH_GROUPS = [
  { id: "work", label: "Your work" },
  { id: "lab", label: "Forecast Lab" },
  { id: "data", label: "Data" },
  { id: "team", label: "The team" },
  { id: "resources", label: "Resources" },
  { id: "settings", label: "Settings" },
];

export const NO_APPEARANCE: Appearance = { colours: {}, icons: {}, gradients: true, washes: {} };

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
 * Turn the wash on or off, page-wide.
 *
 * An attribute on the root rather than a class on the shell, so the whole
 * stylesheet can gate on it in one selector and the preview in the studio is
 * a single line either way.
 */
export function applyGradients(on: boolean): void {
  document.documentElement.dataset.gradients = on ? "on" : "off";
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
  const mine = usePreferences();
  const look = stored.data ?? NO_APPEARANCE;
  const tokens = look.tokens ?? [];
  // The colours as a string, so the effect runs when what was chosen actually
  // changes rather than on every render of the layout.
  const key = JSON.stringify(look.colours);

  useEffect(() => {
    if (tokens.length) applyColours(tokens, look.colours);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tokens.length]);

  /*
   * The studio's switch, and then yours.
   *
   * A person may turn the wash off for themselves; nobody may turn it back on
   * once an admin has turned it off. So the two combine one way only, and the
   * setting reads as what it is rather than as a race between two switches.
   */
  const washOn = look.gradients !== false && mine.wash !== "off";
  useEffect(() => {
    applyGradients(washOn);
  }, [washOn]);

  const { reload } = stored;
  useEffect(() => {
    window.addEventListener(APPEARANCE_CHANGED, reload);
    return () => window.removeEventListener(APPEARANCE_CHANGED, reload);
  }, [reload]);

  return look;
}
