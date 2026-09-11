import { readFileSync } from "node:fs";
import { Router } from "express";
import { canRead, type ViewerRequest } from "./auth.js";
import type { Availability, DataSource, DirectoryPerson } from "./types.js";

/**
 * The content directory: who is on which team, and what they know about.
 *
 * The team keeps this in a Smartsheet — "Content Directory 2026" — and a
 * separate canvas reads it to answer questions a schedule cannot: who covers
 * Menswear in APAC, who the Feed Lead for Beauty is, who to ask about
 * Modestwear. Those are the questions that currently get asked in chat and
 * answered by whoever happens to be reading.
 *
 * What is modelled here is the sheet's own shape, because that is what will
 * arrive from Smartsheet later: one row per person, with several columns
 * holding more than one value separated by line breaks. Everything else — the
 * grouping, the counting, the search — falls out of that.
 *
 * ## What is deliberately not shown
 *
 * The sheet's Status column carries "Maternity Leave" and "Medical Leave"
 * beside "Full-Time". That is health and family information about a
 * colleague, and a directory that prints it to two hundred people has taken a
 * fact somebody told HR and published it. So the reason never leaves the
 * server: anybody not currently working reads as "Away", and that is all.
 * Nobody looking for a person to ask about knitwear needs to know why they
 * are out.
 */

export type { Availability, DirectoryPerson } from "./types.js";

/** How a directory row arrives: the sheet's own column names. */
export type DirectoryRow = Record<string, string | null | undefined>;

/**
 * A cell holding several values.
 *
 * Smartsheet's multi-select columns come back as one string with line breaks
 * in it, and the same column in an export is the same string. Semicolons and
 * commas turn up in hand-typed cells too, but a comma cannot be split on
 * safely — "Decor / DIY & Hardware, to include lighting" is one tag — so only
 * line breaks and semicolons count.
 */
