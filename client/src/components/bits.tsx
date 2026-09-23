import type { CSSProperties } from "react";
import type { EventType, Status } from "../types";
import { EVENT_LABELS, STATUS_LABELS, initials, personHue } from "../lib/domain";
import { Icon } from "../lib/icons";
import { usePhoto } from "../lib/viewer";

/*
 * A pill carries an icon rather than a plain dot: the status is then readable
 * from the shape as well as the colour and the word, which matters most in the
 * deadlines table where a column of pills is scanned rather than read.
 */
export function StatusPill({ status }: { status: Status }) {
  return (
    <span className="pill" style={{ "--pill-color": `var(--status-${status})` } as CSSProperties}>
      <Icon name={status} size={13} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function EventPill({ type }: { type: EventType }) {
  return (
    <span className="pill" style={{ "--pill-color": `var(--event-${type})` } as CSSProperties}>
      <Icon name={type} size={13} />
      {EVENT_LABELS[type]}
    </span>
  );
}

/**
 * A person, as a small round mark.
 *
 * Their photograph if they have set one, their initials on a colour derived
 * from their id if they have not. The initials stay in the markup underneath
 * either way: a photo that fails to load — an expired cache, a blocked
 * request — falls back to them rather than to a hole.
 *
 * `photo` is looked up rather than passed, because an avatar turns up in a
 * table cell, a card and a sidebar, and threading a URL through every one of
 * those would mean every list knowing about photographs.
 */
export function Avatar({
  id,
  name,
  size,
}: {
  id: string;
  name: string;
  size?: "lg" | "xl";
}) {
  const photo = usePhoto(id);
  return (
    <span
      className={size ? `avatar ${size}` : "avatar"}
      style={{ "--hue": personHue(id) } as CSSProperties}
      title={name}
      aria-hidden
    >
      {initials(name)}
      {photo && <img className="avatar-photo" src={photo} alt="" loading="lazy" />}
    </span>
  );
}

export function Who({ id, name }: { id: string; name: string }) {
  return (
    <span className="who">
      <Avatar id={id} name={name} />
      {name}
    </span>
  );
}

/**
 * Something to watch while a sheet is being read.
 *
 * Three rings round a nucleus, because a read of Smartsheet is several sheets
 * fetched at once and an atom is the one familiar picture of separate things
 * going round together. A spinner would have said the same thing the way
 * every other page on the internet says it.
 *
 * The rings hold still and the electrons travel them, which is the way round
 * that reads as an atom. Spinning the rings themselves was the first attempt
 * and is the cheaper effect: within a second or two the three of them drift
 * into the same angle and the figure becomes a tangle rather than a thing
 * with a shape.
 *
 * Not called `atom` — the Forecast Builder already has that class for the
 * cards somebody drags, and the two would have fought over a border.
 *
 * Purely decorative, so it is hidden from anybody listening rather than read
 * out as a row of shapes. The sentence underneath says what is happening.
 */
export function Atom({ size = 46 }: { size?: number }) {
  return (
    <svg
      className="loader-atom"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      {[0, 60, 120].map((tilt, i) => (
        <g key={tilt} transform={`rotate(${tilt} 20 20)`}>
          <ellipse cx="20" cy="20" rx="16.5" ry="6.4" />
          {/*
            Placed on the ring by its own coordinates, so a browser that does
            not follow the path still draws an atom at rest rather than a dot
            stranded in the corner.
          */}
          <circle className={`loader-electron loader-electron-${i + 1}`} cx="36.5" cy="20" r="2.1" />
        </g>
      ))}
      <circle className="loader-core" cx="20" cy="20" r="3.4" />
    </svg>
  );
}

export function Loading({ what = "the schedule" }: { what?: string }) {
  return (
    <div className="loading">
      <Atom />
      <div>Loading {what}…</div>
    </div>
  );
}

/**
 * Something went wrong, with the server's own words under it.
 *
 * `heading` exists because most of these are a failed read, but some are a
 * refused write — and telling somebody "could not load the data" when what
 * actually happened is that their setting was rejected sends them looking
 * for a fault that is not there.
 */
export function ErrorNote({
  message,
  heading = "Could not load the data.",
}: {
  message: string;
  heading?: string;
}) {
  return (
    <div className="callout" role="alert">
      <strong>{heading}</strong>
      <div style={{ marginTop: 4 }}>{message}</div>
    </div>
  );
}
