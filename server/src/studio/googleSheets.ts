import { createSign } from "node:crypto";
import type { Connector, ConnectorContext, SettingSpec } from "./connectors.js";
import { fieldFromValues } from "./connectors.js";
import type { Field } from "./types.js";

/**
 * Google Sheets, read-only.
 *
 * The second connector that actually reads, and the one people will reach for
 * first: half the team's working lists are a Google Sheet somebody made in an
 * afternoon, and asking them to move those into Smartsheet before the Hub can
 * show them is how a tool goes unused.
 *
 * Two things here are decisions rather than mechanics, and both are in the
 * comments where they bite: how a sheet is authorised, and what a column's
 * identity is. Everything else — filters, layouts, who sees a view — is the
 * studio's and is the same whatever the rows came from.
 */

const SHEETS_API = process.env.GOOGLE_SHEETS_API ?? "https://sheets.googleapis.com/v4";
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token";

/** Read, and nothing else. The Hub never writes to a Google Sheet. */
const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

/** Rows past this are not read, and the dataset says it was cut. */
const ROW_CAP = 20000;

/**
 * How far right to read.
 *
 * ZZ is 702 columns. A sheet wider than that exists, but a *table* wider than
 * that does not, and an open-ended range makes Google return every empty cell
 * to the right of the data.
 */
const LAST_COLUMN = "ZZ";

/**
 * A spreadsheet id, from whatever somebody pasted.
 *
 * Nobody has the bare id to hand; they have the address bar. So the full URL
 * works, and so does the id on its own. The id is then checked against
 * Google's own alphabet before it goes anywhere near a URL, so a stored
 * connection cannot become a way to make the server fetch an arbitrary
 * address.
 */
export function readSpreadsheetId(value: string): string {
  const raw = (value ?? "").trim();
  if (!raw) throw new Error("No spreadsheet given.");

  const fromUrl = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(raw);
  const id = fromUrl ? fromUrl[1] : raw;

  if (!/^[A-Za-z0-9_-]{20,}$/.test(id)) {
    throw new Error(
      `"${raw.slice(0, 60)}" is not a Google Sheet. Paste the sheet's address, or the long id out of the middle of it.`,
    );
  }
  return id;
}

/**
 * Which tab, as a dataset stores it.
 *
 * `gid:0` — the tab's own number, which is what the address bar shows after
 * `#gid=` and what survives somebody renaming the tab. A bare title is
 * accepted too, because that is what a person types and what datasets saved
 * by hand may hold; it is resolved to a gid on the next read.
 */
export function readTabRef(ref: string): { gid?: number; title?: string } {
  const raw = (ref ?? "").trim();
  if (!raw) throw new Error("No tab given.");
  const m = /^gid:(\d{1,20})$/.exec(raw);
  if (m) return { gid: Number(m[1]) };
  return { title: raw };
}

interface SheetProperties {
  sheetId: number;
  title: string;
  gridProperties?: { rowCount?: number; columnCount?: number };
}

interface SpreadsheetMeta {
  properties?: { title?: string };
  sheets?: { properties: SheetProperties }[];
}

/**
 * An access token from a service-account key, cached until it expires.
 *
 * Module-level and keyed on the account's own address, because two
 * connections pointed at two spreadsheets through the same service account
 * should not each hold a token — and because a token lasts an hour while a
 * page load lasts a moment.
 */
const tokens = new Map<string, { token: string; until: number }>();

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/** Is this credential a service-account key, or an API key? */
function asServiceAccount(secret: string): ServiceAccount | null {
  const trimmed = secret.trim();
  if (!trimmed.startsWith("{")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(
      "That looks like a service-account key but is not valid JSON. Paste the whole file, braces included.",
    );
  }
  const account = parsed as Partial<ServiceAccount>;
  if (!account.client_email || !account.private_key) {
    throw new Error(
      "That JSON is missing client_email or private_key, so it is not a service-account key.",
    );
  }
  return account as ServiceAccount;
}

const base64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64url");

/**
 * Sign in as the service account.
 *
 * Google's server-to-server flow: a JWT signed with the account's private key
 * is exchanged for an access token. Done with `node:crypto` rather than
 * Google's client library, because it is twenty lines and the library is a
 * dependency tree — and because the twenty lines are the part worth being
 * able to read when a key stops working.
 *
 * The private key never leaves this function, and no error raised here
 * carries the credential: a message that quotes what it was given is how a
 * key ends up in a log.
 */
