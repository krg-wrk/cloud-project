import assert from "node:assert/strict";
import test from "node:test";
import { sheetIds } from "./index.js";

/**
 * A calendar assembled from several sheets.
 *
 * The things that must not happen: a holiday shown twice because an id was
 * pasted twice, a sheet silently dropped because the list was typed with a
 * trailing comma, and an id of "" reported as a 404 that names no sheet
 * anybody can find.
 */

test("one id is still one id, so nothing changes for a team with a single sheet", () => {
  assert.deepEqual(sheetIds("1234567890123456"), ["1234567890123456"]);
});

test("holidays, leave and shows are three sheets read as one calendar", () => {
  assert.deepEqual(sheetIds("111111111111,222222222222,333333333333"), [
    "111111111111",
    "222222222222",
    "333333333333",
  ]);
});

test("spaces round an id are trimmed, because a list typed by hand has them", () => {
  assert.deepEqual(sheetIds(" 111111111111 , 222222222222 "), ["111111111111", "222222222222"]);
});

test("a trailing comma does not become a sheet id of nothing", () => {
  assert.deepEqual(sheetIds("111111111111,"), ["111111111111"]);
  assert.deepEqual(sheetIds("111111111111,,222222222222"), ["111111111111", "222222222222"]);
});

test("the same sheet twice is read once, so no holiday lands on the calendar twice", () => {
  assert.deepEqual(sheetIds("111111111111,111111111111"), ["111111111111"]);
});

test("unset is no sheets rather than one empty one", () => {
  assert.deepEqual(sheetIds(undefined), []);
  assert.deepEqual(sheetIds(""), []);
  assert.deepEqual(sheetIds("  "), []);
  assert.deepEqual(sheetIds(","), []);
});
