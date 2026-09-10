import { useEffect } from "react";
import type { NavigateOptions, URLSearchParamsInit } from "react-router-dom";

/**
 * Remembering what someone last chose on a page.
 *
 * Every filter lives in the query string, which is what makes a view
 * shareable. That has one cost: arriving at /trends with no query means
 * arriving at the defaults, every time, even for someone who works in one
 * vertical and sets the same three filters each morning.
 *
 * So a page's own choices are kept per person, in this browser, and applied
 * only when the address carries none of them. A link someone was sent always
 * wins — otherwise a shared view would silently become a different view in
 * the recipient's hands, which is worse than not remembering at all.
 */

const PREFIX = "forecasters-hub.last";

/** Per person, so a shared machine or the demo's account switcher stays sane. */
function key(page: string, who: string): string {
  return `${PREFIX}.${page}.${who || "anon"}`;
}

export function readRemembered(page: string, who: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(key(page, who));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v !== "") out[k] = v;
    }
    return out;
  } catch {
    // Blocked or corrupt storage: fall back to the page's own defaults.
    return {};
  }
}

export function writeRemembered(page: string, who: string, values: Record<string, string>): void {
  try {
    const keep: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) if (v) keep[k] = v;
    if (Object.keys(keep).length === 0) localStorage.removeItem(key(page, who));
    else localStorage.setItem(key(page, who), JSON.stringify(keep));
  } catch {
    // Nothing to do; the choice lasts for this page load only.
  }
}

/**
 * Keep a page's filters and its remembered set in step.
 *
 * On arrival with a bare address, the remembered choices are put into the
 * query string — with `replace`, so the back button does not land on the
 * un-filtered version of the page you were just on. Afterwards, every change
 * is written back.
 *
 * `fields` is the list this page owns. Anything else in the address is left
 * alone, so a page can remember its filters without touching, say, a month.
 */
export function useRemembered(
  page: string,
  who: string,
  fields: string[],
  params: URLSearchParams,
  setParams: (next: URLSearchParamsInit, options?: NavigateOptions) => void,
): void {
  const carries = fields.some((f) => params.has(f));
  const current = JSON.stringify(fields.map((f) => params.get(f) ?? ""));

  useEffect(() => {
    if (!who) return;
    if (!carries) {
      const remembered = readRemembered(page, who);
      const wanted = fields.filter((f) => remembered[f]);
      if (wanted.length === 0) return;
      const next = new URLSearchParams(params);
      for (const f of wanted) next.set(f, remembered[f]);
      setParams(next, { replace: true });
      return;
    }
    writeRemembered(
      page,
      who,
      Object.fromEntries(fields.map((f) => [f, params.get(f) ?? ""])),
    );
    // `current` stands in for the values themselves: params is a new object on
    // every render, so depending on it directly would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, who, carries, current]);
}
