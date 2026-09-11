import { Router } from "express";
import { canRead, type ViewerRequest } from "./auth.js";
import type { HubStore } from "./store.js";

/**
 * The colours and the icons, changeable without a deploy.
 *
 * The Hub's palette is already tokenised — every colour in the app comes from
 * a CSS variable at the top of index.css — so letting an admin change one is
 * a matter of storing an override and setting the variable, not of touching
 * the stylesheet. Which is the point: "in-review is too close to at-risk" is
 * a thing somebody notices while using it, and should be a thing they can fix
 * while using it.
 *
 * What is here is deliberately not the whole palette. The paper, the ink and
 * the rules are the house style and changing those is a redesign; what an
 * admin can change is the meaning colours — the statuses, the diary kinds,
 * the accent — because those are the ones that carry information and so the
 * ones a team argues about.
 *
 * An icon override says which glyph a sidebar item uses. The name has to be
 * one the client knows; an unknown one falls back to the built-in rather than
 * leaving a gap, because a menu item with no icon looks broken and a wrong
 * icon does not.
 */

const KEY = "appearance";

/** One thing an admin can recolour: the token, and what it is called. */
export interface Token {
  /** The stored key, which is also the CSS variable without the dashes. */
  id: string;
  /** The CSS custom property it sets. */
  css: string;
  label: string;
  group: string;
  /** What the code uses when nobody has changed it. */
  fallback: string;
}

export const TOKENS: Token[] = [
  { id: "accent", css: "--accent", label: "Accent", group: "The house colour", fallback: "#4c5578" },

  { id: "status-not-started", css: "--status-not-started", label: "Not started", group: "Status", fallback: "#8b8b91" },
  { id: "status-in-progress", css: "--status-in-progress", label: "In progress", group: "Status", fallback: "#2f5f9e" },
  { id: "status-submitted", css: "--status-submitted", label: "Submitted", group: "Status", fallback: "#6b4fc0" },
  { id: "status-in-review", css: "--status-in-review", label: "In review", group: "Status", fallback: "#875d13" },
  { id: "status-published", css: "--status-published", label: "Published", group: "Status", fallback: "#256b48" },
  { id: "status-at-risk", css: "--status-at-risk", label: "At risk, and anything late", group: "Status", fallback: "#b8341f" },

  { id: "event-leave", css: "--event-leave", label: "Leave", group: "The diary", fallback: "#6b4fc0" },
  { id: "event-public-holiday", css: "--event-public-holiday", label: "Public holiday", group: "The diary", fallback: "#17706c" },
  { id: "event-workshop", css: "--event-workshop", label: "Workshop", group: "The diary", fallback: "#9c6b16" },
  { id: "event-training", css: "--event-training", label: "Training", group: "The diary", fallback: "#2f5f9e" },
  { id: "event-conference", css: "--event-conference", label: "Show or conference", group: "The diary", fallback: "#a33a60" },

  { id: "kind-workshop", css: "--kind-workshop", label: "Workshop", group: "Learning sessions", fallback: "#4c5578" },
  { id: "kind-masterclass", css: "--kind-masterclass", label: "Masterclass", group: "Learning sessions", fallback: "#a33a60" },
  { id: "kind-lunch-and-learn", css: "--kind-lunch-and-learn", label: "Lunch and learn", group: "Learning sessions", fallback: "#17706c" },
  { id: "kind-critique", css: "--kind-critique", label: "Critique", group: "Learning sessions", fallback: "#9c6b16" },
  { id: "kind-training", css: "--kind-training", label: "Training", group: "Learning sessions", fallback: "#2f5f9e" },

  { id: "mine", css: "--mine", label: "Yours, and nobody else’s", group: "Marks", fallback: "#8e3b74" },
  { id: "review", css: "--review", label: "Waiting on a review", group: "Marks", fallback: "#a94c16" },
];

const BY_ID = new Map(TOKENS.map((t) => [t.id, t]));

export interface Appearance {
  /** token id → hex colour. Only what somebody changed. */
  colours: Record<string, string>;
  /** slot id → icon name. Only what somebody changed. */
  icons: Record<string, string>;
}

export const EMPTY: Appearance = { colours: {}, icons: {} };

/**
 * A colour the browser will take and a person meant.
 *
 * Hex only, rather than every colour CSS understands. `red` and
 * `color-mix(...)` would both work in the variable, but this value is shown
 * in a colour picker and compared for contrast, and both of those want six
 * digits. Refusing the rest keeps one representation everywhere.
 */
export function readColour(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(text)) return null;
  // Three digits expand, so everything stored is six.
  if (text.length === 4) {
    return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
  }
  return text;
}

/** An icon name as the client's registry spells them. */
export function readIcon(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  return /^[a-z][a-z0-9-]{0,30}$/.test(text) ? text : null;
}

/** A sidebar item's slot id, which is what an icon override is keyed on. */
const isSlot = (key: string): boolean => /^nav\.item\.[a-z0-9-]{1,40}$/.test(key);

/**
 * What was sent, reduced to what may be stored.
 *
 * Unknown tokens and unparseable colours are dropped rather than refused, for
 * the same reason the resources list drops a half-typed row: one bad value
 * should not lose the rest of somebody's work. The response says how many
 * went, so it is not silent.
 */
export function readAppearance(value: unknown): { kept: Appearance; dropped: number } {
  const body = (value ?? {}) as { colours?: unknown; icons?: unknown };
  const kept: Appearance = { colours: {}, icons: {} };
  let dropped = 0;

  for (const [id, raw] of Object.entries((body.colours ?? {}) as Record<string, unknown>)) {
    const colour = readColour(raw);
    // An empty string is "put it back to the code's own colour", not a change.
    if (raw === "" || raw === null) continue;
    if (!BY_ID.has(id) || !colour) {
      dropped++;
      continue;
    }
    if (colour === BY_ID.get(id)!.fallback) continue;
    kept.colours[id] = colour;
  }

  for (const [slot, raw] of Object.entries((body.icons ?? {}) as Record<string, unknown>)) {
    const icon = readIcon(raw);
    if (raw === "" || raw === null) continue;
    if (!isSlot(slot) || !icon) {
      dropped++;
      continue;
    }
    kept.icons[slot] = icon;
  }

  return { kept, dropped };
}

export async function appearanceFor(store: HubStore): Promise<Appearance> {
  const raw = await store.setting(KEY);
  if (!raw) return EMPTY;
  try {
    return readAppearance(JSON.parse(raw)).kept;
  } catch {
    return EMPTY;
  }
}

export function createAppearanceRouter(store: HubStore): Router {
  const router = Router();

  /**
   * Everybody reads it, because it is the look of the app rather than a
   * setting about anybody. It goes out alongside the page wording, and the
   * client sets the variables before the first paint it can.
   */
  router.get("/appearance", async (req: ViewerRequest, res, next) => {
    try {
      if (!canRead(req.viewer!)) {
        res.status(403).json({ error: "This account does not have access to the Hub." });
        return;
      }
      res.json({ ...(await appearanceFor(store)), tokens: TOKENS });
    } catch (err) {
      next(err);
    }
  });

  router.put("/studio/appearance", async (req: ViewerRequest, res, next) => {
    try {
      const viewer = req.viewer!;
      if (viewer.role !== "admin") {
        res.status(403).json({ error: "Only an admin can change how the Hub looks." });
        return;
      }
      const { kept, dropped } = readAppearance(req.body);
      await store.setSetting(KEY, JSON.stringify(kept), viewer.email);
      res.json({ ...kept, dropped: dropped > 0 ? dropped : undefined });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
