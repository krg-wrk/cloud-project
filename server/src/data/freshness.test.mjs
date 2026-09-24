/**
 * Reading a sheet only when the sheet has changed, against a stubbed API.
 *
 * Drawing the fixed pages reads thirteen sheets. Most of them — the directory
 * above all — change perhaps weekly, so nearly every one of those reads asks
 * a question already answered. Smartsheet increments a sheet's version on
 * every change to it and will report that number on its own, and that is
 * what decides.
 *
 * Written as the things that must never happen:
 *
 *   * a sheet somebody has edited being served from the copy in hand
 *   * the writer's re-read being answered from that copy, which would turn
 *     the concurrency check into the Hub agreeing with itself
 *   * a version check that fails quietly freezing the schedule
 *   * the check asking about sheets this deployment was never pointed at
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
 * Serve the version and the sheet, and record what was asked for.
 *
 * `state` is mutable so a test can edit the sheet between reads the way a
 * person edits it between page loads — moving the version, or deliberately
 * not moving it.
 */
function stub(state) {
  const reads = { version: 0, sheet: 0, asked: [] };
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
    reads.asked.push(at);
    if (at.endsWith("/version")) {
      reads.version += 1;
      if (state.versionFails) {
        return { ok: false, status: 500, statusText: "Server Error", async json() { return {}; } };
      }
      return answer({ version: state.version });
    }
    reads.sheet += 1;
    return answer({
      id: Number(SHEET),
      name: "All Content 2026",
      version: state.version,
      columns: COLS,
      rows: [rowWith(state)],
    });
  };
  return reads;
}

/*
 * The version is asked again every time unless a test says otherwise, so
 * what is being watched is the version deciding rather than an interval
 * elapsing.
 */
const source = ({ allowWrites = false, stampTtlMs = 0 } = {}) =>
  new SmartsheetSource({ token: "stub-token", contentSheetIds: [SHEET], allowWrites, stampTtlMs });

test("a version that has not moved means the sheet is the one already read", () => {
  assert.equal(sheetIsCurrent(117, 117), true);
  assert.equal(sheetIsCurrent(0, 0), true, "a sheet nobody has ever edited counts too");
});

test("anything the check cannot vouch for is read again, because unknown is not unchanged", () => {
  assert.equal(sheetIsCurrent(117, 118), false, "moved");
  assert.equal(sheetIsCurrent(undefined, 117), false, "never read");
  assert.equal(sheetIsCurrent(117, undefined), false, "no version to be had");
  assert.equal(sheetIsCurrent(undefined, undefined), false);
});

test("a sheet nobody has touched is read once, however often the pages ask for it", async () => {
  const state = { version: 117, title: "Big Ideas S/S 28" };
  const reads = stub(state);
  const s = source();

  await s.listContent();
  await s.listContent();
  await s.listContent();

  assert.equal(reads.sheet, 1, "the sheet itself is read once");
  assert.equal(reads.version, 3, "though the version is asked every time, which is the cheap call");
});

test("only the sheets this deployment was pointed at are ever asked about", async () => {
  const state = { version: 117, title: "Big Ideas S/S 28" };
  const reads = stub(state);
  const s = source();

  await s.listContent();
  await s.listContent();

  /*
   * Every call names the one sheet configured. Listing the account would
   * work and was how this started — it also returns all hundred and twenty
   * sheets the token can see to answer a question about thirteen, and it
   * stops answering at all for a token narrowed to the Hub's own folder.
   */
  for (const url of reads.asked) {
    assert.ok(url.includes(`/sheets/${SHEET}`), `asked about something else: ${url}`);
  }
  assert.equal(
    reads.asked.some((url) => /\/sheets\?/.test(url)),
    false,
    "the account is never listed",
  );
});

test("one version answer stands for the whole interval, so even the cheap call is not made per read", async () => {
  const state = { version: 117, title: "Big Ideas S/S 28" };
  const reads = stub(state);
  const s = source({ stampTtlMs: 30_000 });

  await s.listContent();
  await s.listContent();
  await s.listContent();

  assert.equal(reads.version, 1);
  assert.equal(reads.sheet, 1);
});

test("a sheet somebody has edited is read again, so a corrected title reaches the page", async () => {
  const state = { version: 117, title: "Big Ideas S/S 28" };
  const reads = stub(state);
  const s = source();

  const before = await s.listContent();
  assert.equal(before[0].title, "Big Ideas S/S 28");

  // Somebody edits the row in Smartsheet, which moves the sheet's version.
  state.title = "Big Ideas S/S 28 — revised";
  state.version = 118;

  const after = await s.listContent();
  assert.equal(after[0].title, "Big Ideas S/S 28 — revised");
  assert.equal(reads.sheet, 2);
});

test("a write of the Hub's own drops the copy, whatever the version says", async () => {
  const state = { version: 117, title: "Big Ideas S/S 28" };
  const reads = stub(state);
  const s = source({ stampTtlMs: 30_000 });

  await s.listContent();
  s.forget();
  await s.listContent();

  assert.equal(reads.sheet, 2);
});

test("a version check that fails reads the sheet the long way rather than serving an old one", async () => {
  const state = { version: 117, title: "Big Ideas S/S 28", versionFails: true };
  const reads = stub(state);
  const s = source();

  await s.listContent();
  state.title = "Big Ideas S/S 28 — revised";
  const after = await s.listContent();

  assert.equal(after[0].title, "Big Ideas S/S 28 — revised", "nothing is served without a version");
  assert.equal(reads.sheet, 2);
});

test("the writer's re-read goes to the sheet, so somebody else's edit is still caught", async () => {
  const state = { version: 117, title: "Big Ideas S/S 28" };
  stub(state);
  const s = source({ allowWrites: true, stampTtlMs: 30_000 });
  await s.enableWrites();

  // The page is drawn, which fills the copy in hand.
  await s.listContent();

  /*
   * Somebody edits the row and the version does not move — the case the
   * cache cannot see. The apply must still refuse, because it reads the
   * sheet itself rather than what the Hub happens to be holding.
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
