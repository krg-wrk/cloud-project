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
  assert.deepEqual(kept, { colours: {}, icons: {}, gradients: true, washes: {}, opens: "page" });
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
  const bare = { colours: {}, icons: {}, gradients: true, washes: {}, opens: "page" };
  assert.deepEqual(readAppearance(undefined).kept, bare);
  assert.deepEqual(readAppearance({ colours: null, icons: null }).kept, bare);
});

test("a wash is stored only when it differs from the default", () => {
  /*
   * The defaults are meaningful — each group's hue is taken from a colour
   * that group already uses — so storing one is a change, and storing the
   * default is the same as storing nothing. Keeping the record minimal means
   * a later change to a default reaches everybody who never overrode it.
   */
  assert.deepEqual(readAppearance({ washes: { lab: "magenta" } }).kept.washes, {},
    "magenta is the Lab's default");
  assert.deepEqual(readAppearance({ washes: { lab: "green" } }).kept.washes, { lab: "green" });
  assert.deepEqual(readAppearance({ washes: { work: "" } }).kept.washes, {},
    "an empty value is a reset");
});

test("an unknown group or hue is dropped rather than stored", () => {
  const { kept, dropped } = readAppearance({
    washes: { data: "teal", data2: "green", work: "chartreuse", lab: "amber" },
  });
  assert.deepEqual(kept.washes, { lab: "amber" }, "teal is Data's default, so not stored");
  assert.equal(dropped, 2, "the made-up group and the made-up hue");
});

test("the wash is on unless somebody turned it off", () => {
  /*
   * Absent means on, which matters for the records written before the switch
   * existed: an admin who set a colour last month should not find the washes
   * off because their stored appearance predates them. Only an explicit
   * `false` turns it off — a missing key, a null, or anything truthy is on.
   */
  assert.equal(readAppearance({}).kept.gradients, true, "absent is on");
  assert.equal(readAppearance({ gradients: undefined }).kept.gradients, true);
  assert.equal(readAppearance({ gradients: null }).kept.gradients, true);
  assert.equal(readAppearance({ gradients: true }).kept.gradients, true);
  assert.equal(readAppearance({ gradients: false }).kept.gradients, false, "off is off");
});

test("every token names a real variable and a real colour", () => {
  for (const token of TOKENS) {
    assert.match(token.css, /^--[a-z-]+$/, `${token.id} sets a custom property`);
    assert.equal(readColour(token.fallback), token.fallback, `${token.id} ships a six-digit hex`);
    assert.ok(token.label && token.group, `${token.id} is named for the editor`);
  }
  assert.equal(new Set(TOKENS.map((t) => t.id)).size, TOKENS.length, "ids are unique");
});

/**
 * How a calendar entry opens.
 *
 * The thing that must never happen is a client inventing a third behaviour:
 * the value decides what a click does for everybody, and anything but the two
 * words that mean something falls back to the way it has always worked.
 */

test("the two ways of opening an entry are kept, and nothing else is", () => {
  assert.equal(readAppearance({ opens: "panel" }).kept.opens, "panel");
  assert.equal(readAppearance({ opens: "page" }).kept.opens, "page");
});

test("a way of opening nobody offered falls back to the page, which is how it has always worked", () => {
  assert.equal(readAppearance({ opens: "sidebar" }).kept.opens, "page");
  assert.equal(readAppearance({ opens: true }).kept.opens, "page");
  assert.equal(readAppearance({ opens: { nested: "panel" } }).kept.opens, "page");
  assert.equal(readAppearance({}).kept.opens, "page");
});
