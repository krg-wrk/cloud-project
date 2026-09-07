import { Link, useParams } from "react-router-dom";
import { query, useApi } from "../lib/api";
import { TODAY, formatLong, formatShort, monthKey, relativeDays } from "../lib/date";
import { isOutstanding, isOverdue } from "../lib/domain";
import type { ContentItem, Person, Schedule } from "../types";
import { Avatar, ErrorNote, EventPill, Loading, StatusPill } from "../components/bits";
import ShareLink from "../components/ShareLink";

export function TeamList() {
  const people = useApi<Person[]>("/people");
  const content = useApi<ContentItem[]>("/content");

  if (people.error) return <ErrorNote message={people.error} />;
  if (!people.data || !content.data) return <Loading what="the team" />;

  const forecasters = people.data.filter((p) => p.role === "forecaster");

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{forecasters.length} forecasters</div>
          <h1 className="page-title">The team</h1>
          <p className="page-sub">
            Each forecaster has their own page — their deadlines, their leave,
            and a link they can bookmark.
          </p>
        </div>
      </div>

      <div className="people-grid">
        {forecasters.map((p) => {
          const theirs = content.data!.filter((c) => c.forecasterId === p.id);
          const open = theirs.filter(isOutstanding);
          const late = theirs.filter((c) => isOverdue(c));
          const next = open
            .filter((c) => c.submissionDate >= TODAY)
            .sort((a, b) => a.submissionDate.localeCompare(b.submissionDate))[0];
          return (
            <Link key={p.id} to={`/team/${p.id}`} className="person-card">
              <Avatar id={p.id} name={p.name} size="lg" />
              <div style={{ minWidth: 0 }}>
                <div className="person-name">{p.name}</div>
                <div className="person-meta">
                  {p.vertical} · {p.region}
                </div>
                <div className="person-counts">
                  <span>
                    <b>{open.length}</b> open
                  </span>
                  <span>
                    <b>{theirs.length}</b> commissioned
                  </span>
                  {late.length > 0 && (
                    <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                      {late.length} late
                    </span>
                  )}
                </div>
                {next && (
                  <div className="person-meta" style={{ marginTop: 8 }}>
                    Next: {formatShort(next.submissionDate)} · {relativeDays(next.submissionDate)}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

export function TeamMember() {
  const { id } = useParams<{ id: string }>();
  const person = useApi<Person>(`/people/${id}`);
  const schedule = useApi<Schedule>(`/schedule${query({ forecaster: id })}`);

  if (person.error) return <ErrorNote message={person.error} />;
  if (!person.data || !schedule.data) return <Loading what="this forecaster" />;

  const p = person.data;
  const theirs = schedule.data.content;
  const open = theirs.filter(isOutstanding);
  const late = theirs.filter((c) => isOverdue(c));
  const events = schedule.data.events.filter((e) => e.endDate >= TODAY);

  return (
    <>
      <div className="breadcrumb">
        <Link to="/team">The team</Link> <span>/</span> <span>{p.name}</span>
      </div>

      <div className="page-head">
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Avatar id={p.id} name={p.name} size="lg" />
          <div>
            <div className="eyebrow">
              {p.vertical} · {p.region}
            </div>
            <h1 className="page-title">{p.name}</h1>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to={`/calendar/${monthKey(TODAY)}?forecaster=${p.id}`} className="btn">
            Their calendar
          </Link>
          <ShareLink label="Copy link" />
        </div>
      </div>

      <div className="stat-row">
        <div className={late.length ? "stat alarm" : "stat"}>
          <div className="stat-value">{late.length}</div>
          <div className="stat-label">Past deadline</div>
        </div>
        <div className="stat">
          <div className="stat-value">{open.length}</div>
          <div className="stat-label">Still to write</div>
        </div>
        <div className="stat">
          <div className="stat-value">
            {theirs.filter((c) => c.status === "published").length}
          </div>
          <div className="stat-label">Published</div>
        </div>
        <div className="stat">
          <div className="stat-value">{theirs.length}</div>
          <div className="stat-label">Commissioned</div>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Deadlines</h2>
          <Link to={`/deadlines?forecaster=${p.id}`} className="section-link">
            Filter the full table →
          </Link>
        </div>
        <div className="deadline-list">
          {theirs
            .slice()
            .sort((a, b) => a.submissionDate.localeCompare(b.submissionDate))
            .map((item) => (
              <Link key={item.id} to={`/content/${item.id}`} className="deadline">
                <div className={isOverdue(item) ? "deadline-date urgent" : "deadline-date"}>
                  {formatShort(item.submissionDate)}
                  <span className="rel">{relativeDays(item.submissionDate)}</span>
                </div>
                <div>
                  <div className="deadline-title">{item.title}</div>
                  <div className="deadline-meta">
                    {item.type} · {item.season} · publishes {formatShort(item.publicationDate)}
                  </div>
                </div>
                <div className="deadline-right">
                  <StatusPill status={item.status} />
                </div>
              </Link>
            ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Their diary</h2>
        </div>
        {events.length === 0 ? (
          <div className="empty">Nothing booked in.</div>
        ) : (
          <div className="deadline-list">
            {events.map((e) => (
              <div key={e.id} className="deadline">
                <div className="deadline-date">
                  {formatShort(e.startDate)}
                  {e.endDate !== e.startDate && ` – ${formatShort(e.endDate)}`}
                </div>
                <div>
                  <div className="deadline-title">{e.title}</div>
                  <div className="deadline-meta">
                    {e.location ?? e.region ?? formatLong(e.startDate)}
                  </div>
                </div>
                <div className="deadline-right">
                  <EventPill type={e.type} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
