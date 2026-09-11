import { Router } from "express";
import { canRead, type ViewerRequest } from "./auth.js";
import type { HubStore } from "./store.js";

/**
 * Resources: the links the team keeps having to ask each other for.
 *
 * A Chrome extension somebody swears by, the training doc nobody can find,
 * the tool that lives on a different domain. None of it is the Hub's, and
 * all of it is what a forecaster needs open in another tab — so the Hub
 * holds the list rather than pretending to hold the things.
 *
 * Edited by an admin in the studio rather than in this file, because the
 * whole point is that the list changes without a developer: a link that
 * needs a deploy to appear is a link that will be pasted into chat instead.
 *
 * One row in `hub_settings`, as JSON. There is no query that wants to search
 * across these, it is a handful of rows, and it is ordered by hand — which is
 * three good reasons not to give it a table of its own.
 */

const KEY = "resources.links";

export interface ResourceLink {
  id: string;
  label: string;
  url: string;
  /** A line about what it is for, shown under the label on the page. */
  note?: string;
}

/**
 * What ships before anybody edits anything.
 *
 * Stored nowhere until an admin saves the list, so this stays the answer
 * through a rebuild and needs no seeding.
 */
export const DEFAULT_RESOURCES: ResourceLink[] = [
  {
    id: "moody2",
    label: "Moody2",
    url: "https://chromewebstore.google.com/detail/moody2/ndddendnbhencpcekggegcihmjbjmfbj",
    note: "Chrome extension for building mood boards as you browse.",
  },
];

const MAX = 60;

/**
 * Only somewhere a browser will actually go, and only somewhere the person
 * saving it meant.
 *
 * `javascript:` and `data:` URLs are the reason this is a check rather than a
 * trim: these end up as the `href` of a link every member of the team is
 * invited to click, so nothing but http and https is stored.
 */
export function readUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().slice(0, 2000);
  } catch {
    return null;
  }
}

const slug = (label: string, taken: Set<string>): string => {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "link";
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  taken.add(id);
  return id;
};

/**
 * A list as somebody typed it, turned into a list worth storing.
 *
 * Anything without both a label and a usable URL is dropped rather than
 * rejected: half a row is somebody mid-edit, and losing the rest of their
 * list to it would be the wrong trade.
 */
export function readLinks(value: unknown): ResourceLink[] {
  if (!Array.isArray(value)) return [];
  const taken = new Set<string>();
  const out: ResourceLink[] = [];
  for (const row of value.slice(0, MAX)) {
    const item = (row ?? {}) as Record<string, unknown>;
    const label = String(item.label ?? "").trim().slice(0, 80);
    const url = readUrl(item.url);
    if (!label || !url) continue;
    const note = String(item.note ?? "").trim().slice(0, 200);
    out.push({ id: slug(label, taken), label, url, ...(note ? { note } : {}) });
  }
  return out;
}

/** The stored list, or the built-in one if nobody has saved theirs. */
export async function resourcesFor(store: HubStore): Promise<ResourceLink[]> {
  const raw = await store.setting(KEY);
  if (!raw) return DEFAULT_RESOURCES;
  try {
    return readLinks(JSON.parse(raw));
  } catch {
    return DEFAULT_RESOURCES;
  }
}

export function createResourcesRouter(store: HubStore): Router {
  const router = Router();

  /** Everybody on the team sees the same list; it is a menu, not a secret. */
  router.get("/resources", async (req: ViewerRequest, res, next) => {
    try {
      if (!canRead(req.viewer!)) {
        res.status(403).json({ error: "This account does not have access to the Hub." });
        return;
      }
      res.json({ links: await resourcesFor(store) });
    } catch (err) {
      next(err);
    }
  });

  /**
   * The whole list at once, replaced.
   *
   * A list of six links reordered by hand is one edit, not six — and sending
   * all of it means the order is whatever the admin last saw, with no
   * position column to keep in step.
   */
  router.put("/studio/resources", async (req: ViewerRequest, res, next) => {
    try {
      const viewer = req.viewer!;
      if (viewer.role !== "admin") {
        res.status(403).json({ error: "Only an admin can change the resources menu." });
        return;
      }
      const body = (req.body ?? {}) as { links?: unknown };
      if (!Array.isArray(body.links)) {
        res.status(400).json({ error: "Send { links: [...] }." });
        return;
      }
      const kept = readLinks(body.links);
      const dropped = body.links.length - kept.length;
      await store.setSetting(KEY, JSON.stringify(kept), viewer.email);
      res.json({
        links: kept,
        // Said rather than silently done, so a mistyped address is visible.
        dropped: dropped > 0 ? dropped : undefined,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
