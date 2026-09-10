import type { Viewer } from "../auth.js";
import type { Audience, Field, Filter, ViewSpec } from "./types.js";

/**
 * Turning a view's spec into rows.
 *
 * All of it runs on the server. A view's audience decides whether the request
 * is answered at all, and its filters decide what comes back — neither is
 * something the client is asked to enforce, because a slug someone was sent
 * would then be a way round both.
 */

/** Who the viewer is, as the `mine` filter needs them. */
function identities(viewer: Viewer, viewerName?: string): string[] {
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
      spec.sort?.field,
    ].filter((x): x is string => Boolean(x)),
  );
  return fields.filter((x) => names.has(x.key));
}

/** Only the keys a view draws, so a row does not carry the whole sheet. */
export function project(
  rows: Record<string, string>[],
  fields: Field[],
): Record<string, string>[] {
  return rows.map((row) => {
    const out: Record<string, string> = { _row: row._row ?? "" };
    for (const field of fields) {
      out[field.key] = display(row[field.key] ?? "", field.type);
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
