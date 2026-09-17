import type { Viewer } from "../auth.js";
import type { Audience, Field, Filter, FormatRule, ViewSpec } from "./types.js";

/**
 * Turning a view's spec into rows.
 *
 * All of it runs on the server. A view's audience decides whether the request
 * is answered at all, and its filters decide what comes back — neither is
 * something the client is asked to enforce, because a slug someone was sent
 * would then be a way round both.
 */

/** Who the viewer is, as the `mine` filter and `mine` rules need them. */
export function identities(viewer: Viewer, viewerName?: string): string[] {
  return [viewer.email, viewer.personId ?? "", viewerName ?? ""]
    .filter(Boolean)
    .map((s) => s.toLowerCase());
}

/**
 * Whether this viewer may open this view.
 *
 * An admin sees everything, including drafts, because they are the person
 * building them. Everyone else needs the role rule, the vertical rule and the
 * view to be live — or to be named on it, which is the escape hatch for "just
 * these four people".
 */
export function canSeeView(
  audience: Audience,
  state: "draft" | "live",
  viewer: Viewer,
): boolean {
  if (!viewer.active) return false;
  if (viewer.role === "admin") return true;
  if (state !== "live") return false;

  if (audience.emails.some((e) => e.toLowerCase() === viewer.email.toLowerCase())) return true;

  const roleOk = audience.roles === "all" || audience.roles.includes(viewer.role);
  if (!roleOk) return false;

  if (audience.verticals === "all") return true;
  if (viewer.verticals === "all") return true;
  return audience.verticals.some((v) => (viewer.verticals as string[]).includes(v));
}

/**
 * Whether this viewer may change a cell in this view.
 *
 * Two gates, both of which have to open. Being able to read a view is not the
 * same permission as being able to change the sheet behind it, so the edit
 * rule's own audience is asked as well as the view's — and an admin is not
 * waved through the way `canSeeView` waves them through, because "can see
 * every draft" is a builder's convenience and "can write to any sheet the
 * studio points at" is not the same promise.
 *
 * An admin does still pass the audience half by way of `canSeeView`, so the
 * question they have to answer is only whether the edit rule names them. That
 * keeps a half-built draft from being writable by its author by accident, and
 * makes the rule the single place the answer is written down.
 */
export function canEditView(
  spec: ViewSpec,
  audience: Audience,
  state: "draft" | "live",
  viewer: Viewer,
): boolean {
  const edit = spec.edit;
  if (!edit || edit.fields.length === 0) return false;
  if (!canSeeView(audience, state, viewer)) return false;
  return inAudience(edit.who, viewer);
}

/**
 * The audience rules on their own, without the draft and admin short-circuits.
 *
 * `canSeeView` folds three decisions together — is this person active, is the
 * view live, are they an admin — and only the last of the three is about the
 * audience itself. An edit rule needs that last part by itself.
 */
function inAudience(audience: Audience, viewer: Viewer): boolean {
  if (!viewer.active) return false;
  if (audience.emails.some((e) => e.toLowerCase() === viewer.email.toLowerCase())) return true;

  const roleOk = audience.roles === "all" || audience.roles.includes(viewer.role);
  if (!roleOk) return false;

  if (audience.verticals === "all") return true;
  if (viewer.verticals === "all") return true;
  return audience.verticals.some((v) => (viewer.verticals as string[]).includes(v));
}

/**
 * The fields this view offers for editing, as fields rather than keys.
 *
 * A key in the rule that the dataset no longer has — a column deleted in
 * Smartsheet since the rule was written — is dropped here rather than being
 * offered and then failing at the sheet. The order follows the dataset so two
 * views over the same sheet list their editable columns the same way round.
 */