export function multi(value: unknown): string[] {
  return String(value ?? "")
    .split(/[\n;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

const one = (value: unknown): string | undefined => {
  const text = String(value ?? "").trim();
  return text || undefined;
};

/** "True", "true", "Yes", "1" — a sheet's tick box, however it was typed. */
const ticked = (value: unknown): boolean =>
  /^(true|yes|y|1|x)$/i.test(String(value ?? "").trim());

/**
 * An id from a name, so a person has a stable address.
 *
 * The sheet has no id column and Smartsheet's row ids change when a row is
 * moved, so the name is what there is. Two people with the same name would
 * collide; the reader below numbers the second one rather than losing them.
 */
export const idFor = (name: string): string =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Which statuses mean "at work".
 *
 * Anything else is "away" without a reason, and a person marked inactive has
 * left — they stay out of the directory unless somebody asks for them, since
 * a leaver in the list is how a forecaster ends up emailing a dead address.
 */
function availabilityOf(status: string | undefined): Availability {
  const text = (status ?? "").toLowerCase();
  if (!text) return "here";
  if (text.includes("inactive") || text.includes("left")) return "gone";
  if (text.includes("leave") || text.includes("sabbatical")) return "away";
  return "here";
}

/**
 * The sheet's columns, by the names it uses.
 *
 * One place to change when a column is renamed, which is the same decision
 * the Smartsheet reader makes for the schedule — see COLUMNS in
 * smartsheetSource.ts.
 */
export const COLUMNS = {
  name: "Name",
  email: "Email",
  role: "Role",
  team: "Team",
  tags: "Secondary Team Tags",
  knowledge: "Knowledge Network",
  feedLead: "Feed Lead",
  region: "Regional Lens",
  country: "Country",
  dei: "DEI Board",
  status: "Status",
  cm: "CM",
  managerEmail: "Manager Email",
  aliases: "Aliases",
  senior: "Senior + above",
} as const;

/**
 * The real directory, if somebody has put it on this machine.
 *
 * `tools/import-directory.mjs` writes it and git ignores it, so a checkout
 * carries invented people and only a machine somebody deliberately imported
 * onto has the real hundred and fifty. Missing is the normal case and is not
 * an error; a file that is there but unreadable is worth saying out loud,
 * because the alternative is wondering why the names are wrong.
 */
export function fileRows(): DirectoryRow[] | null {
  const path = process.env.HUB_DIRECTORY ?? "./data/directory.json";
  try {
    const rows = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(rows) ? (rows as DirectoryRow[]) : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`Could not read the directory at ${path}: ${(err as Error).message}`);
    }
    return null;
  }
}

/** Rows as the sheet holds them, turned into people. */
export function readDirectory(rows: DirectoryRow[]): DirectoryPerson[] {
  const taken = new Set<string>();
  const people: DirectoryPerson[] = [];

  for (const row of rows) {
    const name = one(row[COLUMNS.name]);
    // Spacer rows: the sheet has a few, and they are not people.
    if (!name) continue;

    let id = idFor(name);
    if (taken.has(id)) {
      let n = 2;
      while (taken.has(`${id}-${n}`)) n++;
      id = `${id}-${n}`;
    }
    taken.add(id);

    people.push({
      id,
      name,
      email: one(row[COLUMNS.email])?.toLowerCase(),
      role: one(row[COLUMNS.role]),
      team: one(row[COLUMNS.team]),
      tags: multi(row[COLUMNS.tags]),
      knowledge: multi(row[COLUMNS.knowledge]),
      region: one(row[COLUMNS.region]),
      country: one(row[COLUMNS.country]),
      feedLead: ticked(row[COLUMNS.feedLead]),
      deiBoard: ticked(row[COLUMNS.dei]),
      senior: Boolean(one(row[COLUMNS.senior])),
      cm: one(row[COLUMNS.cm]),
      managerEmail: one(row[COLUMNS.managerEmail])?.toLowerCase(),
      availability: availabilityOf(one(row[COLUMNS.status])),
      aliases: multi(row[COLUMNS.aliases]),
    });
  }

  return people.sort((a, b) => a.name.localeCompare(b.name));
}

/** The ways the directory can be cut. The keys are what the URL carries. */
export const FACETS = {
  team: { label: "Team", of: (p: DirectoryPerson) => (p.team ? [p.team] : []) },
  tag: { label: "What they cover", of: (p: DirectoryPerson) => p.tags },
  knowledge: { label: "Knowledge network", of: (p: DirectoryPerson) => p.knowledge },
  region: { label: "Region", of: (p: DirectoryPerson) => (p.region ? [p.region] : []) },
  role: { label: "Role", of: (p: DirectoryPerson) => (p.role ? [p.role] : []) },
} as const;

export type FacetKey = keyof typeof FACETS;

export const isFacet = (value: string): value is FacetKey => value in FACETS;

export interface Group {
  name: string;
  people: DirectoryPerson[];
}

/**
 * Everybody, grouped by one facet.
 *
 * Somebody with three tags appears under all three, because they do cover all
 * three — this is a way of finding people, not a seating plan. Anybody the
 * facet says nothing about goes to the end under "Not recorded", rather than
 * disappearing: a gap in the sheet is worth seeing.
 */
export function groupBy(people: DirectoryPerson[], facet: FacetKey): Group[] {
  const by = new Map<string, DirectoryPerson[]>();
  const missing: DirectoryPerson[] = [];

  for (const person of people) {
    const values = FACETS[facet].of(person);
    if (!values.length) {
      missing.push(person);
      continue;
    }
    for (const value of values) {
      const list = by.get(value) ?? [];
      list.push(person);
      by.set(value, list);
    }
  }

  const groups = [...by.entries()]
    .map(([name, list]) => ({ name, people: list }))
    // Biggest first: the question is usually about a big team, and a list of
    // forty groups alphabetically buries them.
    .sort((a, b) => b.people.length - a.people.length || a.name.localeCompare(b.name));

  if (missing.length) groups.push({ name: "Not recorded", people: missing });
  return groups;
}

/**
 * The one box: a name, part of a name, a tag, a knowledge area, a team.
 *
 * Everything a person is described by is searched at once, because the whole
 * point is that you do not know which column the thing you remember lives in.
 */
export function matches(person: DirectoryPerson, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    person.name,
    person.email,
    person.role,
    person.team,
    person.region,
    person.country,
    person.cm,
    ...person.tags,
    ...person.knowledge,
    ...person.aliases,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  // Every word has to appear somewhere: "apac knitwear" is two conditions.
  return q.split(/\s+/).every((word) => hay.includes(word));
}

export interface DirectoryCounts {
  people: number;
  feedLeads: number;
  deiBoard: number;
  teams: number;
  knowledge: number;
  away: number;
}

export function countsOf(people: DirectoryPerson[]): DirectoryCounts {
  return {
    people: people.length,
    feedLeads: people.filter((p) => p.feedLead).length,
    deiBoard: people.filter((p) => p.deiBoard).length,
    teams: new Set(people.map((p) => p.team).filter(Boolean)).size,
    knowledge: new Set(people.flatMap((p) => p.knowledge)).size,
    away: people.filter((p) => p.availability === "away").length,
  };
}

/**
 * The directory, over HTTP.
 *
 * Grouped on the server rather than in the browser, for the same reason the
 * search is: the sheet is a couple of hundred rows today and will be more,
 * and the answer to "who covers knitwear" is a dozen people either way.
 */
export function createDirectoryRouter(data: DataSource): Router {
  const router = Router();

  router.get("/directory", async (req: ViewerRequest, res, next) => {
    try {
      if (!canRead(req.viewer!)) {
        res.status(403).json({ error: "This account does not have access to the Hub." });
        return;
      }
      const all = await data.listDirectory();
      const facet = typeof req.query.by === "string" && isFacet(req.query.by) ? req.query.by : "team";
      const q = typeof req.query.q === "string" ? req.query.q : "";
      // Leavers are off the list unless somebody asks, so nobody emails a
      // dead address by picking the first match.
      const includeGone = req.query.gone === "1";

      const here = all.filter((p) => includeGone || p.availability !== "gone");
      const found = here.filter((p) => matches(p, q));

      res.json({
        by: facet,
        q,
        facets: Object.entries(FACETS).map(([key, f]) => ({ key, label: f.label })),
        counts: countsOf(found),
        total: here.length,
        groups: groupBy(found, facet),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/directory/:id", async (req: ViewerRequest, res, next) => {
    try {
      if (!canRead(req.viewer!)) {
        res.status(403).json({ error: "This account does not have access to the Hub." });
        return;
      }
      const all = await data.listDirectory();
      const person = all.find((p) => p.id === req.params.id);
      if (!person) {
        res.status(404).json({ error: "Nobody in the directory with that id." });
        return;
      }
      res.json(person);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
