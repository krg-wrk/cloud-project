import type { ContentItem, ContentWriter, Status, WritableFields } from "../types.js";
import { COLUMNS, STATUS_LABELS } from "./smartsheetSource.js";

/**
 * A sheet that is not a sheet, for developing the one thing that writes.
 *
 * Changing the commissioning sheet is the only part of the Hub that edits
 * somebody else's system, so it is the part most worth getting right and the
 * part hardest to sit in front of: seeing it at all needs a Smartsheet token
 * and a real sheet to point it at, which is a lot to ask of somebody fixing
 * the wording on a confirmation dialog. Without this, the write-back screens
 * are the only ones in the Hub nobody can look at locally.
 *
 * So this stands in for the sheet, in memory, and behaves the way the real
 * writer behaves in every way that the screens above it can tell apart:
 *
 * - it speaks the sheet's words, not the Hub's, so the concurrency check is
 *   comparing the same kinds of thing it compares in production;
 * - it refuses a change worked out against a row that has since moved on,
 *   with the same message;
 * - it is named in the confirmation as something obviously not real, so
 *   nobody mistakes a local experiment for a change to the live schedule.
 *
 * It is off unless `SEED_WRITES=1`, and it only exists on the seed source,
 * which has no credentials and no network. Nothing it changes outlives the
 * process.
 */
export class SeedContentWriter implements ContentWriter {
  /*
   * Deliberately not a plausible sheet name. This string is shown in the
   * confirmation — "This will change 3 cells on …" — and the one thing it
   * must never do is read like the managers' real sheet.
   */
  readonly target = "the sample schedule (in memory — nothing real changes)";

  constructor(private readonly rows: ContentItem[]) {}

  private find(rowId: string): ContentItem | undefined {
    return this.rows.find((r) => r.sourceRowId === rowId);
  }

  /** The writable cells in the sheet's own words, keyed by column title. */
  async current(rowId: string): Promise<Record<string, string>> {
    const row = this.find(rowId);
    if (!row) throw new Error(`No row ${rowId} in the sample schedule.`);
    return {
      [COLUMNS.content.status]: STATUS_LABELS[row.status] ?? row.status,
      [COLUMNS.content.submissionDate]: row.submissionDate ?? "",
      [COLUMNS.content.publicationDate]: row.publicationDate ?? "",
      [COLUMNS.content.submittedOn]: row.submittedOn ?? "",
      [COLUMNS.content.notes]: row.notes ?? "",
    };
  }

  async apply(
    rowId: string,
    changes: WritableFields,
    expect: Record<string, string>,
  ): Promise<void> {
    const row = this.find(rowId);
    if (!row) throw new Error(`No row ${rowId} in the sample schedule.`);

    // The same check the real writer makes, for the same reason: somebody
    // else's edit is not ours to discard, and a stale confirmation is exactly
    // how that happens.
    const now = await this.current(rowId);
    for (const [column, was] of Object.entries(expect)) {
      if ((now[column] ?? "") !== was) {
        throw new Error(
          `"${column}" has changed since this was worked out — it now reads ` +
            `"${now[column] ?? ""}". Review the change again.`,
        );
      }
    }

    if (changes.status !== undefined) row.status = changes.status as Status;
    if (changes.submissionDate !== undefined) row.submissionDate = changes.submissionDate;
    if (changes.publicationDate !== undefined) row.publicationDate = changes.publicationDate;
    if (changes.submittedOn !== undefined) row.submittedOn = changes.submittedOn;
    if (changes.notes !== undefined) row.notes = changes.notes;
  }
}
