import { useEffect, useState } from "react";

/**
 * The settings that are yours rather than the Hub's.
 *
 * Kept in this browser rather than on the server, because that is what they
 * mean: "on this machine, at this desk, do not do that". A preference about
 * how a page looks to one person on one screen is not worth a row, a
 * migration and a round trip — and somebody who signs in from a laptop with a
 * bad panel wants the change there and not on their phone.
 *
 * Anything that has to follow a person between machines — which alerts reach
 * them, their photograph — belongs on the server instead, and does.
 */

export interface Preferences {
  /**
   * The iridescent wash, for you.
   *
   * "default" takes whatever the studio set for everybody; "off" is a
   * personal override of it. There is deliberately no personal "on": turning
   * something back on that an admin turned off would make the studio's switch
   * a suggestion rather than a setting.
   */
  wash: "default" | "off";
  /**
   * The explanation under each page title.
   *
   * Shut by default: the people who use the Hub every day outnumber the ones
   * meeting it, and a paragraph on every page pushes the thing they came for
   * a screen down. Opening one opens them all, which is the point — it is a
   * decision about the Hub, not about a page.
   */
  intros: "on" | "off";
  /** Whether the sidebar's account menu has been opened before. */
  seenAccountMenu?: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = { wash: "default", intros: "off" };

const KEY = "forecasters-hub.preferences";

/** Said when they change, so every reader on the page keeps up. */
export const PREFERENCES_CHANGED = "hub:preferences";

export function readPreferences(): Preferences {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Preferences>;
    return {
      wash: raw.wash === "off" ? "off" : "default",
      intros: raw.intros === "on" ? "on" : "off",
      seenAccountMenu: raw.seenAccountMenu === true,
    };
  } catch {
    // Blocked or corrupt storage: the defaults, which is the whole app working
    // as it does for somebody who has never changed anything.
    return DEFAULT_PREFERENCES;
  }
}

export function writePreferences(next: Preferences): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // The choice lasts for this page load. Still worth telling the page.
  }
  window.dispatchEvent(new Event(PREFERENCES_CHANGED));
}

/**
 * The preferences, kept current.
 *
 * Listens for the Hub's own event, so the settings page and the layout agree
 * without either knowing about the other, and for `storage`, so a change made
 * in one tab reaches the rest.
 */
export function usePreferences(): Preferences {
  const [prefs, setPrefs] = useState(readPreferences);

  useEffect(() => {
    const reread = () => setPrefs(readPreferences());
    window.addEventListener(PREFERENCES_CHANGED, reread);
    window.addEventListener("storage", reread);
    return () => {
      window.removeEventListener(PREFERENCES_CHANGED, reread);
      window.removeEventListener("storage", reread);
    };
  }, []);

  return prefs;
}
