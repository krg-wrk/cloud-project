/**
 * Writing back to the commissioning sheet, against a stubbed API.
 *
 * This is the only thing the Hub does that edits somebody else's system, and
 * api.smartsheet.com is unreachable from the environment it was built in — so
 * these tests are the whole of the evidence that it behaves. They are written
 * as the things that must never happen:
 *
 *   * a write when the deployment did not ask for one
 *   * a write to a column outside the five
 *   * a write that overwrites an edit somebody else made in between
 *   * a status the sheet's own picklist would reject
 *
 *   node --test server/dist/data/write.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { COLUMNS, SmartsheetSource } from "./smartsheetSource.js";

const SHEET = "6141831453742468";

/** The commissioning sheet's columns, as the API returns them. */
const COLS = [
  { id: 1, title: COLUMNS.content.id },
  { id: 2, title: COLUMNS.content.title },
  { id: 3, title: COLUMNS.content.vertical },
  {
    id: 4,
    title: COLUMNS.content.status,
    type: "PICKLIST",
    // Deliberately the sheet's own wording, not the Hub's slugs.
    options: ["Not Started", "Writing", "Delivered", "In Review", "Live", "Blocked"],
  },
  { id: 5, title: COLUMNS.content.submissionDate, type: "DATE" },
  { id: 6, title: COLUMNS.content.publicationDate, type: "DATE" },
  { id: 7, title: COLUMNS.content.submittedOn, type: "DATE" },
  { id: 8, title: COLUMNS.content.notes },
];

const ROW = {
  id: 900,
  cells: [
    { columnId: 1, displayValue: "ss-4013" },
    { columnId: 2, displayValue: "Big Ideas S/S 28" },
    { columnId: 3, displayValue: "Womenswear" },
    { columnId: 4, displayValue: "Writing" },
    { columnId: 5, displayValue: "2026-09-18" },
    { columnId: 6, displayValue: "2026-10-02" },
    { columnId: 7, displayValue: "" },
    { columnId: 8, displayValue: "Waiting on the catwalk data" },
  ],
};

/**
 * Serve the sheet, and record what gets written.
 *
 * `rowNow` lets a test change the sheet under the writer's feet, which is the
 * case the concurrency check exists for.
 */
function stub({ rowNow = ROW, cols = COLS, fail } = {}) {
  const writes = [];
  globalThis.fetch = async (url, init = {}) => {
    if ((init.method ?? "GET") === "GET") {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        async json() {
          return { id: Number(SHEET), name: "Commissioning schedule", columns: cols, rows: [rowNow] };
        },
      };
    }
    writes.push({ url: String(url), method: init.method, body: JSON.parse(init.body) });
    if (fail) {
      return {
        ok: false,
        status: fail.status,
        statusText: "Bad Request",
        async json() {
          return { message: fail.message };
        },
      };
    }
    return { ok: true, status: 200, statusText: "OK", async json() { return { message: "SUCCESS" }; } };
  };
  return writes;
}

const source = async (allowWrites = true) => {
  const s = new SmartsheetSource({ token: "stub-token", contentSheetId: SHEET, allowWrites });
  await s.enableWrites();
  return s;
};

test("a source the deployment did not open for writing cannot write at all", async () => {
  stub();
  const s = new SmartsheetSource({ token: "stub-token", contentSheetId: SHEET });
  assert.equal(await s.enableWrites(), "off");
  assert.equal(s.writes, undefined, "there is no object to call");

  // And with the flag off but explicitly false, the same.
  const off = new SmartsheetSource({ token: "t", contentSheetId: SHEET, allowWrites: false });
  await off.enableWrites();
  assert.equal(off.writes, undefined);
});

test("switching writing on names the sheet, so a person is told what they are changing", async () => {
  stub();
  const s = await source();
  assert.ok(s.writes, "the writer exists once asked for");
  assert.equal(s.writes.target, `Commissioning schedule (sheet ${SHEET})`);
});

test("the row carries the sheet row it came from, which is the write address", async () => {
  stub();
  const s = await source();
  const [item] = await s.listContent();
  assert.equal(item.sourceRowId, "900");
  // The Content ID is a label, not a location, and is not what a write uses.
  assert.equal(item.id, "ss-4013");
});

test("a status is written as one of the sheet's own options, not the Hub's word", async () => {
  const writes = stub();
  const s = await source();
  await s.writes.apply("900", { status: "submitted" }, { [COLUMNS.content.status]: "Writing" });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, "PUT");
  assert.ok(writes[0].url.endsWith(`/sheets/${SHEET}/rows`));
  // "Delivered" is what this sheet calls submitted; "submitted" would be
  // refused by the picklist.
  assert.deepEqual(writes[0].body, [{ id: 900, cells: [{ columnId: 4, value: "Delivered" }] }]);
});

test("a status column with no picklist takes a plain label", async () => {
  const writes = stub({ cols: COLS.map((c) => (c.id === 4 ? { id: 4, title: c.title } : c)) });
  const s = await source();
  await s.writes.apply("900", { status: "at-risk" }, { [COLUMNS.content.status]: "Writing" });
  assert.deepEqual(writes[0].body[0].cells, [{ columnId: 4, value: "At Risk" }]);
});

