import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { devViewer, setDevViewer, useApi } from "../lib/api";
import { TODAY, monthKey } from "../lib/date";
import { isOutstanding, isOverdue } from "../lib/domain";
import { Icon } from "../lib/icons";
import { ViewerProvider, useViewer } from "../lib/viewer";
import type { ContentItem, Me, Person, SessionWithSignUps, ViewLink } from "../types";
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

interface Section {
  to: string;
  label: string;
  icon: string;
  /** Short enough for a tab under an icon. */
  short?: string;
  badge?: string;
  end?: boolean;
  group: "work" | "team";
  /** Shown as a tab on a phone; the rest go behind "More". */
  primary?: boolean;
  /** Built in the studio rather than written by hand. */
  custom?: boolean;
  order?: number;
}

/**
 * The sections, in one place. The sidebar renders them grouped; the bar at
 * the bottom of a phone screen renders the primary four and puts the rest
 * behind More, so every section is two taps away at most.
 */
function sections({
  overdue,
  outstanding,
  mySessions,
  forecasters,
}: {
  overdue: number;
  outstanding: number;
  mySessions: number;
  forecasters: number;
}): Section[] {
  return [
    {
      to: "/",
      label: "Today",
      icon: "today",
      end: true,
      group: "work",
      primary: true,
      badge: overdue > 0 ? `${overdue} late` : undefined,
    },
    {
      to: "/deadlines",
      label: "Deadlines",
      icon: "deadlines",
      group: "work",
      primary: true,
      badge: String(outstanding),
    },
    { to: `/calendar/${monthKey(TODAY)}`, label: "Calendar", icon: "calendar", group: "work", primary: true },
    { to: "/trends", label: "Trends", icon: "trends", group: "work", primary: true },
    { to: "/performance", label: "Performance", icon: "performance", group: "work" },
    {
      to: "/workshops",
      label: "Learning",
      icon: "learning",
      group: "team",
      badge: mySessions > 0 ? String(mySessions) : undefined,
    },
    {
      to: "/team",
      label: "Forecasters",
      icon: "forecasters",
      group: "team",
      badge: String(forecasters),
    },
    { to: "/whats-on", label: "What\u2019s on", icon: "whats-on", group: "team" },
    { to: "/subscribe", label: "Add to your calendar", short: "Calendar feed", icon: "subscribe", group: "team" },
  ];
}

/**
 * A view built in the studio, as a sidebar section.
 *
 * It lands in whichever group it was given, alongside the hand-written pages,
 * because to the person it was built for there is no difference between the
 * two. Only the studio's own draft badge gives it away.
 */
function asSection(view: ViewLink): Section {
  return {
    to: `/v/${view.slug}`,
    label: view.label,
    icon: view.icon,
    group: view.section === "The team" ? "team" : "work",
    badge: view.state === "draft" ? "Draft" : undefined,
    custom: true,
    order: view.order,
  };
}

function useSections(content: ContentItem[]): Section[] {
  const { person, isManager, isAdmin } = useViewer();
  const scope = isManager ? content : content.filter((c) => c.forecasterId === person?.id);
  const sessions = useApi<SessionWithSignUps[]>(
    person ? `/sessions?when=upcoming&person=${person.id}` : "/sessions?when=upcoming",
  );
  // The server decides which views this account may see, including whether
  // drafts are among them.
  const views = useApi<ViewLink[]>("/views");

  const fixed = sections({
    overdue: scope.filter((c) => isOverdue(c)).length,
    outstanding: scope.filter(isOutstanding).length,
    mySessions: person ? (sessions.data?.length ?? 0) : 0,
    forecasters: new Set(content.map((c) => c.forecasterId)).size,
  });

  const custom = [...(views.data ?? [])]
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
    .map(asSection);

  const studio: Section[] = isAdmin
    ? [{ to: "/studio", label: "Studio", icon: "studio", group: "team" }]
    : [];

  return [...fixed, ...custom, ...studio];
}

function Sidebar({ content }: { content: ContentItem[] }) {
  const { me, person, people } = useViewer();
  const items = useSections(content);

  return (
    <aside className="sidebar">
      <NavLink to="/" className="brand">
        <div className="brand-mark">WGSN</div>
        <div className="brand-sub">Forecasters Hub</div>
        <div className="brand-kicker">Content Calendar</div>
      </NavLink>

      <nav className="nav">
        <div className="nav-label">Your work</div>
        {items
          .filter((s) => s.group === "work")
          .map((s) => (
            <NavLink key={s.to} to={s.to} end={s.end} className="nav-link">
              <Icon name={s.icon} />
              {s.label}
              {s.badge && <span className="count">{s.badge}</span>}
            </NavLink>
          ))}

        <div className="nav-label" style={{ marginTop: 20 }}>
          The team
        </div>
        {items
          .filter((s) => s.group === "team")
          .map((s) => (
            <NavLink key={s.to} to={s.to} className="nav-link">
              <Icon name={s.icon} />
              {s.label}
              {s.badge && <span className="count">{s.badge}</span>}
            </NavLink>
          ))}
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

/**
 * Navigation on a phone.
 *
 * A wrapped row of text links was unusable at this width and hid the section
 * groups entirely. This is a fixed bar at the bottom of the screen — four
 * sections as icon-and-label tabs, and More for the rest — so the whole app
 * is reachable with a thumb.
 */
function MobileNav({ content }: { content: ContentItem[] }) {
  const [sheet, setSheet] = useState(false);
  const { me, person, people } = useViewer();
  const items = useSections(content);
  const location = useLocation();
  const rest = items.filter((s) => !s.primary);
  // "More" carries the dot when something behind it wants attention.
  const restBadge = rest.some((s) => s.badge && s.badge !== "0");
  const onRest = rest.some((s) => location.pathname.startsWith(s.to) && s.to !== "/");

  return (
    <>
      {sheet && (
        <>
          <button className="sheet-scrim" onClick={() => setSheet(false)} aria-label="Close menu" />
          <div className="nav-sheet" role="dialog" aria-label="More sections">
            <div className="nav-sheet-head">
              <span className="who">
                {person && <Avatar id={person.id} name={person.name} />}
                <span>
                  {me.name}
                  <br />
                  {ROLE_LABELS[me.role]}
                </span>
              </span>
              <button className="btn" onClick={() => setSheet(false)}>
                Close
              </button>
            </div>
            <div className="nav-sheet-links">
              {rest.map((s) => (
                <NavLink
                  key={s.to}
                  to={s.to}
                  className="sheet-link"
                  onClick={() => setSheet(false)}
                >
                  <Icon name={s.icon} size={18} />
                  {s.label}
                  {s.badge && <span className="count">{s.badge}</span>}
                </NavLink>
              ))}
            </div>
            <AccountSwitch people={people} />
          </div>
        </>
      )}

      <nav className="tabbar" aria-label="Sections">
        {items
          .filter((s) => s.primary)
          .map((s) => (
            <NavLink key={s.to} to={s.to} end={s.end} className="tab">
              <Icon name={s.icon} size={20} />
              <span>{s.short ?? s.label}</span>
              {s.badge && s.badge !== "0" && <i className="tab-dot" />}
            </NavLink>
          ))}
        <button
          className={onRest ? "tab on" : "tab"}
          onClick={() => setSheet((v) => !v)}
          aria-expanded={sheet}
        >
          <Icon name="more" size={20} />
          <span>More</span>
          {restBadge && <i className="tab-dot" />}
        </button>
      </nav>
    </>
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
        <MobileNav content={content.data} />
      </div>
    </ViewerProvider>
  );
}
