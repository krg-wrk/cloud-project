import { Link } from "react-router-dom";
import { useApi } from "../lib/api";
import {
  TODAY,
  formatShort,
  monthKey,
  relativeDays,
} from "../lib/date";
import {
  clashesFor,
  isOutstanding,
  isOverdue,
  personName,
} from "../lib/domain";
import { useViewer } from "../lib/viewer";
import type { ContentItem, Schedule } from "../types";
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
  const { person, isManager } = useViewer();
  const { data, error, loading } = useApi<Schedule>("/schedule");

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
          <h1 className="page-title">Morning, {firstName}</h1>
          <p className="page-sub">
            {isManager
              ? "Everything in commission across the team, with the deadlines closest to landing first."
              : "Your submission deadlines, what publishes next, and anything in the diary that gets in the way."}
          </p>
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

      {overdue.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Past deadline</h2>
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

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Next up</h2>
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

      {clashing.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Worth a look</h2>
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
        <div>
          <div className="section-head">
            <h2 className="section-title">Publishing soon</h2>
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

        <div>
          <div className="section-head">
            <h2 className="section-title">In the diary</h2>
            <Link to="/whats-on" className="section-link">
              What&rsquo;s on →
            </Link>
          </div>
          <div className="deadline-list">
            {upcomingEvents.map((event) => (
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
      </div>

      {isManager && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Who&rsquo;s carrying what</h2>
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
