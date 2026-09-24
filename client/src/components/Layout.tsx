import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { devViewer, setDevViewer, useApi } from "../lib/api";
import { TODAY, monthKey } from "../lib/date";
import { isOutstanding, isOverdue } from "../lib/domain";
import { Icon } from "../lib/icons";
import { CustomisationProvider, EditBar, Slot, useCustom } from "../lib/custom";
import { useAppearance } from "../lib/appearance";
import { useDialog } from "../lib/dialog";
import { ACCOUNT_CHANGED, ViewerProvider, useViewer } from "../lib/viewer";
import type {
  ContentItem,
  DevAccount,
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
import Wordmark from "./Wordmark";
import Wash, { useWashClass } from "./Wash";

const ROLE_LABELS: Record<Me["role"], string> = {
  forecaster: "Forecaster",
  "commissioning-manager": "Commissioning manager",
  leadership: "Leadership",
  "view-only": "View only",
  admin: "Admin",
};

/**
 * Dev-only account switcher. With SSO in front the account comes from the
 * proxy and this disappears; it is here so the Hub can be shown and tested
 * as any of the team without an identity provider.
 *
 * Inside the account menu rather than standing in the sidebar: it is the one
 * control on this page that will not exist in production, and a permanent
 * dropdown for it made the foot of every page look like a settings form.
 */
function AccountSwitch({ people, id = "account" }: { people: Person[]; id?: string }) {
  const { me } = useViewer();
  return (
    <div className="viewer-switch">
      <label htmlFor={id}>Switch profile (demo)</label>
      <select
        id={id}
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

/**
 * Who you are, at the foot of the sidebar, in one row.
 *
 * The row itself is the whole of it: a photograph or initials, a name, a
 * role, and a cog. Everything else — the address you are signed in with, the
 * way into your own settings, and in this build the profile switcher — is
 * behind the name, where an account menu is in every other application
 * somebody uses all day.
 *
 * The cog is a link rather than a menu item because Settings is a page, and
 * one press should land on it. It sits to the right of the row, separate
 * from the button that opens the menu, so neither swallows the other.
 */
function AccountFoot({ people }: { people: Person[] }) {
  const { me, person } = useViewer();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);

  // Click away and Escape close it, as they close the bell.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const on = e.target as Node;
      if (box.current?.contains(on) || button.current?.contains(on)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div className="account">
      {open && (
        <div className="account-menu" ref={box} role="dialog" aria-label="Your account">
          <div className="account-menu-head">
            {person && <Avatar id={person.id} name={person.name} size="lg" />}
            <div className="account-menu-who">
              <b>{me.name}</b>
              <span className="muted small">{me.email}</span>
              <span className="muted small">
                {ROLE_LABELS[me.role]}
                {me.role !== "forecaster" &&
                  me.verticals !== "all" &&
                  ` · ${me.verticals.length} verticals`}
              </span>
            </div>
          </div>

          <NavLink className="account-menu-link" to="/settings" onClick={() => setOpen(false)}>
            <Icon name="settings" size={16} />
            Settings
          </NavLink>
          <NavLink
            className="account-menu-link"
            to="/notifications"
            onClick={() => setOpen(false)}
          >
            <Icon name="bell" size={16} />
            Your alerts
          </NavLink>

          {/* Not in production: with SSO in front, you are who the proxy says
              you are and there is nothing to switch. */}
          <AccountSwitch people={people} id="account-menu-switch" />
        </div>
      )}

      <div className="account-row">
        <button
          className="account-open"
          ref={button}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          {person && <Avatar id={person.id} name={person.name} />}
          <span className="account-who">
            <b>{me.name}</b>
            <small>{ROLE_LABELS[me.role]}</small>
          </span>
          <Icon name="chevron-down" size={12} className="account-caret" />
        </button>
        <NavLink className="account-cog" to="/settings" title="Settings">
          <Icon name="settings" size={16} label="Settings" />
        </NavLink>
      </div>
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

type GroupKey =
  | "work"
  | "lab"
  | "data"
  | "team"
  | "resources"
  | "planning"
  | "settings";

/**
 * The groups, in the order they are read.
 *
 * Your work first because it is why people are here; the Lab next because it
 * is where the work is made; Data and the team after; Resources then, since
 * it is the drawer of things that are not the Hub's at all. Settings last,
 * where every application people already use keeps it — it is the group you
 * go to on purpose, never the one you are trying to get past.
 */
const GROUPS: { key: GroupKey; slot: string }[] = [
  { key: "work", slot: "nav.group.work" },
  { key: "lab", slot: "nav.group.lab" },
  { key: "data", slot: "nav.group.data" },
  { key: "team", slot: "nav.group.team" },
  { key: "resources", slot: "nav.group.resources" },
  // Just above the studio: both are a commissioning manager's tools rather
  // than a forecaster's, and neither belongs in the run of daily work.
  { key: "planning", slot: "nav.group.planning" },
  { key: "settings", slot: "nav.group.settings" },
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
  commissioning = false,
}: {
  overdue: number;
  outstanding: number;
  mySessions: number;
  forecasters: number;
  /** Whether to offer the commissioning manager's own tools. */
  commissioning?: boolean;
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
    /*
     * Commissioning managers only, and hidden rather than refused: a menu
     * item that answers 403 tells a forecaster there is a page about them
     * they may not read, which is worse than not mentioning it. The server
     * refuses it as well — this only decides whether it is offered.
     */
    /*
     * Commissioning managers, and not yet leadership.
     *
     * The grid reads as a verdict on the schedule, and the people who can act
     * on that verdict are the ones commissioning it. Showing it to leadership
     * before the horizon column is filled in would be showing them a page
     * that is four-fifths "untagged" — a fair reading of the data and an
     * unfair first impression of the team.
     */
    ...(commissioning
      ? [
          {
            to: "/plan",
            label: "The plan",
            icon: "performance",
            group: "planning" as const,
            slot: "nav.item.plan",
          },
        ]
      : []),
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
      label: "Review Proof Points",
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
      label: "STEPIC Drivers",
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
  ];
}

/**
 * The glyph each sidebar item ships with, keyed by its slot.
 *
 * Derived from the list above rather than written out again, so the studio's
 * icon picker shows what an item actually looks like today and cannot drift
 * from it. The counts are nought because only the icons are wanted.
 */
export const NAV_ICONS: Record<string, string> = Object.fromEntries(
  sections({ overdue: 0, outstanding: 0, mySessions: 0, forecasters: 0 })
    .filter((s) => s.slot)
    .map((s) => [s.slot as string, s.icon]),
);

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

/** Where a person's collapsed groups are kept, per account. */
const COLLAPSED_KEY = "forecasters-hub.nav-collapsed";

function readCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    // Blocked or corrupt storage: everything open, which is the default anyway.
    return {};
  }
}

/**
 * One group of the sidebar, with a heading that folds it away.
 *
 * Open by default and on a first visit, because a menu that starts closed is
 * a menu that hides the app from somebody who has never seen it. What gets
 * remembered is the closing: if you have decided you never use Resources,
 * that decision should survive a reload.
 *
 * The heading is a real `<button>` with `aria-expanded` rather than a `<div>`
 * with a click handler, so it is reachable by keyboard and announced as what
 * it is.
 *
 * Every group folds, the one you are currently inside included. Refusing to
 * fold that one was the first try — the reasoning being that collapsing it
 * hides the highlight showing where you are — but it made the heading of
 * whichever group you were in do nothing when pressed, which reads as broken
 * rather than as protective. A collapsed group that holds the current page
 * carries the marker on its heading instead, so nothing is lost by folding it.
 */
function NavGroup({
  groupKey,
  slot,
  items,
  hue,
}: {
  groupKey: GroupKey;
  slot: string;
  items: Section[];
  /** The wash hue this section was given in the studio: dusk, magenta, … */
  hue: string;
}) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(() => !(readCollapsed()[groupKey] ?? false));

  const holdsCurrent = items.some(
    (s) => !s.href && (s.to === pathname || (s.to !== "/" && pathname.startsWith(`${s.to}/`))),
  );

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(
        COLLAPSED_KEY,
        JSON.stringify({ ...readCollapsed(), [groupKey]: !next }),
      );
    } catch {
      // The choice lasts for this page load only, which is no worse than before.
    }
  };

  return (
    <div className={`nav-group hue-${hue}${open ? "" : " shut"}`}>
      <button className="nav-label" onClick={toggle} aria-expanded={open}>
        <Icon name="chevron-down" size={12} className="nav-fold" />
        <Slot id={slot} as="span" />
        {/* Folded, but you are in there: the same accent bar the open group
            puts against the current item, kept on the heading. */}
        {!open && holdsCurrent && (
          <span className="nav-here" title="The page you are on is in this group" />
        )}
        {!open && <span className="nav-shut-count">{items.length}</span>}
      </button>
      {open && items.map((s) => <NavItem key={s.to} section={s} className="nav-link" />)}
    </div>
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
  // The Resources drawer, which an admin fills in from the studio rather
  // than by asking for a deploy.
  const resources = useApi<{ links: ResourceLink[] }>("/resources");
  // The colours are applied by this hook; what is wanted here is the icons,
  // where an admin has chosen a different glyph for a sidebar item.
  const look = useAppearance();

  const fixed = sections({
    overdue: scope.filter((c) => isOverdue(c)).length,
    outstanding: scope.filter(isOutstanding).length,
    mySessions: person ? (sessions.data?.length ?? 0) : 0,
    forecasters: new Set(content.map((c) => c.forecasterId)).size,
    commissioning: isManager,
  });

  const built = [...(views.data ?? [])]
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
    .map(asSection);

  const studio: Section[] = isAdmin
    ? [{ to: "/studio", label: "Studio", icon: "studio", group: "settings", order: 1000 }]
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

  /*
   * An admin's icon, where they chose one. Unknown names fall through to the
   * built-in, because a menu item with no icon looks broken and one with the
   * wrong icon does not.
   */
  const withIcons = (items: Section[]): Section[] =>
    items.map((s) => (s.slot && look.icons[s.slot] ? { ...s, icon: look.icons[s.slot] } : s));

  return [...withIcons(customise(fixed, custom)), ...built, ...studio, ...links];
}

