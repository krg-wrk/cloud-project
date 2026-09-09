import { Link } from "react-router-dom";
import { useApi } from "../lib/api";
import {
  TODAY,
  formatShort,
  monthKey,
  relativeDays,
} from "../lib/date";
import { Slot, useCustom } from "../lib/custom";
import {
  KIND_LABELS,
  clashesFor,
  isOutstanding,
  isOverdue,
  personName,
} from "../lib/domain";
import { useViewer } from "../lib/viewer";
import type { ContentItem, Schedule, SessionWithSignUps } from "../types";
import { ErrorNote, EventPill, Loading, StatusPill, Who } from "../components/bits";

function DeadlineRow({
  item,
  people,
  showOwner,
}: {
  item: ContentItem;
  people: Schedule["people"];
  showOwner?: boolean;
}) {
  const days = relativeDays(item.submissionDate);
  const urgent = isOverdue(item) || days === "today" || days === "tomorrow";
  return (
    <Link to={`/content/${item.id}`} className="deadline">
      <div className={urgent ? "deadline-date urgent" : "deadline-date"}>
        {formatShort(item.submissionDate)}
        <span className="rel">{isOverdue(item) ? `late — ${days}` : days}</span>
      </div>
      <div>
        <div className="deadline-title">{item.title}</div>
        <div className="deadline-meta">
          {item.type} · {item.vertical} · {item.season}
          {showOwner && ` · ${personName(people, item.forecasterId)}`}
        </div>
      </div>
      <div className="deadline-right">
        <StatusPill status={item.status} />
      </div>
    </Link>
  );
}

