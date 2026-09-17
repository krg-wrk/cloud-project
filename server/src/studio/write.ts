import { API, parseRef } from "./connectors.js";
import type { ConnectorContext } from "./connectors.js";
import type { Connection, Dataset, Field } from "./types.js";

/**
 * Changing a cell a view drew.
 *
 * The Hub has had a write-back since the commissioning sheet needed one, and
 * this is deliberately not that code. `ContentWriter` is bound to one
 * configured sheet and five named columns, and it addresses those columns by
 * their title — all three of which are the right decisions for the page it
 * serves and none of which survive contact with an arbitrary dataset somebody
 * pointed the studio at this morning. What is reused is everything that
 * matters: read the row before writing it, compare what the sheet says now
 * against what the person was shown, refuse on any difference, write only the
 * cells that changed, and record the attempt either way.
 *
 * The one real departure is how a column is named. The studio addresses
 * columns by id, because that is what survives somebody renaming a column in
 * Smartsheet, and the whole key/name split exists to make that true. So this
 * writer speaks ids, and the person-facing words are looked up from the
 * dataset's field list at the last moment.
 */

/** How long to wait on Smartsheet before giving up on one cell. */
const TIMEOUT_MS = 15_000;

/**
 * Why a dataset cannot be written, in words for the person who chose it.
 *
 * Three of the five connectors cannot write at all and the other two cannot
 * write *safely*, which is a different sentence and worth saying plainly in
 * the studio rather than discovering at the first failed save.
 */
export function writableSheet(
  connection: Connection,
  dataset: Dataset,
): { ok: true; sheetId: string } | { ok: false; why: string } {
  if (connection.kind === "google-sheets") {
    return {
      ok: false,
      why:
        "A Google Sheet is read-only to the Hub — the connection asks Google for read access and nothing else. " +
        "A row there is also addressed by its position in the grid, so sorting the tab would move what a saved edit points at.",
    };
  }
  if (connection.kind === "hub") {
    return {
      ok: false,
      why:
        "The Hub's own tables are a reading surface over the sheets behind them. " +
        "Change the forecast itself, on its page, and the view follows.",
    };
  }
  if (connection.kind !== "smartsheet") {
    return { ok: false, why: `${connection.kind} does not read yet, let alone write.` };
  }

  let ref: { kind: "sheet" | "report"; id: string };
  try {
    ref = parseRef(dataset.ref);
  } catch (err) {
    return { ok: false, why: err instanceof Error ? err.message : "That reference is not readable." };
  }
  if (ref.kind === "report") {
    return {
      ok: false,
      why:
        "A report draws rows from several sheets and names its columns with ids that mean nothing outside the report, " +
        "so there is no sheet and no column for the Hub to write to. Point the dataset at the sheet itself.",
    };
  }
  return { ok: true, sheetId: ref.id };
}

/** One cell, as it was shown to the person before they committed to it. */
export interface CellEdit {
  /** The column's stable key — a Smartsheet column id. */
  field: string;
  /** Its title, as of the last read, for the confirmation and the log. */
  name: string;
  /** What the sheet says now. */
  from: string;
  /** What it would say. */
  to: string;
}

/**
 * A value on its way into a cell.
 *
 * Smartsheet is typed and the studio's idea of a type is inferred from what
 * the column happened to contain, so this stays small and refuses rather than
 * guesses. An empty string clears the cell — the same meaning the existing
 * write-back gives it, and the only way to unset a date from a text box.
 */
export function cellValue(value: string, type: Field["type"] | undefined): unknown {
  const text = value.trim();
  if (text === "") return null;
  if (type === "boolean") return /^(true|yes|1|y)$/i.test(text);
  if (type === "number") {
    const n = Number(text.replace(/[,\s]/g, ""));
    return Number.isFinite(n) ? n : text;
  }
  return text;
}

/**
 * Whether a value is one this column could take, before anything is sent.
 *
 * Only the two structural checks, and deliberately not a check against the
 * column's `options`. Those are not a picklist — the studio fills them in for
 * any column with few enough distinct values, so a free-text column that
 * happens to hold a dozen different things would have its thirteenth refused.
 * They are a good enough hint to offer as suggestions and nowhere near good
 * enough to refuse on.
 *
 * Smartsheet is the authority on what a column will take, and it says so with
 * a 400 that carries a usable message. What this stops is the two cases that
 * would otherwise become that round trip for no reason.
 */
export function refuseValue(value: string, field: Field): string | undefined {
  const text = value.trim();
  if (text === "") return undefined;
  if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return `${field.name} is a date, so it needs to look like 2026-09-30.`;
  }
  if (field.type === "number" && !Number.isFinite(Number(text.replace(/[,\s]/g, "")))) {
    return `${field.name} is a number, and "${text}" is not one.`;
  }
  return undefined;
}

