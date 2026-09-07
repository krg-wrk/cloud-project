import { NavLink, Outlet } from "react-router-dom";
import { devViewer, setDevViewer, useApi } from "../lib/api";
import { TODAY, monthKey } from "../lib/date";
import { isOutstanding, isOverdue } from "../lib/domain";
import { ViewerProvider, useViewer } from "../lib/viewer";
import type { ContentItem, Me, Person, SessionWithSignUps } from "../types";
import { Avatar, ErrorNote, Loading } from "./bits";

const ROLE_LABELS: Record<Me["role"], string> = {
  forecaster: "Forecaster",
  "commissioning-manager": "Commissioning manager",
  admin: "Admin",
};

/**
 * Dev-only account switcher. With SSO in front the account comes from the
 * proxy and this disappears; it is here so the Hub can be shown and tested
 * as any of the team without an identity provider.
 */
function AccountSwitch({ people }: { people: Person[] }) {
  const { me } = useViewer();
  return (
    <div className="viewer-switch">
      <label htmlFor="account">Signed in as (demo)</label>
      <select
        id="account"
        value={me.email}
        onChange={(e) => {
          setDevViewer(e.target.value);
          window.location.reload();
        }}
      >
        <optgroup label="Forecasters">
          {people
            .filter((p) => p.role === "forecaster")
            .map((p) => (
              <option key={p.id} value={p.email}>
                {p.name}
              </option>
            ))}
        </optgroup>
        <optgroup label="Commissioning managers">
          {people
            .filter((p) => p.role === "commissioning-manager")
            .map((p) => (
              <option key={p.id} value={p.email}>
                {p.name}
              </option>
            ))}
        </optgroup>
      </select>
    </div>
  );
}

function Sidebar({ content }: { content: ContentItem[] }) {
  const { me, person, people, isManager } = useViewer();
  const scope = isManager ? content : content.filter((c) => c.forecasterId === person?.id);
  const outstanding = scope.filter(isOutstanding).length;
  const overdue = scope.filter((c) => isOverdue(c)).length;

  const sessions = useApi<SessionWithSignUps[]>(
    person ? `/sessions?when=upcoming&person=${person.id}` : "/sessions?when=upcoming",
  );
  const mySessions = person ? (sessions.data?.length ?? 0) : 0;

  return (
    <aside className="sidebar">
      <NavLink to="/" className="brand">
        <div className="brand-mark">WGSN</div>
        <div className="brand-sub">Forecasters Hub</div>
        <div className="brand-kicker">Content Calendar</div>
      </NavLink>

      <nav className="nav">
        <div className="nav-label">Your work</div>
        <NavLink to="/" end className="nav-link">
          Today
          {overdue > 0 && <span className="count">{overdue} late</span>}
        </NavLink>
        <NavLink to="/deadlines" className="nav-link">
          Deadlines
          <span className="count">{outstanding}</span>
        </NavLink>
        <NavLink to={`/calendar/${monthKey(TODAY)}`} className="nav-link">
          Calendar
        </NavLink>

        <div className="nav-label" style={{ marginTop: 20 }}>
          The team
        </div>
        <NavLink to="/workshops" className="nav-link">
          Learning
          {mySessions > 0 && <span className="count">{mySessions}</span>}
        </NavLink>
        <NavLink to="/team" className="nav-link">
          Forecasters
          <span className="count">{new Set(content.map((c) => c.forecasterId)).size}</span>
        </NavLink>
        <NavLink to="/whats-on" className="nav-link">
          What&rsquo;s on
        </NavLink>
        <NavLink to="/subscribe" className="nav-link">
          Add to your calendar
        </NavLink>
      </nav>

      <div className="sidebar-foot">
        <AccountSwitch people={people} />
        <div style={{ marginTop: 14 }}>
          <span className="who">
            {person && <Avatar id={person.id} name={person.name} />}
            <span>
              {me.name}
              <br />
              {ROLE_LABELS[me.role]}
              {me.role !== "forecaster" &&
                me.verticals !== "all" &&
                ` · ${me.verticals.length} verticals`}
            </span>
          </span>
        </div>
      </div>
    </aside>
  );
}

/** Loads the account and the team once, then hands the app a settled viewer. */
export default function Layout() {
  const me = useApi<Me>("/me");
  const people = useApi<Person[]>("/people");
  const content = useApi<ContentItem[]>("/content");

  // Nobody chosen yet in dev mode: the API has no identity to work from.
  if (me.error && !devViewer()) {
    return (
      <div className="main">
        <div className="page-head">
          <div>
            <div className="eyebrow">Forecasters Hub</div>
            <h1 className="page-title">Sign in</h1>
            <p className="page-sub">
              With SSO in front of the Hub you would already be here. For now, pick an
              account to look around as.
            </p>
          </div>
        </div>
        <div className="card" style={{ maxWidth: 380 }}>
          <label className="eyebrow" htmlFor="pick">
            Account
          </label>
          <select
            id="pick"
            defaultValue=""
            style={{ width: "100%", marginTop: 8, padding: 8 }}
            onChange={(e) => {
              if (!e.target.value) return;
              setDevViewer(e.target.value);
              window.location.reload();
            }}
          >
            <option value="">Choose an account…</option>
            {(people.data ?? []).map((p) => (
              <option key={p.id} value={p.email}>
                {p.name} — {p.email}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  if (me.error || people.error || content.error) {
    return (
      <div className="main">
        <ErrorNote message={me.error ?? people.error ?? content.error ?? ""} />
      </div>
    );
  }
  if (!me.data || !people.data || !content.data) return <Loading />;

  if (!me.data.active) {
    return (
      <div className="main">
        <div className="page-head">
          <div>
            <div className="eyebrow">Forecasters Hub</div>
            <h1 className="page-title">No access</h1>
            <p className="page-sub">
              {me.data.email} is signed in but not on the forecast team&rsquo;s access list.
              A commissioning manager can add the address.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ViewerProvider me={me.data} people={people.data}>
      <div className="shell">
        <Sidebar content={content.data} />
        <main className="main">
          <Outlet />
        </main>
      </div>
    </ViewerProvider>
  );
}
