import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RESOURCES, readLinks, readUrl } from "./resources.js";

/**
 * What is allowed to become a link.
 *
 * This list is typed by an admin and rendered as the `href` of something
 * every forecaster is invited to click, so the tests are about what is
 * refused rather than about what is kept.
 */

test("an ordinary address survives", () => {
  assert.equal(
    readUrl("https://stepic-ssft.wgsndev.com/"),
    "https://stepic-ssft.wgsndev.com/",
  );
  assert.equal(readUrl("  http://example.com/a?b=c  "), "http://example.com/a?b=c");
});

test("javascript: and data: are not addresses", () => {
  assert.equal(readUrl("javascript:alert(1)"), null);
  assert.equal(readUrl("data:text/html,<script>alert(1)</script>"), null);
  assert.equal(readUrl("file:///etc/passwd"), null);
});

test("something that is not a URL at all is refused", () => {
  assert.equal(readUrl("wgsn.com"), null);
  assert.equal(readUrl(""), null);
  assert.equal(readUrl(42), null);
  assert.equal(readUrl(undefined), null);
});

test("a row missing its label or its address is dropped, the rest kept", () => {
  const links = readLinks([
    { label: "Moody2", url: "https://example.com/moody" },
    { label: "", url: "https://example.com/nameless" },
    { label: "Nowhere", url: "not a url" },
    { label: "Score", url: "https://score.wgsndev.com/" },
  ]);
  assert.deepEqual(
    links.map((l) => l.label),
    ["Moody2", "Score"],
  );
});

test("two links with the same name get different ids", () => {
  const links = readLinks([
    { label: "Training", url: "https://example.com/one" },
    { label: "Training", url: "https://example.com/two" },
  ]);
  assert.deepEqual(
    links.map((l) => l.id),
    ["training", "training-2"],
  );
});

test("labels and notes are cut rather than refused", () => {
  const [link] = readLinks([
    { label: "x".repeat(200), url: "https://example.com/", note: "y".repeat(400) },
  ]);
  assert.equal(link.label.length, 80);
  assert.equal(link.note.length, 200);
});

test("the order it was sent in is the order it is stored in", () => {
  const links = readLinks([
    { label: "Third", url: "https://example.com/3" },
    { label: "First", url: "https://example.com/1" },
  ]);
  assert.deepEqual(
    links.map((l) => l.label),
    ["Third", "First"],
  );
});

test("what ships is a real list", () => {
  assert.ok(DEFAULT_RESOURCES.length > 0);
  for (const link of DEFAULT_RESOURCES) {
    assert.equal(readUrl(link.url), link.url, `${link.label} has a usable address`);
    assert.ok(link.label);
  }
});

test("nothing is not a list", () => {
  assert.deepEqual(readLinks(undefined), []);
  assert.deepEqual(readLinks({ label: "x" }), []);
});
