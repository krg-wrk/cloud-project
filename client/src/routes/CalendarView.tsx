import type { CSSProperties } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useApi, query } from "../lib/api";
import {
  TODAY,
  dayOfMonth,
  firstOfMonth,
  formatMedium,
  isSameMonth,
  isWeekend,
  lastOfMonth,
  monthGrid,
  monthKey,
  monthLabel,
  shiftMonth,
} from "../lib/date";
import {
  EVENT_LABELS,
  EVENT_LABELS_SHORT,
  eventCovers,
  personName,
} from "../lib/domain";
import { useViewer } from "../lib/viewer";
import type { CalendarEvent, ContentItem, Schedule } from "../types";
import { ErrorNote, Loading } from "../components/bits";
import ShareLink from "../components/ShareLink";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 3;

type Chip =
  | { kind: "submission" | "publication"; item: ContentItem }
  | { kind: "event"; event: CalendarEvent };

function chipsForDay(
  date: string,
  content: ContentItem[],
  events: CalendarEvent[],
  show: { submissions: boolean; publications: boolean; events: boolean },
): Chip[] {
  const chips: Chip[] = [];
  if (show.events) {
    for (const event of events) {
      if (eventCovers(event, date)) chips.push({ kind: "event", event });
    }
  }
  if (show.submissions) {
    for (const item of content) {
      if (item.submissionDate === date) chips.push({ kind: "submission", item });
    }
  }
  if (show.publications) {
    for (const item of content) {
      if (item.publicationDate === date) chips.push({ kind: "publication", item });
    }
  }
  return chips;
}

export default function CalendarView() {
  const { month } = useParams<{ month: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { person, people, isManager } = useViewer();

  const key = month && /^\d{4}-\d{2}$/.test(month) ? month : monthKey(TODAY);
  // Managers see the whole team by default; forecasters see their own work.
  const forecaster =
    params.get("forecaster") ?? (isManager ? "" : (person?.id ?? ""));
  const show = {
    submissions: params.get("submissions") !== "0",
    publications: params.get("publications") !== "0",
    events: params.get("events") !== "0",
  };

  const grid = monthGrid(key);
  const { data, error, loading } = useApi<Schedule>(
    `/schedule${query({
      from: grid[0][0],
      to: grid[5][6],
      forecaster: forecaster || undefined,
    })}`,
  );

  function setParam(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  }

  function toggle(name: keyof typeof show) {
    setParam(name, show[name] ? "0" : "");
  }

  function goMonth(delta: number) {
    navigate({ pathname: `/calendar/${shiftMonth(key, delta)}`, search: params.toString() });
  }

  if (error) return <ErrorNote message={error} />;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {formatMedium(firstOfMonth(key))} — {formatMedium(lastOfMonth(key))}
          </div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-sub">
            Submission deadlines, publication dates and everything in the diary
            that sits around them. The month and the filters are in the URL, so
            any view you are looking at can be pasted straight into Slack.
          </p>
        </div>
        <div className="cal-nav">
          <button className="btn" onClick={() => goMonth(-1)} aria-label="Previous month">
            ←
          </button>
          <div className="cal-month">{monthLabel(key)}</div>
          <button className="btn" onClick={() => goMonth(1)} aria-label="Next month">
            →
          </button>
          <Link to={`/calendar/${monthKey(TODAY)}`} className="btn ghost">
            Today
          </Link>
        </div>
      </div>

      <div className="filters">
        <div className="field">
          <label htmlFor="who">Forecaster</label>
          <select
            id="who"
            value={forecaster}
            onChange={(e) => setParam("forecaster", e.target.value)}
          >
            <option value="">Everyone</option>
            {people
              .filter((p) => p.role === "forecaster")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
        <div className="field">
          <label>Show</label>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className={show.submissions ? "btn accent" : "btn"}
              onClick={() => toggle("submissions")}
            >
              Submissions
            </button>
            <button
              className={show.publications ? "btn accent" : "btn"}
              onClick={() => toggle("publications")}
            >
              Publications
            </button>
            <button
              className={show.events ? "btn accent" : "btn"}
              onClick={() => toggle("events")}
            >
              Diary
            </button>
          </div>
        </div>
        <div className="filters-right">
          <ShareLink />
        </div>
      </div>

      {loading || !data ? (
        <Loading what="the month" />
      ) : (
        <>
          <div className="calendar">
            <div className="cal-head">
              {WEEKDAYS.map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>
            {grid.map((week) => (
              <div className="cal-week" key={week[0]}>
                {week.map((date) => {
                  const chips = chipsForDay(date, data.content, data.events, show);
                  const classes = ["cal-day"];
                  if (!isSameMonth(date, key)) classes.push("outside");
                  if (isWeekend(date)) classes.push("weekend");
                  if (date === TODAY) classes.push("today");
                  return (
                    <div className={classes.join(" ")} key={date}>
                      <div className="cal-daynum">{dayOfMonth(date)}</div>
                      {chips.slice(0, MAX_CHIPS).map((chip, i) =>
                        chip.kind === "event" ? (
                          <Link
                            key={`${chip.event.id}-${i}`}
                            to={`/whats-on?type=${chip.event.type}`}
                            className="cal-chip"
                            style={
                              { "--chip-color": `var(--event-${chip.event.type})` } as CSSProperties
                            }
                            title={`${EVENT_LABELS[chip.event.type]}: ${chip.event.title}`}
                          >
                            <span className="chip-kind">
                              {chip.event.personId
                                ? personName(data.people, chip.event.personId).split(" ")[0]
                                : EVENT_LABELS_SHORT[chip.event.type]}
                            </span>
                            {chip.event.title}
                          </Link>
                        ) : (
                          <Link
                            key={`${chip.item.id}-${chip.kind}`}
                            to={`/content/${chip.item.id}`}
                            className="cal-chip"
                            style={
                              {
                                "--chip-color":
                                  chip.kind === "submission"
                                    ? "var(--accent)"
                                    : "var(--status-published)",
                              } as CSSProperties
                            }
                            title={`${chip.kind === "submission" ? "Due" : "Publishes"}: ${chip.item.title}`}
                          >
                            <span className="chip-kind">
                              {chip.kind === "submission" ? "Due" : "Publishes"}
                            </span>
                            {chip.item.title}
                          </Link>
                        ),
                      )}
                      {chips.length > MAX_CHIPS && (
                        <div className="cal-more">+{chips.length - MAX_CHIPS} more</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="legend">
            <span style={{ "--legend-color": "var(--accent)" } as CSSProperties}>
              <i /> Submission due
            </span>
            <span style={{ "--legend-color": "var(--status-published)" } as CSSProperties}>
              <i /> Publication
            </span>
            {(Object.keys(EVENT_LABELS) as (keyof typeof EVENT_LABELS)[]).map((type) => (
              <span key={type} style={{ "--legend-color": `var(--event-${type})` } as CSSProperties}>
                <i /> {EVENT_LABELS[type]}
              </span>
            ))}
          </div>
        </>
      )}
    </>
  );
}