test("a date is written as it stands, and an empty one clears the cell", async () => {
  const writes = stub();
  const s = await source();
  await s.writes.apply(
    "900",
    { submittedOn: "2026-09-17", publicationDate: "" },
    { [COLUMNS.content.submittedOn]: "", [COLUMNS.content.publicationDate]: "2026-10-02" },
  );
  assert.deepEqual(writes[0].body[0].cells, [
    { columnId: 6, value: null },
    { columnId: 7, value: "2026-09-17" },
  ]);
});

test("nothing outside the five columns can be reached", async () => {
  const writes = stub();
  const s = await source();
  // A caller that has got hold of extra keys — the API layer drops these, and
  // the writer does not trust that it did.
  await s.writes.apply(
    "900",
    { status: "published", vertical: "Beauty", forecaster: "someone@example.com", "Content ID": "x" },
    { [COLUMNS.content.status]: "Writing" },
  );
  const touched = writes[0].body[0].cells.map((c) => c.columnId);
  assert.deepEqual(touched, [4], "only the status column");
  // The title, vertical and Content ID columns are never in a payload.
  for (const id of [1, 2, 3]) assert.ok(!touched.includes(id), `column ${id} was written`);
});

test("a row somebody else changed in between is refused, not overwritten", async () => {
  // The sheet now says "In Review" where the confirmation said "Writing".
  const moved = {
    ...ROW,
    cells: ROW.cells.map((c) => (c.columnId === 4 ? { ...c, displayValue: "In Review" } : c)),
  };
  const writes = stub({ rowNow: moved });
  const s = await source();
  await assert.rejects(
    () => s.writes.apply("900", { status: "submitted" }, { [COLUMNS.content.status]: "Writing" }),
    /now reads "In Review" rather than "Writing"/,
  );
  assert.equal(writes.length, 0, "and nothing was sent");
});

test("a row that is no longer on the sheet is refused", async () => {
  const writes = stub({ rowNow: { id: 12345, cells: [] } });
  const s = await source();
  await assert.rejects(
    () => s.writes.apply("900", { status: "submitted" }, {}),
    /Row 900 is no longer on/,
  );
  assert.equal(writes.length, 0);
});

test("a sheet without the column says so rather than writing elsewhere", async () => {
  const writes = stub({ cols: COLS.filter((c) => c.title !== COLUMNS.content.submittedOn) });
  const s = await source();
  await assert.rejects(
    () => s.writes.apply("900", { submittedOn: "2026-09-17" }, {}),
    /has no "Actual Submission" column/,
  );
  assert.equal(writes.length, 0);
});

test("a change of nothing sends nothing", async () => {
  const writes = stub();
  const s = await source();
  await s.writes.apply("900", {}, {});
  assert.equal(writes.length, 0);
});

test("a refusal from Smartsheet comes back in words, naming the sheet", async () => {
  stub({ fail: { status: 400, message: "You do not have permission to modify this sheet." } });
  const s = await source();
  await assert.rejects(
    () => s.writes.apply("900", { status: "published" }, { [COLUMNS.content.status]: "Writing" }),
    /Commissioning schedule.*You do not have permission/s,
  );
});

test("a status word is read as the right one, whatever the sheet calls it", async () => {
  // Found by the picklist test above: "delivered" contains "live", so a
  // delivered forecast was being read as a published one — and every
  // timeliness figure computed from it was wrong.
  stub();
  const s = await source();
  const wanted = {
    "Not Started": "not-started",
    Writing: "in-progress",
    "In Progress": "in-progress",
    Draft: "in-progress",
    Delivered: "submitted",
    Submitted: "submitted",
    "In Review": "in-review",
    Live: "published",
    Published: "published",
    "Blocked": "at-risk",
    "At Risk": "at-risk",
  };
  for (const [sheetWord, expected] of Object.entries(wanted)) {
    const row = {
      ...ROW,
      cells: ROW.cells.map((c) => (c.columnId === 4 ? { ...c, displayValue: sheetWord } : c)),
    };
    stub({ rowNow: row });
    const [item] = await s.listContent();
    assert.equal(item.status, expected, `"${sheetWord}" should read as ${expected}`);
  }
});

test("what is compared against the sheet is read off the sheet, not translated", async () => {
  /*
   * The bug this exists for: the confirmation says "In progress → Submitted"
   * in the Hub's words, but the cell says "Writing". Comparing the two would
   * never match, so the concurrency check would be decorative — it would
   * refuse every write, and the fix for that is exactly the wrong one.
   */
  stub();
  const s = await source();
  const current = await s.writes.current("900");
  assert.equal(current[COLUMNS.content.status], "Writing", "the sheet's word");

  // Only the writable columns; nothing else is any of its business.
  assert.deepEqual(Object.keys(current).sort(), [
    COLUMNS.content.submittedOn,
    COLUMNS.content.notes,
    COLUMNS.content.publicationDate,
    COLUMNS.content.status,
    COLUMNS.content.submissionDate,
  ].sort());

  // And that value is the one apply accepts.
  const writes = stub();
  await s.writes.apply("900", { status: "submitted" }, current);
  assert.equal(writes.length, 1, "the check passes on the sheet's own words");
});
