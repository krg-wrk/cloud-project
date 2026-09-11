/**
 * What can be changed on the built-in pages.
 *
 * Every heading, field label, table column and navigation item that an admin
 * may rename, hide or reorder is declared once, here. The pages read their
 * wording from it and the studio's editor lists it, so the two cannot drift:
 * a heading that is not in this file is not editable, and one that is appears
 * in the editor without anybody wiring it up.
 *
 * The defaults live here rather than in the database. An untouched slot has
 * no stored record at all, so the code's own wording is what ships, and
 * adding a heading needs no migration.
 */

export type SlotKind =
  | "title"
  | "eyebrow"
  | "sub"
  | "section"
  | "field"
  | "column"
  | "nav"
  | "action"
  | "step";

export interface SlotDef {
  /** The dotted id, matching the server's key. */
  id: string;
  /** What it says unless an admin has changed it. */
  label: string;
  kind: SlotKind;
  /** A word about what it is, for the editor. */
  hint?: string;
  /** Whether it can be taken off the page. Titles cannot. */
  hideable?: boolean;
}

export interface SlotGroup {
  /** The group's own id, which is also the prefix of its items. */
  id: string;
  label: string;
  /** Items in a group can be reordered against each other. */
  orderable?: boolean;
  slots: SlotDef[];
}

export interface SlotPage {
  /** The page prefix, so a whole page can be reset at once. */
  id: string;
  label: string;
  /** Where to go to see it, so the editor can link to the page itself. */
  path: string;
  groups: SlotGroup[];
}

const t = (id: string, label: string, hint?: string): SlotDef => ({
  id,
  label,
  kind: "title",
  hint,
});
const section = (id: string, label: string): SlotDef => ({
  id,
  label,
  kind: "section",
  hideable: true,
});
const field = (id: string, label: string): SlotDef => ({
  id,
  label,
  kind: "field",
  hideable: true,
});
const column = (id: string, label: string): SlotDef => ({
  id,
  label,
  kind: "column",
  hideable: true,
});
const nav = (id: string, label: string): SlotDef => ({ id, label, kind: "nav", hideable: true });

/**
 * The pages, in the order they appear in the app.
 *
 * Not everything on a page is here. A status word comes off the sheet, a
 * person's name is their name, and a date's format is a decision rather than
 * a label — changing those is not renaming, it is editing data or writing
 * code. What is here is the app's own furniture.
 */
