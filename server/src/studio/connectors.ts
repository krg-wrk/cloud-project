import type { DataSource } from "../types.js";
import type { Connection, ConnectorKind, Field, FieldType } from "./types.js";

/**
 * What a connector has to do.
 *
 * Three jobs, deliberately small: say whether the credential works, list what
 * is available and what columns a table has, and read the rows. Everything
 * above this — filtering, layout, who may see it — is the same whatever the
 * rows came from, so it lives once in the studio rather than per connector.
 *
 * Rows come back as flat string maps keyed by column title. Strings because
 * that is what a sheet actually holds, and because a view's filters and
 * layouts then behave identically across all four systems. The field types
 * discovered by `describe` are what tell a date from a number.
 */
export interface Connector {
  readonly kind: ConnectorKind;
  /** Shown in the studio: what this connector needs to be set up. */
  readonly needs: { settings: SettingSpec[]; credential: string };
  /** Whether the credential works. The note is shown to the admin verbatim. */
  probe(ctx: ConnectorContext): Promise<{ ok: boolean; note: string }>;
  /** The tables available, when the system can list them. */
  catalogue?(ctx: ConnectorContext): Promise<{ ref: string; label: string }[]>;
  /** The columns of one table, and how many rows it has. */
  describe(ctx: ConnectorContext, ref: string): Promise<{ fields: Field[]; rowCount: number }>;
  read(ctx: ConnectorContext, ref: string): Promise<Record<string, string>[]>;
}

export interface SettingSpec {
  key: string;
  label: string;
  placeholder?: string;
  required: boolean;
}

/** Everything a connector needs for one call. The secret never leaves here. */
export interface ConnectorContext {
  settings: Record<string, string>;
  secret?: string;
}

/**
 * A connector that is modelled but not built.
 *
 * The studio offers all four systems because the shape of the model has to be
 * right before the work starts. What it will not do is pretend: a connection
 * of this kind tests as "not wired up yet", says what it would need, and
 * cannot be pointed at a dataset. Better a clear no than a view that is
 * silently always empty.
 */
class NotWiredUp implements Connector {
  constructor(
    readonly kind: ConnectorKind,
    readonly needs: { settings: SettingSpec[]; credential: string },
    private readonly note: string,
  ) {}

  async probe(): Promise<{ ok: boolean; note: string }> {
    return { ok: false, note: this.note };
  }

  async describe(): Promise<{ fields: Field[]; rowCount: number }> {
    throw new Error(this.note);
  }

  async read(): Promise<Record<string, string>[]> {
    throw new Error(this.note);
  }
}

/**
 * The Hub's own tables.
 *
 * Whatever the Hub is already reading — the sample schedule locally, the live
 * commissioning sheets in a deployed environment — is available to the studio
 * with no second credential and no second read. So a manager can build a view
 * over the schedule, the team or the 446 trend profiles on their first visit,
 * and the studio is not dead weight until a token turns up.
 *
 * Objects are flattened one level: an array becomes a comma-joined string, a
 * nested object becomes `parent.child` keys. That is enough for the schedule,
 * and it keeps a row the same flat shape every connector produces.
 */
export class HubConnector implements Connector {
  readonly kind = "hub" as const;
  readonly needs = { settings: [] as SettingSpec[], credential: "" };

  private readonly tables: { ref: string; label: string; load: () => Promise<unknown[]> }[];

  constructor(data: DataSource) {
    this.tables = [
      { ref: "content", label: "Commissioning schedule", load: () => data.listContent() },
      { ref: "people", label: "The team", load: () => data.listPeople() },
      { ref: "events", label: "Leave, holidays and shows", load: () => data.listEvents() },
      { ref: "sessions", label: "Workshops and sessions", load: () => data.listSessions() },
      { ref: "trends", label: "TFDB trend profiles", load: () => data.listTrends() },
      { ref: "metrics", label: "KPI definitions", load: () => data.listMetrics() },
      { ref: "observations", label: "KPI readings", load: () => data.listMetricObservations() },
    ];
  }

  async probe(): Promise<{ ok: boolean; note: string }> {
    const counts: string[] = [];
    for (const t of this.tables) {
      counts.push(`${(await t.load()).length} ${t.ref}`);
    }
    return { ok: true, note: `Reading the Hub's own tables — ${counts.join(", ")}.` };
  }

