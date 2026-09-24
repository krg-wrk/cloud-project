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
  { id: "accent", css: "--accent", label: "Accent", group: "The house colour", fallback: "#4868b3" },

  { id: "status-not-started", css: "--status-not-started", label: "Not started", group: "Status", fallback: "#ef6c02" },
  { id: "status-in-progress", css: "--status-in-progress", label: "In progress", group: "Status", fallback: "#f09400" },
  { id: "status-submitted", css: "--status-submitted", label: "Submitted", group: "Status", fallback: "#e4c442" },
  { id: "status-in-review", css: "--status-in-review", label: "In review", group: "Status", fallback: "#bae8da" },
  { id: "status-published", css: "--status-published", label: "Published", group: "Status", fallback: "#049be5" },
  { id: "status-at-risk", css: "--status-at-risk", label: "At risk, and anything late", group: "Status", fallback: "#d50101" },

  { id: "event-leave", css: "--event-leave", label: "Leave", group: "The diary", fallback: "#7cb342" },
  { id: "event-public-holiday", css: "--event-public-holiday", label: "Public holiday", group: "The diary", fallback: "#009688" },
  { id: "event-conference", css: "--event-conference", label: "Show or conference", group: "The diary", fallback: "#9c6b16" },
  { id: "event-travel", css: "--event-travel", label: "Travel", group: "The diary", fallback: "#049be5" },
  { id: "event-marketing", css: "--event-marketing", label: "Marketing", group: "The diary", fallback: "#d91a60" },
  { id: "event-client-call", css: "--event-client-call", label: "Client call", group: "The diary", fallback: "#8e24aa" },
  { id: "event-reminder", css: "--event-reminder", label: "Reminder", group: "The diary", fallback: "#a68550" },
  { id: "event-other", css: "--event-other", label: "Anything not bucketed yet", group: "The diary", fallback: "#6e7e8b" },

  { id: "kind-workshop", css: "--kind-workshop", label: "Workshop", group: "Learning sessions", fallback: "#9f6aaf" },
  { id: "kind-scoring-session", css: "--kind-scoring-session", label: "Scoring session", group: "Learning sessions", fallback: "#7a86cb" },
  { id: "kind-trend-governance", css: "--kind-trend-governance", label: "Trend governance", group: "Learning sessions", fallback: "#3f52b5" },
  { id: "kind-forecast-forums", css: "--kind-forecast-forums", label: "Forecast forums", group: "Learning sessions", fallback: "#308d9a" },
  { id: "kind-research", css: "--kind-research", label: "Research", group: "Learning sessions", fallback: "#508a4d" },
  { id: "kind-other", css: "--kind-other", label: "Anything not bucketed yet", group: "Learning sessions", fallback: "#6e7e8b" },

  { id: "mine", css: "--mine", label: "Yours, and nobody else’s", group: "Marks", fallback: "#8b8b91" },
  { id: "review", css: "--review", label: "Waiting on a review", group: "Marks", fallback: "#b8341f" },
];

const BY_ID = new Map(TOKENS.map((t) => [t.id, t]));

export interface Appearance {
  /** token id → hex colour. Only what somebody changed. */
  colours: Record<string, string>;
  /** slot id → icon name. Only what somebody changed. */
  icons: Record<string, string>;
  /**
   * Whether the pages carry the iridescent wash behind them.
   *
   * On by default, and a single switch for everybody rather than a per-person
   * preference: it is a decision about how the Hub looks, which is the same
   * kind of decision as the accent colour sitting two fields above it. The
   * movement on the Forecast Builder is governed separately by the browser's
   * own reduced-motion setting, which no admin should be able to overrule.
   */
  gradients: boolean;
  /**
   * Which wash hue each part of the Hub takes.
   *
   * Keyed on the sidebar's own group ids, so the choice is "Data feels like
   * this" rather than "this page feels like this" — which is the grain the
   * nav already has and the only one a person would think in. Anything not
   * set here falls back to the default below, so an admin only stores the
   * ones they changed.
   */
  washes: Record<string, string>;
  /**
   * What clicking an entry on the calendar does.
   *
   * "page" opens the forecast, the workshop or the diary entry on its own
   * page, which is the address somebody pastes to a colleague. "panel" keeps
   * the month in place and opens the same detail over it, which is what you
   * want when you are reading down a week rather than going somewhere.
   *
   * A deployment-wide setting rather than a per-person one, deliberately: it
   * changes what a link does, and two people describing the same click
   * differently is worse than either behaviour.
   */
  opens: "page" | "panel";
}

