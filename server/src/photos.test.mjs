import assert from "node:assert/strict";
import test from "node:test";
import { MAX_PHOTO_BYTES, readPhoto } from "./photos.js";

/**
 * What the Hub will accept as somebody's face.
 *
 * An avatar is uploaded by one person and rendered in everybody else's
 * browser, so these tests are almost entirely about what is refused.
 */

const asData = (type, bytes) => `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1];
const WEBP = [...Buffer.from("RIFF"), 0x20, 0, 0, 0, ...Buffer.from("WEBPVP8 ")];

test("a PNG, a JPEG and a WebP are all photographs", () => {
  for (const [type, bytes] of [
    ["image/png", PNG],
    ["image/jpeg", JPEG],
    ["image/webp", WEBP],
  ]) {
    const read = readPhoto(asData(type, bytes));
    assert.equal(read.ok, true, `${type} was refused: ${read.problem}`);
    assert.equal(read.photo.mediaType, type);
    assert.equal(read.photo.bytes, bytes.length);
  }
});

test("the type is read from the bytes, not from the label", () => {
  // The dangerous case: something that is not an image, wearing an image's
  // name. If this were kept it would later be served as image/png.
  const svg = `data:image/png;base64,${Buffer.from('<svg onload="alert(1)"/>').toString("base64")}`;
  const read = readPhoto(svg);
  assert.equal(read.ok, false);

  // And the merely wrong case: a real JPEG called a PNG.
  const mislabelled = readPhoto(asData("image/png", JPEG));
  assert.equal(mislabelled.ok, false);
  assert.match(mislabelled.problem, /does not match/);
});

test("SVG is not an avatar format, however it is declared", () => {
  const read = readPhoto(asData("image/svg+xml", Buffer.from("<svg/>")));
  assert.equal(read.ok, false);
  assert.match(read.problem, /PNG, a JPEG or a WebP/);
});

test("a photo over the cap is refused, and the message says the size", () => {
  const big = [...PNG, ...new Array(MAX_PHOTO_BYTES).fill(0)];
  const read = readPhoto(asData("image/png", big));
  assert.equal(read.ok, false);
  assert.match(read.problem, /96KB/);
});

test("a photo right on the cap is kept", () => {
  const exact = [...PNG, ...new Array(MAX_PHOTO_BYTES - PNG.length).fill(0)];
  const read = readPhoto(asData("image/png", exact));
  assert.equal(read.ok, true);
  assert.equal(read.photo.bytes, MAX_PHOTO_BYTES);
});

test("anything that is not a data URL is not a photo", () => {
  for (const value of [
    "",
    undefined,
    42,
    "https://example.com/me.png",
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "data:image/png,not-base64",
  ]) {
    assert.equal(readPhoto(value).ok, false, `${String(value)} was accepted`);
  }
});

test("base64 with line breaks in it still reads, and comes back clean", () => {
  const wrapped = asData("image/png", PNG).replace(";base64,", ";base64,\n  ");
  const read = readPhoto(wrapped);
  assert.equal(read.ok, true);
  assert.equal(read.photo.base64, Buffer.from(PNG).toString("base64"));
});
