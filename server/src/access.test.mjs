import assert from "node:assert/strict";
import test from "node:test";
import {
  canWriteNote,
  canWriteSchedule,
  hubAccessFor,
  resolveViewer,
  seesWholeTeam,
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
