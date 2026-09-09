import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useApi } from "../lib/api";
import { Slot, useCustom } from "../lib/custom";
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
  const custom = useCustom();
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
  // Bound once: inside the section callbacks below the narrowing on
  // people.data is lost, and re-checking it in each is noise.
  const team = people.data;
  const forecaster = team.find((p) => p.id === c.forecasterId);
  const clashes = events.data ? clashesFor(c, events.data, team) : [];
  const submitted = c.status !== "not-started" && c.status !== "in-progress" && c.status !== "at-risk";
  const published = c.status === "published";

  return (
    <>
      <div className="breadcrumb">
        <Link to="/deadlines">{custom.text("content.crumb")}</Link> <span>/</span>{" "}
        <span>{c.vertical}</span> <span>/</span> <span>{c.id}</span>
      </div>

      <div className="page-head">
        <div>
          <div className="eyebrow">
            {c.type} · {c.season}
          </div>
          <h1 className="page-title">{c.title}</h1>
          <p className="page-sub">
            Due with {personName(team, c.managerId)} on{" "}
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

          {/*
            The body is a composition rather than a fixed sequence: which
            sections appear, what they are called and in what order is the
            admin's, so a page can be shaped around how the team actually
            works without a deploy.
          */}
          {custom.group("content.section").map((slot) => {
            switch (slot.id) {
              case "content.section.where":
                return (
                  <div key={slot.id}>
                    <Slot
                      id={slot.id}
                      as="h2"
                      className="section-title"
                    />
                    <div className="timeline">
                      {custom.group("content.step").map((step) => {
                        const state =
                          step.id === "content.step.submission"
                            ? submitted || published
                              ? "done"
                              : "next"
                            : step.id === "content.step.review"
                              ? published
                                ? "done"
                                : submitted
                                  ? "next"
                                  : ""
                              : published
                                ? "done"
                                : "";
                        const when =
                          step.id === "content.step.submission"
                            ? `${formatLong(c.submissionDate)} · ${relativeDays(c.submissionDate)}`
                            : step.id === "content.step.review"
                              ? submitted
                                ? "In hand"
                                : "Once the copy lands"
                              : `${formatLong(c.publicationDate)}${
                                  c.publicationDate >= TODAY
                                    ? ` · ${relativeDays(c.publicationDate)}`
                                    : ""
                                }`;
                        return (
                          <div className={`timeline-step ${state}`} key={step.id}>
                            <div className="timeline-dot" />
                            <div>
                              <Slot id={step.id} as="strong" />
                              <div className="timeline-when">{when}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );

              case "content.section.note":
                if (!c.notes) return null;
                return (
                  <div key={slot.id}>
                    <Slot
                      id={slot.id}
                      as="h2"
                      className="section-title"
                    />
                    <p>{c.notes}</p>
                  </div>
                );

              case "content.section.details":
                return (
                  <div key={slot.id} style={{ marginTop: 28 }}>
                    <DetailsPanel
                      item={c}
                      people={team}
                      contentTypes={(taxonomy.data?.contentTypes ?? []).map((t) => t.name)}
                      headingSlot={slot.id}
                    />
                  </div>
                );

              case "content.section.notes":
                return (
                  <section className="section" key={slot.id}>
                    <Notes
                      contentId={c.id}
                      people={team}
                      headingSlot={slot.id}
                    />
                  </section>
                );

              case "content.section.related":
                return (
                  <div key={slot.id}>
                    <Slot
                      id={slot.id}
                      as="h2"
                      className="section-title"
                      suffix={` · ${c.vertical}`}
                    />
                    <RelatedList vertical={c.vertical} excludeId={c.id} />
                  </div>
                );

              default:
                return null;
            }
          })}
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
              {custom.group("content.facts").map((slot) => {
                const value: Record<string, ReactNode> = {
                  "content.facts.reference": c.id,
                  "content.facts.type": c.type,
                  "content.facts.vertical": c.vertical,
                  "content.facts.season": c.season,
                  "content.facts.submission": formatLong(c.submissionDate),
                  "content.facts.publication": formatLong(c.publicationDate),
                  "content.facts.manager": personName(team, c.managerId),
                };
                return (
                  <div className="fact" key={slot.id}>
                    <Slot id={slot.id} as="dt" />
                    <dd>{value[slot.id]}</dd>
                  </div>
                );
              })}
            </dl>
            {custom.shown("content.action.month") && (
              <Link
                to={`/calendar/${monthKey(c.submissionDate)}?forecaster=${c.forecasterId}`}
                className="btn"
                style={{ display: "block", marginTop: 14, textAlign: "center" }}
              >
                <Slot id="content.action.month" />
              </Link>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <PeerReviewPanel
              item={c}
              people={team}
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
