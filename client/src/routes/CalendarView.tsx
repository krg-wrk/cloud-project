import { useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { send, useApi, query } from "../lib/api";
import {
  TODAY,
  dayOfMonth,
  firstOfMonth,
  formatLong,
  formatMedium,
  formatWeekday,
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
  KIND_LABELS,
  eventCovers,
  personName,
} from "../lib/domain";
import { Icon } from "../lib/icons";
import { NARROW, useMedia } from "../lib/media";
import { isMultiDay, packWeek, type Bar } from "../lib/spans";
import { useViewer } from "../lib/viewer";
import type {
  CalendarEvent,
  ContentItem,
  MyPeerReview,
  PersonalEntry,
  Schedule,
  SessionWithSignUps,
} from "../types";
import { ErrorNote, Loading } from "../components/bits";
import EntryForm from "../components/EntryForm";
import ShareLink from "../components/ShareLink";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Room for three single-day chips before a cell starts saying "+n more". */
const MAX_CHIPS = 3;

type Chip =
  | { kind: "submission" | "publication"; item: ContentItem }
  | { kind: "event"; event: CalendarEvent }
  | { kind: "session"; session: SessionWithSignUps }
  | { kind: "entry"; entry: PersonalEntry }
  | { kind: "review"; review: MyPeerReview };

type Show = { submissions: boolean; publications: boolean; events: boolean; mine: boolean };

interface Feed {
  content: ContentItem[];
  events: CalendarEvent[];
  sessions: SessionWithSignUps[];
  entries: PersonalEntry[];
  reviews: MyPeerReview[];
}

/**
 * Everything on one day, as chips.
 *
 * Multi-day events and reminders are deliberately left out: they are drawn
 * once as a bar across the week instead of repeated in every day they touch.
 * Pass `includeSpans` to get them anyway, which the day panel wants.
 */
function chipsForDay(date: string, feed: Feed, show: Show, includeSpans = false): Chip[] {
  const chips: Chip[] = [];
  const wanted = (span: { from: string; to: string }) =>
    includeSpans || !isMultiDay(span);

  if (show.mine) {
    for (const entry of feed.entries) {
      if (entry.date > date || entry.endDate < date) continue;
      if (wanted({ from: entry.date, to: entry.endDate })) chips.push({ kind: "entry", entry });
    }
    for (const review of feed.reviews) {
      if (review.reviewDate === date) chips.push({ kind: "review", review });
    }
  }
  if (show.events) {
    for (const event of feed.events) {
      if (!eventCovers(event, date)) continue;
      if (wanted({ from: event.startDate, to: event.endDate })) chips.push({ kind: "event", event });
    }
    for (const session of feed.sessions) {
      if (session.date === date) chips.push({ kind: "session", session });
    }
  }
  if (show.submissions) {
    for (const item of feed.content) {
      if (item.submissionDate === date) chips.push({ kind: "submission", item });
    }
  }
  if (show.publications) {
    for (const item of feed.content) {
      if (item.publicationDate === date) chips.push({ kind: "publication", item });
    }
  }
  return chips;
}

/** The multi-day things in view — the ones that become bars. */
type SpanItem =
  | { kind: "event"; event: CalendarEvent }
  | { kind: "entry"; entry: PersonalEntry };

function spanItems(feed: Feed, show: Show): SpanItem[] {
  const out: SpanItem[] = [];
  if (show.events) {
    for (const event of feed.events) {
      if (isMultiDay({ from: event.startDate, to: event.endDate })) out.push({ kind: "event", event });
    }
  }
  if (show.mine) {
    for (const entry of feed.entries) {
      if (isMultiDay({ from: entry.date, to: entry.endDate })) out.push({ kind: "entry", entry });
    }
  }
  return out;
}

const spanOf = (s: SpanItem) =>
  s.kind === "event"
    ? { from: s.event.startDate, to: s.event.endDate }
    : { from: s.entry.date, to: s.entry.endDate };

/** A chip's destination — the same one wherever the chip is clicked from. */
function chipHref(chip: Chip): string {
  switch (chip.kind) {
    case "submission":
    case "publication":
      return `/content/${chip.item.id}`;
    case "review":
      return `/content/${chip.review.contentId}`;
    case "session":
      return `/workshops/${chip.session.id}`;
    case "event":
      return `/whats-on?type=${chip.event.type}`;
    case "entry":
      return "";
  }
}

/** Spelled out in full, for the day panel and for tooltips. */
function chipMeaning(chip: Chip): string {
  switch (chip.kind) {
    case "submission":
      return "Copy due with the commissioning manager";
    case "publication":
      return "Publishes on the platform";
    case "review":
      return chip.review.iAmReviewer ? "Peer review — you are reviewing" : "Peer review of your piece";
    case "session":
      return `${KIND_LABELS[chip.session.kind]}, ${chip.session.startTime}–${chip.session.endTime}`;
    case "event":
      return EVENT_LABELS[chip.event.type];
    case "entry":
      return "Your own reminder";
  }
}

function chipLabel(chip: Chip, people: Schedule["people"]): { kicker: string; title: string; icon: string; colour: string } {
  switch (chip.kind) {
    // No kicker on these two: the icon and the colour say which it is, and
    // the title is what people are scanning for. The day panel spells it out.
    case "submission":
      return { kicker: "", title: chip.item.title, icon: "deadlines", colour: "var(--ink)" };
    case "publication":
      return {
        kicker: "",
        title: chip.item.title,
        icon: "published",
        colour: "var(--status-published)",
      };
    case "review":
      return {
        kicker: chip.review.iAmReviewer ? "Review" : "Reviewed",
        title: chip.review.item?.title ?? "Peer review",
        icon: "review",
        colour: "var(--review)",
      };
    case "session":
      return {
        kicker: chip.session.startTime,
        title: chip.session.title,
        icon: chip.session.kind === "training" ? "training" : "workshop",
        colour: `var(--kind-${chip.session.kind})`,
      };
    case "event":
      return {
        kicker: chip.event.personId
          ? personName(people, chip.event.personId).split(" ")[0]
          : EVENT_LABELS_SHORT[chip.event.type],
        title: chip.event.title,
        icon: chip.event.type,
        colour: `var(--event-${chip.event.type})`,
      };
    case "entry":
      return { kicker: "Mine", title: chip.entry.title, icon: "note", colour: "var(--mine)" };
  }
}

/**
 * The month as a list, for a phone.
 *
 * A seven-column grid at 390px gives each day about fifty pixels, which is
 * one letter of a title — so on a narrow screen the month becomes an agenda
 * instead. A multi-day thing still appears once, on the day it starts, with
 * the dates it covers, for the same reason it is one bar on the grid.
 */
function Agenda({
  month,
  feed,
  show,
  people,
  onRemoveEntry,
}: {
  month: string;
  feed: Feed;
  show: Show;
  people: Schedule["people"];
  onRemoveEntry: (id: string) => void;
}) {
  const first = `${month}-01`;
  const last = lastOfMonth(month);

  // Single-day things on their day; multi-day things on the day they start,
  // or on the first of the month when they began before it.
  const byDay = new Map<string, { chip: Chip; through?: string }[]>();
  const add = (date: string, chip: Chip, through?: string) => {
    if (date < first || date > last) return;
    const list = byDay.get(date) ?? [];
    list.push({ chip, through });
    byDay.set(date, list);
  };

  for (const item of feed.content) {
    if (show.submissions) add(item.submissionDate, { kind: "submission", item });
    if (show.publications) add(item.publicationDate, { kind: "publication", item });
  }
  if (show.events) {
    for (const event of feed.events) {
      const multi = isMultiDay({ from: event.startDate, to: event.endDate });
      const start = event.startDate < first ? first : event.startDate;
      if (event.endDate < first || event.startDate > last) continue;
      add(start, { kind: "event", event }, multi ? event.endDate : undefined);
    }
    for (const session of feed.sessions) add(session.date, { kind: "session", session });
  }
  if (show.mine) {
    for (const entry of feed.entries) {
      const multi = isMultiDay({ from: entry.date, to: entry.endDate });
      const start = entry.date < first ? first : entry.date;
      if (entry.endDate < first || entry.date > last) continue;
      add(start, { kind: "entry", entry }, multi ? entry.endDate : undefined);
    }
    for (const review of feed.reviews) add(review.reviewDate, { kind: "review", review });
  }

  const days = [...byDay.keys()].sort();
  if (days.length === 0) {
    return (
      <div className="empty">
        <Icon name="calendar" size={22} />
        <p>Nothing in this month, with those filters.</p>
      </div>
    );
  }

  return (
    <div className="agenda">
      {days.map((date) => (
        <section className="agenda-day" key={date}>
          <h2 className={date === TODAY ? "agenda-date today" : "agenda-date"}>
            <b>{dayOfMonth(date)}</b>
            <span>{formatWeekday(date)}</span>
            {date === TODAY && <em>Today</em>}
          </h2>
          <div className="agenda-items">
            {byDay.get(date)!.map(({ chip, through }, i) => {
              const { title, icon, colour } = chipLabel(chip, people);
              const style = { "--chip-color": colour } as CSSProperties;
              const body = (
                <>
                  <span className="day-item-icon">
                    <Icon name={icon} size={16} />
                  </span>
                  <span>
                    <span className="day-item-title">{title}</span>
                    <span className="day-item-meta">
                      {chipMeaning(chip)}
                      {through && ` · until ${formatMedium(through)}`}
                    </span>
                  </span>
                </>
              );
              return chip.kind === "entry" ? (
                <button
                  key={`${chip.kind}-${i}`}
                  className="day-item day-item-button"
                  style={style}
                  onClick={() => onRemoveEntry(chip.entry.id)}
                  title="Yours — tap to remove"
                >
                  {body}
                </button>
              ) : (
                <Link
                  key={`${chip.kind}-${i}`}
                  className="day-item"
                  style={style}
                  to={chipHref(chip)}
                >
                  {body}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
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
  const show: Show = {
    submissions: params.get("submissions") !== "0",
    publications: params.get("publications") !== "0",
    events: params.get("events") !== "0",
    mine: params.get("mine") !== "0",
  };
  const openDay = params.get("day") ?? "";
  const narrow = useMedia(NARROW);

  const grid = monthGrid(key);
  const { data, error, loading } = useApi<Schedule>(
    `/schedule${query({
      from: grid[0][0],
      to: grid[5][6],
      forecaster: forecaster || undefined,
    })}`,
  );
  // Workshops belong to the whole team, so they are not narrowed by forecaster.
  const sessions = useApi<SessionWithSignUps[]>("/sessions");

  const [adding, setAdding] = useState(false);
  const [extraEntries, setExtraEntries] = useState<PersonalEntry[]>([]);
  const [dropped, setDropped] = useState<string[]>([]);

  const entries = [...(data?.entries ?? []), ...extraEntries].filter(
    (e) => !dropped.includes(e.id),
  );

  async function removeEntry(id: string) {
    // Optimistic: the chip is the only place it appears on this page.
    setDropped((current) => [...current, id]);
    try {
      await send(`/my/entries/${id}`, "DELETE");
    } catch {
      setDropped((current) => current.filter((x) => x !== id));
    }
  }

  function setParam(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  }

  function toggle(name: keyof Show) {
    setParam(name, show[name] ? "0" : "");
  }

  function goMonth(delta: number) {
    navigate({ pathname: `/calendar/${shiftMonth(key, delta)}`, search: params.toString() });
  }

  if (error) return <ErrorNote message={error} />;

  const feed: Feed = {
    content: data?.content ?? [],
    events: data?.events ?? [],
    sessions: sessions.data ?? [],
    entries,
    reviews: data?.peerReviews ?? [],
  };

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
            that sits around them. Anything running over more than a day is drawn
            once, across the days it covers. The month and the filters are in the
            URL, so any view you are looking at can be pasted straight into Slack.
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
              <Icon name="deadlines" />
              Submissions
            </button>
            <button
              className={show.publications ? "btn accent" : "btn"}
              onClick={() => toggle("publications")}
            >
              <Icon name="published" />
              Publications
            </button>
            <button
              className={show.events ? "btn accent" : "btn"}
              onClick={() => toggle("events")}
            >
              <Icon name="calendar" />
              Diary
            </button>
          </div>
        </div>
        <div className="field">
          <label>Mine</label>
          <button
            className={show.mine ? "btn accent" : "btn"}
            onClick={() => toggle("mine")}
            title="Your own reminders and peer reviews"
          >
            <Icon name="note" />
            My plan
          </button>
        </div>
        <div className="filters-right">
          <button className="btn solid" onClick={() => setAdding((v) => !v)}>
            <Icon name="plus" />
            {adding ? "Close" : "Add a reminder"}
          </button>
          <ShareLink />
        </div>
      </div>

      {adding && (
        <EntryForm
          defaultDate={`${key}-01` > TODAY ? `${key}-01` : TODAY}
          onSaved={(entry) => {
            setExtraEntries((current) => [...current, entry]);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {loading || !data ? (
        <Loading what="the month" />
      ) : (
        <>
          {openDay && !narrow && (
            <DayPanel
              date={openDay}
              chips={chipsForDay(openDay, feed, show, true)}
              people={data.people}
              onClose={() => setParam("day", "")}
              onRemoveEntry={removeEntry}
            />
          )}

          {narrow ? (
            <Agenda
              month={key}
              feed={feed}
              show={show}
              people={data.people}
              onRemoveEntry={removeEntry}
            />
          ) : (
          <div className="calendar">
            <div className="cal-head">
              {WEEKDAYS.map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>
            {grid.map((week) => {
              const { bars, lanes } = packWeek(week, spanItems(feed, show), spanOf);
              return (
                <div
                  className="cal-week"
                  key={week[0]}
                  style={{ "--lanes": lanes } as CSSProperties}
                >
                  <div className="cal-days">
                    {week.map((date) => {
                      const chips = chipsForDay(date, feed, show);
                      const classes = ["cal-day"];
                      if (!isSameMonth(date, key)) classes.push("outside");
                      if (isWeekend(date)) classes.push("weekend");
                      if (date === TODAY) classes.push("today");
                      const hidden = chips.length - MAX_CHIPS;
                      return (
                        <div className={classes.join(" ")} key={date}>
                          <button
                            className="cal-daynum"
                            onClick={() => setParam("day", date)}
                            title={`Everything on ${formatLong(date)}`}
                          >
                            {dayOfMonth(date)}
                          </button>
                          {lanes > 0 && <div className="cal-lane-space" aria-hidden />}
                          {chips.slice(0, MAX_CHIPS).map((chip, i) => (
                            <ChipView
                              key={`${chip.kind}-${i}`}
                              chip={chip}
                              people={data.people}
                              onRemoveEntry={removeEntry}
                            />
                          ))}
                          {hidden > 0 && (
                            <button className="cal-more" onClick={() => setParam("day", date)}>
                              +{hidden} more
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Bars sit over the day cells, one row per lane. */}
                  <div className="cal-spans">
                    {bars.map((bar) => (
                      <SpanBar
                        key={`${bar.item.kind === "event" ? bar.item.event.id : bar.item.entry.id}-${bar.lane}-${bar.startCol}`}
                        bar={bar}
                        people={data.people}
                        onRemoveEntry={removeEntry}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          )}

          <div className="legend">
            <span style={{ "--legend-color": "var(--ink)" } as CSSProperties}>
              <i /> Submission due
            </span>
            <span style={{ "--legend-color": "var(--status-published)" } as CSSProperties}>
              <i /> Publication
            </span>
            <span style={{ "--legend-color": "var(--kind-workshop)" } as CSSProperties}>
              <i /> Workshop / session
            </span>
            <span style={{ "--legend-color": "var(--review)" } as CSSProperties}>
              <i /> Peer review
            </span>
            <span style={{ "--legend-color": "var(--mine)" } as CSSProperties}>
              <i /> Yours only
            </span>
            {(["leave", "public-holiday", "conference"] as (keyof typeof EVENT_LABELS)[]).map((type) => (
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

/**
 * A multi-day thing, drawn once across the columns it covers. Where it runs
 * past the edge of the week a chevron says so, rather than the bar simply
 * stopping as though the event did.
 */
function SpanBar({
  bar,
  people,
  onRemoveEntry,
}: {
  bar: Bar<SpanItem>;
  people: Schedule["people"];
  onRemoveEntry: (id: string) => void;
}) {
  const span = spanOf(bar.item);
  const style = {
    gridColumn: `${bar.startCol + 1} / ${bar.endCol + 2}`,
    gridRow: bar.lane + 1,
    "--chip-color": bar.item.kind === "event" ? `var(--event-${bar.item.event.type})` : "var(--mine)",
  } as CSSProperties;

  const who =
    bar.item.kind === "event" && bar.item.event.personId
      ? personName(people, bar.item.event.personId).split(" ")[0]
      : null;
  const title = bar.item.kind === "event" ? bar.item.event.title : bar.item.entry.title;
  const icon = bar.item.kind === "event" ? bar.item.event.type : "note";
  const dates = `${formatMedium(span.from)} to ${formatMedium(span.to)}`;

  const body = (
    <>
      {bar.continuesBefore && <span className="span-carry">‹</span>}
      <Icon name={icon} size={13} />
      <span className="span-title">{who ? `${who} — ${title}` : title}</span>
      {bar.continuesAfter && <span className="span-carry">›</span>}
    </>
  );

  if (bar.item.kind === "entry") {
    const id = bar.item.entry.id;
    return (
      <button
        className="cal-span cal-span-button"
        style={style}
        title={`${title}, ${dates} (yours — click to remove)`}
        onClick={() => onRemoveEntry(id)}
      >
        {body}
      </button>
    );
  }
  return (
    <Link
      className="cal-span"
      style={style}
      to={`/whats-on?type=${bar.item.event.type}`}
      title={`${title}${who ? ` — ${who}` : ""}, ${dates}`}
    >
      {body}
    </Link>
  );
}

/** One single-day chip. */
function ChipView({
  chip,
  people,
  onRemoveEntry,
}: {
  chip: Chip;
  people: Schedule["people"];
  onRemoveEntry: (id: string) => void;
}) {
  const { kicker, title, icon, colour } = chipLabel(chip, people);
  const style = { "--chip-color": colour } as CSSProperties;
  const body = (
    <>
      <Icon name={icon} size={12} />
      {kicker && <span className="chip-kind">{kicker}</span>}
      <span className="chip-title">{title}</span>
    </>
  );
  if (chip.kind === "entry") {
    return (
      <button
        className="cal-chip cal-chip-button"
        style={style}
        title={`${chip.entry.title}${chip.entry.note ? ` — ${chip.entry.note}` : ""} (yours — click to remove)`}
        onClick={() => onRemoveEntry(chip.entry.id)}
      >
        {body}
      </button>
    );
  }
  return (
    <Link
      className="cal-chip"
      style={style}
      to={chipHref(chip)}
      title={`${title} — ${chipMeaning(chip)}`}
    >
      {body}
    </Link>
  );
}

/**
 * One day in full. A cell only has room for three chips, and the day number
 * and the "+n more" both open this, so nothing on the calendar is unreachable.
 */
function DayPanel({
  date,
  chips,
  people,
  onClose,
  onRemoveEntry,
}: {
  date: string;
  chips: Chip[];
  people: Schedule["people"];
  onClose: () => void;
  onRemoveEntry: (id: string) => void;
}) {
  return (
    <div className="day-panel">
      <div className="day-panel-head">
        <div>
          <div className="eyebrow">{date === TODAY ? "Today" : "On this day"}</div>
          <h2>{formatLong(date)}</h2>
        </div>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      {chips.length === 0 ? (
        <p className="muted">Nothing in the diary, and nothing due.</p>
      ) : (
        <div className="day-list">
          {chips.map((chip, i) => {
            const { title, icon, colour } = chipLabel(chip, people);
            const style = { "--chip-color": colour } as CSSProperties;
            const body = (
              <>
                <span className="day-item-icon">
                  <Icon name={icon} size={16} />
                </span>
                <span>
                  <span className="day-item-title">{title}</span>
                  <span className="day-item-meta">{chipMeaning(chip)}</span>
                </span>
              </>
            );
            return chip.kind === "entry" ? (
              <button
                key={`${chip.kind}-${i}`}
                className="day-item day-item-button"
                style={style}
                onClick={() => onRemoveEntry(chip.entry.id)}
                title="Yours — click to remove"
              >
                {body}
              </button>
            ) : (
              <Link key={`${chip.kind}-${i}`} className="day-item" style={style} to={chipHref(chip)}>
                {body}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