export function editableFields(spec: ViewSpec, fields: Field[]): Field[] {
  const keys = new Set(spec.edit?.fields ?? []);
  return keys.size === 0 ? [] : fields.filter((f) => keys.has(f.key));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/** A comparable number from a cell, for sorting and the numeric operators. */
function num(value: string): number {
  const cleaned = value.replace(/[,%\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : Number.NaN;
}

function truthy(value: string): boolean {
  return /^(true|yes|1|y)$/i.test(value.trim());
}

function matches(row: Record<string, string>, filter: Filter, me: string[]): boolean {
  const raw = row[filter.field] ?? "";
  const cell = raw.trim();
  const want = (filter.value ?? "").trim();

  switch (filter.op) {
    case "empty":
      return cell === "";
    case "not-empty":
      return cell !== "";
    case "is":
      return cell.toLowerCase() === want.toLowerCase();
    case "is-not":
      return cell.toLowerCase() !== want.toLowerCase();
    case "contains":
      return cell.toLowerCase().includes(want.toLowerCase());
    case "mine":
      // The cell may hold a name, an email, or several of either.
      return cell
        .split(/[,;]+/)
        .map((part) => part.trim().toLowerCase())
        .some((part) => part !== "" && me.includes(part));
    case "before":
    case "after": {
      // Dates compare as ISO strings; anything else falls back to numbers, so
      // "after 100" works on a count column too.
      if (ISO_DATE.test(cell) && ISO_DATE.test(want)) {
        return filter.op === "before" ? cell < want : cell > want;
      }
      const a = num(cell);
      const b = num(want);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      return filter.op === "before" ? a < b : a > b;
    }
    case "gt":
    case "lt": {
      const a = num(cell);
      const b = num(want);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      return filter.op === "gt" ? a > b : a < b;
    }
    default:
      return true;
  }
}

/**
 * A cell as the layout should show it.
 *
 * Booleans become Yes / No because a bare "true" in a table reads as a bug,
 * and everything else is left exactly as the source has it — a sheet's own
 * formatting is usually what the team expects to see.
 */
export function display(value: string, type: Field["type"] | undefined): string {
  if (type === "boolean") {
    if (value.trim() === "") return "";
    return truthy(value) ? "Yes" : "No";
  }
  return value;
}

export interface Applied {
  total: number;
  rows: Record<string, string>[];
}

/**
 * Filter, sort and page a dataset's rows against a spec.
 *
 * `total` is the count after filtering and before paging, so a view can say
 * "50 of 446" rather than just how many fitted on the page.
 */
export function applySpec(
  rows: Record<string, string>[],
  spec: ViewSpec,
  viewer: Viewer,
  viewerName?: string,
  fields: Field[] = [],
): Applied {
  const me = identities(viewer, viewerName);
  let out = rows.filter((row) => spec.filters.every((f) => matches(row, f, me)));

  const sort = spec.sort;
  if (sort?.field) {
    // A spec refers to columns by key, not by title — a renamed column keeps
    // the same key, which is the point.
    const type = fields.find((f) => f.key === sort.field)?.type;
    const dir = sort.direction === "desc" ? -1 : 1;
    out = [...out].sort((a, b) => {
      const x = (a[sort.field] ?? "").trim();
      const y = (b[sort.field] ?? "").trim();
      // Blanks go last whichever way the sort runs: an unset date is not
      // "earliest", it is unknown.
      if (x === "" && y === "") return 0;
      if (x === "") return 1;
      if (y === "") return -1;
      if (type === "number") {
        const d = num(x) - num(y);
        if (!Number.isNaN(d) && d !== 0) return d * dir;
      }
      return x.localeCompare(y, "en", { numeric: true }) * dir;
    });
  }

  const total = out.length;
  if (spec.pageSize > 0) out = out.slice(0, spec.pageSize);
  return { total, rows: out };
}

/**
 * The fields a spec actually uses, so a view's payload carries the columns it
 * draws and not all sixty on the sheet.
 */
export function usedFields(spec: ViewSpec, fields: Field[]): Field[] {
  const f = spec.fields;
  const names = new Set<string>(
    [
      f.title,
      f.subtitle,
      f.body,
      f.date,
      f.endDate,
      f.status,
      f.group,
      f.person,
      f.image,
      f.link,
      ...(f.columns ?? []),
      ...(f.meta ?? []),
      ...spec.filters.map((x) => x.field),
      // An editable column has to travel even when the layout does not draw
      // it, or the cell it is meant to offer arrives blank and unaddressable.
      ...(spec.edit?.fields ?? []),
      spec.sort?.field,
    ].filter((x): x is string => Boolean(x)),
  );
  return fields.filter((x) => names.has(x.key));
}

/**
 * Which formatting rule a row matches, if any.
 *
 * First match wins, so the order rules are written in is the order they are
 * tried — that is what lets "late" sit above "due this week" and beat it
 * without either rule needing to mention the other.
 *
 * Worked out here rather than in the browser because the rules run against
 * the whole row, and the browser is only sent the columns the view draws. A
 * rule on a column the layout does not show would otherwise silently never
 * match.
 */
export function toneFor(
  row: Record<string, string>,
  spec: ViewSpec,
  me: string[],
): FormatRule | undefined {
  return (spec.rules ?? []).find((rule) => matches(row, rule, me));
}

/** A rule's own words, or its condition read back when it was given none. */
export function ruleWords(rule: FormatRule, fields: Field[]): string {
  if (rule.label?.trim()) return rule.label.trim();
  const name = fields.find((f) => f.key === rule.field)?.name ?? rule.field;
  const op = OP_WORDS[rule.op] ?? rule.op;
  return rule.value?.trim() ? `${name} ${op} ${rule.value.trim()}` : `${name} ${op}`;
}

const OP_WORDS: Record<string, string> = {
  is: "is",
  "is-not": "is not",
  contains: "contains",
  empty: "is empty",
  "not-empty": "is filled in",
  before: "is before",
  after: "is after",
  gt: "is over",
  lt: "is under",
  mine: "is mine",
};

/**
 * Only the keys a view draws, so a row does not carry the whole sheet.
 *
 * Plus the tone, where a rule matched: `_tone` is the colour and `_why` the
 * words for it, because colour on its own is not a signal everybody can read.
 */
export function project(
  rows: Record<string, string>[],
  fields: Field[],
  spec?: ViewSpec,
  me: string[] = [],
  allFields: Field[] = fields,
): Record<string, string>[] {
  return rows.map((row) => {
    const out: Record<string, string> = { _row: row._row ?? "" };
    for (const field of fields) {
      out[field.key] = display(row[field.key] ?? "", field.type);
    }
    if (spec) {
      const rule = toneFor(row, spec, me);
      if (rule) {
        out._tone = rule.tone;
        out._why = ruleWords(rule, allFields);
      }
    }
    return out;
  });
}

/**
 * A slug from a label: lower case, dashes, nothing else. Reserved words are
 * refused by the caller — a view at /v/new would shadow the studio's own page.
 */
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export const RESERVED_SLUGS = new Set(["new", "admin", "studio", "api"]);
