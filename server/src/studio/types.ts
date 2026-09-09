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

export interface Field {
  /** The column title in the source, used verbatim so the sheet stays legible. */
  name: string;
  type: FieldType;
  /** Distinct values, when there are few enough for the filter to offer a picker. */
  options?: string[];
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
  /** Whatever the connector addresses — a sheet id, a collection, a table. */
  ref: string;
  fields: Field[];
  rowCount?: number;
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
