/**
 * Profile photographs: what the Hub will accept as one.
 *
 * A photo is the only thing in the Hub that a person uploads and everybody
 * else's browser then renders, which makes it the one place where "whatever
 * they sent" would be somebody else's problem. So it is checked twice: the
 * declared type has to be one of three raster formats, and the bytes have to
 * actually start like that format. A file called a PNG that begins "<svg" is
 * refused here rather than served back with a Content-Type that would let it
 * run script on the Hub's own origin.
 *
 * SVG is not on the list and will not be. It is a document format that can
 * carry script and external references; there is no version of "an avatar"
 * that needs it.
 *
 * The cap is on the decoded bytes rather than the base64, because that is the
 * number that means anything. The client resizes to a small square before it
 * uploads, so a photo straight off a phone arrives well under it; the cap is
 * there for what the client did not send.
 */

/** What the bytes have to start with, per type we accept. */
const SIGNATURES: { mediaType: string; test: (bytes: Buffer) => boolean }[] = [
  {
    mediaType: "image/png",
    test: (b) =>
      b.length > 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    mediaType: "image/jpeg",
    test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mediaType: "image/webp",
    test: (b) =>
      b.length > 12 &&
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP",
  },
];

export const PHOTO_TYPES = SIGNATURES.map((s) => s.mediaType);

/** 96 KB decoded. A 256px square JPEG is a tenth of that. */
export const MAX_PHOTO_BYTES = 96 * 1024;

export interface AcceptedPhoto {
  mediaType: string;
  base64: string;
  bytes: number;
}

export type PhotoCheck = { ok: true; photo: AcceptedPhoto } | { ok: false; problem: string };

/**
 * Read a `data:` URL as a photograph, or say why it is not one.
 *
 * The message is the one the person sees, so it says what to do about it
 * rather than which check failed.
 */
export function readPhoto(value: unknown): PhotoCheck {
  if (typeof value !== "string" || !value) {
    return { ok: false, problem: "No image was sent." };
  }
  const match = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(value.trim());
  if (!match) {
    return { ok: false, problem: "That is not an image file the Hub can read." };
  }
  const declared = match[1].toLowerCase();
  if (!PHOTO_TYPES.includes(declared)) {
    return { ok: false, problem: "A photo has to be a PNG, a JPEG or a WebP." };
  }

  const base64 = match[2].replace(/\s+/g, "");
  // Decoding is the only way to know the real size, and Buffer is lenient
  // about junk — so the round trip has to match, or the string was not base64.
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.toString("base64").replace(/=+$/, "") !== base64.replace(/=+$/, "")) {
    return { ok: false, problem: "That image could not be read." };
  }
  if (bytes.length > MAX_PHOTO_BYTES) {
    return {
      ok: false,
      problem: `That image is ${Math.round(bytes.length / 1024)}KB. The limit is ${MAX_PHOTO_BYTES / 1024}KB.`,
    };
  }

  const actual = SIGNATURES.find((s) => s.test(bytes));
  if (!actual) {
    return { ok: false, problem: "That file is not a PNG, a JPEG or a WebP." };
  }
  if (actual.mediaType !== declared) {
    // Not pedantry: the type is what the photo is later served as, so a file
    // whose bytes disagree with its label is exactly the thing to refuse.
    return { ok: false, problem: "That file does not match the kind of image it says it is." };
  }

  return { ok: true, photo: { mediaType: actual.mediaType, base64, bytes: bytes.length } };
}
