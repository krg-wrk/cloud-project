import { useCallback, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { devViewer, setDevViewer, useApi } from "../lib/api";
import { TODAY, monthKey } from "../lib/date";
import { isOutstanding, isOverdue } from "../lib/domain";
import { Icon } from "../lib/icons";
import { CustomisationProvider, EditBar, Slot, useCustom } from "../lib/custom";
import { useDialog } from "../lib/dialog";
import { ViewerProvider, useViewer } from "../lib/viewer";
import type {
  ContentItem,
  Inbox,
  Me,
  Person,
  ResourceLink,
  SessionWithSignUps,
  ViewLink,
} from "../types";
import { Avatar, ErrorNote, Loading } from "./bits";
import FreshnessNote from "./FreshnessNote";
import NotificationBell from "./NotificationBell";
import SearchPalette, { useSearchShortcut } from "./SearchPalette";

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
  group: GroupKey;
  /**
   * Somewhere else entirely: a tool of ours that lives on its own domain.
   *
   * The Hub is where a forecaster starts their day, so the things they open
   * every day belong in this menu whether or not the Hub is what serves
   * them. An external item opens in a new tab and says so — losing the Hub's
   * state because a menu item was a different kind of link is the failure to
   * avoid.
   */
  href?: string;
  /** Shown as a tab on a phone; the rest go behind "More". */
  primary?: boolean;
  /** Built in the studio rather than written by hand. */
  custom?: boolean;
  order?: number;
  /** The registry slot that names it, for the fixed sections. */
  slot?: string;
}

type GroupKey = "work" | "lab" | "data" | "team" | "resources";

/**
 * The groups, in the order they are read.
 *
 * Your work first because it is why people are here; the Lab next because it
 * is where the work is made; Data and the team after; Resources last, since
 * it is the drawer of things that are not the Hub's at all.
 */
