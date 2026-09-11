/**
 * The accessibility audit, over every page, in a real browser.
 *
 *   node tools/audit-a11y.mjs                 # the app, on http://localhost:5173
 *   node tools/audit-a11y.mjs --demo          # the built demo file
 *   node tools/audit-a11y.mjs --demo --dark   # and its dark theme
 *
 * Needs Playwright, which is not a dependency of the Hub because it is a
 * development tool rather than part of the product. Install it when you
 * want to run this:
 *
 *   npm i -D playwright && npx playwright install chromium
 *
 * Or point it at a browser that is already there: `CHROMIUM=/path/to/chrome`.
 *
 * Concrete, checkable things rather than a score, because a score tells you
 * nothing about what to change: a control with no accessible name, a field
 * whose label labels nothing, a heading level skipped, text under 4.5:1
 * against the ground it is actually drawn on, a table header with no scope.
 *
 * The contrast check walks up the tree for the real background rather than
 * trusting the element's own, which is what catches the case that matters —
 * a grey that passes on white and fails on the tinted panel it sits in.
 *
 * The in-page focus check cannot be trusted and is dropped from the output:
 * `.focus()` from a script does not set `:focus-visible`, which is what the
 * outline rule keys on. The Tab walk at the bottom presses a real key, and
 * is the one to believe.
 */

import { chromium } from "playwright";

const args = new Set(process.argv.slice(2));
const DEMO = args.has("--demo");
const DARK = args.has("--dark");

/** The app's paths and the demo's hashes, which differ in two places. */
const PAGES = [
  ["Today", "/", "#/"],
  ["Deadlines", "/deadlines", "#/deadlines"],
  ["Calendar", "/calendar/2026-09", "#/calendar/2026-09"],
  ["Trends", "/trends", "#/trends"],
  ["Performance", "/performance", "#/performance"],
  ["Proof points", "/data/proof-points", "#/data/proof-points"],
  ["Review", "/data/review?owner=all&quality=all", "#/data/review?owner=all&quality=all"],
  ["Team", "/team", "#/team"],
  ["Learning", "/workshops", "#/learning"],
  ["What's on", "/whats-on", "#/whats-on"],
  ["Calendar feed", "/subscribe", "#/subscribe"],
  ["Notifications", "/notifications", "#/notifications"],
  ["Studio", "/studio/connections", "#/studio/connections"],
  ["Freshness", "/studio/freshness", "#/studio/freshness"],
  ["Notify admin", "/studio/notifications", "#/studio/notifications"],
];

const APP = "http://localhost:5173";
const FILE = new URL("../demo/forecasters-hub.html", import.meta.url).href;

/** Somebody who can reach every page, so nothing is skipped as forbidden. */
const ADMIN = "graham.krag@wgsn.com";

