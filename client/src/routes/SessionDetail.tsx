import { useEffect, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { query, send, useApi } from "../lib/api";
import { formatLong, monthKey, relativeDays } from "../lib/date";
import { KIND_LABELS, personName, signUpState } from "../lib/domain";
import { useViewer } from "../lib/viewer";
import type { Person, SessionWithSignUps } from "../types";
import { Avatar, ErrorNote, Loading, Who } from "../components/bits";
import ShareLink from "../components/ShareLink";

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const { person } = useViewer();
  const loaded = useApi<SessionWithSignUps>(`/sessions/${id}`);
  const people = useApi<Person[]>("/people");

  const [session, setSession] = useState<SessionWithSignUps>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  useEffect(() => {
    if (loaded.data) setSession(loaded.data);
  }, [loaded.data]);

  if (loaded.error) return <ErrorNote message={loaded.error} />;
  if (!session || !people.data) return <Loading what="this session" />;

  const state = signUpState(session, person?.id);
  const host = session.hostExternal ?? personName(people.data, session.hostId);

  async function act() {
    if (!person || !session) return;
    setBusy(true);
    setProblem(undefined);
    const leaving = state === "going" || state === "waiting";
    try {
      const res = await send<{ signUps: { going: string[]; waiting: string[] } }>(
        leaving
          ? `/sessions/${session.id}/sign-up${query({ personId: person.id })}`
          : `/sessions/${session.id}/sign-up`,
        leaving ? "DELETE" : "POST",
        leaving ? undefined : { personId: person.id },
      );
      const going = res.signUps.going;
      setSession({
        ...session,
        going,
        waiting: res.signUps.waiting,
        placesLeft: session.capacity === null ? null : Math.max(0, session.capacity - going.length),
        full: session.capacity !== null && going.length >= session.capacity,
      });
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const action =
    state === "can-sign-up"
      ? "Sign up"
      : state === "full"
        ? "Join the waitlist"
        : state === "going"
          ? "Cancel my place"
          : state === "waiting"
            ? "Leave the waitlist"
            : null;

  return (
    <>
      <div className="breadcrumb">
        <Link to="/workshops">Learning</Link> <span>/</span>{" "}
        <span>{KIND_LABELS[session.kind]}</span> <span>/</span> <span>{session.id}</span>
      </div>

      <div className="page-head">
        <div>
          <div className="eyebrow">
            {KIND_LABELS[session.kind]} · {formatLong(session.date)} ·{" "}
            {session.startTime}–{session.endTime}
          </div>
          <h1 className="page-title">{session.title}</h1>
          <p className="page-sub">
            Hosted by {host} · {session.location}
            {state !== "past" && ` · ${relativeDays(session.date)}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {action && (
            <button
              className={state === "can-sign-up" ? "btn solid" : "btn"}
              onClick={act}
              disabled={busy}
            >
              {busy ? "Saving…" : action}
            </button>
          )}
          <ShareLink label="Copy link" />
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-body">
          {state === "going" && (
            <div className="callout" style={{ marginBottom: 18 }}>
              <strong>You have a place.</strong> Cancel if you can&rsquo;t make it — someone on the
              waitlist takes it straight away.
            </div>
          )}
          {state === "waiting" && (
            <div className="callout warn" style={{ marginBottom: 18 }}>
              <strong>
                You are {session.waiting.indexOf(person?.id ?? "") + 1} on the waitlist.
              </strong>{" "}
              You move into a place automatically if someone drops out.
            </div>
          )}
          {problem && (
            <div className="callout warn" style={{ marginBottom: 18 }}>
              {problem}
            </div>
          )}

          <h2 className="section-title" style={{ marginBottom: 8 }}>
            What it covers
          </h2>
          <p>{session.summary}</p>

          <div className="session-topics" style={{ marginBottom: 24 }}>
            {session.topics.map((topic) => (
              <span className="tag" key={topic}>
                {topic}
              </span>
            ))}
          </div>

          <h2 className="section-title" style={{ marginBottom: 10 }}>
            Who&rsquo;s going ({session.going.length})
          </h2>
          {session.going.length === 0 ? (
            <div className="empty">Nobody yet. Be the first.</div>
          ) : (
            <div className="deadline-list">
              {session.going.map((personId) => (
                <Link key={personId} to={`/team/${personId}`} className="deadline">
                  <div className="deadline-date">
                    {personId === session.hostId ? "Host" : ""}
                  </div>
                  <div>
                    <div className="deadline-title">
                      <Who id={personId} name={personName(people.data!, personId)} />
                    </div>
                  </div>
                  <div className="deadline-right" />
                </Link>
              ))}
            </div>
          )}

          {session.waiting.length > 0 && (
            <>
              <h2 className="section-title" style={{ margin: "24px 0 10px" }}>
                Waitlist ({session.waiting.length})
              </h2>
              <div className="deadline-list">
                {session.waiting.map((personId, i) => (
                  <div key={personId} className="deadline">
                    <div className="deadline-date">{i + 1}</div>
                    <div>
                      <div className="deadline-title">
                        <Who id={personId} name={personName(people.data!, personId)} />
                      </div>
                    </div>
                    <div className="deadline-right" />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <aside>
          <div className="card">
            <dl className="facts">
              <div className="fact">
                <dt>Date</dt>
                <dd>{formatLong(session.date)}</dd>
              </div>
              <div className="fact">
                <dt>Time</dt>
                <dd>
                  {session.startTime}–{session.endTime}
                </dd>
              </div>
              <div className="fact">
                <dt>Where</dt>
                <dd>{session.location}</dd>
              </div>
              <div className="fact">
                <dt>Format</dt>
                <dd>{session.online ? "Remote" : "In person"}</dd>
              </div>
              <div className="fact">
                <dt>Places</dt>
                <dd>
                  {session.capacity === null
                    ? "No limit"
                    : `${session.going.length} of ${session.capacity}`}
                </dd>
              </div>
              <div className="fact">
                <dt>Host</dt>
                <dd>{host}</dd>
              </div>
            </dl>

            {session.hostId && (
              <Link
                to={`/team/${session.hostId}`}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: "1px solid var(--rule)",
                }}
              >
                <Avatar
                  id={session.hostId}
                  name={personName(people.data, session.hostId)}
                  size="lg"
                />
                <div>
                  <div className="person-name">{personName(people.data, session.hostId)}</div>
                  <div className="person-meta">Hosting this session</div>
                </div>
              </Link>
            )}

            <Link
              to={`/calendar/${monthKey(session.date)}`}
              className="btn"
              style={{ display: "block", marginTop: 14, textAlign: "center" }}
            >
              See this month
            </Link>
          </div>

          {session.recapUrl && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                After the session
              </div>
              <a
                className="btn"
                href={session.recapUrl}
                style={{ display: "block", textAlign: "center" }}
              >
                Notes and recording
              </a>
            </div>
          )}

          <div
            className="card"
            style={
              {
                marginTop: 12,
                borderLeft: "3px solid var(--kind-color)",
                "--kind-color": `var(--kind-${session.kind})`,
              } as CSSProperties
            }
          >
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              {KIND_LABELS[session.kind]}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-70)" }}>
              {session.kind === "lunch-and-learn"
                ? "Short, informal, over lunch. No preparation expected."
                : session.kind === "masterclass"
                  ? "A deep session on one subject, usually with a specialist host."
                  : session.kind === "critique"
                    ? "We read each other's work and say what isn't landing."
                    : session.kind === "training"
                      ? "Practical skills session — bring your own work to it."
                      : "Working session with an output the whole team uses."}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