const GROUPS: { key: GroupKey; slot: string }[] = [
  { key: "work", slot: "nav.group.work" },
  { key: "lab", slot: "nav.group.lab" },
  { key: "data", slot: "nav.group.data" },
  { key: "team", slot: "nav.group.team" },
  { key: "resources", slot: "nav.group.resources" },
];

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
  unread,
}: {
  overdue: number;
  outstanding: number;
  mySessions: number;
  forecasters: number;
  unread: number;
}): Section[] {
  return [
    {
      to: "/",
      label: "Today",
      icon: "today",
      slot: "nav.item.today",
      end: true,
      group: "work",
      primary: true,
      badge: overdue > 0 ? `${overdue} late` : undefined,
    },
    {
      to: "/deadlines",
      label: "Deadlines",
      icon: "deadlines",
      slot: "nav.item.deadlines",
      group: "work",
      primary: true,
      badge: String(outstanding),
    },
    {
      to: `/calendar/${monthKey(TODAY)}`,
      label: "Calendar",
      icon: "calendar",
      group: "work",
      primary: true,
      slot: "nav.item.calendar",
    },
    { to: "/trends", label: "Trends", icon: "trends", group: "work", primary: true, slot: "nav.item.trends" },
    {
      to: "/performance",
      label: "Performance",
      icon: "performance",
      group: "work",
      slot: "nav.item.performance",
    },
    /*
     * The Forecast Lab: where a forecast gets made rather than tracked.
     *
     * Two of these are concepts with a page that says so, one is a first cut,
     * and two are tools of ours that live on their own domains. They are one
     * group because that is how the work feels from the inside — you are
     * building, and it does not matter which of our systems serves the thing
     * you reach for.
     */
    {
      to: "/lab/builder",
      label: "Forecast Builder",
      short: "Builder",
      icon: "builder",
      slot: "nav.item.lab-builder",
      group: "lab",
    },
    {
      to: "/lab/atoms",
      label: "Add Atoms",
      short: "Atoms",
      icon: "atom",
      slot: "nav.item.lab-atoms",
      group: "lab",
    },
    {
      to: "https://medialibrary.wgsn.com/",
      href: "https://medialibrary.wgsn.com/",
      label: "Workspace 2",
      icon: "media",
      slot: "nav.item.lab-workspace",
      group: "lab",
    },
    {
      to: "https://www.wgsn.com/trend-tag",
      href: "https://www.wgsn.com/trend-tag",
      label: "The Feed",
      icon: "feed",
      slot: "nav.item.lab-feed",
      group: "lab",
    },
    {
      to: "/lab/brief",
      label: "Freelance Brief Builder",
      short: "Briefs",
      icon: "brief",
      slot: "nav.item.lab-brief",
      group: "lab",
    },
    /*
     * Data has sub-views rather than one page, so the section heading is the
     * group and each analysis is an item under it. One so far; the shape is
     * there for the next.
     */
    {
      to: "/data/proof-points",
      label: "Proof Point Library",
      short: "Proof points",
      icon: "proof",
      slot: "nav.item.proof-points",
      group: "data",
    },
    {
      to: "/data/review",
      label: "Review proof points",
      short: "Review",
      icon: "review",
      slot: "nav.item.proof-review",
      group: "data",
    },
    /*
     * The two databases that are ours but not the Hub's. Listed here because
     * "where do I find the drivers" is a question about data, and the answer
     * being a different domain is our problem rather than the forecaster's.
     */
    {
      to: "https://stepic-ssft.wgsndev.com/",
      href: "https://stepic-ssft.wgsndev.com/",
      label: "STEPIC Driver Database",
      short: "STEPIC",
      icon: "driver",
      slot: "nav.item.stepic",
      group: "data",
    },
    {
      to: "https://score.wgsndev.com/",
      href: "https://score.wgsndev.com/",
      label: "WGSN Score",
      short: "Score",
      icon: "score",
      slot: "nav.item.score",
      group: "data",
    },
    {
      to: "/workshops",
      label: "Learning",
      icon: "learning",
      slot: "nav.item.workshops",
      group: "team",
      badge: mySessions > 0 ? String(mySessions) : undefined,
    },
    {
      to: "/team",
      label: "Forecasters",
      icon: "forecasters",
      slot: "nav.item.team",
      group: "team",
      badge: String(forecasters),
    },
    { to: "/whats-on", label: "What\u2019s on", icon: "whats-on", group: "team", slot: "nav.item.whats-on" },
    {
      to: "/subscribe",
      label: "Add to your calendar",
      short: "Calendar feed",
      icon: "subscribe",
      group: "team",
      slot: "nav.item.subscribe",
    },
    /*
     * In the sidebar as well as on the bell. The bell hangs off the sidebar,
     * which a phone does not have — so the page needs a way in that survives
     * the layout, and "what am I being emailed about" is a thing people look
     * for in a menu rather than by clicking a bell.
     */
    {
      to: "/notifications",
      label: "What the Hub tells you",
      short: "Notices",
      icon: "bell",
      group: "team",
      slot: "nav.item.notifications",
      badge: unread > 0 ? String(unread) : undefined,
    },
  ];
}

/**
 * One item, whether it is a page of ours or somewhere else.
 *
 * Both kinds look the same in the menu on purpose — the difference that
 * matters to the person reading it is where they end up, and that is what
 * the marker and "opens in a new tab" say. Screen readers get the words;
 * everybody else gets the little arrow.
 */
function NavItem({
  section,
  className,
  onClick,
}: {
  section: Section;
  className: string;
  onClick?: () => void;
}) {
  const inside = (
    <>
      <Icon name={section.icon} size={className === "sheet-link" ? 18 : undefined} />
      {section.label}
      {section.href && (
        <>
          <Icon name="external" size={13} className="nav-out" />
          <span className="sr-only">(opens in a new tab)</span>
        </>
      )}
      {section.badge && <span className="count">{section.badge}</span>}
    </>
  );

  if (section.href) {
    return (
      <a
        className={className}
        href={section.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
      >
        {inside}
      </a>
    );
  }
  return (
    <NavLink className={className} to={section.to} end={section.end} onClick={onClick}>
      {inside}
    </NavLink>
  );
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
    group: view.section === "The team" ? "team" : view.section === "Data" ? "data" : "work",
    badge: view.state === "draft" ? "Draft" : undefined,
    custom: true,
    order: view.order,
  };
}

