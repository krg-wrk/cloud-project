import assert from "node:assert/strict";
import test from "node:test";
import { adminList, resolveViewer } from "./auth.js";

/**
 * The deployment's own admins.
 *
 * This is a way back into a locked room, so what must never happen is it
 * failing quietly: a name that does not take effect, or one the access sheet
 * can overrule. The other thing that must never happen is it being generous —
 * naming one address must not admit anybody else.
 */

const people = [
  { id: "graham-krag", name: "Graham Krag", email: "graham.krag@wgsn.com", role: "forecaster", region: "EMEA" },
  { id: "someone", name: "Someone Else", email: "someone@wgsn.com", role: "forecaster", region: "EMEA" },
];

test("the list is read with the spacing and capitals people actually type", () => {
  assert.deepEqual(adminList("A@wgsn.com, b@WGSN.com "), ["a@wgsn.com", "b@wgsn.com"]);
  assert.deepEqual(adminList("one@wgsn.com,,"), ["one@wgsn.com"]);
  assert.deepEqual(adminList(""), []);
  assert.deepEqual(adminList(undefined), []);
});

test("a named address is an admin over every vertical, with no access sheet at all", () => {
  const v = resolveViewer("graham.krag@wgsn.com", [], people, ["graham.krag@wgsn.com"]);
  assert.equal(v.role, "admin");
  assert.equal(v.verticals, "all");
  assert.equal(v.active, true);
  assert.equal(v.personId, "graham-krag", "still matched to their person record");
});

test("the access sheet cannot demote a named admin, because that is the lock-out this prevents", () => {
  const sheet = [{ email: "graham.krag@wgsn.com", role: "forecaster", active: false }];
  const v = resolveViewer("graham.krag@wgsn.com", sheet, people, ["graham.krag@wgsn.com"]);
  assert.equal(v.role, "admin");
  assert.equal(v.active, true);
});

test("naming one person admits one person", () => {
  const v = resolveViewer("someone@wgsn.com", [], people, ["graham.krag@wgsn.com"]);
  // Role is the whole of it: an empty verticals field has always read as
  // "all", and scope is only ever consulted for a manager.
  assert.equal(v.role, "forecaster");
});

test("an address nobody has heard of is still nobody, even beside a named admin", () => {
  const v = resolveViewer("stranger@example.com", [], people, ["graham.krag@wgsn.com"]);
  assert.equal(v.active, false);
});

test("a named admin who is on no sheet at all still gets in", () => {
  const v = resolveViewer("graham.krag@wgsn.com", [], [], ["graham.krag@wgsn.com"]);
  assert.equal(v.role, "admin");
  assert.equal(v.active, true);
  assert.equal(v.personId, null, "no person record, so nothing is invented");
});

test("with nobody named, the sheets decide exactly as they did before", () => {
  const v = resolveViewer("graham.krag@wgsn.com", [], people, []);
  assert.equal(v.role, "forecaster");
  assert.equal(v.active, true);
});
