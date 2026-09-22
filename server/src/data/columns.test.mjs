import assert from "node:assert/strict";
import test from "node:test";
import { renamedColumns, titleOf, titles } from "./smartsheetSource.js";

/**
 * A mapping that survives somebody renaming a column.
 *
 * The thing that must never happen is the quiet version: a heading changes
 * in Smartsheet, the title stops matching, every row reads empty for that
 * field, and the page looks like the sheet is simply not filled in. The
 * column id is the second way of finding the same column — and the order
 * matters, because an id belongs to one sheet and a title belongs to all of
 * them.
 */

const cols = (...pairs) => pairs.map(([id, title]) => ({ id, title }));

test("a plain string is a title, because that is what every other source has", () => {
  assert.equal(titleOf("Sub Date"), "Sub Date");
  assert.equal(titleOf({ title: "Sub Date", id: "123" }), "Sub Date");
  assert.deepEqual(titles({ a: "One", b: { title: "Two", id: "9" } }), { a: "One", b: "Two" });
});

test("a column still called what it was mapped as needs no rescuing", () => {
  const group = { submissionDate: { title: "Sub Date", id: "111" } };
  assert.deepEqual(renamedColumns(group, cols([111, "Sub Date"])), []);
});

test("a renamed column is found by its id, so the field does not quietly empty", () => {
  const group = { submissionDate: { title: "Sub Date", id: "111" } };
  assert.deepEqual(renamedColumns(group, cols([111, "Submission Deadline"])), [
    { field: "submissionDate", mapped: "Sub Date", actual: "Submission Deadline" },
  ]);
});

test("the title wins while it is there, so a second sheet resolves by name rather than by a foreign id", () => {
  // 2027: same heading, a different column id, and 111 belongs to something else.
  const group = { submissionDate: { title: "Sub Date", id: "111" } };
  const sheet2027 = cols([222, "Sub Date"], [111, "Peer Review Date"]);
  assert.deepEqual(
    renamedColumns(group, sheet2027),
    [],
    "nothing is rewritten — Sub Date is present and answers for itself",
  );
});

test("a column that is gone altogether is left alone, so the doctor reports it rather than a wrong guess", () => {
  const group = { submissionDate: { title: "Sub Date", id: "111" } };
  assert.deepEqual(renamedColumns(group, cols([999, "Something Else"])), []);
});

test("a mapping with no id cannot be rescued, which is the Google Sheets case", () => {
  assert.deepEqual(renamedColumns({ submissionDate: "Sub Date" }, cols([111, "Renamed"])), []);
});
