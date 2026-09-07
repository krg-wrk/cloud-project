import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { query, send, useApi } from "../lib/api";
import {
  TODAY,
  formatMedium,
  formatMonthShort,
  formatWeekday,
  monthKey,
  monthLabel,
  relativeDays,
} from "../lib/date";
import {
  KIND_LABELS,
  KIND_ORDER,
  personName,
  signUpState,
  type SignUpState,
} from "../lib/domain";
import { useViewer } from "../lib/viewer";
import type { Person, SessionWithSignUps } from "../types";
import { Avatar, ErrorNote, Loading } from "../components/bits";
import ShareLink from "../components/ShareLink";

/** How the sign-up control reads in each state. */
const ACTION_LABEL: Record<SignUpState, string | null> = {
  "can-sign-up": "Sign up",
  going: "Cancel my place",
  waiting: "Leave the waitlist",
  full: "Join the waitlist",
  closed: null,
  required: null,
  past: null,
};

function Places({ session }: { session: SessionWithSignUps }) {
  if (session.capacity === null) {
    return <div className="places-text">No limit on numbers</div>;
  }
  const taken = session.going.length;
  const left = session.placesLeft ?? 0;
  const tone = left === 0 ? "full" : left <= 3 ? "tight" : "";
  // One tick per place reads well up to about twenty; past that it turns to mush.
  const ticked = session.capacity <= 20;
  return (
    <div className="places">
      <div className="places-bar" aria-hidden>
        {ticked ? (
          Array.from({ length: session.capacity }, (_, i) => (
            <i key={i} className={i < taken ? "taken" : ""} />
          ))
        ) : (
          <i
            className="taken"
            style={{ flex: `0 0 ${(taken / session.capacity) * 100}%` }}
          />
        )}
        {!ticked && <i />}
      </div>
      <div className={`places-text ${tone}`}>
        {left === 0
          ? `Full — ${taken} of ${session.capacity}${
              session.waiting.length ? `, ${session.waiting.length} waiting` : ""
            }`
          : `${left} of ${session.capacity} places left`}
      </div>
    </div>
  );
}

