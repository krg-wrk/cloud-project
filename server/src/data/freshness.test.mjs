/**
 * Reading a sheet only when the sheet has changed, against a stubbed API.
 *
 * Drawing the fixed pages reads sixteen sheets. Most of them — the directory
 * above all — change perhaps weekly, so nearly every one of those reads asks
 * a question already answered. One listing call reports every sheet's
 * modified time at once, and that is what decides.
 *
 * Written as the things that must never happen:
 *
 *   * a sheet somebody has edited being served from the copy in hand
 *   * the writer's re-read being answered from that copy, which would turn
 *     the concurrency check into the Hub agreeing with itself
 *   * a listing that fails quietly freezing the schedule
 *
 *   node --test server/dist/data/freshness.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { COLUMNS, SmartsheetSource, sheetIsCurrent } from "./smartsheetSource.js";

const SHEET = "6141831453742468";

const COLS = [
  { id: 1, title: COLUMNS.content.id },
  { id: 2, title: COLUMNS.content.title },
  { id: 3, title: COLUMNS.content.vertical },
  { id: 4, title: COLUMNS.content.status, type: "PICKLIST", options: ["Writing"] },
  { id: 5, title: COLUMNS.content.submissionDate, type: "DATE" },
  { id: 6, title: COLUMNS.content.notes },
];

const rowWith = (state) => ({
  id: 900,
  cells: [
    { columnId: 1, displayValue: "ss-4013" },
    { columnId: 2, displayValue: state.title },
    { columnId: 3, displayValue: "Womenswear" },
    { columnId: 4, displayValue: "Writing" },
    { columnId: 5, value: "2026-09-18", displayValue: "18/09/26" },
    { columnId: 6, displayValue: state.notes ?? "Waiting on the catwalk data" },
  ],
});

/**
 * Serve the listing and the sheet, and count which was asked for.
 *
 * `state` is mutable so a test can edit the sheet between reads the way a
 * person edits it between page loads — moving the stamp, or deliberately not
 * moving it.
 */
function stub(state) {
  const reads = { listing: 0, sheet: 0 };
  globalThis.fetch = async (url) => {
    const at = String(url);
    const answer = (body) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      async json() {
        return body;
      },
    });
    if (at.includes("/sheets?")) {
      reads.listing += 1;
      if (state.listingFails) {
        return { ok: false, status: 500, statusText: "Server Error", async json() { return {}; } };
      }
      return answer({ data: [{ id: Number(SHEET), name: "All Content 2026", modifiedAt: state.modifiedAt }] });
    }
    reads.sheet += 1;
    return answer({
      id: Number(SHEET),
      name: "All Content 2026",
      columns: COLS,
      rows: [rowWith(state)],
    });
  };
  return reads;
}

/*
 * The stamps are re-listed every time unless a test says otherwise, so what
 * is being watched is the stamp deciding rather than an interval elapsing.
 */
const source = ({ allowWrites = false, stampTtlMs = 0 } = {}) =>
  new SmartsheetSource({ token: "stub-token", contentSheetIds: [SHEET], allowWrites, stampTtlMs });

test("a stamp that has not moved means the sheet is the one already read", () => {
  assert.equal(sheetIsCurrent("2026-09-23T11:00:41Z", "2026-09-23T11:00:41Z"), true);
});

test("anything the listing cannot vouch for is read again, because unknown is not unchanged", () => {
  assert.equal(sheetIsCurrent("2026-09-23T11:00:41Z", "2026-09-23T12:00:00Z"), false, "moved");
  assert.equal(sheetIsCurrent(undefined, "2026-09-23T11:00:41Z"), false, "never read");
  assert.equal(sheetIsCurrent("2026-09-23T11:00:41Z", undefined), false, "not in the listing");
  assert.equal(sheetIsCurrent(undefined, undefined), false);
});

test("a sheet nobody has touched is read once, however often the pages ask for it", async () => {
  const state = { modifiedAt: "2026-09-23T11:00:41Z", title: "Big Ideas S/S 28" };
  const reads = stub(state);
  const s = source();

  await s.listContent();
  await s.listContent();
  await s.listContent();

  assert.equal(reads.sheet, 1, "the sheet itself is read once");
  assert.equal(reads.listing, 3, "though the listing is asked every time, which is the cheap call");
});

test("one listing stands for the whole interval, so the cheap call is not made per sheet either", async () => {
  const state = { modifiedAt: "2026-09-23T11:00:41Z", title: "Big Ideas S/S 28" };
  const reads = stub(state);
  const s = source({ stampTtlMs: 30_000 });

  await s.listContent();
  await s.listContent();
  await s.listContent();

  assert.equal(reads.listing, 1);
  assert.equal(reads.sheet, 1);
});

test("a sheet somebody has edited is read again, so a corrected title reaches the page", async () => {
  const state = { modifiedAt: "2026-09-23T11:00:41Z", title: "Big Ideas S/S 28" };
  const reads = stub(state);
  const s = source();

  const before = await s.listContent();
  assert.equal(before[0].title, "Big Ideas S/S 28");

  // Somebody edits the row in Smartsheet, which moves the sheet's stamp.
  state.title = "Big Ideas S/S 28 — revised";
  state.modifiedAt = "2026-09-23T12:30:00Z";

  const after = await s.listContent();
  assert.equal(after[0].title, "Big Ideas S/S 28 — revised");
  assert.equal(reads.sheet, 2);
});

test("a write of the Hub's own drops the copy, whatever the stamp says", async () => {
  const state = { modifiedAt: "2026-09-23T11:00:41Z", title: "Big Ideas S/S 28" };
  const reads = stub(state);
  const s = source({ stampTtlMs: 30_000 });

  await s.listContent();
  s.forget();
  await s.listContent();

  assert.equal(reads.sheet, 2);
});

test("a listing that fails reads every sheet the long way rather than serving an old one", async () => {
  const state = { modifiedAt: "2026-09-23T11:00:41Z", title: "Big Ideas S/S 28", listingFails: true };
  const reads = stub(state);
  const s = source();

  await s.listContent();
  state.title = "Big Ideas S/S 28 — revised";
  const after = await s.listContent();

  assert.equal(after[0].title, "Big Ideas S/S 28 — revised", "nothing is held without a stamp");
  assert.equal(reads.sheet, 2);
});

test("the writer's re-read goes to the sheet, so somebody else's edit is still caught", async () => {
  const state = { modifiedAt: "2026-09-23T11:00:41Z", title: "Big Ideas S/S 28" };
  stub(state);
  const s = source({ allowWrites: true, stampTtlMs: 30_000 });
  await s.enableWrites();

  // The page is drawn, which fills the copy in hand.
  await s.listContent();

  /*
   * Somebody edits the row and the stamp does not move — the case the cache
   * cannot see. The apply must still refuse, because it reads the sheet
   * itself rather than what the Hub happens to be holding.
   */
  state.notes = "Somebody else got there first";

  const current = await s.writes.current("900");
  assert.equal(
    current[COLUMNS.content.notes],
    "Somebody else got there first",
    "the writer is told what the sheet says now, not what the pages were drawn from",
  );

  await assert.rejects(
    () =>
      s.writes.apply(
        "900",
        { notes: "mine" },
        { [COLUMNS.content.notes]: "Waiting on the catwalk data" },
      ),
    /Somebody changed the row/,
  );
});
