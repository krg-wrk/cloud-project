import { useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { send, useApi, query } from "../lib/api";
import {
  TODAY,
  addDays,
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
  relativeDays,
  startOfWeek,
  shiftMonth,
  weekGrid,
  weekLabel,
} from "../lib/date";
import {
  EVENT_LABELS,
  EVENT_LABELS_SHORT,
  KIND_LABELS,
  eventCovers,
  personName,
} from "../lib/domain";
import { Icon } from "../lib/icons";
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
import BackLink from "../components/BackLink";
import { ErrorNote, Loading } from "../components/bits";
import EntryForm from "../components/EntryForm";
import ShareLink from "../components/ShareLink";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/**
 * A month cell has room for three chips before it needs to say "+n more".
 * A week cell is five times taller, so it shows everything.
 */
const MAX_CHIPS = 3;

type View = "month" | "week" | "day";

const VIEWS: { id: View; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
];

/**
 * The path segment is a month key in the month view and a full date in the
 * others, so a link to any of them is a link to exactly what you were
 * looking at. Either form is accepted for either view, so hand-edited and
 * older URLs still land somewhere sensible.
 */
function anchorDate(segment: string | undefined): string {
  if (segment && /^\d{4}-\d{2}-\d{2}$/.test(segment)) return segment;
  if (segment && /^\d{4}-\d{2}$/.test(segment)) {
    // Opening a week or a day from a month key: today if it is in that month,
    // so "this week" is what you get, otherwise the first of it.
    return monthKey(TODAY) === segment ? TODAY : `${segment}-01`;
  }
  return TODAY;
}

/** What the path segment should be for a view anchored on this date. */
function segmentFor(view: View, date: string): string {
  return view === "month" ? monthKey(date) : date;
}

/**
 * Where the week view should open when you switch to it.
 *
 * The week containing the 1st of a month is usually mostly the month before,
 * which is a jarring thing to land on after looking at that month — so if
 * fewer than four of its days are in the month, step on to the next week.
 */
function weekAnchor(date: string): string {
  const monday = startOfWeek(date);
  const inMonth = weekGrid(monday).filter((d) => monthKey(d) === monthKey(date)).length;
  return inMonth >= 4 ? date : addDays(monday, 7);
}

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
      // No page of its own, so it opens the diary filtered to its kind.
      // `from` says where the click came from, so the diary knows to offer
      // the way back — see WhatsOn.
      return `/whats-on?type=${chip.event.type}&from=calendar`;
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

export default function CalendarView() {
  const { month } = useParams<{ month: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { person, people, isManager } = useViewer();

  // An unknown ?view= falls back to the month rather than rendering nothing.
  const asked = params.get("view");
  const view: View = VIEWS.some((v) => v.id === asked) ? (asked as View) : "month";
  const anchor = anchorDate(month);
  const key = monthKey(anchor);
  // Managers see the whole team by default; forecasters see their own work.
  const forecaster =
    params.get("forecaster") ?? (isManager ? "" : (person?.id ?? ""));
  const show: Show = {
    submissions: params.get("submissions") !== "0",
    publications: params.get("publications") !== "0",
    events: params.get("events") !== "0",
    mine: params.get("mine") !== "0",
  };

  const grid = monthGrid(key);
  const week = weekGrid(anchor);
  // Fetch what the view shows: the whole month grid, the week, or the day.
  const from = view === "month" ? grid[0][0] : view === "week" ? week[0] : anchor;
  const to = view === "month" ? grid[5][6] : view === "week" ? week[6] : anchor;
  const { data, error, loading } = useApi<Schedule>(
    `/schedule${query({ from, to, forecaster: forecaster || undefined })}`,
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

  /** Prev/next steps by whatever the view is showing. */
  function step(delta: number) {
    const next =
      view === "month"
        ? shiftMonth(key, delta)
        : addDays(anchor, delta * (view === "week" ? 7 : 1));
    navigate({ pathname: `/calendar/${next}`, search: params.toString() });
  }

  /** Switching view keeps you on the same date rather than jumping to today. */
  function setView(next: View) {
    const search = new URLSearchParams(params);
    if (next === "month") search.delete("view");
    else search.set("view", next);
    const on = next === "week" ? weekAnchor(anchor) : anchor;
    navigate({ pathname: `/calendar/${segmentFor(next, on)}`, search: search.toString() });
  }

  /** A link to one day, in the day view — what clicking a date opens. */
  function dayHref(date: string): string {
    const search = new URLSearchParams(params);
    search.set("view", "day");
    const qs = search.toString();
    return `/calendar/${date}${qs ? `?${qs}` : ""}`;
  }

  const periodLabel =
    view === "month" ? monthLabel(key) : view === "week" ? weekLabel(anchor) : formatLong(anchor);

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
            {view === "month"
              ? `${formatMedium(firstOfMonth(key))} — ${formatMedium(lastOfMonth(key))}`
              : view === "week"
                ? "One week"
                : "One day"}
          </div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-sub">
            Submission deadlines, publication dates and everything in the diary
            that sits around them. Anything running over more than a day is drawn
            once, across the days it covers. Click a date for that day on its own,
            and an entry for the piece itself. The view, the date and the filters
            are all in the URL, so whatever you are looking at can be pasted
            straight into Slack.
          </p>
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

      {/* Below the filters, because the filters narrow what a period contains. */}
      <div className="cal-bar">
        <div className="view-switch" role="group" aria-label="Calendar view">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={v.id === view ? "btn accent" : "btn"}
              onClick={() => setView(v.id)}
              aria-pressed={v.id === view}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="cal-nav">
          <button
            className="btn"
            onClick={() => step(-1)}
            aria-label={`Previous ${view}`}
            title={`Previous ${view}`}
          >
            ←
          </button>
          <div className="cal-period">{periodLabel}</div>
          <button
            className="btn"
            onClick={() => step(1)}
            aria-label={`Next ${view}`}
            title={`Next ${view}`}
          >
            →
          </button>
          <Link to={`/calendar/${segmentFor(view, TODAY)}${view === "month" ? "" : `?view=${view}`}`} className="btn ghost">
            Today
          </Link>
        </div>
      </div>

      {adding && (
        <EntryForm
          defaultDate={anchor > TODAY ? anchor : TODAY}
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
          {view === "day" ? (
            <DayView
              date={anchor}
              chips={chipsForDay(anchor, feed, show, true)}
              people={data.people}
              onRemoveEntry={removeEntry}
            />
          ) : (
          /*
           * Narrow screens scroll the grid sideways rather than being given a
           * different thing to look at: a calendar should look like a
           * calendar, and seven columns squeezed to 390px are not readable,
           * so the columns keep a workable minimum width.
           */
          <div className="calendar-scroll">
          <div className={view === "week" ? "calendar week-view" : "calendar"}>
            <div className="cal-head">
              {WEEKDAYS.map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>
            {(view === "week" ? [week] : grid).map((week) => {
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
                      if (view === "month" && !isSameMonth(date, key)) classes.push("outside");
                      if (isWeekend(date)) classes.push("weekend");
                      if (date === TODAY) classes.push("today");
                      const cap = view === "week" ? chips.length : MAX_CHIPS;
                      const hidden = chips.length - cap;
                      return (
                        <div className={classes.join(" ")} key={date}>
                          {/* The date opens that day on its own. */}
                          <Link
                            className="cal-daynum"
                            to={dayHref(date)}
                            title={`${formatLong(date)} on its own`}
                          >
                            {dayOfMonth(date)}
                          </Link>
                          {lanes > 0 && <div className="cal-lane-space" aria-hidden />}
                          {chips.slice(0, cap).map((chip, i) => (
                            <ChipView
                              key={`${chip.kind}-${i}`}
                              chip={chip}
                              people={data.people}
                              onRemoveEntry={removeEntry}
                            />
                          ))}
                          {hidden > 0 && (
                            <Link className="cal-more" to={dayHref(date)}>
                              +{hidden} more
                            </Link>
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
      to={`/whats-on?type=${bar.item.event.type}&from=calendar`}
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
 * One day in full — what clicking a date opens.
 *
 * Everything on the day, in the order it happens where there is a time and
 * grouped by what it is where there is not, each row going to the same place
 * the same entry goes to from the month grid.
 */
function DayView({
  date,
  chips,
  people,
  onRemoveEntry,
}: {
  date: string;
  chips: Chip[];
  people: Schedule["people"];
  onRemoveEntry: (id: string) => void;
}) {
  // Timed things first, in time order; everything else after, in the order
  // the chip builder produced (mine, diary, submissions, publications).
  const timed = chips
    .filter((c) => c.kind === "session")
    .sort((a, b) =>
      a.kind === "session" && b.kind === "session"
        ? a.session.startTime.localeCompare(b.session.startTime)
        : 0,
    );
  const untimed = chips.filter((c) => c.kind !== "session");
  const ordered = [...timed, ...untimed];

  return (
    <div className="day-view">
      {/*
        A day is reached by clicking a date, so it needs the way back on the
        page. Going back returns to the month you were looking at with its
        filters intact, which rebuilding the address could not do — this day
        does not know them.
      */}
      <div className="crumb-row day-view-back">
        <BackLink to={`/calendar/${monthKey(date)}`} label="Calendar" />
      </div>
      <div className="day-view-head">
        <div className="day-view-date">
          <b>{dayOfMonth(date)}</b>
          <span>{formatWeekday(date)}</span>
        </div>
        <div>
          <div className="eyebrow">
            {date === TODAY ? "Today" : date < TODAY ? "Past" : relativeDays(date)}
          </div>
          <h2>{formatLong(date)}</h2>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {ordered.length === 0
              ? "Nothing in the diary, and nothing due."
              : ordered.length === 1
                ? "One thing on."
                : `${ordered.length} things on.`}
          </p>
        </div>
      </div>

      {ordered.length > 0 && (
        <div className="day-rows">
          {ordered.map((chip, i) => {
            const { title, icon, colour } = chipLabel(chip, people);
            const style = { "--chip-color": colour } as CSSProperties;
            const when = chip.kind === "session" ? chip.session.startTime : "";
            const body = (
              <>
                <span className="day-row-when">{when || "\u2014"}</span>
                <span className="day-row-icon">
                  <Icon name={icon} size={16} />
                </span>
                <span className="day-row-text">
                  <span className="day-row-title">{title}</span>
                  <span className="day-row-meta">{chipMeaning(chip)}</span>
                </span>
                <span className="day-row-go">
                  {chip.kind === "entry" ? "Remove" : "Open"}
                  {chip.kind !== "entry" && <Icon name="link" size={13} />}
                </span>
              </>
            );
            return chip.kind === "entry" ? (
              <button
                key={`${chip.kind}-${i}`}
                className="day-row day-row-button"
                style={style}
                onClick={() => onRemoveEntry(chip.entry.id)}
                title="Yours — click to remove"
              >
                {body}
              </button>
            ) : (
              <Link key={`${chip.kind}-${i}`} className="day-row" style={style} to={chipHref(chip)}>
                {body}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
