import assert from "node:assert/strict";
import test from "node:test";
import { TOKENS, readAppearance, readColour, readIcon } from "./appearance.js";

/**
 * What an admin is allowed to set.
 *
 * These values become CSS custom properties on the running app, so the tests
 * are about what is refused — and about the rule that one bad value never
 * costs somebody the rest of their changes.
 */

test("hex, and hex only", () => {
  assert.equal(readColour("#4C5578"), "#4c5578");
  assert.equal(readColour("  #abc "), "#aabbcc");
  assert.equal(readColour("red"), null);
  assert.equal(readColour("rgb(1,2,3)"), null);
  assert.equal(readColour("#12345"), null);
  assert.equal(readColour("url(evil)"), null);
  assert.equal(readColour(42), null);
});

test("an icon name is a name", () => {
  assert.equal(readIcon("Trends"), "trends");
  assert.equal(readIcon("public-holiday"), "public-holiday");
  assert.equal(readIcon("../evil"), null);
  assert.equal(readIcon(""), null);
});

test("a token nobody has heard of is dropped, the rest kept", () => {
  const { kept, dropped } = readAppearance({
    colours: { accent: "#123456", "not-a-token": "#123456", mine: "nonsense" },
  });
  assert.deepEqual(kept.colours, { accent: "#123456" });
  assert.equal(dropped, 2);
});

test("setting a token back to its own colour stores nothing", () => {
  const accent = TOKENS.find((t) => t.id === "accent");
  const { kept, dropped } = readAppearance({ colours: { accent: accent.fallback } });
  assert.deepEqual(kept.colours, {});
  assert.equal(dropped, 0);
});

test("an empty value is a reset rather than a mistake", () => {
  const { kept, dropped } = readAppearance({ colours: { accent: "" }, icons: { "nav.item.today": "" } });
  assert.deepEqual(kept, { colours: {}, icons: {} });
  assert.equal(dropped, 0);
});

test("icons are keyed on sidebar slots and nothing else", () => {
  const { kept, dropped } = readAppearance({
    icons: { "nav.item.today": "clock", "content.title": "clock", evil: "clock" },
  });
  assert.deepEqual(kept.icons, { "nav.item.today": "clock" });
  assert.equal(dropped, 2);
});

test("nothing sent is nothing stored", () => {
  assert.deepEqual(readAppearance(undefined).kept, { colours: {}, icons: {} });
  assert.deepEqual(readAppearance({ colours: null, icons: null }).kept, { colours: {}, icons: {} });
});

test("every token names a real variable and a real colour", () => {
  for (const token of TOKENS) {
    assert.match(token.css, /^--[a-z-]+$/, `${token.id} sets a custom property`);
    assert.equal(readColour(token.fallback), token.fallback, `${token.id} ships a six-digit hex`);
    assert.ok(token.label && token.group, `${token.id} is named for the editor`);
  }
  assert.equal(new Set(TOKENS.map((t) => t.id)).size, TOKENS.length, "ids are unique");
});
