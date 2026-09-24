import assert from "node:assert/strict";
import test from "node:test";
import { PALETTE, paletteName } from "./palette.ts";

/**
 * The studio's colour list.
 *
 * Nothing here is clever, and that is the point: a hand-written list of
 * fifty-six colours is exactly the kind of thing where a duplicate hex, a
 * repeated name or a stray capital letter survives review and then shows up
 * as two identical entries in a dropdown. These are the things that must
 * never happen, checked rather than trusted.
 */

test("every colour is a six-digit lowercase hex, so a saved value matches what was picked", () => {
  for (const colour of PALETTE) {
    assert.match(colour.hex, /^#[0-9a-f]{6}$/, `${colour.name} is not a plain hex`);
  }
});

test("no colour appears twice, and no two colours share a name", () => {
  assert.equal(new Set(PALETTE.map((c) => c.hex)).size, PALETTE.length, "a hex is repeated");
  assert.equal(new Set(PALETTE.map((c) => c.name)).size, PALETTE.length, "a name is repeated");
});

test("the colours the Hub already ships are all in the list, so nothing in use is unnamed", () => {
  // The token fallbacks in server/src/appearance.ts, which is what somebody
  // sees before they have changed anything.
  const inUse = [
    "#4c5578", "#8b8b91", "#2f5f9e", "#6b4fc0", "#875d13", "#256b48",
    "#b8341f", "#17706c", "#9c6b16", "#a33a60", "#8e3b74", "#a94c16",
  ];
  for (const hex of inUse) {
    assert.ok(paletteName(hex), `${hex} is on screen now and the palette cannot name it`);
  }
});

test("a colour is found whatever case it was typed in", () => {
  assert.equal(paletteName("#8e3b74"), "Mulberry");
  assert.equal(paletteName("#8E3B74"), "Mulberry");
  assert.equal(paletteName("  #8e3b74 "), "Mulberry");
});

test("a colour nobody named answers with nothing, rather than the nearest one", () => {
  assert.equal(paletteName("#123456"), undefined);
  assert.equal(paletteName(""), undefined);
  assert.equal(paletteName("nonsense"), undefined);
});
