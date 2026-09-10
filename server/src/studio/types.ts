import type { Role } from "../auth.js";

/**
 * The studio: connections, datasets and views, all held as data rather than
 * code.
 *
 * The fixed pages — Today, Deadlines, Calendar, Trends — are written by hand,
 * because their behaviour is specific and worth getting exactly right. What
 * the studio adds is everything else: a manager can point the Hub at a sheet
 * and build a view of it for a group of people, without a deploy. That is the
 * one thing AppSheet did well, and the reason the team has not left it yet.
 */

/**
 * The systems the Hub can read.
 *
 * `hub` is the Hub's own tables — the schedule, the team, the trend profiles
 * — already loaded and needing no credential. It is there because a studio
 * you cannot point at anything is a studio you cannot try, and because a view
 * over the commissioning schedule is a thing people will actually want.
 *
 * `smartsheet` is any other sheet, by id, with a token. Those two read today.
 * The rest are modelled but not built, and the studio says so plainly rather
 * than offering connectors that quietly fail.
 */
export type ConnectorKind = "hub" | "smartsheet" | "google-sheets" | "mongodb" | "snowflake";

export const CONNECTOR_KINDS: ConnectorKind[] = [
  "hub",
  "smartsheet",
  "google-sheets",
  "mongodb",
  "snowflake",
];

/** What a column holds, which decides how a view can use it. */
export type FieldType = "text" | "number" | "date" | "boolean" | "person" | "url" | "list";

/**
 * One column of a dataset.
 *
 * `key` and `name` are deliberately separate, and the difference is the whole
 * point. A view's spec refers to columns by `key` — for Smartsheet, the
 * column's own id, which does not change when someone renames the column or
 * drags it somewhere else. `name` is the title as the source has it *today*,
 * refreshed every time the dataset's columns are read, and it is what the
 * studio and the rendered view show a person.
 *
 * So renaming "Submission Date" to "Copy due" in Smartsheet changes the label
 * everywhere and breaks nothing. Under the old scheme, where the title *was*
 * the key, it emptied every view built on that column.
 */
export interface Field {
  /**
   * The stable identifier rows are keyed by. A Smartsheet column id, a
   * report's virtual column id, or — for the Hub's own tables, whose column
   * names are code — the name itself.
   */
  key: string;
  /** The column's title in the source, as of the last read. */
  name: string;
  type: FieldType;
  /** Distinct values, when there are few enough for the filter to offer a picker. */
  options?: string[];
}

/**
 * A dataset's columns as they came back before this scheme existed had no
 * `key`. Reading one, the title stands in as the key — which is exactly what
 * it was being used as — so existing views keep working until the dataset's
 * columns are read again.
 */
export function withKeys(fields: Field[]): Field[] {
  return fields.map((f) => (f.key ? f : { ...f, key: f.name }));
}

/**
 * A link to a system.
 *
 * The credential is never part of this record as far as the client is
 * concerned. `secretEnv` names an environment variable, which is the way to
 * do it in a deployed Hub; `hasSecret` says a credential is stored here
 * instead, and `secretHint` is its last four characters so it can be
 * recognised without being read.
 */
