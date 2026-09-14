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

export function Loading({ what = "the schedule" }: { what?: string }) {
  return <div className="loading">Loading {what}…</div>;
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