function SessionCard({
  session,
  people,
  onChange,
}: {
  session: SessionWithSignUps;
  people: Person[];
  onChange: (updated: SessionWithSignUps) => void;
}) {
  const { person } = useViewer();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  const state = signUpState(session, person?.id);
  const action = ACTION_LABEL[state];
  const past = state === "past";
  const mine = state === "going" || state === "waiting";

  async function act() {
    if (!person) return;
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
      onChange({
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

  const host = session.hostExternal ?? personName(people, session.hostId);

  return (
    <article
      className={`session${mine ? " mine" : ""}${past ? " session-past" : ""}`}
      style={{ "--kind-color": `var(--kind-${session.kind})` } as CSSProperties}
    >
      <div className="session-when">
        <span className="session-day">{session.date.slice(8)}</span>
        <span className="session-month">{formatMonthShort(session.date)}</span>
        <div>
          {formatWeekday(session.date)} {session.startTime}–{session.endTime}
        </div>
        {!past && <div style={{ marginTop: 4 }}>{relativeDays(session.date)}</div>}
      </div>

      <div>
        <span
          className="pill"
          style={{ "--pill-color": `var(--kind-${session.kind})` } as CSSProperties}
        >
          <i className="dot" />
          {KIND_LABELS[session.kind]}
        </span>
        {session.required && (
          <span className="pill" style={{ "--pill-color": "var(--ink)" } as CSSProperties}>
            <i className="dot" />
            Whole team
          </span>
        )}
        <Link to={`/workshops/${session.id}`} className="session-title" style={{ display: "block", marginTop: 8 }}>
          {session.title}
        </Link>
        <div className="session-host">
          {host} · {session.location}
        </div>
        <p className="session-summary">{session.summary}</p>
        <div className="session-topics">
          {session.topics.map((topic) => (
            <span className="tag" key={topic}>
              {topic}
            </span>
          ))}
        </div>
      </div>

      <div className="session-side">
        {!past && <Places session={session} />}

        {session.going.length > 0 && (
          <>
            <div className="signup-note">
              {past ? "Attended" : "Going"} ({session.going.length})
            </div>
            <div className="attendees">
              {session.going.slice(0, 10).map((id) => (
                <Avatar key={id} id={id} name={personName(people, id)} />
              ))}
            </div>
          </>
        )}

        {state === "going" && <div className="signup-note going">You have a place</div>}
        {state === "waiting" && (
          <div className="signup-note waiting">
            You are {session.waiting.indexOf(person?.id ?? "") + 1} on the waitlist
          </div>
        )}
        {state === "required" && <div className="signup-note">Everyone is expected</div>}
        {state === "closed" && <div className="signup-note">Sign-ups are closed</div>}

        {action && (
          <button className={state === "can-sign-up" ? "btn solid" : "btn"} onClick={act} disabled={busy}>
            {busy ? "Saving…" : action}
          </button>
        )}

        {past && session.recapUrl && (
          <a className="btn" href={session.recapUrl}>
            Notes and recording
          </a>
        )}

        {problem && <div className="signup-note waiting">{problem}</div>}
      </div>
    </article>
  );
}

export default function Workshops() {
  const [params, setParams] = useSearchParams();
  const { person } = useViewer();
  const people = useApi<Person[]>("/people");

  const kind = params.get("kind") ?? "";
  const mineOnly = params.get("mine") === "1";
  const when = params.get("when") === "past" ? "past" : "upcoming";

  const path = `/sessions${query({
    kind: kind || undefined,
    when,
    person: mineOnly ? person?.id : undefined,
  })}`;
  const loaded = useApi<SessionWithSignUps[]>(path);

  // Sign-ups change the list in place, so it is held in state once loaded.
  const [sessions, setSessions] = useState<SessionWithSignUps[]>([]);
  useEffect(() => {
    if (loaded.data) setSessions(loaded.data);
  }, [loaded.data]);

  const onChange = useCallback((updated: SessionWithSignUps) => {
    setSessions((current) => current.map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  function setParam(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  }

  if (loaded.error) return <ErrorNote message={loaded.error} />;

  const byMonth = new Map<string, SessionWithSignUps[]>();
  for (const session of sessions) {
    const key = monthKey(session.date);
    byMonth.set(key, [...(byMonth.get(key) ?? []), session]);
  }
  const months = [...byMonth.entries()];
  if (when === "past") months.reverse();

  const myCount = person
    ? sessions.filter((s) => s.going.includes(person.id) || s.waiting.includes(person.id)).length
    : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Workshops · masterclasses · lunch &amp; learns</div>
          <h1 className="page-title">Learning</h1>
          <p className="page-sub">
            What is coming up across the team, and what you can put your name
            down for. Sessions with a limit fill up, so the waitlist moves you
            into a place when someone drops out.
          </p>
        </div>
        <ShareLink label="Copy link" />
      </div>

      <div className="filters">
        <div className="field">
          <label>When</label>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className={when === "upcoming" ? "btn accent" : "btn"}
              onClick={() => setParam("when", "")}
            >
              Coming up
            </button>
            <button
              className={when === "past" ? "btn accent" : "btn"}
              onClick={() => setParam("when", "past")}
            >
              Been and gone
            </button>
          </div>
        </div>
        <div className="field">
          <label>Kind</label>
          <div className="kind-rail">
            <button className={kind === "" ? "btn accent" : "btn"} onClick={() => setParam("kind", "")}>
              Everything
            </button>
            {KIND_ORDER.map((k) => (
              <button
                key={k}
                className={kind === k ? "btn accent" : "btn"}
                onClick={() => setParam("kind", k)}
              >
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="filters-right">
          <button
            className={mineOnly ? "btn accent" : "btn"}
            onClick={() => setParam("mine", mineOnly ? "" : "1")}
          >
            {mineOnly ? "Showing mine" : `Just mine${myCount ? ` (${myCount})` : ""}`}
          </button>
        </div>
      </div>

      {loaded.loading && sessions.length === 0 ? (
        <Loading what="the programme" />
      ) : sessions.length === 0 ? (
        <div className="empty">
          {mineOnly
            ? "You have not signed up for anything yet."
            : "Nothing in the programme for that filter."}
        </div>
      ) : (
        months.map(([key, list]) => (
          <div key={key}>
            <h2 className="month-heading">{monthLabel(key)}</h2>
            {list.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                people={people.data ?? []}
                onChange={onChange}
              />
            ))}
          </div>
        ))
      )}

      {when === "upcoming" && (
        <p className="page-sub" style={{ marginTop: 26, fontSize: 12.5 }}>
          Running something worth sharing?{" "}
          <a href="mailto:graham.krag@wgsn.com" style={{ color: "var(--accent)" }}>
            Tell a commissioning manager
          </a>{" "}
          and it goes on here. Sessions before {formatMedium(TODAY)} are under
          &ldquo;been and gone&rdquo;, with notes and recordings where we have them.
        </p>
      )}
    </>
  );
}
