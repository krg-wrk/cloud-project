import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApi } from "../lib/api";
import { TODAY, formatLong, formatShort, monthKey, relativeDays } from "../lib/date";
import { STATUS_LABELS, clashesFor, isOverdue, personName } from "../lib/domain";
import type { CalendarEvent, ContentItem, PeerReview, Person, Taxonomy } from "../types";
import { Avatar, ErrorNote, EventPill, Loading, StatusPill } from "../components/bits";
import DetailsPanel from "../components/DetailsPanel";
import Notes from "../components/Notes";
import PeerReviewPanel from "../components/PeerReviewPanel";
import ShareLink from "../components/ShareLink";

export default function ContentDetail() {
  const { id } = useParams<{ id: string }>();
  const item = useApi<ContentItem>(`/content/${id}`);
  const people = useApi<Person[]>("/people");
  const events = useApi<CalendarEvent[]>("/events");
  const taxonomy = useApi<Taxonomy>("/taxonomy");

  const [review, setReview] = useState<PeerReview | null>(null);
  useEffect(() => {
    if (item.data) setReview(item.data.peerReview ?? null);
  }, [item.data]);

  if (item.error) return <ErrorNote message={item.error} />;
  if (!item.data || !people.data) return <Loading what="this forecast" />;

  const c = item.data;
  const forecaster = people.data.find((p) => p.id === c.forecasterId);
  const clashes = events.data ? clashesFor(c, events.data, people.data) : [];
  const submitted = c.status !== "not-started" && c.status !== "in-progress" && c.status !== "at-risk";
  const published = c.status === "published";

  return (
    <>
      <div className="breadcrumb">
        <Link to="/deadlines">Deadlines</Link> <span>/</span>{" "}
        <span>{c.vertical}</span> <span>/</span> <span>{c.id}</span>
      </div>

      <div className="page-head">
        <div>
          <div className="eyebrow">
            {c.type} · {c.season}
          </div>
          <h1 className="page-title">{c.title}</h1>
          <p className="page-sub">
            Due with {personName(people.data, c.managerId)} on{" "}
            <strong>{formatLong(c.submissionDate)}</strong> ({relativeDays(c.submissionDate)}),
            publishing {formatLong(c.publicationDate)}.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <StatusPill status={c.status} />
          <ShareLink label="Copy link" />
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-body">
          {isOverdue(c) && (
            <div className="callout" style={{ marginBottom: 20 }}>
              <strong>This one is past its submission date.</strong> Copy was due{" "}
              {formatLong(c.submissionDate)} and the status is still{" "}
              {STATUS_LABELS[c.status].toLowerCase()}. Publication is{" "}
              {formatLong(c.publicationDate)}.
            </div>
          )}

          {clashes.length > 0 && (
            <div className="callout" style={{ marginBottom: 20 }}>
              <strong>Deadline clash.</strong> The submission date falls inside{" "}
              {clashes.map((e) => e.title.toLowerCase()).join(" and ")}
              {forecaster ? ` for ${forecaster.name}` : ""}.
            </div>
          )}

          <h2 className="section-title" style={{ marginBottom: 4 }}>
            Where it is
          </h2>
          <div className="timeline">
            <div className={`timeline-step ${submitted || published ? "done" : "next"}`}>
              <div className="timeline-dot" />
              <div>
                <strong>Copy due with the commissioning manager</strong>
                <div className="timeline-when">
                  {formatLong(c.submissionDate)} · {relativeDays(c.submissionDate)}
                </div>
              </div>
            </div>
            <div
              className={`timeline-step ${published ? "done" : submitted ? "next" : ""}`}
            >
              <div className="timeline-dot" />
              <div>
                <strong>Edit and review</strong>
                <div className="timeline-when">
                  {submitted ? "In hand" : "Once the copy lands"}
                </div>
              </div>
            </div>
            <div className={`timeline-step ${published ? "done" : ""}`}>
              <div className="timeline-dot" />
              <div>
                <strong>Live on the platform</strong>
                <div className="timeline-when">
                  {formatLong(c.publicationDate)}
                  {c.publicationDate >= TODAY && ` · ${relativeDays(c.publicationDate)}`}
                </div>
              </div>
            </div>
          </div>

          {c.notes && (
            <>
              <h2 className="section-title" style={{ margin: "26px 0 6px" }}>
                Commissioning note
              </h2>
              <p>{c.notes}</p>
            </>
          )}

          <div style={{ marginTop: 28 }}>
            <DetailsPanel
              item={c}
              people={people.data}
              contentTypes={(taxonomy.data?.contentTypes ?? []).map((t) => t.name)}
            />
          </div>

          <section className="section">
            <Notes contentId={c.id} people={people.data} />
          </section>

          <h2 className="section-title" style={{ margin: "26px 0 10px" }}>
            Also in {c.vertical}
          </h2>
          <RelatedList vertical={c.vertical} excludeId={c.id} />
        </div>

        <aside>
          <div className="card">
            {forecaster && (
              <Link
                to={`/team/${forecaster.id}`}
                style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}
              >
                <Avatar id={forecaster.id} name={forecaster.name} size="lg" />
                <div>
                  <div className="person-name">{forecaster.name}</div>
                  <div className="person-meta">
                    {forecaster.vertical} · {forecaster.region}
                  </div>
                </div>
              </Link>
            )}
            <dl className="facts">
              <div className="fact">
                <dt>Reference</dt>
                <dd>{c.id}</dd>
              </div>
              <div className="fact">
                <dt>Type</dt>
                <dd>{c.type}</dd>
              </div>
              <div className="fact">
                <dt>Vertical</dt>
                <dd>{c.vertical}</dd>
              </div>
              <div className="fact">
                <dt>Season</dt>
                <dd>{c.season}</dd>
              </div>
              <div className="fact">
                <dt>Submission</dt>
                <dd>{formatLong(c.submissionDate)}</dd>
              </div>
              <div className="fact">
                <dt>Publication</dt>
                <dd>{formatLong(c.publicationDate)}</dd>
              </div>
              <div className="fact">
                <dt>Commissioned by</dt>
                <dd>{personName(people.data, c.managerId)}</dd>
              </div>
            </dl>
            <Link
              to={`/calendar/${monthKey(c.submissionDate)}?forecaster=${c.forecasterId}`}
              className="btn"
              style={{ display: "block", marginTop: 14, textAlign: "center" }}
            >
              See this month
            </Link>
          </div>

          <div style={{ marginTop: 12 }}>
            <PeerReviewPanel
              item={c}
              people={people.data}
              review={review}
              onChange={setReview}
            />
          </div>

          {clashes.length > 0 && (
            <div className="card" style={{ marginTop: 14 }}>
              <div className="nav-label" style={{ padding: 0 }}>
                Around the deadline
              </div>
              {clashes.map((e) => (
                <div key={e.id} style={{ marginTop: 10 }}>
                  <EventPill type={e.type} />
                  <div style={{ fontSize: 12, color: "var(--ink-70)", marginTop: 4 }}>
                    {e.title} · {formatLong(e.startDate)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function RelatedList({ vertical, excludeId }: { vertical: string; excludeId: string }) {
  const { data } = useApi<ContentItem[]>(
    `/content?vertical=${encodeURIComponent(vertical)}`,
  );
  const rows = (data ?? []).filter((r) => r.id !== excludeId).slice(0, 5);
  if (rows.length === 0) return <div className="empty">Nothing else in this vertical.</div>;
  return (
    <div className="deadline-list">
      {rows.map((r) => (
        <Link key={r.id} to={`/content/${r.id}`} className="deadline">
          <div className="deadline-date">{formatShort(r.publicationDate)}</div>
          <div>
            <div className="deadline-title">{r.title}</div>
            <div className="deadline-meta">
              {r.type} · {r.season}
            </div>
          </div>
          <div className="deadline-right">
            <StatusPill status={r.status} />
          </div>
        </Link>
      ))}
    </div>
  );
}
