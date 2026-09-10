/**
 * The Smartsheet reader, against a stubbed API.
 *
 * api.smartsheet.com is unreachable from the environment this was built in,
 * so the reader cannot be exercised against the real thing. These tests stand
 * in for that: they serve the shapes the API documents — a paged sheet, a
 * report with virtual column ids, a renamed column — and check the four
 * behaviours that would otherwise only fail in production.
 *
 *   node --test server/dist/studio/connectors.test.mjs
 *
 * Run against the built output so it tests what actually ships.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { SmartsheetConnector, parseRef } from "./connectors.js";

const TOKEN = { settings: {}, secret: "stub-token" };

/** A column as the API returns one. */
const col = (id, title, type = "TEXT_NUMBER", extra = {}) => ({ id, title, type, ...extra });

/**
 * Serve a fake Smartsheet.
 *
 * `pages` is how many pages of `pageSize` the sheet has; the stub honours the
 * page parameter, so a reader that ignores paging reads only the first page
 * and the assertions catch it.
 */
function stub({ columns, rowsPerPage, pages, kind = "sheet", cellKey = "columnId" }) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const page = Number(new URL(String(url)).searchParams.get("page") ?? 1);
    const total = rowsPerPage * pages;
    const rows = [];
    for (let i = 0; i < rowsPerPage; i++) {
      const n = (page - 1) * rowsPerPage + i;
      rows.push({
        id: 1000 + n,
        cells: columns.map((c) => ({
          [cellKey]: cellKey === "virtualColumnId" ? c.virtualId : c.id,
          value: `${c.title}-${n}`,
          displayValue: `${c.title}-${n}`,
        })),
      });
    }
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      async json() {
        return {
          name: `A ${kind}`,
          totalRowCount: total,
          pageNumber: page,
          totalPages: pages,
          columns,
          rows,
        };
      },
    };
  };
  return calls;
}

test("a ref names a sheet or a report, and nothing else", () => {
  assert.deepEqual(parseRef("sheet:6141831453742468"), {
    kind: "sheet",
    id: "6141831453742468",
  });
  assert.deepEqual(parseRef("report:6141831453742468"), {
    kind: "report",
    id: "6141831453742468",
  });
  // A bare number is a sheet, so datasets saved before reports existed work.
  assert.deepEqual(parseRef("6141831453742468"), { kind: "sheet", id: "6141831453742468" });
  // Anything that is not an id is refused rather than concatenated into a URL.
  for (const bad of ["https://evil.example/x", "sheet:abc", "../etc/passwd", "12", ""]) {
    assert.throws(() => parseRef(bad), /not a Smartsheet reference/, `should refuse ${bad}`);
  }
});

test("every page of a large sheet is read, not just the first", async () => {
  const columns = [col(101, "Title"), col(102, "Due", "DATE")];
  // 3,000 rows is the size the team actually has: six pages of 500.
  const calls = stub({ columns, rowsPerPage: 500, pages: 6 });
  const rows = await new SmartsheetConnector().read(TOKEN, "sheet:6141831453742468");

  assert.equal(rows.length, 3000, "all six pages should be read");
  assert.equal(calls.length, 6, "one request per page");
  assert.ok(
    calls.every((u) => u.includes("pageSize=500")),
    "each request asks for a full page",
  );
  // First and last row present, so nothing was dropped at either end.
  assert.equal(rows[0]["101"], "Title-0");
  assert.equal(rows[2999]["101"], "Title-2999");
});