async function accessToken(account: ServiceAccount): Promise<string> {
  const cached = tokens.get(account.client_email);
  if (cached && cached.until > Date.now()) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const uri = account.token_uri ?? TOKEN_URL;
  const claims = {
    iss: account.client_email,
    scope: SCOPE,
    aud: uri,
    iat: now,
    exp: now + 3600,
  };
  const signed = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify(claims),
  )}`;

  let assertion: string;
  try {
    const signer = createSign("RSA-SHA256");
    signer.update(signed);
    // The key arrives from JSON, where the newlines are escaped; a PEM with
    // literal \n in it is the single most common reason this step fails.
    assertion = `${signed}.${signer.sign(account.private_key.replace(/\\n/g, "\n"), "base64url")}`;
  } catch {
    throw new Error(
      "The private key in that service-account file could not be used to sign. Check the file was pasted whole and has not been edited.",
    );
  }

  let res: Response;
  try {
    res = await fetch(uri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
  } catch (err) {
    throw new Error(
      `Could not reach Google to sign in — ${
        err instanceof Error ? err.message : "the request failed"
      }. This is a network or firewall problem, not the key.`,
    );
  }

  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !body.access_token) {
    // Google's own words, which are usually the actionable ones ("Invalid
    // JWT Signature", "Invalid grant: account not found").
    const said = body.error_description ?? body.error ?? `${res.status} ${res.statusText}`;
    throw new Error(
      `Google refused the service account: ${said}. Check the key is current and the Sheets API is enabled on its project.`,
    );
  }

  tokens.set(account.client_email, {
    token: body.access_token,
    // A minute short of the stated life, so a token never expires mid-read.
    until: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000,
  });
  return body.access_token;
}

/** Forget any cached token, so a changed credential takes effect at once. */
export function forgetGoogleTokens(): void {
  tokens.clear();
}

export class GoogleSheetsConnector implements Connector {
  readonly kind = "google-sheets" as const;
  readonly needs = {
    settings: [
      {
        key: "spreadsheetId",
        label: "Spreadsheet",
        placeholder: "Paste the sheet's address, or its id",
        required: true,
      },
    ] as SettingSpec[],
    credential:
      "A service-account key — the whole JSON file, braces included — with the sheet shared onto that account's address, exactly as you would share it with a colleague. An API key works too, but only on a sheet anyone with the link can already view, so it is for trying something out rather than for anything confidential.",
    // A JSON key is a file, not a token: a single-line box would eat its
    // newlines and quietly ruin the private key inside it.
    credentialLines: 6,
  };

  /**
   * One call, authorised whichever way this connection is set up.
   *
   * A service account is the one to use: the sheet stays private and is
   * shared with one address, exactly as it would be with a person. An API key
   * is offered because it is quick to try, and it only ever works on a sheet
   * that is already readable by anyone with the link — which the studio says
   * out loud rather than letting somebody discover by publishing a sheet.
   */
  private async call<T>(ctx: ConnectorContext, path: string, what: string): Promise<T> {
    if (!ctx.secret) throw new Error("No credential on this connection yet.");

    const account = asServiceAccount(ctx.secret);
    const url = new URL(`${SHEETS_API}${path}`);
    const headers: Record<string, string> = {};

    if (account) headers.Authorization = `Bearer ${await accessToken(account)}`;
    else url.searchParams.set("key", ctx.secret.trim());

    let res: Response;
    try {
      res = await fetch(url, { headers });
    } catch (err) {
      throw new Error(
        `Could not reach sheets.googleapis.com — ${
          err instanceof Error ? err.message : "the request failed"
        }. This is a network or firewall problem, not the credential.`,
      );
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string; status?: string };
      };
      // The address to share the sheet with is the one thing somebody needs at
      // exactly the moment they see a 403, and they do not have it to hand —
      // it is buried in a JSON file they downloaded once.
      throw new Error(
        googleMessage(res.status, body.error?.message, what, account?.client_email ?? false),
      );
    }
    return (await res.json()) as T;
  }

  private async meta(ctx: ConnectorContext): Promise<SpreadsheetMeta> {
    const id = readSpreadsheetId(ctx.settings.spreadsheetId ?? "");
    return this.call<SpreadsheetMeta>(
      ctx,
      // Only what is needed to list the tabs: no cell data, so this stays
      // cheap on a spreadsheet with a hundred thousand rows in it.
      `/spreadsheets/${encodeURIComponent(id)}?fields=${encodeURIComponent(
        "properties.title,sheets.properties(sheetId,title,gridProperties)",
      )}`,
      "spreadsheet",
    );
  }

  async probe(ctx: ConnectorContext): Promise<{ ok: boolean; note: string }> {
    try {
      const account = ctx.secret ? asServiceAccount(ctx.secret) : null;
      const meta = await this.meta(ctx);
      const tabs = meta.sheets ?? [];
      const rows = tabs.reduce((n, t) => n + (t.properties.gridProperties?.rowCount ?? 0), 0);
      const as = account ? ` as ${account.client_email}` : " with an API key";
      return {
        ok: true,
        note: `Reading “${meta.properties?.title ?? "the spreadsheet"}”${as} — ${tabs.length} ${
          tabs.length === 1 ? "tab" : "tabs"
        }, ${rows.toLocaleString()} rows of grid.`,
      };
    } catch (err) {
      return { ok: false, note: err instanceof Error ? err.message : "Failed" };
    }
  }

  async catalogue(ctx: ConnectorContext): Promise<{ ref: string; label: string }[]> {
    const meta = await this.meta(ctx);
    return (meta.sheets ?? []).map((s) => ({
      ref: `gid:${s.properties.sheetId}`,
      label: s.properties.title,
    }));
  }

  async describe(
    ctx: ConnectorContext,
    ref: string,
  ): Promise<{ fields: Field[]; rowCount: number; truncated: boolean }> {
    const read = await this.fetchAll(ctx, ref);
    return {
      fields: read.headers.map((h) =>
        fieldFromValues(h.key, h.name, read.rows.map((r) => r[h.key]).filter(Boolean)),
      ),
      rowCount: read.total,
      truncated: read.truncated,
    };
  }

  async read(ctx: ConnectorContext, ref: string): Promise<Record<string, string>[]> {
    return (await this.fetchAll(ctx, ref)).rows;
  }

  /**
   * One tab, as rows keyed by their heading.
   *
   * **A column's identity here is its heading, and that is a trade rather
   * than an oversight.** Smartsheet gives every column a permanent id, so the
   * Hub keys on that and a rename changes nothing. A Google Sheet has no such
   * thing: a column is a letter and a letter is a position. Keying on the
   * position would mean that inserting a column — which people do in a Google
   * Sheet without thinking, because it is a grid — silently re-points every
   * view at its neighbour, and a view showing the wrong column's data with no
   * sign of trouble is the worst outcome available.
   *
   * So the heading is the key. Insert, move and delete columns freely;
   * *rename* one and the views bound to it go empty, which is visible, and
   * reading the columns again picks the new name up.
   */
  private async fetchAll(
    ctx: ConnectorContext,
    ref: string,
  ): Promise<{
    headers: { key: string; name: string }[];
    rows: Record<string, string>[];
    total: number;
    truncated: boolean;
  }> {
    const id = readSpreadsheetId(ctx.settings.spreadsheetId ?? "");
    const want = readTabRef(ref);

    // The tab's title is what an A1 range is written in, and a gid is what the
    // dataset stored — so the tabs are listed to turn one into the other.
    const meta = await this.meta(ctx);
    const tabs = meta.sheets ?? [];
    const tab =
      want.gid !== undefined
        ? tabs.find((s) => s.properties.sheetId === want.gid)
        : tabs.find(
            (s) => s.properties.title.toLowerCase() === (want.title ?? "").toLowerCase(),
          );

    if (!tab) {
      const names = tabs.map((s) => s.properties.title).join(", ");
      throw new Error(
        want.gid !== undefined
          ? `That tab is no longer in the spreadsheet. It now has: ${names || "no tabs"}.`
          : `No tab called “${want.title}”. The spreadsheet has: ${names || "no tabs"}.`,
      );
    }

    const range = `${quoteTitle(tab.properties.title)}!A1:${LAST_COLUMN}${ROW_CAP + 1}`;
    const body = await this.call<{ values?: string[][] }>(
      ctx,
      // FORMATTED_VALUE is what a person sees in the cell, which is what
      // Smartsheet's displayValue gives too — so a row looks the same
      // whichever system it came from.
      `/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(
        range,
      )}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`,
      "tab",
    );

    const grid = body.values ?? [];
    if (grid.length === 0) {
      return { headers: [], rows: [], total: 0, truncated: false };
    }

    const headers = readHeaders(grid[0]);
    const rows = grid.slice(1).map((line, i) => {
      const row: Record<string, string> = { _row: String(i + 2) };
      headers.forEach((h, col) => {
        // Google omits trailing empty cells, so a short row is normal and a
        // missing cell has to read as empty rather than as undefined.
        row[h.key] = (line[col] ?? "").toString().trim();
      });
      return row;
    });

    for (const h of headers) normaliseDateColumn(rows, h.key);

    const declared = tab.properties.gridProperties?.rowCount ?? 0;
    return {
      headers,
      rows,
      // The grid's own row count includes the header and every blank row
      // below the data, so the rows actually read are the honest figure —
      // except when the cap bit, where the grid knows better.
      total: Math.max(rows.length, rows.length >= ROW_CAP ? declared - 1 : 0),
      truncated: rows.length >= ROW_CAP,
    };
  }
}

/**
 * The heading row, made into keys.
 *
 * Two things real sheets do that break a naive reader: a blank heading over a
 * column that has data in it, and the same heading twice. Neither is worth
 * refusing the sheet over, so a blank becomes its column letter and a
 * duplicate is numbered — and both keep their position, so nothing shifts.
 */
export function readHeaders(row: string[]): { key: string; name: string }[] {
  const seen = new Map<string, number>();
  return row.map((cell, i) => {
    const text = (cell ?? "").toString().trim();
    const base = text || columnLetter(i);
    const n = (seen.get(base.toLowerCase()) ?? 0) + 1;
    seen.set(base.toLowerCase(), n);
    const name = n === 1 ? base : `${base} (${n})`;
    return { key: name, name };
  });
}

/** 0 → A, 25 → Z, 26 → AA. What the sheet itself calls the column. */
export function columnLetter(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** A tab title inside an A1 range. Single quotes, and any quote doubled. */
export function quoteTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

const SLASHED = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/**
 * Dates, turned into the one form the rest of the Hub understands.
 *
 * A Google Sheet hands back what the cell displays, so a date is "24/09/2026"
 * or "9/24/2026" depending on the sheet's locale — and the Hub's calendar,
 * its date filters and its sorting all want `YYYY-MM-DD`. Left alone, a date
 * column from a Google Sheet sorts alphabetically, which puts the 1st of
 * every month together.
 *
 * Which way round the two numbers go is decided by the column rather than by
 * the row, and by evidence rather than by assumption: a value with more than
 * 12 in the first position can only be day-first, and more than 12 in the
 * second can only be month-first. A column where every value could be either
 * is genuinely ambiguous, and day-first is the right guess for a UK team — so
 * that is the default, applied to the whole column so at least it is
 * consistent.
 *
 * A column that is not entirely dates is left exactly as it was.
 */
export function normaliseDateColumn(rows: Record<string, string>[], key: string): void {
  const values = rows.map((r) => r[key]).filter((v) => v !== "" && v != null);
  if (values.length === 0) return;

  const parts = values.map((v) => SLASHED.exec(v));
  if (parts.some((p) => p === null)) return;

  let dayFirst = true;
  const firstOver12 = parts.some((p) => Number(p![1]) > 12);
  const secondOver12 = parts.some((p) => Number(p![2]) > 12);
  // Both over 12 in different rows means the column is not one date format at
  // all, so nothing is safe to conclude and nothing is changed.
  if (firstOver12 && secondOver12) return;
  if (secondOver12) dayFirst = false;

  for (const row of rows) {
    const m = SLASHED.exec(row[key] ?? "");
    if (!m) continue;
    const day = dayFirst ? m[1] : m[2];
    const month = dayFirst ? m[2] : m[1];
    row[key] = `${m[3]}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
}

