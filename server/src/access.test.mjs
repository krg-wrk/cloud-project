import assert from "node:assert/strict";
import test from "node:test";
import {
  canWriteNote,
  canWriteSchedule,
  hubAccessFor,
  reportsTo,
  resolveViewer,
  seesWholeTeam,
  sessionReaches,
} from "./auth.js";

/**
 * What the directory's Hub Access column is allowed to do.
 *
 * The things that must never happen: somebody marked View Only writing
 * anything, somebody marked No Access getting in at all, and Leadership
 * quietly acquiring the right to edit the commissioning sheet because seeing
 * the whole team and commissioning for it used to be the same question.
 */

const item = {
  id: "c1",
  title: "Big Ideas",
  vertical: "Womenswear",
  forecasterId: "somebody",
  contributorIds: [],
};

const viewer = (role, extra = {}) => ({
  email: "x@wgsn.com",
  name: "X",
  personId: "x",
  role,
  verticals: "all",
  active: true,
  ...extra,
});

test("the column's own words are read, including the CM this directory actually writes", () => {
  assert.deepEqual(hubAccessFor("Commissioning Manager"), { role: "commissioning-manager" });
  assert.deepEqual(hubAccessFor("CM"), { role: "commissioning-manager" });
  assert.deepEqual(hubAccessFor("commissioning manager"), { role: "commissioning-manager" });
  assert.deepEqual(hubAccessFor("Leadership"), { role: "leadership" });
  assert.deepEqual(hubAccessFor("View Only"), { role: "view-only" });
  assert.deepEqual(hubAccessFor("Admin"), { role: "admin" });
  assert.deepEqual(hubAccessFor("Forecaster"), { role: "forecaster" });
});

test("No Access is the absence of a level, not a quiet one", () => {
  assert.deepEqual(hubAccessFor("No Access"), { active: false });
});

test("a blank cell decides nothing, so the two hundred unfilled rows keep working", () => {
  assert.deepEqual(hubAccessFor(""), {});
  assert.deepEqual(hubAccessFor(undefined), {});
  assert.deepEqual(hubAccessFor("Something nobody put in the dropdown"), {});
});

test("leadership sees the whole team and cannot touch the commissioning sheet", () => {
  const v = viewer("leadership");
  assert.equal(seesWholeTeam(v), true);
  assert.equal(canWriteSchedule(v, item), false);
});

test("a commissioning manager sees the team and may write in scope", () => {
  const v = viewer("commissioning-manager");
  assert.equal(seesWholeTeam(v), true);
  assert.equal(canWriteSchedule(v, item), true);
});

test("view only writes nothing, not even on a forecast that names them", () => {
  const v = viewer("view-only", { personId: "somebody" });
  const theirs = { ...item, forecasterId: "somebody" };
  assert.equal(canWriteNote(v, theirs), false, "owning it does not override looking only");
  assert.equal(canWriteSchedule(v, theirs), false);
});

test("a forecaster still sees themselves first", () => {
  assert.equal(seesWholeTeam(viewer("forecaster")), false);
});

test("the directory's level is used when no access sheet names somebody", () => {
  const people = [
    { id: "p", name: "P", email: "p@wgsn.com", role: "forecaster", region: "EMEA", hubAccess: "leadership", active: true },
  ];
  const v = resolveViewer("p@wgsn.com", [], people, []);
  assert.equal(v.role, "leadership");
});

test("an access-sheet row beats the column, because it is the hand-written exception", () => {
  const people = [
    { id: "p", name: "P", email: "p@wgsn.com", role: "forecaster", region: "EMEA", hubAccess: "view-only", active: true },
  ];
  const sheet = [{ email: "p@wgsn.com", role: "commissioning-manager", active: true }];
  assert.equal(resolveViewer("p@wgsn.com", sheet, people, []).role, "commissioning-manager");
});

test("somebody the directory marks inactive does not get in", () => {
  const people = [
    { id: "p", name: "P", email: "p@wgsn.com", role: "forecaster", region: "EMEA", active: false },
  ];
  assert.equal(resolveViewer("p@wgsn.com", [], people, []).active, false);
});

