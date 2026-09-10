/**
 * The gate every proof point's markup goes through.
 *
 * A proof point arrives as HTML, already rendered by the matching pipeline —
 * a headline, a donut drawn in SVG, a stat row, a quote. The library puts
 * that markup straight into the page, which is exactly the thing you must not
 * do with HTML you did not write. Two of its ingredients are model output
 * (the pipeline builds captions and rationales with an LLM) and one is the
 * data callout's own text, typed by whoever wrote it; none of the three is
 * trustworthy enough to inject as markup.
 *
 * So it is rebuilt rather than filtered. Every tag, every attribute and every
 * class is checked against a list of what a proof point actually contains,
 * and anything else is dropped — not escaped, not stripped of its dangerous
 * parts, dropped. A `<script>` cannot survive that, and neither can an
 * `onclick`, a `style`, a `javascript:` href, or a tag nobody has thought
 * about yet.
 *
 * The lists come from what the 10,235 rendered proof points hold today: ten
 * tags, twenty-four attributes, twenty-one classes. Adding a shape to the
 * pipeline means adding it here, which is the point — a new tag arriving
 * unannounced is exactly what should not render.
 */

/** Tags a proof point is built from. Everything else goes. */
const TAGS = new Set([
  "div",
  "span",
  "strong",
  "em",
  "u",
  "br",
  "a",
  // The donuts and gauges.
  "svg",
  "circle",
  "path",
  "text",
  "g",
  "line",
  "rect",
]);

/** Tags with no closing tag, so a stray `</br>` is not treated as one. */
const VOID_TAGS = new Set(["br"]);

/**
 * Attributes allowed, per tag. `*` applies to all of them.
 *
 * Presentation attributes on the SVG are allowed because that is how the
 * pipeline draws — it writes `fill` and `stroke` rather than a stylesheet.
 * `style` is not allowed anywhere: it can load a URL and it can cover the
 * page, and no proof point needs it.
 */
const ATTRS: Record<string, Set<string>> = {
  "*": new Set(["class"]),
  a: new Set(["href", "target", "rel", "title"]),
  svg: new Set(["width", "height", "viewbox", "fill", "xmlns"]),
  circle: new Set([
    "cx",
    "cy",
    "r",
    "fill",
    "stroke",
    "stroke-width",
    "stroke-dasharray",
    "stroke-dashoffset",
    "stroke-linecap",
    "transform",
  ]),
  path: new Set([
    "d",
    "fill",
    "stroke",
    "stroke-width",
    "stroke-dasharray",
    "stroke-dashoffset",
    "stroke-linecap",
    "stroke-linejoin",
    "transform",
  ]),
  line: new Set([
    "x1",
    "y1",
    "x2",
    "y2",
    "stroke",
    "stroke-width",
    "stroke-dasharray",
    "stroke-linecap",
  ]),
  rect: new Set(["x", "y", "width", "height", "rx", "ry", "fill", "stroke", "stroke-width"]),
  g: new Set(["transform", "fill", "stroke", "opacity"]),
  text: new Set([
    "x",
    "y",
    "dx",
    "dy",
    "fill",
    "transform",
    "text-anchor",
    "dominant-baseline",
    "font-size",
    "font-family",
    "font-weight",
    "letter-spacing",
  ]),
};

/**
 * Classes the Hub's stylesheet knows about.
 *
 * An unknown class is dropped rather than the element carrying it, because a
 * proof point with an unstyled `<div>` still reads; one with a class that
 * happens to match the Hub's own layout could break the page around it.
 */
const CLASSES = new Set([
  "pp",
  "pp-slide",
  "pp-head",
  "pp-sub",
  "pp-mark",
  "pp-caption",
  "pp-desc",
  "pp-foot",
  "pp-stat",
  "pp-stat-row",
  "pp-item",
  "pp-badge",
  "pp-arrow",
  "pp-up",
  "pp-down",
  "pp-quote",
  "pp-quotetext",
  "pp-author",
  "image-caption",
  "body",
  "link",
]);

