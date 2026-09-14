import { useRef, useState } from "react";
import { send } from "../../lib/api";
import { Icon } from "../../lib/icons";
import { Avatar, ErrorNote } from "../../components/bits";
import type { Person } from "../../types";

/**
 * Your photograph.
 *
 * Resized here rather than sent whole. A picture off a phone is four
 * megabytes and eight megapixels; what the Hub draws is a circle 25 pixels
 * across, and 44 on a profile. So the browser scales it to a 256px square
 * before anything leaves the machine — which makes the upload instant on a
 * bad connection, keeps the table small, and means the cap the server
 * enforces is never the thing a person meets.
 *
 * The crop is a centre square, not a chooser. A face-positioning tool is a
 * week of work for the two people in two hundred whose photograph is not
 * roughly centred, and they can crop it before they upload it.
 */

/** What the avatar is drawn at, times two, for a sharp circle on any screen. */
const SIDE = 256;

/** A hard stop before decoding — a plausible photograph, not a video file. */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export interface PhotoProps {
  person: Person;
  /** Called after a change, so the page that owns the account reloads it. */
  onChanged: () => void;
}

/**
 * Draw the image into a square canvas, cropped to the middle, as a JPEG.
 *
 * JPEG rather than PNG: a photograph is what this is for, and the same face
 * at the same size is a tenth of the bytes. Quality 0.82 is where the
 * difference stops being visible at 44 pixels.
 */
async function squareJpeg(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That file could not be read as an image."));
      img.src = url;
    });

    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (!side) throw new Error("That file could not be read as an image.");

    const canvas = document.createElement("canvas");
    canvas.width = SIDE;
    canvas.height = SIDE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot resize the image.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      SIDE,
      SIDE,
    );
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function Photo({ person, onChanged }: PhotoProps) {
  const file = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function choose(chosen: File | undefined) {
    if (!chosen) return;
    setError(null);
    setNote(null);
    if (chosen.size > MAX_UPLOAD_BYTES) {
      setError("That file is very large. Pick a photograph rather than a raw image.");
      return;
    }
    setBusy(true);
    try {
      const photo = await squareJpeg(chosen);
      const saved = await send<{ bytes: number }>("/my/photo", "PUT", { photo });
      setNote(`Saved — ${Math.max(1, Math.round(saved.bytes / 1024))}KB.`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The photo could not be saved.");
    } finally {
      setBusy(false);
      // So choosing the same file again still fires a change.
      if (file.current) file.current.value = "";
    }
  }

  async function remove() {
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      await send("/my/photo", "DELETE");
      setNote("Removed. Your initials are back.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The photo could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="photo-row">
      <Avatar id={person.id} name={person.name} size="xl" />
      <div className="photo-what">
        <b>{person.name}</b>
        <span className="muted small">
          {person.photoAt
            ? "Your photograph, shown wherever your name appears in the Hub."
            : "No photograph yet, so your initials stand in wherever your name appears."}
        </span>
        <div className="photo-actions">
          <label className="btn">
            <Icon name="camera" size={15} />
            {person.photoAt ? "Change photo" : "Upload a photo"}
            <input
              ref={file}
              type="file"
              className="sr-only"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(e) => void choose(e.target.files?.[0])}
            />
          </label>
          {person.photoAt && (
            <button className="btn" onClick={() => void remove()} disabled={busy}>
              Remove
            </button>
          )}
          <span className="muted small">{busy ? "Working…" : note}</span>
        </div>
        <span className="muted small">
          Cropped to a square and scaled down in your browser, so nothing large is uploaded.
          Only you can change yours.
        </span>
      </div>
      {error && <ErrorNote heading="That photo was not saved." message={error} />}
    </div>
  );
}
