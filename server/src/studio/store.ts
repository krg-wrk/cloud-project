import type { Db } from "../db.js";
import { randomUUID } from "node:crypto";
import type {
  Audience,
  Connection,
  ConnectorKind,
  Dataset,
  Field,
  SlotOverride,
  SlotPatch,
  ViewDef,
  ViewSpec,
} from "./types.js";
import { EVERYONE, withKeys } from "./types.js";

/**
 * Where the studio's configuration lives.
 *
 * Three tables, all ordinary SQL that runs on SQLite and Postgres. JSON goes
 * in TEXT columns because these are documents that are read whole and never
 * queried into — the settings on a connection, the field list on a dataset,
 * the spec on a view.
 *
 * The one column that needs care is `secret`. It holds a credential, it is
 * never selected by any method that feeds a response, and the only way out of
 * this class is `secretFor`, which the connectors call and nothing else does.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS studio_connections (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  kind TEXT NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}',
  secret_env TEXT,
  secret TEXT,
  secret_hint TEXT,
  checked_at TEXT,
  check_ok INTEGER,
  check_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS studio_datasets (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES studio_connections (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  ref TEXT NOT NULL,
  fields TEXT NOT NULL DEFAULT '[]',
  row_count INTEGER,
  truncated INTEGER NOT NULL DEFAULT 0,
  refresh_seconds INTEGER NOT NULL DEFAULT 60,
  described_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS studio_datasets_by_connection
  ON studio_datasets (connection_id, label);

CREATE TABLE IF NOT EXISTS studio_views (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'table',
  section TEXT NOT NULL DEFAULT 'Your work',
  sort_order INTEGER NOT NULL DEFAULT 0,
  dataset_id TEXT NOT NULL REFERENCES studio_datasets (id) ON DELETE CASCADE,
  description TEXT,
  spec TEXT NOT NULL,
  audience TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS studio_views_by_section ON studio_views (section, sort_order);

/*
 * The built-in pages, made changeable.
 *
 * A "slot" is one customisable thing on a hand-written page: a heading, a
 * field label, a column, a navigation item. The client declares which slots
 * exist and what they say by default; this table holds only the changes an
 * admin has made, so a slot nobody has touched has no row and the default
 * stands. That keeps the defaults in the code, where they belong, and means
 * a page gaining a new heading does not need a migration.
 */