/** Numbers, lengths, colours, transforms and path data — no URLs, no expressions. */
const SAFE_VALUE = /^[-+0-9a-zA-Z_ .,%#()/:]*$/;

/**
 * Where the platform lives, for the links a proof point writes as paths.
 *
 * The matching pipeline ran inside WGSN's own site, so a fair number of its
 * links are root-relative — `/interiors/article/680b…`, `/fashion/feed?…`.
 * Passed through unchanged those would point at the *Hub*, which is not where
 * they mean to go, so they are resolved against the platform instead. It has
 * to be a single leading slash: `//evil.example/x` is protocol-relative and
 * goes nowhere near this.
 */
const PLATFORM = "https://www.wgsn.com";

/**
 * Only a plain web address, so `javascript:`, `data:` and `vbscript:` cannot
 * get in — and neither can a bare path pretending to be one.
 */
function safeHref(value: string): string | undefined {
  // A handful of hrefs in the source hold two addresses, or an address with
  // a stray phone number after it. The first word is the link; the rest was
  // never navigable anyway.
  let url = value.trim().split(/\s+/)[0] ?? "";
  if (/^\/(?!\/)/.test(url)) url = PLATFORM + url;
  // No whitespace, no quotes, no angle brackets: nothing that could end the
  // attribute early or start a tag.
  if (/^https?:\/\/[^\s"'<>\\]+$/i.test(url)) return url;
  return undefined;
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

/** Text, as text. Existing entities are left alone so `&amp;` stays one. */
function escapeText(text: string): string {
  return text.replace(/&(?![a-zA-Z]+;|#\d+;|#x[0-9a-fA-F]+;)|[<>"]/g, (c) => ESCAPES[c] ?? c);
}

/** One tag's attributes, rebuilt from the ones its tag is allowed. */
function attributes(tag: string, raw: string): string {
  const allowed = ATTRS[tag];
  const out: string[] = [];
  const pattern = /([a-zA-Z-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (let m = pattern.exec(raw); m; m = pattern.exec(raw)) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    if (!ATTRS["*"].has(name) && !allowed?.has(name)) continue;

    if (name === "class") {
      const keep = value.split(/\s+/).filter((c) => CLASSES.has(c));
      if (keep.length) out.push(`class="${keep.join(" ")}"`);
      continue;
    }
    if (name === "href") {
      const href = safeHref(value);
      // A link out of the Hub opens in a new tab and is told not to hand the
      // Hub's window to whatever it opens.
      if (href) out.push(`href="${escapeText(href)}" target="_blank" rel="noopener noreferrer"`);
      continue;
    }
    // target and rel are set alongside href, never taken from the source.
    if (name === "target" || name === "rel") continue;
    if (name === "viewbox") {
      if (SAFE_VALUE.test(value)) out.push(`viewBox="${escapeText(value)}"`);
      continue;
    }
    if (name === "title") {
      out.push(`title="${escapeText(value)}"`);
      continue;
    }
    if (SAFE_VALUE.test(value)) out.push(`${name}="${escapeText(value)}"`);
  }
  return out.length ? ` ${out.join(" ")}` : "";
}

/**
 * A proof point's markup, rebuilt from what is allowed.
 *
 * Unclosed tags are closed and tags closed out of order are ignored, so the
 * result cannot leave the page's own markup open. Comments and doctypes are
 * dropped whole — a comment is where a half-escaped payload hides.
 */
export function sanitiseProofPointHtml(html: string): string {
  if (!html) return "";
  const out: string[] = [];
  const open: string[] = [];
  /*
   * A `<` only starts a tag when a letter, a slash, a bang or a question mark
   * follows it — the same rule the browser's own parser uses. So "5 < 6" is
   * five less than six, and gets escaped as text, rather than being read as
   * a tag and silently swallowed along with everything up to the next `>`.
   */
  const token = /<!--[\s\S]*?(?:-->|$)|<[!?][^>]*(?:>|$)|<\/?[a-zA-Z][^>]*(?:>|$)|<\/[^>]*(?:>|$)/g;
  let at = 0;

  for (let m = token.exec(html); m; m = token.exec(html)) {
    if (m.index > at) out.push(escapeText(html.slice(at, m.index)));
    at = m.index + m[0].length;

    const raw = m[0];
    // Comments, doctypes and processing instructions: nothing to keep.
    if (raw.startsWith("<!") || raw.startsWith("<?")) continue;

    const closing = /^<\s*\/\s*([a-zA-Z0-9:-]+)/.exec(raw);
    if (closing) {
      const tag = closing[1].toLowerCase();
      if (!TAGS.has(tag) || VOID_TAGS.has(tag)) continue;
      // Only close it if it is actually open, and close anything opened
      // inside it on the way — markup that nests wrongly stays balanced.
      const depth = open.lastIndexOf(tag);
      if (depth === -1) continue;
      while (open.length > depth) out.push(`</${open.pop()}>`);
      continue;
    }

    const opening = /^<\s*([a-zA-Z0-9:-]+)([\s\S]*?)\/?>?$/.exec(raw);
    if (!opening) continue;
    const tag = opening[1].toLowerCase();
    if (!TAGS.has(tag)) continue;

    if (VOID_TAGS.has(tag) || /\/>$/.test(raw.trim())) {
      out.push(`<${tag}${attributes(tag, opening[2])} />`);
      continue;
    }
    out.push(`<${tag}${attributes(tag, opening[2])}>`);
    open.push(tag);
  }

  if (at < html.length) out.push(escapeText(html.slice(at)));
  while (open.length) out.push(`</${open.pop()}>`);
  return out.join("");
}