/** The two ways a calendar entry can open. */
export const OPENS = ["page", "panel"] as const;

/** The hues on offer, each one a colour the Hub already uses somewhere. */
export const WASHES = [
  { id: "dusk", label: "Future Dusk", from: "the accent" },
  { id: "magenta", label: "Magenta", from: "the Pulse node, and anything that is yours" },
  { id: "green", label: "Green", from: "an approved proof point" },
  { id: "teal", label: "Teal", from: "a lunch and learn" },
  { id: "rose", label: "Rose", from: "a masterclass" },
  { id: "amber", label: "Amber", from: "a workshop" },
] as const;

const WASH_IDS: ReadonlySet<string> = new Set<string>(WASHES.map((w) => w.id));

/**
 * Where each group starts, before anybody changes it.
 *
 * Chosen so the light on a page agrees with the page: the Lab gets the
 * magenta its Pulse node is drawn in, Data the green an approved proof point
 * already uses, the team the amber of a workshop.
 */
export const DEFAULT_WASHES: Record<string, string> = {
  work: "dusk",
  lab: "magenta",
  data: "teal",
  team: "amber",
  resources: "dusk",
  settings: "dusk",
};

/** A nav group id, which is what a wash choice is keyed on. */
const isGroup = (key: string): boolean => key in DEFAULT_WASHES;

export const EMPTY: Appearance = {
  colours: {},
  icons: {},
  gradients: true,
  washes: {},
  // Going somewhere is what the calendar has always done, so it stays the
  // default: a change of setting should not change what a click means for
  // everybody who never asked for it.
  opens: "page",
};

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
  const body = (value ?? {}) as {
    colours?: unknown;
    icons?: unknown;
    gradients?: unknown;
    washes?: unknown;
    opens?: unknown;
  };
  /*
   * Absent means on, which matters for the records written before the switch
   * existed: an admin who had set a colour last month should not find the
   * washes off because their stored appearance predates them.
   */
  const kept: Appearance = {
    colours: {},
    icons: {},
    gradients: body.gradients !== false,
    washes: {},
    // Rebuilt from the two words that mean anything, rather than trusted:
    // anything else a client sends falls back to the way it has always been.
    opens: body.opens === "panel" ? "panel" : "page",
  };
  let dropped = 0;

  for (const [group, raw] of Object.entries((body.washes ?? {}) as Record<string, unknown>)) {
    if (raw === "" || raw === null) continue;
    if (!isGroup(group) || typeof raw !== "string" || !WASH_IDS.has(raw)) {
      dropped++;
      continue;
    }
    // Storing the default is the same as not storing it.
    if (raw === DEFAULT_WASHES[group]) continue;
    kept.washes[group] = raw;
  }

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

/**
 * Every group's wash, defaults filled in.
 *
 * Resolved on the server rather than in the client, so there is one copy of
 * the defaults and a page cannot disagree with the studio about what it is
 * showing.
 */
export async function washesFor(store: HubStore): Promise<Record<string, string>> {
  const stored = (await appearanceFor(store)).washes;
  return { ...DEFAULT_WASHES, ...stored };
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
      res.json({ ...(await appearanceFor(store)), tokens: TOKENS, washes: await washesFor(store) });
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
