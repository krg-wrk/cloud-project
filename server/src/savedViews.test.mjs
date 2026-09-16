import assert from "node:assert/strict";
import test from "node:test";
import { cleanPath } from "./api.js";

/**
 * A saved view's address.
 *
 * This is the one thing a person types that becomes a link on their own page
 * later, so the test is about what must never come back out of it.
 */

test("an ordinary filtered page is kept, query and all", () => {
  assert.equal(
    cleanPath("/deadlines?vertical=Womenswear&status=at-risk"),
    "/deadlines?vertical=Womenswear&status=at-risk",
  );
  assert.equal(cleanPath("/"), "/");
});

test("a scheme is refused", () => {
  for (const bad of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>",
    "https://evil.example/steal",
    "http://evil.example",
    "vbscript:msgbox",
  ]) {
    assert.equal(cleanPath(bad), null, bad);
  }
});

test("a protocol-relative address is refused, slashes or backslashes", () => {
  // Both of these leave the Hub, and both start with something a naive
  // "does it begin with a slash" check would wave through.
  assert.equal(cleanPath("//evil.example/steal"), null);
  assert.equal(cleanPath("/\\evil.example/steal"), null);
  assert.equal(cleanPath("\\\\evil.example"), null);
});

test("control characters are stripped before the check, not after", () => {
  // A newline is a classic way to smuggle a scheme past a prefix test.
  assert.equal(cleanPath("java\nscript:alert(1)"), null);
  assert.equal(cleanPath("\t/deadlines"), "/deadlines");
});

test("a fragment is dropped, because nothing here uses one", () => {
  assert.equal(cleanPath("/deadlines?q=a#anything"), "/deadlines?q=a");
  assert.equal(cleanPath("/#x"), "/");
});

test("a relative path with no leading slash is refused", () => {
  assert.equal(cleanPath("deadlines"), null);
  assert.equal(cleanPath("../etc"), null);
});

test("nothing, or something absurd, is refused", () => {
  assert.equal(cleanPath(""), null);
  assert.equal(cleanPath("   "), null);
  assert.equal(cleanPath(null), null);
  assert.equal(cleanPath(42), null);
  assert.equal(cleanPath("/" + "a".repeat(2100)), null);
});