function Sidebar({ content }: { content: ContentItem[] }) {
  const { people } = useViewer();
  const items = useSections(content);
  // Which colour each section carries, as an admin set it in the studio.
  const look = useAppearance();

  return (
    <aside className="sidebar">
      {/* Pinned: the identity and the way into everything stay put while the
          menu below them scrolls. */}
      <div className="sidebar-top">
      <div className="brand-row">
        <NavLink to="/" className="brand">
          <Wordmark className="brand-mark" />
          <div className="brand-sub">Forecasters Hub</div>
          <div className="brand-kicker">Content Calendar</div>
        </NavLink>
        {/* The bell sits with the identity rather than in the nav: it is
            about you, not about a section of the app. */}
        <NotificationBell />
      </div>

      </div>

      {/* A heading only appears if its group has anything in it, so hiding
          the library does not leave a stray "Data" above nothing — and a
          Resources drawer nobody has filled in is not a drawer. */}
      <nav className="nav nav-scroll">
        {GROUPS.map(({ key, slot }) => {
          const inGroup = items.filter((s) => s.group === key);
          if (!inGroup.length) return null;
          return (
            <NavGroup
              key={key}
              groupKey={key}
              slot={slot}
              items={inGroup}
              /* The studio's choice for this section, which is also what
                 decides the wash behind its pages — so the menu and the page
                 agree without anybody keeping two settings in step. */
              hue={look.washes?.[key] ?? "dusk"}
            />
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <AccountFoot people={people} />
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
  unread,
}: {
  close: () => void;
  rest: Section[];
  onSearch: () => void;
  me: Me;
  /** Absent for somebody signed in who is not on the forecast team. */
  person?: Person;
  people: Person[];
  /** How many alerts are unread, for the row that leads to them. */
  unread: number;
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
        {/* On a phone there is no sidebar, so no bell and no cog. Both of the
            things they lead to are here instead — written out rather than
            taken from the menu, because neither is a section of the app. */}
        <NavLink className="sheet-link" to="/notifications" onClick={close}>
          <Icon name="bell" size={18} />
          Your alerts
          {unread > 0 && <span className="count">{unread}</span>}
        </NavLink>
        <NavLink className="sheet-link" to="/settings" onClick={close}>
          <Icon name="settings" size={18} />
          Settings
        </NavLink>
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
  // An account with no forecaster record has no inbox, which is a 403 — so
  // the count is simply nought rather than an error at the foot of the screen.
  const inbox = useApi<Inbox>("/notifications");
  const unread = inbox.data?.unread ?? 0;
  // "More" carries the dot when something behind it wants attention — now
  // including unread alerts, which live behind it since the bell does not
  // exist at this width.
  const restBadge = unread > 0 || rest.some((s) => s.badge && s.badge !== "0");
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
          unread={unread}
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

/**
 * The dev switcher, on its own read.
 *
 * The accounts come from `/accounts` rather than `/people` because nobody is
 * signed in yet and every read behind the identity middleware answers 401 —
 * fed from `/people` the menu is empty on any browser that has not already
 * chosen, which is every new laptop. It is a component of its own so that
 * read happens when somebody is actually signing in, rather than on every
 * page load for the whole life of the app.
 */
function SignIn() {
  const accounts = useApi<DevAccount[]>("/accounts");

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
        {accounts.loading && <Loading />}
        {/*
         * The switcher is a dev-mode thing, so the route is not there in
         * proxy mode. Saying so names the actual situation — the Hub is
         * waiting on SSO — rather than showing an empty menu and letting
         * somebody conclude the team sheet is broken.
         */}
        {accounts.error && (
          <ErrorNote message="Nobody is signed in, and this Hub expects SSO in front of it to say who you are." />
        )}
        {accounts.data?.length === 0 && (
          <p className="page-sub">
            There is nobody on the team sheet to sign in as. Check the schedule the Hub is
            pointed at with <code>npm run doctor</code>.
          </p>
        )}
        {accounts.data && accounts.data.length > 0 && (
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
            <option value="">Choose an account&hellip;</option>
            {accounts.data.map((a) => (
              <option key={a.email} value={a.email}>
                {a.name} &mdash; {a.email}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

/** Loads the account and the team once, then hands the app a settled viewer. */
export default function Layout() {
  const [searching, setSearching] = useState(false);
  const openSearch = useCallback(() => setSearching(true), []);
  useSearchShortcut(openSearch);
  /*
   * The wash's hue follows the section of the Hub you are in, and which hue
   * each section takes is the admin's to set — so this reads the appearance
   * rather than hard-coding it. `useAppearance` is what applies the colours
   * and the on/off switch too; calling it here means one read serves all
   * three.
   */
  const look = useAppearance();
  const wash = useWashClass(look.washes);
  const me = useApi<Me>("/me");
  const people = useApi<Person[]>("/people");
  const content = useApi<ContentItem[]>("/content");

  /*
   * Somebody changed their own account — a new photograph, so far.
   *
   * The account and the team are read once, here, and handed down; a page
   * deep in the tree that changes one of them has no way to say so except
   * this. Without it the avatar in the corner keeps the old picture until the
   * next full page load, which reads as the upload having failed.
   */
  const { reload: reloadMe } = me;
  const { reload: reloadPeople } = people;
  useEffect(() => {
    const again = () => {
      reloadMe();
      reloadPeople();
    };
    window.addEventListener(ACCOUNT_CHANGED, again);
    return () => window.removeEventListener(ACCOUNT_CHANGED, again);
  }, [reloadMe, reloadPeople]);

  // Nobody chosen yet in dev mode: the API has no identity to work from.
  if (me.error && !devViewer()) return <SignIn />;

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
        <div className={`shell ${wash}`}>
          {/* Behind the content column, and behind nothing else: the sidebar
              paints its own paper over it. */}
          <Wash />
          <Sidebar content={content.data} />
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
