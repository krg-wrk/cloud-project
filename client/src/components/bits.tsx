import type { CSSProperties } from "react";
import type { EventType, Status } from "../types";
import { EVENT_LABELS, STATUS_LABELS, initials, personHue } from "../lib/domain";
import { Icon } from "../lib/icons";

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

export function Avatar({
  id,
  name,
  size,
}: {
  id: string;
  name: string;
  size?: "lg";
}) {
  return (
    <span
      className={size === "lg" ? "avatar lg" : "avatar"}
      style={{ "--hue": personHue(id) } as CSSProperties}
      title={name}
      aria-hidden
    >
      {initials(name)}
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