  async catalogue(): Promise<{ ref: string; label: string }[]> {
    return this.tables.map(({ ref, label }) => ({ ref, label }));
  }

  async describe(_ctx: ConnectorContext, ref: string) {
    const rows = await this.read(_ctx, ref);
    const names = new Set<string>();
    for (const row of rows) for (const key of Object.keys(row)) names.add(key);
    return {
      fields: [...names]
        .filter((n) => n !== "_row")
        .map((name) => fieldFromValues(name, rows.map((r) => r[name]).filter(Boolean))),
      rowCount: rows.length,
    };
  }

  async read(_ctx: ConnectorContext, ref: string): Promise<Record<string, string>[]> {
    const table = this.tables.find((t) => t.ref === ref);
    if (!table) {
      throw new Error(
        `"${ref}" is not one of the Hub's tables (${this.tables.map((t) => t.ref).join(", ")}).`,
      );
    }
    const rows = await table.load();
    return rows.map((row, i) => flat(row, i));
  }
}

/** One level of nesting, so a row is the flat string map every view expects. */
function flat(row: unknown, index: number): Record<string, string> {
  const out: Record<string, string> = {};
  const record = (row ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (value == null) {
      out[key] = "";
    } else if (Array.isArray(value)) {
      out[key] = value.map((v) => String(v)).join(", ");
    } else if (typeof value === "object") {
      for (const [k2, v2] of Object.entries(value as Record<string, unknown>)) {
        out[`${key}.${k2}`] = v2 == null ? "" : String(v2);
      }
    } else {
      out[key] = String(value);
    }
  }
  out._row = String(record.id ?? index);
  return out;
}

const API = "https://api.smartsheet.com/2.0";

interface SmartsheetColumn {
  id: number;
  title: string;
  type?: string;
  options?: string[];
}

interface SmartsheetSheet {
  name?: string;
  totalRowCount?: number;
  columns: SmartsheetColumn[];
  rows: { id: number; cells: { columnId: number; value?: unknown; displayValue?: string }[] }[];
}

/**
 * Smartsheet, which is where the team works today and so the one that has to
 * be right.
 *
 * A sheet id is checked before it goes into a URL: it is a long number, and
 * anything else is refused rather than concatenated. That keeps a stored
 * dataset from being a way to make the server fetch an arbitrary address.
 */
export class SmartsheetConnector implements Connector {
  readonly kind = "smartsheet" as const;
  readonly needs = {
    settings: [] as SettingSpec[],
    credential: "A Smartsheet API access token, from Account → Personal Settings → API Access.",
  };

  private async call<T>(
    ctx: ConnectorContext,
    path: string,
    scope: "account" | "sheet",
  ): Promise<T> {
    if (!ctx.secret) throw new Error("No API token on this connection yet.");
    let res: Response;
    try {
      res = await fetch(`${API}${path}`, {
        headers: { Authorization: `Bearer ${ctx.secret}`, "Content-Type": "application/json" },
      });
    } catch (err) {
      // A blocked egress policy and a wrong token look nothing alike to a
      // person, so they should not read alike here either.
      throw new Error(
        `Could not reach api.smartsheet.com — ${
          err instanceof Error ? err.message : "the request failed"
        }. This is a network or firewall problem, not the token.`,
      );
    }
    if (!res.ok) {
      // The token can appear in a Smartsheet error body, so the status is all
      // that is passed on.
      throw new Error(smartsheetMessage(res.status, res.statusText, scope));
    }
    return (await res.json()) as T;
  }

  async probe(ctx: ConnectorContext): Promise<{ ok: boolean; note: string }> {
    try {
      const me = await this.call<{ email?: string }>(ctx, "/users/me", "account");
      const sheets = await this.call<{ totalCount?: number }>(ctx, "/sheets?pageSize=1", "account");
      const who = me.email ? ` as ${me.email}` : "";
      return {
        ok: true,
        note: `Connected${who} — ${sheets.totalCount ?? 0} sheets visible to this token.`,
      };
    } catch (err) {
      return { ok: false, note: err instanceof Error ? err.message : "Failed" };
    }
  }

  async catalogue(ctx: ConnectorContext): Promise<{ ref: string; label: string }[]> {
    const res = await this.call<{ data?: { id: number; name: string }[] }>(
      ctx,
      "/sheets?pageSize=500",
      "account",
    );
    return (res.data ?? []).map((s) => ({ ref: String(s.id), label: s.name }));
  }