CREATE TABLE IF NOT EXISTS studio_slots (
  slot TEXT PRIMARY KEY,
  label TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
`;

const now = () => new Date().toISOString();

/** Parse a JSON column, falling back rather than taking the server down. */
function json<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export interface ConnectionInput {
  label: string;
  kind: ConnectorKind;
  settings?: Record<string, string>;
  secretEnv?: string;
  /** A pasted credential. Stored here, never read back out to a client. */
  secret?: string;
}

export interface DatasetInput {
  connectionId: string;
  label: string;
  ref: string;
  refreshSeconds?: number;
}

export interface ViewInput {
  slug: string;
  label: string;
  icon?: string;
  section?: string;
  order?: number;
  datasetId: string;
  description?: string;
  spec: ViewSpec;
  audience?: Audience;
  state?: "draft" | "live";
}

export class StudioStore {
  constructor(private readonly db: Db) {}

  /** Create the tables, if they are not there. See HubStore.init. */
  async init(): Promise<void> {
    await this.db.exec(SCHEMA);
  }

  // --- Connections -------------------------------------------------------

  /**
   * Every connection, without its credential. This is the only shape that
   * reaches a response, which is why `secret` is not in the select list.
   */
  async listConnections(): Promise<Connection[]> {
    const rows = await this.db.all(`SELECT id, label, kind, settings, secret_env, secret_hint,
                secret IS NOT NULL AND secret != '' AS has_secret,
                checked_at, check_ok, check_note, created_at, updated_at, updated_by
         FROM studio_connections ORDER BY label`) as Record<string, unknown>[];
    return rows.map(toConnection);
  }

  async connection(id: string): Promise<Connection | undefined> {
    return (await this.listConnections()).find((c) => c.id === id);
  }

  /**
   * The credential for a connection: the environment variable it names, or
   * the one stored here. Called by the connectors and by nothing else.
   */
  async secretFor(id: string): Promise<string | undefined> {
    const row = await this.db.get(`SELECT secret_env, secret FROM studio_connections WHERE id = ?`, [id]) as { secret_env?: string; secret?: string } | undefined;
    if (!row) return undefined;
    if (row.secret_env) return process.env[row.secret_env] || undefined;
    return row.secret || undefined;
  }

  async createConnection(input: ConnectionInput, by: string): Promise<Connection> {
    const id = randomUUID();
    const at = now();
    await this.db.run(`INSERT INTO studio_connections
           (id, label, kind, settings, secret_env, secret, secret_hint,
            created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id,
        input.label,
        input.kind,
        JSON.stringify(input.settings ?? {}),
        input.secretEnv ?? null,
        input.secret ?? null,
        hintFor(input.secret),
        at,
        at,
        by]);
    return (await this.connection(id))!;
  }

  /**
   * Update a connection. An absent `secret` leaves the stored one alone —
   * otherwise every edit of a label would wipe the credential; an empty
   * string clears it, which is how you remove one.
   */
  async updateConnection(id: string, input: Partial<ConnectionInput>, by: string): Promise<Connection | undefined> {
    const existing = await this.connection(id);
    if (!existing) return undefined;
    const clearSecret = input.secret === "";
    await this.db.run(`UPDATE studio_connections
            SET label = ?, kind = ?, settings = ?, secret_env = ?,
                secret = CASE WHEN ? THEN NULL WHEN ? IS NOT NULL THEN ? ELSE secret END,
                secret_hint = CASE WHEN ? THEN NULL WHEN ? IS NOT NULL THEN ? ELSE secret_hint END,
                updated_at = ?, updated_by = ?
          WHERE id = ?`, [input.label ?? existing.label,
        input.kind ?? existing.kind,
        JSON.stringify(input.settings ?? existing.settings),
        input.secretEnv === undefined ? (existing.secretEnv ?? null) : input.secretEnv || null,
        clearSecret ? 1 : 0,
        input.secret ?? null,
        input.secret ?? null,
        clearSecret ? 1 : 0,
        input.secret ?? null,
        hintFor(input.secret),
        now(),
        by,
        id]);
    return this.connection(id);
  }

  /** Record what a test came back with, so the list can show it. */
  async recordCheck(id: string, ok: boolean, note: string): Promise<void> {
    await this.db.run(`UPDATE studio_connections SET checked_at = ?, check_ok = ?, check_note = ? WHERE id = ?`, [now(), ok ? 1 : 0, note, id]);
  }

  async deleteConnection(id: string): Promise<boolean> {
    const r = await this.db.run(`DELETE FROM studio_connections WHERE id = ?`, [id]);
    return Number(r.changes) > 0;
  }

  // --- Datasets ----------------------------------------------------------

  async listDatasets(connectionId?: string): Promise<Dataset[]> {
    const rows = connectionId
      ? (await this.db.all(`SELECT * FROM studio_datasets WHERE connection_id = ? ORDER BY label`, [connectionId]) as Record<string, unknown>[])
      : (await this.db.all(`SELECT * FROM studio_datasets ORDER BY label`) as Record<
          string,
          unknown
        >[]);
    return rows.map(toDataset);
  }

  async dataset(id: string): Promise<Dataset | undefined> {
    const row = await this.db.get(`SELECT * FROM studio_datasets WHERE id = ?`, [id]) as
      | Record<string, unknown>
      | undefined;
    return row ? toDataset(row) : undefined;
  }

  async createDataset(input: DatasetInput, by: string): Promise<Dataset> {
    const id = randomUUID();
    const at = now();
    await this.db.run(`INSERT INTO studio_datasets
           (id, connection_id, label, ref, refresh_seconds, created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id,
        input.connectionId,
        input.label,
        input.ref,
        input.refreshSeconds ?? 60,
        at,
        at,
        by]);
    return (await this.dataset(id))!;
  }

  async updateDataset(id: string, input: Partial<DatasetInput>, by: string): Promise<Dataset | undefined> {
    const existing = await this.dataset(id);
    if (!existing) return undefined;
    await this.db.run(`UPDATE studio_datasets
            SET label = ?, ref = ?, refresh_seconds = ?, updated_at = ?, updated_by = ?
          WHERE id = ?`, [input.label ?? existing.label,
        input.ref ?? existing.ref,
        input.refreshSeconds ?? existing.refreshSeconds,
        now(),
        by,
        id]);
    return this.dataset(id);
  }

  /**
   * Store what a describe found: the columns, how many rows there were, and
   * whether the read stopped short of all of them.
   */
  async recordFields(
    id: string,
    fields: Field[],
    rowCount: number,
    truncated = false,
  ): Promise<Dataset | undefined> {
    await this.db.run(`UPDATE studio_datasets
            SET fields = ?, row_count = ?, truncated = ?, described_at = ?
          WHERE id = ?`, [JSON.stringify(fields), rowCount, truncated ? 1 : 0, now(), id]);
    return this.dataset(id);
  }

  async deleteDataset(id: string): Promise<boolean> {
    const r = await this.db.run(`DELETE FROM studio_datasets WHERE id = ?`, [id]);
    return Number(r.changes) > 0;
  }

  // --- Views -------------------------------------------------------------

  async listViews(): Promise<ViewDef[]> {
    const rows = await this.db.all(`SELECT * FROM studio_views ORDER BY section, sort_order, label`) as Record<string, unknown>[];
    return rows.map(toView);
  }

  async view(id: string): Promise<ViewDef | undefined> {
    const row = await this.db.get(`SELECT * FROM studio_views WHERE id = ?`, [id]) as
      | Record<string, unknown>
      | undefined;
    return row ? toView(row) : undefined;
  }

  async viewBySlug(slug: string): Promise<ViewDef | undefined> {
    const row = await this.db.get(`SELECT * FROM studio_views WHERE slug = ?`, [slug]) as
      | Record<string, unknown>
      | undefined;
    return row ? toView(row) : undefined;
  }

  async createView(input: ViewInput, by: string): Promise<ViewDef> {
    const id = randomUUID();
    const at = now();
    await this.db.run(`INSERT INTO studio_views
           (id, slug, label, icon, section, sort_order, dataset_id, description,
            spec, audience, state, created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id,
        input.slug,
        input.label,
        input.icon ?? "table",
        input.section ?? "Your work",
        input.order ?? 0,
        input.datasetId,
        input.description ?? null,
        JSON.stringify(input.spec),
        JSON.stringify(input.audience ?? EVERYONE),
        input.state ?? "draft",
        at,
        at,
        by]);
    return (await this.view(id))!;
  }

  async updateView(id: string, input: Partial<ViewInput>, by: string): Promise<ViewDef | undefined> {
    const existing = await this.view(id);
    if (!existing) return undefined;
    await this.db.run(`UPDATE studio_views
            SET slug = ?, label = ?, icon = ?, section = ?, sort_order = ?, dataset_id = ?,
                description = ?, spec = ?, audience = ?, state = ?, updated_at = ?, updated_by = ?
          WHERE id = ?`, [input.slug ?? existing.slug,
        input.label ?? existing.label,
        input.icon ?? existing.icon,
        input.section ?? existing.section,
        input.order ?? existing.order,
        input.datasetId ?? existing.datasetId,
        input.description === undefined ? (existing.description ?? null) : input.description || null,
        JSON.stringify(input.spec ?? existing.spec),
        JSON.stringify(input.audience ?? existing.audience),
        input.state ?? existing.state,
        now(),
        by,
        id]);
    return this.view(id);
  }

  async deleteView(id: string): Promise<boolean> {
    const r = await this.db.run(`DELETE FROM studio_views WHERE id = ?`, [id]);
    return Number(r.changes) > 0;
  }

  // --- Slots: the built-in pages' own wording and layout ------------------

  /**
   * Every override an admin has made, keyed by slot.
   *
   * Read by any signed-in viewer, because a page cannot render without it.
   * There is nothing sensitive here — it is the wording of the app.
   */
  async listSlots(): Promise<Record<string, SlotOverride>> {
    const rows = await this.db.all(`SELECT slot, label, hidden, sort_order FROM studio_slots`) as Record<string, unknown>[];
    const out: Record<string, SlotOverride> = {};
    for (const row of rows) {
      const override: SlotOverride = {};
      const label = opt(row.label);
      if (label !== undefined) override.label = label;
      if (Number(row.hidden ?? 0)) override.hidden = true;
      if (row.sort_order != null) override.order = Number(row.sort_order);
      // A row that overrides nothing is the same as no row at all.
      if (Object.keys(override).length > 0) out[str(row.slot)] = override;
    }
    return out;
  }

  /**
   * Change one slot.
   *
   * A field left out is left alone, so renaming something does not un-hide
   * it and reordering does not wipe a rename. `null` clears one field;
   * `resetSlot` drops the row and puts the default back.
   */
  async setSlot(slot: string, patch: SlotPatch, by: string): Promise<void> {
    const existing = await this.db.get(`SELECT label, hidden, sort_order FROM studio_slots WHERE slot = ?`, [slot]) as Record<string, unknown> | undefined;

    const label =
      patch.label === undefined ? (existing ? opt(existing.label) : undefined) : (patch.label ?? undefined);
    const hidden =
      patch.hidden === undefined ? Boolean(Number(existing?.hidden ?? 0)) : patch.hidden;
    const order =
      patch.order === undefined
        ? existing?.sort_order == null
          ? null
          : Number(existing.sort_order)
        : (patch.order ?? null);

    await this.db.run(`INSERT INTO studio_slots (slot, label, hidden, sort_order, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (slot) DO UPDATE SET
           label = excluded.label,
           hidden = excluded.hidden,
           sort_order = excluded.sort_order,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`, [slot, label ?? null, hidden ? 1 : 0, order, now(), by]);
  }

  /** Put one slot back to what the code says. */
  async resetSlot(slot: string): Promise<void> {
    await this.db.run(`DELETE FROM studio_slots WHERE slot = ?`, [slot]);
  }

  /**
   * Put a whole page, or everything, back to the defaults. The prefix is
   * matched on the dotted slot id, so "content." resets that page alone.
   */
  async resetSlots(prefix?: string): Promise<number> {
    const r = prefix
      ? await this.db.run(`DELETE FROM studio_slots WHERE slot LIKE ? || '%'`, [prefix])
      : await this.db.run(`DELETE FROM studio_slots`);
    return Number(r.changes);
  }

  /** Whether a slug is free, ignoring the view being edited. */
  async slugFree(slug: string, exceptId?: string): Promise<boolean> {
    const row = await this.db.get(`SELECT id FROM studio_views WHERE slug = ?`, [slug]) as
      | { id: string }
      | undefined;
    return !row || row.id === exceptId;
  }
}

