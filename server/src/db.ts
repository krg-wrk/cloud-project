import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import pg from "pg";

/**
 * The database, behind one door.
 *
 * SQLite is right for a proof of concept — no service to run, a real
 * database with real indexes, and it survives a restart. It is wrong for two
 * hundred people, because only one process can write to a file and the Hub
 * will want more than one instance behind a load balancer.
 *
 * So both, with the same SQL. Not an ORM and not a query builder: every
 * query in the Hub is ordinary SQL and stays that way, because SQL is the
 * thing that is worth being able to read. What differs between the two is
 * small enough to name:
 *
 * - **Placeholders.** SQLite takes `?`, Postgres takes `$1`. The queries are
 *   written with `?` and translated on the way out, because `?` is the one
 *   that stays readable when a statement has nine of them.
 * - **Async.** Every Postgres driver is asynchronous, and node:sqlite is not.
 *   So this interface is asynchronous and SQLite is wrapped — which costs a
 *   microtask per query and makes the store the same shape on both.
 * - **Types.** SQLite has no boolean and returns integers; Postgres has one
 *   and returns booleans. `COUNT(*)` comes back a number from one and a
 *   string from the other. Both are normalised in the row readers rather
 *   than here, because it is the readers that know which column is what.
 * - **A handful of DDL words.** `AUTOINCREMENT`, `PRAGMA`. The schema avoids
 *   them; see `schema.ts`.
 */

export type Row = Record<string, unknown>;

export interface Db {
  /** Which one this is, for the boot banner and the freshness page. */
  readonly kind: "sqlite" | "postgres";
  /** Where it is, with any password removed. Safe to print. */
  readonly where: string;
  all(sql: string, params?: unknown[]): Promise<Row[]>;
  get(sql: string, params?: unknown[]): Promise<Row | undefined>;
  /** How many rows it touched — which is how a delete says whether it found one. */
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  /** Several statements, for the schema. */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * `?` to `$1`, `$2`, …
 *
 * Only outside string literals: a query that carries a literal question mark
 * — `'Why?'` — must not have it renumbered. Walking the string is more code
 * than a regex and is the only way to know which quotes are open.
 */
export function toDollars(sql: string): string {
  let out = "";
  let n = 0;
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (quote) {
      out += c;
      // Two quotes in a row is an escaped quote, not the end of the string.
      if (c === quote) {
        if (sql[i + 1] === quote) {
          out += sql[++i];
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      out += c;
      continue;
    }
    out += c === "?" ? `$${++n}` : c;
  }
  return out;
}

/** A connection string with the password taken out, for printing. */
export function hideSecret(url: string): string {
  try {
    const at = new URL(url);
    if (at.password) at.password = "***";
    return at.toString();
  } catch {
    return "the configured database";
  }
}

class SqliteDb implements Db {
  readonly kind = "sqlite" as const;
  readonly where: string;
  private db: DatabaseSync;

  constructor(file: string) {
    this.where = file;
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    // Concurrent readers alongside a writer, and referential integrity —
    // neither is the default, and Postgres gives both without asking.
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
  }

  async all(sql: string, params: unknown[] = []): Promise<Row[]> {
    return this.db.prepare(sql).all(...(params as never[])) as Row[];
  }

  async get(sql: string, params: unknown[] = []): Promise<Row | undefined> {
    return this.db.prepare(sql).get(...(params as never[])) as Row | undefined;
  }

  async run(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    const result = this.db.prepare(sql).run(...(params as never[]));
    return { changes: Number(result.changes) };
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async close(): Promise<void> {
    this.db.close();
  }

  /** The studio's own tables share the handle rather than a second file. */
  get handle(): DatabaseSync {
    return this.db;
  }
}

class PostgresDb implements Db {
  readonly kind = "postgres" as const;
  readonly where: string;
  private pool: pg.Pool;

  constructor(url: string) {
    this.where = hideSecret(url);
    /*
     * A pool rather than a connection, because the point of moving here is
     * that several requests are in flight at once. Ten is plenty for a team
     * of two hundred reading a schedule; it is the sort of number to raise
     * only when something says to.
     */
    this.pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.HUB_DB_POOL ?? 10),
      // A query that has not answered in ten seconds is not going to.
      statement_timeout: 10_000,
    });
  }

  async all(sql: string, params: unknown[] = []): Promise<Row[]> {
    const res = await this.pool.query(toDollars(sql), params);
    return res.rows as Row[];
  }

  async get(sql: string, params: unknown[] = []): Promise<Row | undefined> {
    const res = await this.pool.query(toDollars(sql), params);
    return res.rows[0] as Row | undefined;
  }

  async run(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    const res = await this.pool.query(toDollars(sql), params);
    return { changes: res.rowCount ?? 0 };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Whichever this deployment asked for.
 *
 * `HUB_DB_URL=postgres://…` is the switch. Without it, the file — which
 * keeps `npm run dev` a one-liner with nothing to install, and is what the
 * proof of concept has always run on.
 */
export function openDb(): Db {
  const url = process.env.HUB_DB_URL;
  if (url) {
    if (!/^postgres(ql)?:\/\//.test(url)) {
      throw new Error(
        `HUB_DB_URL should be a postgres:// connection string. Got "${url.slice(0, 24)}…".`,
      );
    }
    return new PostgresDb(url);
  }
  return new SqliteDb(process.env.HUB_DB ?? "./data/hub.db");
}

/** The SQLite handle, where something still needs the synchronous one. */
export function sqliteHandle(db: Db): DatabaseSync | null {
  return db instanceof SqliteDb ? db.handle : null;
}