  async describe(
    ctx: ConnectorContext,
    ref: string,
  ): Promise<{ fields: Field[]; rowCount: number }> {
    const sheet = await this.fetchSheet(ctx, ref);
    const rows = flatten(sheet);
    return {
      fields: sheet.columns.map((c) => fieldFor(c, rows)),
      rowCount: sheet.totalRowCount ?? rows.length,
    };
  }

  async read(ctx: ConnectorContext, ref: string): Promise<Record<string, string>[]> {
    return flatten(await this.fetchSheet(ctx, ref));
  }

  private fetchSheet(ctx: ConnectorContext, ref: string): Promise<SmartsheetSheet> {
    if (!/^\d{6,25}$/.test(ref)) {
      throw new Error(`"${ref}" is not a Smartsheet sheet id — they are long numbers.`);
    }
    return this.call<SmartsheetSheet>(
      ctx,
      `/sheets/${ref}?level=2&include=objectValue`,
      "sheet",
    );
  }
}

/**
 * A Smartsheet failure in words a manager can act on.
 *
 * A 403 means two different things depending on what was asked for, so the
 * caller says which: refused outright, or a sheet this token cannot see.
 */
function smartsheetMessage(
  status: number,
  statusText: string,
  scope: "account" | "sheet",
): string {
  if (status === 401) return "Smartsheet refused the token (401). It may be wrong or revoked.";
  if (status === 403) {
    return scope === "sheet"
      ? "The token works but has no access to this sheet (403). Share the sheet with the token's account."
      : "Smartsheet refused the token (403). Check it is current and has API access enabled.";
  }
  if (status === 404) return "No sheet with that id (404).";
  if (status === 429) return "Smartsheet is rate-limiting the token (429). Try again shortly.";
  return `Smartsheet returned ${status} ${statusText}.`;
}