export interface Connection {
  id: string;
  label: string;
  kind: ConnectorKind;
  /** Non-secret settings — a Snowflake account and warehouse, a Mongo database. */
  settings: Record<string, string>;
  secretEnv?: string;
  hasSecret: boolean;
  secretHint?: string;
  /** The last time the connection was tested, and what came back. */
  checkedAt?: string;
  checkOk?: boolean;
  checkNote?: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

/** A named table from a connection: one sheet, collection or warehouse table. */
export interface Dataset {
  id: string;
  connectionId: string;
  label: string;
  /**
   * Whatever the connector addresses. For Smartsheet this is `sheet:<id>` or
   * `report:<id>` — a report is a different endpoint with its own column
   * identifiers, so which one it is has to be part of the address. A bare
   * number means a sheet, which is how datasets saved before reports existed
   * keep working.
   */
  ref: string;
  fields: Field[];
  rowCount?: number;
  /**
   * Set when the source holds more rows than were read. A view over it is
   * showing the first N, and the studio says so rather than implying it has
   * everything.
   */
  truncated?: boolean;
  /** How long a read is cached. Sheets change a few times a day at most. */
  refreshSeconds: number;
  describedAt?: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export type Layout = "table" | "cards" | "list" | "calendar" | "board";

export const LAYOUTS: Layout[] = ["table", "cards", "list", "calendar", "board"];

/**
 * A filter clause.
 *
 * `mine` is the one that earns its keep: it compares the view's person field
 * against whoever is signed in, so "my deadlines" is one view rather than one
 * per forecaster.
 */
export type FilterOp =
  | "is"
  | "is-not"
  | "contains"
  | "empty"
  | "not-empty"
  | "before"
  | "after"
  | "gt"
  | "lt"
  | "mine";

export const FILTER_OPS: FilterOp[] = [
  "is",
  "is-not",
  "contains",
  "empty",
  "not-empty",
  "before",
  "after",
  "gt",
  "lt",
  "mine",
];

export interface Filter {
  field: string;
  op: FilterOp;
  value?: string;
}

/**
 * Which column carries what.
 *
 * A layout reads the roles it needs and ignores the rest, so switching a view
 * from cards to a calendar keeps the mapping you already did.
 */
export interface FieldRoles {
  title?: string;
  subtitle?: string;
  body?: string;
  date?: string;
  endDate?: string;
  status?: string;
  group?: string;
  person?: string;
  image?: string;
  link?: string;
  /** Table layout: the columns, in order. */
  columns?: string[];
  /** Cards and list: the small facts along the bottom. */
  meta?: string[];
}

export interface ViewSpec {
  layout: Layout;
  fields: FieldRoles;
  filters: Filter[];
  sort?: { field: string; direction: "asc" | "desc" };
  /** Rows per page; 0 for all of them. */
  pageSize: number;
}

/**
 * Who a view is for.
 *
 * Applied on the server for both the sidebar and the view itself, so a slug
 * someone was sent is no way past it.
 */
export interface Audience {
  roles: Role[] | "all";
  verticals: string[] | "all";
  /** Named people, in addition to whatever the role and vertical rules allow. */
  emails: string[];
}

export const EVERYONE: Audience = { roles: "all", verticals: "all", emails: [] };

export interface ViewDef {
  id: string;
  /** The address: /v/<slug>. Lower case, dashes, unique. */
  slug: string;
  label: string;
  icon: string;
  /** The sidebar group it sits in. */
  section: string;
  order: number;
  datasetId: string;
  description?: string;
  spec: ViewSpec;
  audience: Audience;
  /** A draft is visible to admins only, so a view can be built in the open. */
  state: "draft" | "live";
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

/** A view as the sidebar needs it: no spec, no dataset internals. */
export interface ViewLink {
  slug: string;
  label: string;
  icon: string;
  section: string;
  order: number;
  state: "draft" | "live";
}

/** A view plus its rows, which is what the runtime route returns. */
export interface ViewPage {
  view: ViewLink & { description?: string; spec: ViewSpec };
  fields: Field[];
  /** The dataset's label and where it comes from, shown as provenance. */
  source: { dataset: string; connection: string; kind: ConnectorKind };
  total: number;
  rows: Record<string, string>[];
  /** Set when the read failed, so the page can say what went wrong. */
  error?: string;
}

/* ---- The built-in pages, made changeable -------------------------------- */

/**
 * What an admin has changed about one slot on a hand-written page.
 *
 * A slot is one customisable thing: a heading, a field label, a table column,
 * a navigation item. The client declares which slots exist and what they say
 * by default, so this carries only the differences — an untouched slot has no
 * record and the code's own wording stands.
 */
export interface SlotOverride {
  /** New wording. Absent means the default stands. */
  label?: string;
  /** Taken off the page. Only slots the registry marks as hideable. */
  hidden?: boolean;
  /** Position within its group. Absent means the declared order. */
  order?: number;
}

/**
 * A change to one slot. An absent field is left as it was — renaming
 * something must not un-hide it — and `null` clears that field.
 */
export interface SlotPatch {
  label?: string | null;
  hidden?: boolean;
  order?: number | null;
}