/**
 * The sidebar, with the admin's own wording and order.
 *
 * A fixed section's slot id is nav.item.<key>; a studio view's label is the
 * view's own and is changed in the studio, so it is left alone here.
 */
function customise(items: Section[], custom: ReturnType<typeof useCustom>): Section[] {
  const order = custom.group("nav.item").map((s) => s.id);
  return items
    .filter((s) => s.custom || custom.shown(s.slot ?? ""))
    .map((s) => ({
      ...s,
      label: s.slot ? custom.text(s.slot, s.label) : s.label,
      order: s.slot ? order.indexOf(s.slot) : (s.order ?? 999),
    }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function useSections(content: ContentItem[]): Section[] {
  const { person, isManager, isAdmin } = useViewer();
  const custom = useCustom();
  const scope = isManager ? content : content.filter((c) => c.forecasterId === person?.id);
  const sessions = useApi<SessionWithSignUps[]>(
    person ? `/sessions?when=upcoming&person=${person.id}` : "/sessions?when=upcoming",
  );
  // The server decides which views this account may see, including whether
  // drafts are among them.
  const views = useApi<ViewLink[]>("/views");
  // An account with no forecaster record has no inbox, which is a 403 — so
  // the count is simply nought rather than an error in the sidebar.
  const inbox = useApi<Inbox>("/notifications");
  // The Resources drawer, which an admin fills in from the studio rather
  // than by asking for a deploy.
  const resources = useApi<{ links: ResourceLink[] }>("/resources");

  const fixed = sections({
    overdue: scope.filter((c) => isOverdue(c)).length,
    outstanding: scope.filter(isOutstanding).length,
    mySessions: person ? (sessions.data?.length ?? 0) : 0,
    forecasters: new Set(content.map((c) => c.forecasterId)).size,
    unread: inbox.data?.unread ?? 0,
  });

  const built = [...(views.data ?? [])]
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
    .map(asSection);

  const studio: Section[] = isAdmin
    ? [{ to: "/studio", label: "Studio", icon: "studio", group: "team", order: 1000 }]
    : [];

  /*
   * Resources are data rather than code, so they are not slots: renaming one
   * is editing the link itself, in the studio, where it was added.
   */
  const links: Section[] = (resources.data?.links ?? []).map((link) => ({
    to: link.url,
    href: link.url,
    label: link.label,
    icon: "link",
    group: "resources",
  }));

  return [...customise(fixed, custom), ...built, ...studio, ...links];
}

function Sidebar({ content, onSearch }: { content: ContentItem[]; onSearch: () => void }) {
  const { me, person, people } = useViewer();
  const items = useSections(content);
  // ⌘ on a Mac, Ctrl everywhere else. Read once: it never changes mid-session.
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  return (
    <aside className="sidebar">
      <div className="brand-row">
        <NavLink to="/" className="brand">
          <div className="brand-mark">WGSN</div>
          <div className="brand-sub">Forecasters Hub</div>
          <div className="brand-kicker">Content Calendar</div>
        </NavLink>
        {/* The bell sits with the identity rather than in the nav: it is
            about you, not about a section of the app. */}
        <NotificationBell />
      </div>

      {/* Above the sections, because it is a way to reach any of them. */}
      <button className="search-open" onClick={onSearch}>
        <Icon name="search" size={15} />
        <span>Search</span>
        <kbd>{mac ? "\u2318" : "Ctrl"}K</kbd>
      </button>

      {/* A heading only appears if its group has anything in it, so hiding
          the library does not leave a stray "Data" above nothing — and a
          Resources drawer nobody has filled in is not a drawer. */}
      <nav className="nav">
        {GROUPS.map(({ key, slot }, i) => {
          const inGroup = items.filter((s) => s.group === key);
          if (!inGroup.length) return null;
          return (
            <div key={key} className="nav-group">
              <div className="nav-label" style={i > 0 ? { marginTop: 20 } : undefined}>
                <Slot id={slot} />
              </div>
              {inGroup.map((s) => (
                <NavItem key={s.to} section={s} className="nav-link" />
              ))}
            </div>
          );
        })}
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
/**
 * The "More" sheet, as its own component.
 *
 * Separate so it mounts and unmounts with the sheet rather than living
 * hidden in the tree, which is what lets `useDialog` do focus and Escape on
 * the same terms as every other dialog: focus moves in, Tab stays inside,
 * and closing it returns you to the tab you opened it from rather than to
 * the top of the document.
 */
function NavSheet({
  close,
  rest,
  onSearch,
  me,
  person,
  people,
}: {
  close: () => void;
  rest: Section[];
  onSearch: () => void;
  me: Me;
  /** Absent for somebody signed in who is not on the forecast team. */
  person?: Person;
  people: Person[];
}) {
  const box = useRef<HTMLDivElement | null>(null);
  useDialog(box, close);

  return (
    <>
      <button className="sheet-scrim" onClick={close} aria-label="Close menu" tabIndex={-1} />
      <div
        className="nav-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="More sections"
        ref={box}
        tabIndex={-1}
      >
        <div className="nav-sheet-head">
          <span className="who">
            {person && <Avatar id={person.id} name={person.name} />}
            <span>
              {me.name}
              <br />
              {ROLE_LABELS[me.role]}
            </span>
          </span>
          <button className="btn" onClick={close}>
            Close
          </button>
        </div>
        <div className="nav-sheet-links">
          {rest.map((s) => (
            <NavItem key={s.to} section={s} className="sheet-link" onClick={close} />
          ))}
        </div>
        {/* A phone has no ⌘K, so the sheet carries the way in. */}
        <button
          className="sheet-link"
          onClick={() => {
            close();
            onSearch();
          }}
        >
          <Icon name="search" size={18} />
          Search everything
        </button>
        <AccountSwitch people={people} />
      </div>
    </>
  );
}

function MobileNav({ content, onSearch }: { content: ContentItem[]; onSearch: () => void }) {
  const [sheet, setSheet] = useState(false);
  const { me, person, people } = useViewer();
  const items = useSections(content);
  const location = useLocation();
  const rest = items.filter((s) => !s.primary);
  // "More" carries the dot when something behind it wants attention.
  const restBadge = rest.some((s) => s.badge && s.badge !== "0");
  // An external item is never "where you are", however its URL starts.
  const onRest = rest.some(
    (s) => !s.href && location.pathname.startsWith(s.to) && s.to !== "/",
  );

  return (
    <>
      {sheet && (
        <NavSheet
          close={() => setSheet(false)}
          rest={rest}
          onSearch={onSearch}
          me={me}
          person={person}
          people={people}
        />
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
  const [searching, setSearching] = useState(false);
  const openSearch = useCallback(() => setSearching(true), []);
  useSearchShortcut(openSearch);
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
      {/*
        The wording layer wraps everything, because the sidebar is as
        renamable as the pages are.
      */}
      <CustomisationProvider>
        {/*
          Straight to the page.
          
          The sidebar is fifteen tab stops, on every page, before the content
          — which is the single biggest thing standing between a keyboard and
          this app. Off screen until it has focus, as the convention is, so
          it costs a mouse nothing.
        */}
        <a className="skip" href="#main">
          Skip to the page
        </a>
        <div className="shell">
          <Sidebar content={content.data} onSearch={openSearch} />
          <main className="main" id="main" tabIndex={-1}>
            <Outlet />
            {/*
              How old the schedule is. Present for an admin, and for everybody
              when an admin has turned it on — the endpoint refuses otherwise,
              so there is simply nothing here rather than a control nobody can
              use.
            */}
            <FreshnessNote />
          </main>
          <MobileNav content={content.data} onSearch={openSearch} />
        </div>
        <SearchPalette open={searching} onClose={() => setSearching(false)} />
        <EditBar />
      </CustomisationProvider>
    </ViewerProvider>
  );
}
