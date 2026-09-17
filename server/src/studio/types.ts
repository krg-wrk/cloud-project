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

/**
 * The tones a formatting rule can paint a row.
 *
 * A closed list rather than a colour picker, and that is the whole design.
 * The Hub's palette already means something — red is at risk, amber is
 * waiting, green is done — and a view where somebody chose their own red for
 * "fine" would break that meaning everywhere it is read. Six named tones,
 * each the colour the rest of the Hub already uses for that idea.
 */
export type Tone = "at-risk" | "waiting" | "done" | "accent" | "mine" | "quiet";

export const TONES: Tone[] = ["at-risk", "waiting", "done", "accent", "mine", "quiet"];

/**
 * Colour a row when it matches.
 *
 * The same field, operator and value a filter uses, so there is one
 * vocabulary to learn rather than two: a rule is a filter that tints instead
 * of hiding. Rules are tried in order and the first match wins, which is what
 * lets "late" beat "due this week" without either needing to know about the
 * other.
 *
 * `label` is not decoration. Colour alone is not a signal somebody colour
 * blind can read, so the words go on the row as well — a rule with no label
 * shows its own condition instead.
 */
export interface FormatRule {
  field: string;
  op: FilterOp;
  value?: string;
  tone: Tone;
  /** What the colour means, in words: "Late", "Needs a score". */
  label?: string;
}

/**
 * What a view lets people change, and who.
 *
 * A view is a reading surface by default and stays one unless somebody says
 * otherwise out loud — the same arrangement the Smartsheet write-back and the
 * notification channels use. `fields` empty means read-only, which is what
 * every view built before this existed has.
 *
 * `who` is a second, narrower gate rather than a reuse of the view's audience.
 * Being able to open a view and being able to change the sheet behind it are
 * different permissions, and collapsing them would make every view that is
 * visible to the team also writable by the team the moment one column was
 * marked editable.
 *
 * It lives inside the spec rather than beside the audience because the views
 * table cannot gain a column: the schema is applied with CREATE TABLE IF NOT
 * EXISTS and nothing ever alters one, so an existing deployment would never
 * see it. The spec is a JSON blob read whole, so it can.
 */
export interface EditRule {
  /** Field keys a person may change. Empty — or absent — is read-only. */
  fields: string[];
  /** Who may change them, on top of being able to see the view at all. */
  who: Audience;
}

export interface ViewSpec {
  layout: Layout;
  fields: FieldRoles;
  filters: Filter[];
  /** Conditional formatting. Absent on views built before it existed. */
  rules?: FormatRule[];
  /** Write-back. Absent on views built before it existed, which is read-only. */
  edit?: EditRule;
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

/**
 * Nobody at all — an empty role list, which `canSeeView` never matches.
 *
 * The audience parser turns an empty role list into "all", because an audience
 * nobody is in is never what somebody meant to save. An edit rule is the
 * opposite: no roles is exactly what it means, and is what a view says when
 * nobody has been given permission to change it yet.
 */
export const NOBODY: Audience = { roles: [], verticals: "all", emails: [] };

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
  /**
   * The view's own id travels with the page as well as its slug.
   *
   * A slug is the address and can be renamed; the id is what a subscription
   * is keyed by, so the page that offers "email me this" needs it. There is
   * nothing to protect here — it identifies a view whose rows are already on
   * the screen.
   */
  view: ViewLink & { id: string; description?: string; spec: ViewSpec };
  fields: Field[];
  /** The dataset's label and where it comes from, shown as provenance. */
  source: { dataset: string; connection: string; kind: ConnectorKind };
  total: number;
  rows: Record<string, string>[];
  /**
   * The column keys *this* viewer may change, already decided here.
   *
   * Empty for almost every view and almost every person, which is the point: a
   * page that draws an editor because the spec has one, and finds out at save
   * time that the person may not, has already made a promise it cannot keep.
   * The client draws what is in this list and nothing else.
   */
  editable: string[];
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
