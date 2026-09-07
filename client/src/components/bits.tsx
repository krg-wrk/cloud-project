import type { CSSProperties } from "react";
import type { EventType, Status } from "../types";
import { EVENT_LABELS, STATUS_LABELS, initials, personHue } from "../lib/domain";

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className="pill" style={{ "--pill-color": `var(--status-${status})` } as CSSProperties}>
      <i className="dot" />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function EventPill({ type }: { type: EventType }) {
  return (
    <span className="pill" style={{ "--pill-color": `var(--event-${type})` } as CSSProperties}>
      <i className="dot" />
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

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="callout">
      <strong>Could not load the data.</strong>
      <div style={{ marginTop: 4 }}>{message}</div>
    </div>
  );
}