/**
 * A Google failure in words somebody can act on.
 *
 * The two that matter are the two people actually hit: a sheet that has not
 * been shared with the service account, and an API key pointed at a private
 * sheet. Both arrive as a bare 403, and telling somebody "403 Forbidden"
 * sends them to look at the credential when what is wrong is the sharing.
 */
export function googleMessage(
  status: number,
  said: string | undefined,
  what: string,
  /** The service account's address, or false for an API key. */
  serviceAccount: string | false,
): string {
  if (status === 401) {
    return "Google refused the credential (401). If it is a service-account key, it may have been revoked.";
  }
  if (status === 403) {
    return serviceAccount
      ? `The credential works but has no access to this ${what} (403). Share the sheet with ${serviceAccount} — the way you would share it with a colleague. Viewer is enough.`
      : `An API key can only read a sheet that anyone with the link can view (403). Either change the sheet's sharing, or — better for anything confidential — use a service-account key and share the sheet with its address.`;
  }
  if (status === 404) {
    return `No ${what} with that id (404). Check the address was pasted whole.`;
  }
  if (status === 400) {
    // Google's own 400s are specific and worth passing on ("Unable to parse
    // range", "API key not valid"), unlike its 403s.
    return said ? `Google refused the request: ${said}` : "Google refused the request (400).";
  }
  if (status === 429) {
    return "Google is rate-limiting this credential (429). Try again shortly.";
  }
  return `Google returned ${status}${said ? ` — ${said}` : ""}.`;
}