test("rows are keyed by column id, so a rename does not break a view", async () => {
  const columns = [col(101, "Submission Date", "DATE"), col(102, "Forecaster")];
  stub({ columns, rowsPerPage: 2, pages: 1 });
  const before = await new SmartsheetConnector().describe(TOKEN, "sheet:6141831453742468");

  assert.deepEqual(
    before.fields.map((f) => f.key),
    ["101", "102"],
    "the key is the column id",
  );
  assert.equal(before.fields[0].name, "Submission Date");

  // Somebody renames the column and drags it to the end.
  const renamed = [col(102, "Forecaster"), col(101, "Copy due", "DATE")];
  stub({ columns: renamed, rowsPerPage: 2, pages: 1 });
  const after = await new SmartsheetConnector().describe(TOKEN, "sheet:6141831453742468");

  const key101 = after.fields.find((f) => f.key === "101");
  assert.ok(key101, "the column is still found by its id");
  assert.equal(key101.name, "Copy due", "and its label follows the rename");

  // The rows still carry it under the same key, which is what a saved view
  // refers to.
  const rows = await new SmartsheetConnector().read(TOKEN, "sheet:6141831453742468");
  assert.equal(rows[0]["101"], "Copy due-0");
});

test("a report is read through its virtual column ids", async () => {
  const columns = [
    col(500, "Trend", "TEXT_NUMBER", { virtualId: 9001 }),
    col(501, "Owner", "CONTACT_LIST", { virtualId: 9002 }),
  ];
  const calls = stub({
    columns,
    rowsPerPage: 3,
    pages: 1,
    kind: "report",
    cellKey: "virtualColumnId",
  });
  const c = new SmartsheetConnector();
  const described = await c.describe(TOKEN, "report:6141831453742468");

  assert.ok(calls[0].includes("/reports/6141831453742468"), "the report endpoint is used");
  assert.deepEqual(
    described.fields.map((f) => f.key),
    ["9001", "9002"],
    "a report keys on the virtual id its cells carry",
  );
  assert.equal(described.fields[1].type, "person", "a contact column reads as a person");

  const rows = await c.read(TOKEN, "report:6141831453742468");
  assert.equal(rows[0]["9001"], "Trend-0", "cells resolve against the virtual id");
});

test("a column with no cell on a row is present and empty", async () => {
  const columns = [col(101, "Title"), col(102, "Sometimes")];
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    async json() {
      return {
        totalRowCount: 1,
        pageNumber: 1,
        totalPages: 1,
        columns,
        // Only the first column has a cell on this row.
        rows: [{ id: 1, cells: [{ columnId: 101, displayValue: "Just me" }] }],
      };
    },
  });
  const rows = await new SmartsheetConnector().read(TOKEN, "sheet:6141831453742468");
  assert.equal(rows[0]["101"], "Just me");
  assert.equal(rows[0]["102"], "", "an absent cell reads as empty, not undefined");
});

test("a source past the cap is cut and says so", async () => {
  const columns = [col(101, "Title")];
  // 25,000 rows against a 20,000 cap.
  stub({ columns, rowsPerPage: 500, pages: 50 });
  const described = await new SmartsheetConnector().describe(TOKEN, "sheet:6141831453742468");
  assert.equal(described.truncated, true, "the read reports that it stopped short");
  assert.equal(described.rowCount, 25000, "and still reports the source's real size");
});

test("a wrong token and a blocked network read differently", async () => {
  globalThis.fetch = async () => ({ ok: false, status: 401, statusText: "Unauthorized" });
  await assert.rejects(
    () => new SmartsheetConnector().read(TOKEN, "sheet:6141831453742468"),
    /refused the token/,
  );

  globalThis.fetch = async () => {
    throw new Error("getaddrinfo ENOTFOUND api.smartsheet.com");
  };
  await assert.rejects(
    () => new SmartsheetConnector().read(TOKEN, "sheet:6141831453742468"),
    /network or firewall problem/,
  );

  // A sheet-scoped 403 is a sharing problem, and says so.
  globalThis.fetch = async () => ({ ok: false, status: 403, statusText: "Forbidden" });
  await assert.rejects(
    () => new SmartsheetConnector().read(TOKEN, "sheet:6141831453742468"),
    /Share the sheet/,
  );
});
