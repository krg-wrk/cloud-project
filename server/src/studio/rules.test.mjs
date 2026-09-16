import assert from "node:assert/strict";
import test from "node:test";
import { project, ruleWords, toneFor } from "./query.js";

/**
 * Conditional formatting.
 *
 * Two things are worth pinning down: that the first matching rule wins, which
 * is what lets "late" beat "due soon", and that a rule can key off a column
 * the layout does not draw — the reason this runs on the server at all.
 */

const spec = (rules) => ({
  layout: "table",
  fields: { columns: ["title"] },
  filters: [],
  rules,
  pageSize: 0,
});

const row = { _row: "1", title: "Quiet Kitchens", status: "At risk", owner: "amara@wgsn.com" };

test("a matching rule gives its tone", () => {
  const hit = toneFor(row, spec([{ field: "status", op: "is", value: "At risk", tone: "at-risk" }]), []);
  assert.equal(hit.tone, "at-risk");
});

test("nothing matching is no tone at all, not a default one", () => {
  assert.equal(toneFor(row, spec([{ field: "status", op: "is", value: "Done", tone: "done" }]), []), undefined);
  assert.equal(toneFor(row, spec([]), []), undefined);
  assert.equal(toneFor(row, spec(undefined), []), undefined);
});

test("the first rule in the list wins", () => {
  // Both match. The order written is the order tried, which is what lets a
  // narrow rule sit above a broad one without either mentioning the other.
  const both = [
    { field: "status", op: "not-empty", tone: "at-risk" },
    { field: "status", op: "not-empty", tone: "done" },
  ];
  assert.equal(toneFor(row, spec(both), []).tone, "at-risk");
});

test("a rule reads a column the layout never draws", () => {
  // `columns` is only ["title"], and the rule is on `status`. This is the
  // whole reason the tone is worked out on the server.
  const out = project([row], [{ key: "title", name: "Title", type: "text" }], spec([
    { field: "status", op: "is", value: "At risk", tone: "at-risk", label: "Late" },
  ]), [], [{ key: "status", name: "Status", type: "text" }]);
  assert.equal(out[0]._tone, "at-risk");
  assert.equal(out[0]._why, "Late");
  // And the hidden column is still not sent.
  assert.equal(out[0].status, undefined);
});

test("mine works in a rule, as it does in a filter", () => {
  const rule = [{ field: "owner", op: "mine", tone: "mine" }];
  assert.equal(toneFor(row, spec(rule), ["amara@wgsn.com"]).tone, "mine");
  assert.equal(toneFor(row, spec(rule), ["someone@wgsn.com"]), undefined);
});

test("a rule with no label reads its own condition back", () => {
  const fields = [{ key: "status", name: "Status", type: "text" }];
  assert.equal(
    ruleWords({ field: "status", op: "is", value: "At risk", tone: "at-risk" }, fields),
    "Status is At risk",
  );
  assert.equal(ruleWords({ field: "status", op: "empty", tone: "quiet" }, fields), "Status is empty");
  // A label, where given, is used as written.
  assert.equal(
    ruleWords({ field: "status", op: "empty", tone: "quiet", label: "Not started" }, fields),
    "Not started",
  );
});

test("a row with no tone carries no tone keys", () => {
  const out = project([row], [{ key: "title", name: "Title", type: "text" }], spec([]), []);
  assert.ok(!("_tone" in out[0]));
  assert.ok(!("_why" in out[0]));
});