/**
 * One sheet, one row at a time.
 *
 * Deliberately not a batch interface. A view edit is one person changing one
 * cell they are looking at, and the sheet is somebody else's live document —
 * the round trip per cell is the cost of reading it again before touching it,
 * which is the whole safety property.
 */
export class SheetWriter {
  constructor(
    private readonly sheetId: string,
    private readonly ctx: ConnectorContext,
  ) {}

  /**
   * The row as the sheet has it now, keyed the way the reader keys it.
   *
   * Same `displayValue ?? value` rule the connector's `flatten` uses, because
   * the comparison is against what the person was shown and what they were
   * shown came through that. A different rule here would make every edit to a
   * date or a contact look like somebody else's intervening change.
   */
  async current(rowId: string): Promise<Record<string, string>> {
    const row = await this.call<SmartsheetRow>(
      `/sheets/${this.sheetId}/rows/${numeric(rowId)}`,
      "GET",
    );
    const out: Record<string, string> = {};
    for (const cell of row.cells ?? []) {
      const key = String(cell.columnId ?? "");
      if (!key) continue;
      out[key] = cell.displayValue ?? (cell.value != null ? String(cell.value) : "");
    }
    return out;
  }

  /**
   * Write the changed cells, having checked nobody else moved first.
   *
   * `expect` is what the sheet said when the change was described, and every
   * key in it is re-read and compared before a single cell is sent. That is
   * the difference between this and a form that saves on click: two people
   * editing the same row on a Friday afternoon get a refusal and a reload,
   * rather than one of them silently losing their afternoon.
   *
   * Only the cells in `changes` are written. The commissioning sheet's writer
   * sends all five of its columns on every apply and checks only the ones that
   * differ, which quietly overwrites a column somebody else touched; there is
   * no reason to inherit that.
   */
  async apply(
    rowId: string,
    changes: { field: string; value: unknown }[],
    expect: Record<string, string>,
  ): Promise<void> {
    const now = await this.current(rowId);
    for (const [key, was] of Object.entries(expect)) {
      const holds = now[key] ?? "";
      if (holds.trim() !== was.trim()) {
        throw new Error(
          `That cell now reads "${holds}" rather than "${was}". ` +
            "Somebody changed the row while this was open — reload and look again.",
        );
      }
    }
    if (changes.length === 0) return;
    await this.call(`/sheets/${this.sheetId}/rows`, "PUT", [
      {
        id: numeric(rowId),
        cells: changes.map((c) => ({ columnId: numeric(c.field), value: c.value })),
      },
    ]);
  }

  private async call<T>(path: string, method: "GET" | "PUT", body?: unknown): Promise<T> {
    if (!this.ctx.secret) throw new Error("No API token on this connection yet.");
    let res: Response;
    try {
      res = await fetch(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.ctx.secret}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(
        `Could not reach api.smartsheet.com — ${
          err instanceof Error ? err.message : "the request failed"
        }. This is a network problem, not the change.`,
      );
    }
    if (!res.ok) throw new Error(await writeMessage(res));
    return (await res.json()) as T;
  }
}

/**
 * A refusal from Smartsheet in words somebody can act on.
 *
 * Kept apart from the reader's version because the failures differ: a write
 * fails on permissions the token has for *editing* and on values a column will
 * not take, neither of which a read ever hits.
 */
async function writeMessage(res: Response): Promise<string> {
  if (res.status === 401) return "Smartsheet refused the token (401). It may be wrong or revoked.";
  if (res.status === 403) {
    return "The token can read this sheet but not change it (403). Share the sheet with the token's account as an editor.";
  }
  if (res.status === 404) return "That row is no longer on the sheet (404). It may have been deleted.";
  if (res.status === 429) return "Smartsheet is rate-limiting the token (429). Try again shortly.";
  // A 400 carries the useful part — "the column is not editable", "invalid
  // value for the column type" — and no credential, so it is worth passing on.
  if (res.status === 400) {
    const said = await res
      .json()
      .then((b) => (b as { message?: string }).message)
      .catch(() => undefined);
    return said
      ? `Smartsheet would not take that — ${said}`
      : "Smartsheet would not take that value for this column (400).";
  }
  return `Smartsheet returned ${res.status} ${res.statusText}.`;
}

interface SmartsheetRow {
  id?: number;
  cells?: { columnId?: number; value?: unknown; displayValue?: string }[];
}

/**
 * A Smartsheet id as a number, having checked it is one.
 *
 * Row and column ids arrive from the client, and both go straight into a URL
 * or a request body. Anything that is not a plain positive integer is refused
 * here rather than being concatenated and hoped for.
 */
function numeric(id: string): number {
  if (!/^\d{1,19}$/.test(id.trim())) throw new Error("That row is not one this sheet can address.");
  return Number(id.trim());
}
