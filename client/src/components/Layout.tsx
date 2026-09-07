import { NavLink, Outlet } from "react-router-dom";
import { useApi } from "../lib/api";
import { TODAY, monthKey } from "../lib/date";
import { isOutstanding, isOverdue } from "../lib/domain";
import { ViewerProvider, useViewer } from "../lib/viewer";
import type { ContentItem, Person } from "../types";
import { Avatar, ErrorNote, Loading } from "./bits";

function ViewerSwitch() {
  const { person, people, setViewerId } = useViewer();
  const forecasters = people.filter((p) => p.role === "forecaster");
  const managers = people.filter((p) => p.role === "commissioning-manager");
  return (
    <div className="viewer-switch">
      <label htmlFor="viewer">Viewing as</label>
      <select
        id="viewer"
        value={person?.id ?? ""}
        onChange={(e) => setViewerId(e.target.value)}
      >
        <optgroup label="Forecasters">
          {forecasters.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="Commissioning managers">
          {managers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}

function Sidebar({ content }: { content: ContentItem[] }) {
  const { person } = useViewer();
  const mine = content.filter((c) => c.forecasterId === person?.id);
  const scope = person?.role === "forecaster" ? mine : content;
  const outstanding = scope.filter(isOutstanding).length;
  const overdue = scope.filter((c) => isOverdue(c)).length;

  return (
    <aside className="sidebar">
      <NavLink to="/" className="brand">
        <div className="brand-mark">Forecasters&nbsp;Hub</div>
        <div className="brand-sub">Content Calendar</div>
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
        <NavLink to="/team" className="nav-link">
          Forecasters
          <span className="count">
            {new Set(content.map((c) => c.forecasterId)).size}
          </span>
        </NavLink>
        <NavLink to="/whats-on" className="nav-link">
          What&rsquo;s on
        </NavLink>
      </nav>

      <div className="sidebar-foot">
        <ViewerSwitch />
        <div style={{ marginTop: 14 }}>
          {person && (
            <span className="who">
              <Avatar id={person.id} name={person.name} />
              <span>
                {person.name}
                <br />
                {person.vertical ?? "Commissioning"}
              </span>
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}

/**
 * Loads the two things every page needs — people and the full schedule — once,
 * then hands the rest of the app a settled viewer.
 */
export default function Layout() {
  const people = useApi<Person[]>("/people");
  const content = useApi<ContentItem[]>("/content");

  if (people.error || content.error) {
    return (
      <div className="main">
        <ErrorNote message={people.error ?? content.error ?? ""} />
      </div>
    );
  }
  if (!people.data || !content.data) return <Loading />;

  return (
    <ViewerProvider people={people.data}>
      <div className="shell">
        <Sidebar content={content.data} />
        <main className="main">
          <Outlet />
        </main>
      </div>
    </ViewerProvider>
  );
}