/** One row per sheet row, keyed by column title, values as displayed. */
function flatten(sheet: SmartsheetSheet): Record<string, string>[] {
  const titleById = new Map(sheet.columns.map((c) => [c.id, c.title]));
  return sheet.rows.map((row) => {
    const flat: Record<string, string> = { _row: String(row.id) };
    for (const cell of row.cells) {
      const title = titleById.get(cell.columnId);
      if (!title) continue;
      flat[title] = cell.displayValue ?? (cell.value != null ? String(cell.value) : "");
    }
    // A column with no cell on this row still has to be present, or a filter
    // on it reads as undefined rather than empty.
    for (const c of sheet.columns) if (!(c.title in flat)) flat[c.title] = "";
    return flat;
  });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/**
 * What a column holds.
 *
 * Smartsheet's own column type is right when it is set, but a lot of real
 * sheets are all TEXT_NUMBER, so the values decide when the type does not.
 * A column with few enough distinct values becomes a picker in the filter
 * editor, which is most of what makes the builder quick to use.
 */
function fieldFor(column: SmartsheetColumn, rows: Record<string, string>[]): Field {
  const values = rows.map((r) => r[column.title]).filter((v) => v != null && v !== "");
  return fieldFromValues(column.title, values, declaredType(column), column.options);
}

/**
 * A field from what is actually in the column.
 *
 * `declared` wins when the source states a type; otherwise the values decide,
 * because a lot of real sheets are all TEXT_NUMBER. A column with few enough
 * distinct values also carries them, which is what turns the filter editor
 * into a picker instead of a box to type a value into from memory.
 */
export function fieldFromValues(
  name: string,
  values: string[],
  declared?: FieldType,
  options?: string[],
): Field {
  const type = declared ?? inferredType(values);
  const field: Field = { name, type };
  const distinct = [...new Set(options ?? values)].filter((v) => v !== "");
  if (type !== "date" && type !== "url" && distinct.length > 0 && distinct.length <= 40) {
    field.options = distinct.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  }
  return field;
}

function declaredType(column: SmartsheetColumn): FieldType | undefined {
  switch (column.type) {
    case "DATE":
    case "DATETIME":
    case "ABSTRACT_DATETIME":
      return "date";
    case "CHECKBOX":
      return "boolean";
    case "CONTACT_LIST":
      return "person";
    case "MULTI_CONTACT_LIST":
    case "MULTI_PICKLIST":
      return "list";
    case "DURATION":
      return "number";
    default:
      return undefined;
  }
}

function inferredType(values: string[]): FieldType {
  if (values.length === 0) return "text";
  const all = (test: (v: string) => boolean) => values.every(test);
  if (all((v) => ISO_DATE.test(v))) return "date";
  if (all((v) => /^-?[\d,]+(\.\d+)?%?$/.test(v))) return "number";
  if (all((v) => /^https?:\/\//i.test(v))) return "url";
  if (all((v) => /^(true|false|yes|no)$/i.test(v))) return "boolean";
  if (values.some((v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v))) return "person";
  return "text";
}

/**
 * The registry.
 *
 * A factory rather than a constant because the Hub connector reads through
 * the same DataSource the fixed pages use — one cache, one credential, one
 * source of truth about what the schedule says.
 */
export function createConnectors(data: DataSource): Record<ConnectorKind, Connector> {
  return {
  hub: new HubConnector(data),
  smartsheet: new SmartsheetConnector(),
  "google-sheets": new NotWiredUp(
    "google-sheets",
    {
      settings: [
        { key: "spreadsheetId", label: "Spreadsheet id", required: true },
        { key: "tab", label: "Tab name", required: false },
      ],
      credential: "A Google service-account key, shared onto the spreadsheet.",
    },
    "Google Sheets is not wired up yet. The model is here; the reader is not.",
  ),
  mongodb: new NotWiredUp(
    "mongodb",
    {
      settings: [
        { key: "database", label: "Database", required: true },
        { key: "host", label: "Host", placeholder: "cluster0.example.mongodb.net", required: true },
      ],
      credential: "A connection string with a read-only user.",
    },
    "MongoDB is not wired up yet. The model is here; the reader is not.",
  ),
  snowflake: new NotWiredUp(
    "snowflake",
    {
      settings: [
        { key: "account", label: "Account", placeholder: "wgsn-eu1", required: true },
        { key: "warehouse", label: "Warehouse", required: true },
        { key: "database", label: "Database", required: true },
        { key: "schema", label: "Schema", required: false },
      ],
      credential: "A key-pair or password for a read-only role.",
    },
    "Snowflake is not wired up yet. The model is here; the reader is not. " +
      "TFDB already reaches the Hub through the Smartsheet sheet it feeds.",
  ),
  };
}

/** The kinds that actually read today. The studio labels the rest as such. */
const LIVE_KINDS: ConnectorKind[] = ["hub", "smartsheet"];

/** What the studio shows about each kind: what it needs, and whether it works. */
export function connectorCatalogue(
  connectors: Record<ConnectorKind, Connector>,
): { kind: ConnectorKind; live: boolean; needs: Connector["needs"] }[] {
  return (Object.keys(connectors) as ConnectorKind[]).map((kind) => ({
    kind,
    live: LIVE_KINDS.includes(kind),
    needs: connectors[kind].needs,
  }));
}

/**
 * Read a dataset, cached for as long as it asks for.
 *
 * A sheet read is a second or more and a view may be opened by fifty people
 * in a morning, so the rows are held briefly — the same reasoning as the
 * fixed pages' cache, per dataset rather than globally.
 */
export class DatasetReader {
  private cache = new Map<string, { at: number; rows: Record<string, string>[] }>();

  constructor(
    private readonly connectors: Record<ConnectorKind, Connector>,
    private readonly secretFor: (connectionId: string) => string | undefined,
  ) {}

  connector(kind: ConnectorKind): Connector {
    return this.connectors[kind];
  }

  contextFor(connection: Connection): ConnectorContext {
    return { settings: connection.settings, secret: this.secretFor(connection.id) };
  }

  async rows(
    connection: Connection,
    ref: string,
    ttlSeconds: number,
  ): Promise<Record<string, string>[]> {
    const key = `${connection.id}:${ref}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < ttlSeconds * 1000) return hit.rows;
    const rows = await this.connector(connection.kind).read(this.contextFor(connection), ref);
    this.cache.set(key, { at: Date.now(), rows });
    return rows;
  }

  /** Drop a dataset's cached rows, so a refresh in the studio is immediate. */
  forget(connectionId: string, ref?: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${connectionId}:`) && (!ref || key === `${connectionId}:${ref}`)) {
        this.cache.delete(key);
      }
    }
  }
}
