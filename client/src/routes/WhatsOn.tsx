import type { CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { query, useApi } from "../lib/api";
import { TODAY, formatMedium, monthKey, monthLabel } from "../lib/date";
import { EVENT_LABELS, personName } from "../lib/domain";
import type { CalendarEvent, EventType, Person } from "../types";
import { ErrorNote, EventPill, Loading } from "../components/bits";
import ShareLink from "../components/ShareLink";

export default function WhatsOn() {
  const [params, setParams] = useSearchParams();
  const type = params.get("type") ?? "";
  const people = useApi<Person[]>("/people");
  const { data, error, loading } = useApi<CalendarEvent[]>(
    `/events${query({ type: type || undefined, from: TODAY })}`,
  );

  function setType(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set("type", value);
    else next.delete("type");
    setParams(next, { replace: true });
  }

  if (error) return <ErrorNote message={error} />;

  const events = data ?? [];
  const byMonth = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = monthKey(event.startDate);
    byMonth.set(key, [...(byMonth.get(key) ?? []), event]);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Leave · holidays · workshops · shows</div>
          <h1 className="page-title">What&rsquo;s on</h1>
          <p className="page-sub">
            Everything that sits alongside the deadlines, so nobody plans a
            submission for a week they are away.
          </p>
        </div>
        <ShareLink label="Copy link" />
      </div>

      <div className="filters">
        <div className="field">
          <label>Type</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className={type === "" ? "btn accent" : "btn"} onClick={() => setType("")}>
              Everything
            </button>
            {(Object.keys(EVENT_LABELS) as EventType[]).map((t) => (
              <button
                key={t}
                className={type === t ? "btn accent" : "btn"}
                onClick={() => setType(t)}
              >
                {EVENT_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="filters-right">
          <span style={{ fontSize: 12, color: "var(--ink-45)" }}>
            {events.length} coming up
          </span>
        </div>
      </div>

      {loading || !data ? (
        <Loading what="the diary" />
      ) : events.length === 0 ? (
        <div className="empty">Nothing in the diary for that filter.</div>
      ) : (
        [...byMonth.entries()].map(([key, monthEvents]) => (
          <div key={key}>
            <h2 className="month-heading">{monthLabel(key)}</h2>
            <div className="event-list">
              {monthEvents.map((event) => (
                <div
                  key={event.id}
                  className="event-row"
                  style={{ "--chip-color": `var(--event-${event.type})` } as CSSProperties}
                >
                  <div className="event-when">
                    {formatMedium(event.startDate)}
                    {event.endDate !== event.startDate && (
                      <div style={{ opacity: 0.7 }}>to {formatMedium(event.endDate)}</div>
                    )}
                  </div>
                  <div>
                    <div className="deadline-title">{event.title}</div>
                    <div className="deadline-meta">
                      {event.personId
                        ? personName(people.data ?? [], event.personId)
                        : event.region
                          ? `${event.region} team`
                          : (event.location ?? "Everyone")}
                      {event.location && event.personId ? ` · ${event.location}` : ""}
                    </div>
                  </div>
                  <EventPill type={event.type} />
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}