const AUDIT = () => {
  const problems = [];
  const add = (kind, what, el) =>
    problems.push({
      kind,
      what,
      where: el
        ? `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""}${
            el.id ? "#" + el.id : ""
          }`
        : "",
      text: (el?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 50),
      /*
       * Inside a rendered proof point, which is the pipeline's own artwork
       * reproduced as published rather than anything the Hub draws. Told
       * apart by ancestry rather than by class name, because the markup
       * inside one uses plain names like `.body`.
       */
      theirs: Boolean(el?.closest?.(".pp, .pp-render")),
    });

  /** The name a screen reader would announce, roughly. */
  const nameOf = (el) => {
    const aria = el.getAttribute("aria-label");
    if (aria?.trim()) return aria.trim();
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const t = by
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ")
        .trim();
      if (t) return t;
    }
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label?.textContent.trim()) return label.textContent.trim();
    }
    const wrapping = el.closest("label");
    if (wrapping?.textContent.trim()) return wrapping.textContent.trim();
    const title = el.getAttribute("title");
    if (title?.trim()) return title.trim();
    if (el.tagName === "INPUT" && el.placeholder?.trim()) return `(placeholder) ${el.placeholder}`;
    // Visible text, ignoring anything hidden from the reader.
    const clone = el.cloneNode(true);
    for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
    return clone.textContent.replace(/\s+/g, " ").trim();
  };

  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // --- Named controls ---------------------------------------------------
  for (const el of document.querySelectorAll("button, a[href], [role='button'], [role='option']")) {
    if (!visible(el)) continue;
    if (!nameOf(el)) add("unnamed control", "nothing a screen reader can announce", el);
  }

  // --- Labelled fields --------------------------------------------------
  for (const el of document.querySelectorAll("input, select, textarea")) {
    if (!visible(el)) continue;
    if (el.type === "hidden") continue;
    const name = nameOf(el);
    if (!name) add("unlabelled field", "no label, aria-label or wrapping label", el);
    else if (name.startsWith("(placeholder)"))
      add("placeholder as label", "a placeholder disappears when you type", el);
  }

  // --- Headings ---------------------------------------------------------
  const heads = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(visible);
  const h1s = heads.filter((h) => h.tagName === "H1");
  if (h1s.length === 0) add("no h1", "the page has no top-level heading", null);
  if (h1s.length > 1) add("several h1", `${h1s.length} top-level headings`, h1s[1]);
  let previous = 0;
  for (const h of heads) {
    const level = Number(h.tagName[1]);
    if (previous && level > previous + 1)
      add("heading level skipped", `h${previous} then h${level}`, h);
    previous = level;
  }

  // --- Landmarks --------------------------------------------------------
  if (!document.querySelector("main")) add("no main", "nothing marks the main region", null);
  if (!document.documentElement.lang) add("no lang", "the document declares no language", null);

  // --- Tables -----------------------------------------------------------
  for (const table of document.querySelectorAll("table")) {
    if (!visible(table)) continue;
    if (!table.querySelector("th")) add("table without headers", "no th cells", table);
    for (const th of table.querySelectorAll("thead th")) {
      if (!th.getAttribute("scope")) add("th without scope", "a header cell with no scope", th);
    }
  }

  // --- Images -----------------------------------------------------------
  for (const img of document.querySelectorAll("img")) {
    if (!visible(img)) continue;
    if (img.getAttribute("alt") === null) add("image without alt", "no alt attribute at all", img);
  }

  // --- An icon that is the only content and is hidden from the reader ---
  for (const svg of document.querySelectorAll("svg")) {
    if (!visible(svg)) continue;
    const host = svg.parentElement;
    if (!host) continue;
    const own = host.textContent.replace(/\s+/g, " ").trim();
    if (own) continue;
    if (svg.getAttribute("aria-hidden") !== "true" && !svg.getAttribute("aria-label"))
      add("bare icon", "an icon alone, neither hidden nor labelled", host);
  }

  /*
   * --- Focus rings -------------------------------------------------------
   *
   * Indicative only, and dropped from the report. `.focus()` from a script
   * does not set :focus-visible, which is what the outline rule keys on, so
   * this over-reports; the Tab walk is the one to believe.
   */
  const focusables = [...document.querySelectorAll("button, a[href], input, select, textarea")]
    .filter(visible)
    .slice(0, 30);
  const noRing = [];
  for (const el of focusables) {
    el.focus();
    const s = getComputedStyle(el);
    const ring =
      (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) ||
      s.boxShadow !== "none" ||
      s.borderColor !== getComputedStyle(el.parentElement ?? el).borderColor;
    if (!ring) noRing.push(el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0]);
  }
  if (noRing.length) add("focus not visible", noRing.slice(0, 4).join(", "), null);

  // --- Contrast ----------------------------------------------------------
  const lum = (c) => {
    const [r, g, b] = c;
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const parse = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(/[,\s/]+/).map(Number);
    return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
  };
  const behind = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0.5) return bg.rgb;
      node = node.parentElement;
    }
    return [255, 255, 255];
  };
  const seen = new Set();
  for (const el of document.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const s = getComputedStyle(el);
    const fg = parse(s.color);
    if (!fg) continue;
    const bg = behind(el);
    const size = parseFloat(s.fontSize);
    const bold = Number(s.fontWeight) >= 700;
    const big = size >= 24 || (size >= 18.66 && bold);
    const l1 = lum(fg.rgb);
    const l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const need = big ? 3 : 4.5;
    if (ratio < need) {
      const key = `${s.color}|${size}|${el.className}`;
      if (seen.has(key)) continue;
      seen.add(key);
      add(
        "low contrast",
        `${ratio.toFixed(2)}:1 needs ${need} — ${s.color} on rgb(${bg.join(",")}) at ${size}px`,
        el,
      );
    }
  }

  return problems;
}

