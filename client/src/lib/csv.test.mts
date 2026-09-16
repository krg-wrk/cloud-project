import assert from "node:assert/strict";
import test from "node:test";
import { csvName, toCsv, type Column } from "./csv.ts";

/**
 * The escaping, which is the only part of an export worth testing.
 *
 * Laying rows out in a file is obvious and would pass any test written for
 * it. What is not obvious is what happens when a cell holds a comma, a quote,
 * a newline — or an equals sign, which is not a formatting problem but a
 * security one, because Excel and Sheets both run what follows it.
 *
 * Run with `npm test -w client`. Node reads the TypeScript directly, so these
 * import the same file the app does rather than a copy.
 */

const col: Column<{ a: string | number | null | undefined }>[] = [
  { header: "A", value: (r) => r.a },
];

const oneRow = (value: string | number | null | undefined) =>
  toCsv([{ a: value }], col).split("\r\n")[1];

test("the header row comes first, even with nothing under it", () => {
  assert.equal(toCsv([], col), "A");
});

test("a comma is quoted, because otherwise it is two columns", () => {
  assert.equal(oneRow("Knitwear, Activewear"), '"Knitwear, Activewear"');
});

test("a quote is doubled inside quotes", () => {
  assert.equal(oneRow('He said "no"'), '"He said ""no"""');
});

test("a newline stays inside one quoted cell", () => {
  assert.equal(oneRow("one\ntwo"), '"one\ntwo"');
});

test("a plain value is left alone rather than quoted for the sake of it", () => {
  assert.equal(oneRow("Womenswear"), "Womenswear");
});

test("a formula is defused rather than executed", () => {
  // Excel and Sheets both run a cell opening with =, +, - or @. A schedule
  // exported from the Hub and opened by somebody else must not be able to
  // call HYPERLINK, WEBSERVICE or anything else.
  for (const bad of ['=HYPERLINK("http://x","click")', "+1+1", "-1+1", "@SUM(A1)"]) {
    const out = oneRow(bad);
    assert.ok(
      out.startsWith("'") || out.startsWith("\"'"),
      `${bad} came out as ${out}, which a spreadsheet would run`,
    );
  }
});

test("a tab or a carriage return opening a cell is defused too", () => {
  // Both are ways of sneaking whitespace in front of an = to get past a
  // naive check on the first character. What matters is the apostrophe, not
  // the quoting: a tab needs no quotes in a CSV and a carriage return does,
  // so the assertion is about the cell's first real character.
  const defused = (out: string) => (out.startsWith('"') ? out.slice(1) : out).startsWith("'");
  assert.ok(defused(oneRow("\t=1+1")), oneRow("\t=1+1"));
  assert.ok(defused(oneRow("\r=1+1")), oneRow("\r=1+1"));
});

test("nothing is empty, not the word undefined", () => {
  assert.equal(toCsv([{ a: null }, { a: undefined }], col), "A\r\n\r\n");
});

test("zero is a number, not nothing", () => {
  assert.equal(oneRow(0), "0");
});

test("rows are separated by CRLF, which is what the format says", () => {
  assert.equal(toCsv([{ a: "one" }, { a: "two" }], col), "A\r\none\r\ntwo");
});

test("the filename is tame, and says when it was taken", () => {
  assert.match(
    csvName("Performance — Amara Okafor"),
    /^performance-amara-okafor-\d{4}-\d{2}-\d{2}\.csv$/,
  );
  assert.match(csvName("!!!"), /^export-\d{4}-\d{2}-\d{2}\.csv$/);
});