const str = (v: unknown): string => (v == null ? "" : String(v));
const opt = (v: unknown): string | undefined => {
  const s = str(v);
  return s === "" ? undefined : s;
};

function hintFor(secret: string | undefined): string | null {
  if (!secret) return null;
  return secret.length <= 4 ? "••••" : `••••${secret.slice(-4)}`;
}

function toConnection(row: Record<string, unknown>): Connection {
  return {
    id: str(row.id),
    label: str(row.label),
    kind: str(row.kind) as ConnectorKind,
    settings: json<Record<string, string>>(row.settings, {}),
    secretEnv: opt(row.secret_env),
    hasSecret: Boolean(Number(row.has_secret ?? 0)),
    secretHint: opt(row.secret_hint),
    checkedAt: opt(row.checked_at),
    checkOk: row.check_ok == null ? undefined : Boolean(Number(row.check_ok)),
    checkNote: opt(row.check_note),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    updatedBy: str(row.updated_by),
  };
}

function toDataset(row: Record<string, unknown>): Dataset {
  return {
    id: str(row.id),
    connectionId: str(row.connection_id),
    label: str(row.label),
    ref: str(row.ref),
    // A dataset described before columns had ids keeps working: the title
    // stands in as the key, which is what it was being used as.
    fields: withKeys(json<Field[]>(row.fields, [])),
    rowCount: row.row_count == null ? undefined : Number(row.row_count),
    truncated: Boolean(Number(row.truncated ?? 0)),
    refreshSeconds: Number(row.refresh_seconds ?? 60),
    describedAt: opt(row.described_at),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    updatedBy: str(row.updated_by),
  };
}

function toView(row: Record<string, unknown>): ViewDef {
  return {
    id: str(row.id),
    slug: str(row.slug),
    label: str(row.label),
    icon: str(row.icon) || "table",
    section: str(row.section) || "Your work",
    order: Number(row.sort_order ?? 0),
    datasetId: str(row.dataset_id),
    description: opt(row.description),
    spec: json<ViewSpec>(row.spec, { layout: "table", fields: {}, filters: [], pageSize: 50 }),
    audience: json<Audience>(row.audience, EVERYONE),
    state: str(row.state) === "live" ? "live" : "draft",
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    updatedBy: str(row.updated_by),
  };
}
