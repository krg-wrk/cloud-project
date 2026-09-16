import assert from "node:assert/strict";
import test from "node:test";
import { factsFor, fillMessage, isLate, ruleMatches, ruleNotices } from "./rules.js";
import { readRule } from "./api.js";

/**
 * Rules an admin writes.
 *
 * The three things worth pinning down: that every condition has to hold, that
 * a rule with no conditions can never fire, and that the same standing
 * problem is said again tomorrow rather than once ever.
 */

const TODAY = "2026-09-16";

const piece = (over = {}) => ({
  id: "c1",
  title: "Quiet Kitchens",
  type: "Retail Analysis",
  vertical: "Interiors",
  season: "S/S 28",
  forecasterId: "pr",
  managerId: "gk",
  submissionDate: "2026-09-20",
  publicationDate: "2026-10-01",
  status: "in-progress",
  ...over,
});

const people = [
  { id: "pr", name: "Priya Raman", email: "priya@wgsn.com", role: "forecaster", region: "EMEA" },
  { id: "gk", name: "Graham Krag", email: "graham@wgsn.com", role: "commissioning-manager", region: "UK" },
  { id: "er", name: "Elena Roux", email: "elena@wgsn.com", role: "forecaster", region: "EMEA" },
];

const rule = (over = {}) => ({
  id: "r1",
  label: "Chase it",
  enabled: true,
  when: [{ field: "status", op: "is", value: "in-progress" }],
  tell: "owner",
  message: "{title} is still in progress",
  createdAt: TODAY,
  updatedAt: TODAY,
  updatedBy: "",
  ...over,
});

test("the derived facts are the ones a date column cannot answer", () => {
  const f = factsFor(piece(), TODAY);
  assert.equal(f.daysToSubmission, "4");
  assert.equal(f.daysToPublication, "15");
  assert.equal(f.late, "no");
  // Past the date and not in: late. Past the date and submitted: not.
  assert.ok(isLate(piece({ submissionDate: "2026-09-10" }), TODAY));
  assert.ok(!isLate(piece({ submissionDate: "2026-09-10", status: "submitted" }), TODAY));
  assert.ok(!isLate(piece({ submissionDate: "2026-09-10", status: "published" }), TODAY));
});

test("every condition has to hold, not any", () => {
  const both = rule({
    when: [
      { field: "status", op: "is", value: "in-progress" },
      { field: "vertical", op: "is", value: "Interiors" },
    ],
  });
  assert.ok(ruleMatches(piece(), both, TODAY));
  assert.ok(!ruleMatches(piece({ vertical: "Beauty" }), both, TODAY));
});

test("a rule with no conditions never fires, whatever its state", () => {
  assert.ok(!ruleMatches(piece(), rule({ when: [] }), TODAY));
  assert.equal(ruleNotices([piece()], people, [rule({ when: [] })], TODAY).length, 0);
});

test("a rule that is off says nothing", () => {
  assert.equal(ruleNotices([piece()], people, [rule({ enabled: false })], TODAY).length, 0);
});

test("the numeric operators work on the derived day counts", () => {
  const soon = rule({ when: [{ field: "daysToSubmission", op: "lt", value: "7" }] });
  assert.ok(ruleMatches(piece(), soon, TODAY));
  assert.ok(!ruleMatches(piece({ submissionDate: "2026-12-01" }), soon, TODAY));
});

test("comparing a number against something that is not one is false, not true", () => {
  const nonsense = rule({ when: [{ field: "daysToSubmission", op: "gt", value: "soon" }] });
  assert.ok(!ruleMatches(piece(), nonsense, TODAY));
});

test("who it tells is who it says it tells", () => {
  const owner = ruleNotices([piece()], people, [rule()], TODAY);
  assert.equal(owner[0].personId, "pr");
  const manager = ruleNotices([piece()], people, [rule({ tell: "manager" })], TODAY);
  assert.equal(manager[0].personId, "gk");
  const named = ruleNotices(
    [piece()],
    people,
    [rule({ tell: "named", namedEmail: "elena@wgsn.com" })],
    TODAY,
  );
  assert.equal(named[0].personId, "er");
});

test("a named person who has left is nobody to tell, not a crash", () => {
  const gone = rule({ tell: "named", namedEmail: "whoever@wgsn.com" });
  assert.deepEqual(ruleNotices([piece()], people, [gone], TODAY), []);
});

test("the key carries the day, so a standing problem is said again tomorrow", () => {
  // A deadline notice is said once. A rule is a condition that is still true,
  // and going quiet on a problem that has not gone away is the wrong default.
  const a = ruleNotices([piece()], people, [rule()], TODAY)[0].key;
  const b = ruleNotices([piece()], people, [rule()], "2026-09-17")[0].key;
  assert.notEqual(a, b);
  assert.ok(a.includes(TODAY));
});

test("the message carries the piece's own details", () => {
  assert.equal(
    fillMessage("{title} is {status}, due in {days}", piece(), TODAY),
    "Quiet Kitchens is in-progress, due in 4 days",
  );
});

test("the day count brings its own unit, so nothing ever says 1 days", () => {
  const tomorrow = piece({ submissionDate: "2026-09-17" });
  assert.equal(fillMessage("{days} to go", tomorrow, TODAY), "1 day to go");
  assert.equal(fillMessage("{days} to go", piece(), TODAY), "4 days to go");
  // Past the deadline reads as a distance too, not a negative number.
  assert.equal(
    fillMessage("{days} late", piece({ submissionDate: "2026-09-15" }), TODAY),
    "1 day late",
  );
});

/* ---- What the API will accept ------------------------------------------ */

test("a rule needs a name, a message and a condition", () => {
  assert.match(readRule("r", {}), /name/i);
  assert.match(readRule("r", { label: "x" }), /tell them/i);
  const noConditions = readRule("r", { label: "x", message: "y", when: [] });
  assert.match(noConditions, /at least one condition/i);
  // Because a rule with none would match every piece on the sheet.
  assert.match(noConditions, /every piece/i);
});

test("a condition on a column that does not exist is dropped", () => {
  const out = readRule("r", {
    label: "x",
    message: "y",
    when: [
      { field: "haircut", op: "is", value: "short" },
      { field: "status", op: "is", value: "at-risk" },
    ],
  });
  assert.equal(out.when.length, 1);
  assert.equal(out.when[0].field, "status");
});

test("a comparison with nothing to compare against is refused, by name", () => {
  const out = readRule("r", {
    label: "x",
    message: "y",
    when: [{ field: "status", op: "is", value: "  " }],
  });
  assert.match(out, /Status is/);
});

test("is blank needs no value", () => {
  const out = readRule("r", {
    label: "x",
    message: "y",
    when: [{ field: "season", op: "empty" }],
  });
  assert.equal(typeof out, "object");
});

test("telling one named person needs a real address", () => {
  const base = { label: "x", message: "y", when: [{ field: "status", op: "is", value: "a" }] };
  assert.match(readRule("r", { ...base, tell: "named" }), /email address/i);
  assert.match(readRule("r", { ...base, tell: "named", namedEmail: "nope" }), /email address/i);
  const ok = readRule("r", { ...base, tell: "named", namedEmail: "Elena@WGSN.com" });
  assert.equal(ok.namedEmail, "elena@wgsn.com");
});

test("an audience nobody recognises falls back to the owner", () => {
  const out = readRule("r", {
    label: "x",
    message: "y",
    when: [{ field: "status", op: "is", value: "a" }],
    tell: "everybody",
  });
  assert.equal(out.tell, "owner");
});