/** Tab through a page for real: every stop named, visible and ringed. */
async function walk(page) {
  const problems = [];
  let stops = 0;
  /*
   * Start from the top of the document rather than from wherever the last
   * page left the caret — otherwise a page walked after a long one starts
   * with focus already past its end and reports no stops at all.
   */
  await page.evaluate(() => {
    document.body.setAttribute("tabindex", "-1");
    document.body.focus();
    document.body.removeAttribute("tabindex");
  });
  let quiet = 0;
  for (let i = 0; i < 150; i++) {
    await page.keyboard.press("Tab");
    // A moment to settle: some controls (a date input among them) have not
    // had their focus style computed on the very next tick, which reports
    // as a missing ring when there is one.
    await page.waitForTimeout(12);
    const at = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const own = () => {
        const c = el.cloneNode(true);
        for (const h of c.querySelectorAll('[aria-hidden="true"]')) h.remove();
        return c.textContent;
      };
      const name = [
        el.getAttribute("aria-label"),
        el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : null,
        el.closest("label")?.textContent,
        el.getAttribute("title"),
        own(),
        el.tagName === "INPUT" ? el.placeholder : null,
      ].find((c) => c && c.trim());
      return {
        at: `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}`,
        named: Boolean(name),
        // :focus-visible is what the outline rule keys on, so a control
        // that matches it and has an outline is ringed.
        ring:
          (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) ||
          s.boxShadow !== "none" ||
          !el.matches(":focus-visible"),
        onScreen: r.width > 0 && r.height > 0,
      };
    });
    /*
     * A stop outside the document is the browser's own chrome, which is
     * where the tab order wraps. The first one means one lap is done, and
     * one lap is the whole page.
     */
    if (!at) {
      if (stops || ++quiet > 1) break;
      continue;
    }
    quiet = 0;
    stops++;
    if (!at.named) problems.push(`unnamed stop: ${at.at}`);
    if (!at.ring) problems.push(`no focus ring: ${at.at}`);
    if (!at.onScreen) problems.push(`off-screen stop: ${at.at}`);
  }
  return { stops, problems: [...new Set(problems)] };
}

/*
 * `CHROMIUM=/path/to/chrome` for a machine that already has one — a CI image,
 * or a container with a browser baked in. Without it, Playwright's own.
 */
const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
);
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  colorScheme: DARK ? "dark" : "light",
});
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

if (DEMO) {
  await page.goto(FILE, { waitUntil: "load" });
  await page.waitForTimeout(900);
  await page.evaluate((who) => {
    viewerId = people.find((x) => x.email === who).id;
    render();
  }, ADMIN);
} else {
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.evaluate((who) => localStorage.setItem("forecasters-hub.account", who), ADMIN);
}

const tally = new Map();
/*
 * Findings inside a rendered proof point are the pipeline's own design, not
 * the Hub's. The Hub shows a callout as it appears in the published
 * forecast, so "fixing" its colours here would mean showing something the
 * forecast does not. Reported separately, and they do not fail the run.
 */
const theirs = new Map();

for (const [name, path, hash] of PAGES) {
  if (DEMO) {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForTimeout(900);
  } else {
    await page.goto(`${APP}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1600);
  }

  const found = await page.evaluate(AUDIT);
  // The in-page focus check over-reports; the Tab walk below is the real one.
  const real = found.filter((f) => f.kind !== "focus not visible");
  const keys = await walk(page);

  const ours = [];
  for (const f of real) {
    const line = `${f.kind} — ${f.what}${f.where ? ` at ${f.where}` : ""}`;
    if (f.theirs) theirs.set(line, `${name}: ${line}`);
    else ours.push(line);
  }
  ours.push(...keys.problems);

  console.log(`${name.padEnd(15)} ${String(keys.stops).padStart(3)} tab stops` + (ours.length ? "" : "  clean"));
  for (const line of ours) {
    console.log(`   ${line}`);
    const kind = line.split(" — ")[0].split(":")[0];
    tally.set(kind, (tally.get(kind) ?? 0) + 1);
  }
}

console.log(`\n=== ${DEMO ? "demo" : "app"}${DARK ? ", dark" : ""} ===`);
if (!tally.size) console.log("  nothing found");
for (const [kind, n] of [...tally].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${kind}`);
}
console.log("  page errors:", pageErrors.length ? pageErrors.slice(0, 3) : "none");

if (theirs.size) {
  console.log("\n  in the pipeline's own proof point rendering, which the Hub reproduces");
  console.log("  rather than authors — worth raising with whoever draws them:");
  for (const line of theirs.values()) console.log(`    ${line}`);
}

await browser.close();
process.exitCode = tally.size ? 1 : 0;