export default function Today() {
  const custom = useCustom();
  const { person, isManager } = useViewer();
  const { data, error, loading } = useApi<Schedule>("/schedule");
  const sessions = useApi<SessionWithSignUps[]>(
    person ? `/sessions?when=upcoming&person=${person.id}` : "/sessions?when=upcoming",
  );
  const mySessions = person ? (sessions.data ?? []) : [];

  if (error) return <ErrorNote message={error} />;
  if (loading || !data) return <Loading />;

  const scoped = isManager
    ? data.content
    : data.content.filter((c) => c.forecasterId === person?.id);

  const outstanding = scoped.filter(isOutstanding);
  const overdue = outstanding.filter((c) => isOverdue(c));
  const next = outstanding
    .filter((c) => c.submissionDate >= TODAY)
    .sort((a, b) => a.submissionDate.localeCompare(b.submissionDate));
  const inTwoWeeks = next.filter(
    (c) => c.submissionDate <= addDays(TODAY, 14),
  );
  const publishingSoon = scoped
    .filter((c) => c.publicationDate >= TODAY)
    .sort((a, b) => a.publicationDate.localeCompare(b.publicationDate))
    .slice(0, 5);

  const upcomingEvents = data.events
    .filter((e) => e.endDate >= TODAY)
    .filter((e) => (isManager ? true : !e.personId || e.personId === person?.id))
    .slice(0, 5);

  const clashing = outstanding
    .map((item) => ({ item, clashes: clashesFor(item, data.events, data.people) }))
    .filter((row) => row.clashes.length > 0)
    .slice(0, 3);

  const firstName = person?.name.split(" ")[0] ?? "there";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {new Date(`${TODAY}T00:00:00Z`).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            })}
          </div>
          <h1 className="page-title">
            <Slot id="today.greeting" />, {firstName}
          </h1>
          <Slot
            id={isManager ? "today.sub.team" : "today.sub.mine"}
            as="p"
            className="page-sub"
          />
        </div>
        <Link to={`/calendar/${monthKey(TODAY)}`} className="btn">
          Open the calendar
        </Link>
      </div>

      <div className="stat-row">
        <div className={overdue.length ? "stat alarm" : "stat"}>
          <div className="stat-value">{overdue.length}</div>
          <div className="stat-label">Past deadline</div>
        </div>
        <div className="stat">
          <div className="stat-value">{inTwoWeeks.length}</div>
          <div className="stat-label">Due in 14 days</div>
        </div>
        <div className="stat">
          <div className="stat-value">{outstanding.length}</div>
          <div className="stat-label">Still to write</div>
        </div>
        <div className="stat">
          <div className="stat-value">
            {scoped.filter((c) => c.status === "published").length}
          </div>
          <div className="stat-label">Published</div>
        </div>
      </div>

      {overdue.length > 0 && custom.shown("today.section.overdue") && (
        <section className="section">
          <div className="section-head">
            <Slot id="today.section.overdue" as="h2" className="section-title" />
            <Link to="/deadlines?status=at-risk" className="section-link">
              All at-risk work →
            </Link>
          </div>
          <div className="deadline-list">
            {overdue.map((item) => (
              <DeadlineRow
                key={item.id}
                item={item}
                people={data.people}
                showOwner={isManager}
              />
            ))}
          </div>
        </section>
      )}

      {custom.shown("today.section.next") && (
      <section className="section">
        <div className="section-head">
          <Slot id="today.section.next" as="h2" className="section-title" />
          <Link to="/deadlines" className="section-link">
            Every deadline →
          </Link>
        </div>
        {next.length === 0 ? (
          <div className="empty">Nothing outstanding. Enjoy it.</div>
        ) : (
          <div className="deadline-list">
            {next.slice(0, 6).map((item) => (
              <DeadlineRow
                key={item.id}
                item={item}
                people={data.people}
                showOwner={isManager}
              />
            ))}
          </div>
        )}
      </section>
      )}

      {clashing.length > 0 && custom.shown("today.section.review") && (
        <section className="section">
          <div className="section-head">
            <Slot id="today.section.review" as="h2" className="section-title" />
          </div>
          {clashing.map(({ item, clashes }) => (
            <div className="callout" key={item.id} style={{ marginBottom: 8 }}>
              <Link to={`/content/${item.id}`}>
                <strong>{item.title}</strong>
              </Link>{" "}
              is due {formatShort(item.submissionDate)}, which falls inside{" "}
              {clashes.map((c) => c.title.toLowerCase()).join(" and ")}
              {item.forecasterId !== person?.id &&
                ` for ${personName(data.people, item.forecasterId)}`}
              .
            </div>
          ))}
        </section>
      )}

      <div
        className="section"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}
      >
        {custom.shown("today.section.publishing") && (
        <div>
          <div className="section-head">
            <Slot id="today.section.publishing" as="h2" className="section-title" />
          </div>
          <div className="deadline-list">
            {publishingSoon.map((item) => (
              <Link key={item.id} to={`/content/${item.id}`} className="deadline">
                <div className="deadline-date">
                  {formatShort(item.publicationDate)}
                  <span className="rel">{relativeDays(item.publicationDate)}</span>
                </div>
                <div>
                  <div className="deadline-title">{item.title}</div>
                  <div className="deadline-meta">
                    {item.vertical} · {personName(data.people, item.forecasterId)}
                  </div>
                </div>
                <div className="deadline-right" />
              </Link>
            ))}
          </div>
        </div>
        )}

        {custom.shown(
          mySessions.length > 0 ? "today.section.sessions" : "today.section.diary",
        ) && (
        <div>
          <div className="section-head">
            <Slot
              id={mySessions.length > 0 ? "today.section.sessions" : "today.section.diary"}
              as="h2"
              className="section-title"
            />
            <Link to={mySessions.length > 0 ? "/workshops?mine=1" : "/whats-on"} className="section-link">
              {mySessions.length > 0 ? "Learning →" : "What’s on →"}
            </Link>
          </div>
          <div className="deadline-list">
            {mySessions.slice(0, 5).map((session) => (
              <Link key={session.id} to={`/workshops/${session.id}`} className="deadline">
                <div className="deadline-date">
                  {formatShort(session.date)}
                  <span className="rel">{session.startTime}</span>
                </div>
                <div>
                  <div className="deadline-title">{session.title}</div>
                  <div className="deadline-meta">
                    {KIND_LABELS[session.kind]} · {session.location}
                  </div>
                </div>
                <div className="deadline-right">
                  {session.waiting.includes(person?.id ?? "") ? (
                    <span className="tag">Waitlist</span>
                  ) : null}
                </div>
              </Link>
            ))}
            {mySessions.length === 0 &&
              upcomingEvents.map((event) => (
              <div key={event.id} className="deadline">
                <div className="deadline-date">
                  {formatShort(event.startDate)}
                  <span className="rel">{relativeDays(event.startDate)}</span>
                </div>
                <div>
                  <div className="deadline-title">{event.title}</div>
                  <div className="deadline-meta">
                    {event.personId
                      ? personName(data.people, event.personId)
                      : (event.location ?? event.region ?? "Everyone")}
                  </div>
                </div>
                <div className="deadline-right">
                  <EventPill type={event.type} />
                </div>
              </div>
              ))}
          </div>
        </div>
        )}
      </div>

      {isManager && custom.shown("today.section.team") && (
        <section className="section">
          <div className="section-head">
            <Slot id="today.section.team" as="h2" className="section-title" />
            <Link to="/team" className="section-link">
              The team →
            </Link>
          </div>
          <div className="deadline-list">
            {data.people
              .filter((p) => p.role === "forecaster")
              .map((p) => {
                const theirs = data.content.filter((c) => c.forecasterId === p.id);
                const open = theirs.filter(isOutstanding).length;
                const late = theirs.filter((c) => isOverdue(c)).length;
                return (
                  <Link key={p.id} to={`/team/${p.id}`} className="deadline">
                    <div className="deadline-date">{open} open</div>
                    <div>
                      <div className="deadline-title">
                        <Who id={p.id} name={p.name} />
                      </div>
                      <div className="deadline-meta">
                        {p.vertical} · {p.region}
                      </div>
                    </div>
                    <div className="deadline-right">
                      {late > 0 && (
                        <span className="tag" style={{ color: "var(--accent)" }}>
                          {late} past deadline
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
          </div>
        </section>
      )}
    </>
  );
}

function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