/**
 * Which workshops are somebody's.
 *
 * Relevance, not permission. The failure to avoid is the one on screen now:
 * a forecaster in London reading a Seoul research week and four Beauty
 * scoring days. The other failure is worse and quieter — an over-strict rule
 * emptying the page for all two hundred people while the sheet is still being
 * tagged.
 */

const person = { id: "me", country: "UK" };

test("a session naming somebody is theirs", () => {
  assert.equal(sessionReaches({ attendeeIds: ["me"], department: "Beauty", location: "Korea" }, person), true);
});

test("a session the whole team is for reaches everybody", () => {
  assert.equal(sessionReaches({ department: "All", location: "Korea" }, person), true);
  assert.equal(sessionReaches({ department: "all", location: "Korea" }, person), true);
});

test("a session where somebody is reaches them", () => {
  assert.equal(sessionReaches({ department: "Beauty", location: "UK" }, person), true);
  assert.equal(sessionReaches({ department: "Beauty", location: " uk " }, person), true);
});

test("a session for another department in another country is not theirs", () => {
  assert.equal(sessionReaches({ attendeeIds: ["someone"], department: "Beauty", location: "Korea" }, person), false);
});

test("the host's own session is theirs, whoever else is tagged", () => {
  assert.equal(sessionReaches({ hostId: "me", department: "Beauty", location: "Korea" }, person), true);
});

test("a session with nothing filled in reaches everybody, because most of the sheet is untagged", () => {
  assert.equal(sessionReaches({}, person), true);
  assert.equal(sessionReaches({ attendeeIds: [] }, person), true);
});

test("somebody with no person record sees only the untagged ones", () => {
  assert.equal(sessionReaches({}, null), true);
  assert.equal(sessionReaches({ department: "Beauty" }, null), false);
});

test("a country nobody has filled in for the person does not match every session", () => {
  assert.equal(sessionReaches({ location: "UK" }, { id: "me" }), false);
});

/**
 * Who reports to whom, read from the directory's Manager Email column.
 *
 * The thing that must never happen is the blank cell reading as a match:
 * most of the column is empty, so a rule that treated "no manager named" as
 * "reports to whoever is asking" would hand the whole directory to the first
 * person to look.
 */

const team = [
  { id: "a", name: "A", email: "a@wgsn.com", role: "forecaster", region: "EMEA", managerEmail: "boss@wgsn.com" },
  { id: "b", name: "B", email: "b@wgsn.com", role: "forecaster", region: "APAC", managerEmail: "BOSS@wgsn.com " },
  { id: "c", name: "C", email: "c@wgsn.com", role: "forecaster", region: "EMEA", managerEmail: "other@wgsn.com" },
  { id: "d", name: "D", email: "d@wgsn.com", role: "forecaster", region: "EMEA" },
  { id: "boss", name: "Boss", email: "boss@wgsn.com", role: "forecaster", region: "EMEA" },
];

test("the people naming an address are theirs, whatever case the column was typed in", () => {
  assert.deepEqual(reportsTo("boss@wgsn.com", team), ["a", "b"]);
});

test("a blank column names nobody, so an unfilled directory hands over nothing", () => {
  assert.deepEqual(reportsTo("", team), []);
  assert.deepEqual(reportsTo(null, team), []);
  assert.deepEqual(reportsTo("   ", team), []);
});

test("somebody the directory has never heard of manages nobody", () => {
  assert.deepEqual(reportsTo("stranger@wgsn.com", team), []);
});

test("nobody reports to themselves, however the column is filled in", () => {
  const odd = [{ id: "x", name: "X", email: "x@wgsn.com", role: "forecaster", region: "EMEA", managerEmail: "x@wgsn.com" }];
  assert.deepEqual(reportsTo("x@wgsn.com", odd), []);
});

test("a line manager carries their reports, and a commissioning manager does not need to", () => {
  const managed = resolveViewer("boss@wgsn.com", [], team, []);
  assert.deepEqual(managed.reports, ["a", "b"]);

  const cm = resolveViewer("c@wgsn.com", [{ email: "c@wgsn.com", role: "commissioning-manager", active: true }], team, []);
  assert.equal(seesWholeTeam(cm), true, "and so the reports are the wider list already");
});