export const SLOT_PAGES: SlotPage[] = [
  {
    id: "nav",
    label: "Navigation",
    path: "/",
    groups: [
      {
        id: "nav.group",
        label: "Group headings",
        slots: [
          t("nav.group.work", "Your work"),
          t("nav.group.data", "Data"),
          t("nav.group.team", "The team"),
        ],
      },
      {
        id: "nav.item",
        label: "Sidebar items",
        orderable: true,
        slots: [
          nav("nav.item.today", "Today"),
          nav("nav.item.deadlines", "Deadlines"),
          nav("nav.item.calendar", "Calendar"),
          nav("nav.item.trends", "Trends"),
          nav("nav.item.performance", "Performance"),
          nav("nav.item.proof-points", "Proof Point Library"),
          nav("nav.item.proof-review", "Review proof points"),
          nav("nav.item.workshops", "Learning"),
          nav("nav.item.team", "Forecasters"),
          nav("nav.item.whats-on", "What’s on"),
          nav("nav.item.subscribe", "Add to your calendar"),
        ],
      },
    ],
  },

  {
    id: "today",
    label: "Today",
    path: "/",
    groups: [
      {
        id: "today.head",
        label: "Page heading",
        slots: [
          t("today.greeting", "Morning", "The word before the person's first name"),
          {
            id: "today.sub.mine",
            label:
              "Your submission deadlines, what publishes next, and anything in the diary that gets in the way.",
            kind: "sub",
            hint: "The line under the title, for a forecaster",
          },
          {
            id: "today.sub.team",
            label:
              "Everything in commission across the team, with the deadlines closest to landing first.",
            kind: "sub",
            hint: "The line under the title, for a manager",
          },
        ],
      },
      {
        /*
         * Renamable and hideable, but not reorderable: these sections sit in
         * a two-column layout where each has its own shape, so moving one is
         * a design decision rather than a sort order.
         */
        id: "today.section",
        label: "Sections",
        slots: [
          section("today.section.overdue", "Past deadline"),
          section("today.section.next", "Next up"),
          section("today.section.review", "Worth a look"),
          section("today.section.publishing", "Publishing soon"),
          section("today.section.sessions", "Your next sessions"),
          section("today.section.diary", "In the diary"),
          section("today.section.team", "Who’s carrying what"),
        ],
      },
    ],
  },

  {
    id: "deadlines",
    label: "Deadlines",
    path: "/deadlines",
    groups: [
      {
        id: "deadlines.head",
        label: "Page heading",
        slots: [
          t("deadlines.eyebrow", "Submission deadlines"),
          t("deadlines.title", "Deadlines"),
          {
            id: "deadlines.sub",
            label:
              "Every commissioned forecast and the date its copy is due. Filter it, then send the link — whoever opens it sees the same list.",
            kind: "sub",
            hint: "The line under the title",
          },
        ],
      },
      {
        id: "deadlines.column",
        label: "Table columns",
        orderable: true,
        slots: [
          column("deadlines.column.submission", "Due"),
          column("deadlines.column.title", "Title"),
          column("deadlines.column.type", "Format"),
          column("deadlines.column.vertical", "Vertical"),
          column("deadlines.column.season", "Season"),
          column("deadlines.column.forecaster", "Forecaster"),
          column("deadlines.column.publication", "Publishes"),
          column("deadlines.column.status", "Status"),
        ],
      },
      {
        id: "deadlines.filter",
        label: "Filter labels",
        slots: [
          field("deadlines.filter.forecaster", "Forecaster"),
          field("deadlines.filter.vertical", "Vertical"),
          field("deadlines.filter.type", "Format"),
          field("deadlines.filter.status", "Status"),
          field("deadlines.filter.search", "Search"),
        ],
      },
    ],
  },

  {
    id: "content",
    label: "A forecast",
    path: "/content/ss-4013",
    groups: [
      {
        id: "content.head",
        label: "Page heading",
        slots: [
          t("content.crumb", "Deadlines", "The first step of the breadcrumb"),
          {
            id: "content.action.month",
            label: "See this month",
            kind: "action",
            hideable: true,
          },
        ],
      },
      {
        id: "content.section",
        label: "Sections",
        orderable: true,
        slots: [
          section("content.section.where", "Where it is"),
          section("content.section.note", "Commissioning note"),
          section("content.section.details", "Details"),
          section("content.section.schedule", "Update the sheet"),
          section("content.section.notes", "Notes"),
          section("content.section.related", "Also in this vertical"),
        ],
      },
      {
        id: "content.step",
        label: "The stages",
        orderable: true,
        slots: [
          { id: "content.step.submission", label: "Copy due with the commissioning manager", kind: "step" },
          { id: "content.step.review", label: "Edit and review", kind: "step" },
          { id: "content.step.published", label: "Live on the platform", kind: "step" },
        ],
      },
      {
        id: "content.facts",
        label: "The panel on the right",
        orderable: true,
        slots: [
          field("content.facts.reference", "Reference"),
          field("content.facts.type", "Type"),
          field("content.facts.vertical", "Vertical"),
          field("content.facts.season", "Season"),
          field("content.facts.submission", "Submission"),
          field("content.facts.publication", "Publication"),
          field("content.facts.manager", "Commissioned by"),
        ],
      },
    ],
  },

  {
    id: "trends",
    label: "Trends",
    path: "/trends",
    groups: [
      {
        id: "trends.head",
        label: "Page heading",
        slots: [
          t("trends.eyebrow.mine", "Profiles you own or are credited on"),
          t("trends.eyebrow.all", "The trend database"),
          t("trends.title", "Trends"),
          {
            id: "trends.sub",
            label:
              "Trend profiles from TFDB. Which are yours, what the call is on each, which industries are still waiting for a score, and the way straight through to the profile in Content Editor or on the live site.",
            kind: "sub",
            hint: "The line under the title",
          },
        ],
      },
      {
        id: "trends.figure",
        label: "The figures",
        orderable: true,
        slots: [
          field("trends.figure.showing", "Showing"),
          field("trends.figure.mine", "Yours"),
          field("trends.figure.live", "Live"),
          field("trends.figure.awaiting", "Awaiting a score"),
        ],
      },
      {
        id: "trends.filter",
        label: "Filter labels",
        slots: [
          field("trends.filter.owner", "Owner"),
          field("trends.filter.type", "Trend type"),
          field("trends.filter.industry", "Industry"),
          field("trends.filter.state", "State"),
          field("trends.filter.call", "Call"),
          field("trends.filter.scores", "Scores"),
        ],
      },
    ],
  },

  {
    id: "data",
    label: "Data",
    path: "/data",
    groups: [
      {
        id: "data.head",
        label: "Page heading",
        slots: [
          t("data.eyebrow", "Analysis"),
          t("data.title", "Data"),
          {
            id: "data.sub",
            label:
              "What we work out about the work: the evidence behind the trends, and the analysis that sits beside the schedule rather than in it.",
            kind: "sub",
            hint: "The line under the title",
          },
        ],
      },
    ],
  },

  {
    id: "proof",
    label: "Proof Point Library",
    path: "/data/proof-points",
    groups: [
      {
        id: "proof.head",
        label: "Page heading",
        slots: [
          t("proof.eyebrow", "Data"),
          t("proof.title", "Proof Point Library"),
          {
            id: "proof.sub",
            label:
              "Every data callout we hold, matched against every trend profile by two models scoring independently. What was suggested, why, and whether the trend’s owner took it.",
            kind: "sub",
            hint: "The line under the title",
          },
        ],
      },
      {
        id: "proof.figure",
        label: "The figures",
        orderable: true,
        slots: [
          field("proof.figure.showing", "Showing"),
          field("proof.figure.mine", "On your trends"),
          field("proof.figure.approved", "Approved"),
          field("proof.figure.wgsn", "WGSN data"),
        ],
      },
      {
        id: "proof.filter",
        label: "Filter labels",
        slots: [
          field("proof.filter.owner", "Owner"),
          field("proof.filter.trend", "Trend"),
          field("proof.filter.search", "Search"),
          field("proof.filter.quality", "Match quality"),
          field("proof.filter.state", "Show"),
          field("proof.filter.industry", "Industry"),
          field("proof.filter.forecast", "Forecast"),
        ],
      },
    ],
  },

  {
    id: "review",
    label: "Reviewing proof points",
    path: "/data/review",
    groups: [
      {
        id: "review.head",
        label: "Page heading",
        slots: [
          t("review.eyebrow", "Data"),
          t("review.title", "Review proof points"),
          {
            id: "review.sub",
            label:
              "Suggestions waiting on a decision for the trends you own, best match first. Left is not for this trend, right approves, U undoes.",
            kind: "sub",
            hint: "The line under the title",
          },
        ],
      },
    ],
  },

  {
    id: "trend",
    label: "A trend profile",
    path: "/trends/482",
    groups: [
      {
        id: "trend.section",
        label: "Sections",
        orderable: true,
        slots: [
          section("trend.section.needtoknow", "Need to know"),
          section("trend.section.opportunity", "The opportunity"),
          section("trend.section.note", "Owner’s note"),
          section("trend.section.scores", "Industry scores"),
          section("trend.section.links", "Supporting material"),
          section("trend.section.labels", "Labels"),
        ],
      },
      {
        id: "trend.facts",
        label: "The panel on the right",
        orderable: true,
        slots: [
          field("trend.facts.owner", "Owner"),
          field("trend.facts.authors", "Also credited"),
          field("trend.facts.call", "The call"),
          field("trend.facts.published", "Published"),
          field("trend.facts.editor", "In Content Editor"),
          field("trend.facts.window", "Called for"),
          field("trend.facts.proof", "Proof points"),
          field("trend.facts.strategies", "Strategies"),
          field("trend.facts.score", "Latest score"),
          field("trend.facts.id", "Trend ID"),
          field("trend.facts.synced", "Synced"),
        ],
      },
      {
        id: "trend.action",
        label: "The buttons",
        slots: [
          { id: "trend.action.editor", label: "Open in Content Editor", kind: "action", hideable: true },
          { id: "trend.action.live", label: "View the published profile", kind: "action", hideable: true },
        ],
      },
    ],
  },
];

/** Every slot, by id, for a fast lookup at render time. */
export const SLOT_DEFS: Record<string, SlotDef> = Object.fromEntries(
  SLOT_PAGES.flatMap((page) => page.groups.flatMap((group) => group.slots)).map((s) => [s.id, s]),
);

/** The groups, by id, so a page can ask for one in the admin's order. */
export const SLOT_GROUPS: Record<string, SlotGroup> = Object.fromEntries(
  SLOT_PAGES.flatMap((page) => page.groups).map((g) => [g.id, g]),
);

export const SLOT_PAGE_BY_ID: Record<string, SlotPage> = Object.fromEntries(
  SLOT_PAGES.map((p) => [p.id, p]),
);

/** How many slots there are, for the editor's own summary. */
export const SLOT_COUNT = Object.keys(SLOT_DEFS).length;
