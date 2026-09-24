import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApi } from "../lib/api";
import { Slot } from "../lib/custom";
import { Icon } from "../lib/icons";
import { useViewer } from "../lib/viewer";
import { isOutstanding, isOverdue } from "../lib/domain";
import type { ContentItem, DirectoryPage, DirectoryPerson, Person } from "../types";
import { Avatar, ErrorNote, Loading } from "../components/bits";
import PageIntro from "../components/PageIntro";
import ExportButton from "../components/ExportButton";

/**
 * The team, as a directory rather than a list of forecasters.
 *
 * The questions this answers are the ones that currently go to chat: who
 * covers menswear in APAC, who the Feed Lead for Beauty is, who to ask about
 * modestwear, who else is on the sustainability network. A schedule cannot
 * answer any of them, and neither can a spreadsheet somebody has to be told
 * about first.
 *
 * The team already built a canvas over the same sheet, and this takes its
 * shape — group people by a facet, badge the roles, count the totals — with
 * four differences that come from the Hub rather than from taste:
 *
 * - **One box, not two modes.** The canvas has "search within teams" and
 *   "search the people directory" as a switch, because its grouping is a mode.
 *   Here the search narrows whatever is on screen and the grouping is just how
 *   it is stacked, so there is nothing to choose.
 * - **An address for every cut.** `?by=knowledge&q=modestwear` is a link you
 *   can send, which is the whole argument for the Hub over a dashboard.
 * - **A person is joined to their work.** The directory says who they are; the
 *   Hub knows what they are carrying and when it is due, so the card says both
 *   and the name goes to their page.
 * - **Denser.** The canvas gives a whole card to a name and a lens. A team
 *   of a hundred and fifty is a scrolling problem, so this is a row.
 */

const BADGE = {
  feedLead: { label: "Feed lead", icon: "feed" },
  deiBoard: { label: "DEI board", icon: "people" },
};

/** The facet filters the page carries, as the query string spells them. */
const FILTER_KEYS = ["team", "department", "tag", "knowledge", "lens", "country", "role"] as const;

/**
 * Which groups a person has folded away, kept per facet.
 *
 * Per facet because the groups are different under each one: having decided
 * you never need to see Insight while grouping by team should not fold
 * something unrelated when you switch to knowledge networks. The same
 * arrangement the sidebar's menu groups use, and for the same reason — what
 * is worth remembering is the closing, not the opening.
 */
const FOLDED_KEY = "forecasters-hub.directory-folded";

function readFolded(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(FOLDED_KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    // Blocked or corrupt storage: everything open, which is the default anyway.
    return {};
  }
}

function writeFolded(next: Record<string, boolean>) {
  try {
    localStorage.setItem(FOLDED_KEY, JSON.stringify(next));
  } catch {
    // The choice lasts for this page load, which is no worse than before.
  }
}

export default function Directory() {
  const [params, setParams] = useSearchParams();
  const { isManager } = useViewer();
  const by = params.get("by") ?? "team";
  const q = params.get("q") ?? "";

  // Folded groups, held here rather than read on every render so that
  // toggling one repaints without going back to storage for the whole map.
  const [folded, setFolded] = useState(readFolded);

  const filterQuery = FILTER_KEYS.map((key) => [key, params.get(key) ?? ""] as const)
    .filter(([, value]) => value)
    .map(([key, value]) => `&f_${key}=${encodeURIComponent(value)}`)
    .join("");

  const page = useApi<DirectoryPage>(
    `/directory?by=${encodeURIComponent(by)}${q ? `&q=${encodeURIComponent(q)}` : ""}${filterQuery}`,
  );
  // The schedule's own people and their work, so a directory row can say what
  // somebody is carrying and link to it.
  const people = useApi<Person[]>("/people");
  const content = useApi<ContentItem[]>("/content");

  /** Directory to Hub, by address — the one thing both sides agree on. */
  const hubBy = useMemo(() => {
    const map = new Map<string, Person>();
    for (const p of people.data ?? []) map.set(p.email.toLowerCase(), p);
    return map;
  }, [people.data]);

  const workOf = useMemo(() => {
    const work = new Map<string, { open: number; late: number }>();
    for (const item of content.data ?? []) {
      const row = work.get(item.forecasterId) ?? { open: 0, late: 0 };
      if (isOutstanding(item)) row.open++;
      if (isOverdue(item)) row.late++;
      work.set(item.forecasterId, row);
    }
    return work;
  }, [content.data]);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Replace: a facet and a search are filters, not steps to go back through.
    setParams(next, { replace: true });
  };

  if (page.error) return <ErrorNote message={page.error} />;
  if (!page.data) return <Loading what="the directory" />;

  const { counts, groups, facets, total } = page.data;
  const active = FILTER_KEYS.filter((key) => params.get(key));
  const filtered = q.trim().length > 0 || active.length > 0;

  const keyOf = (name: string) => `${by}:${name}`;
  const openCount = groups.filter((g) => !folded[keyOf(g.name)]).length;

  const foldAll = (shut: boolean) => {
    const next = { ...folded };
    for (const group of groups) {
      if (shut) next[keyOf(group.name)] = true;
      else delete next[keyOf(group.name)];
    }
    setFolded(next);
    writeFolded(next);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <Slot id="team.eyebrow" as="div" className="eyebrow" />
          <Slot id="team.title" as="h1" className="page-title" />
          <PageIntro>
            <Slot id="team.sub" as="span" />
          </PageIntro>
        </div>
        <div className="head-figures">
          <div className="figure">
            <b>{counts.people}</b>
            <span>{filtered ? `of ${total}` : "people"}</span>
          </div>
          <div className="figure">
            <b>{counts.teams}</b>
            <span>teams</span>
          </div>
          <div className="figure">
            <b>{counts.knowledge}</b>
            <span>networks</span>
          </div>
          <div className="figure">
            <b>{counts.feedLeads}</b>
            <span>feed leads</span>
          </div>
        </div>
      </div>

      <div className="filters">
        <label className="field">
          <span className="field-label">Search</span>
          <input
            value={q}
            onChange={(e) => set("q", e.target.value)}
            placeholder="A name, a category, a knowledge network, a regional lens"
            style={{ minWidth: 300 }}
          />
        </label>
        <div className="field">
          <span className="field-label">Group by</span>
          <div className="toggles">
            {facets.map((f) => (
              <button
                key={f.key}
                className={by === f.key ? "chip on" : "chip"}
                onClick={() => set("by", f.key)}
                aria-pressed={by === f.key}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/*
        Narrowing, one dropdown per facet.
        The options are the values that actually feature, with their counts,
        rather than a list somebody maintains: a new knowledge network shows up
        the moment the first person is tagged into it. Picking two narrows to
        the overlap, so "Fashion Design" and "Sustainability" is the question
        it looks like.
      */}
      <div className="filters dir-narrow">
        {facets.map((f) => (
          <label className="field" key={f.key}>
            <span className="field-label">{f.label}</span>
            <select value={params.get(f.key) ?? ""} onChange={(e) => set(f.key, e.target.value)}>
              <option value="">All ({f.values.reduce((n, v) => n + v.count, 0)})</option>
              {f.values.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.value} ({v.count})
                </option>
              ))}
            </select>
          </label>
        ))}
        <div className="filters-right">
          {/* Flattened: a person in three groups is one row here, not three. */}
          <ExportButton
            label="The team"
            rows={[...new Map(groups.flatMap((g) => g.people).map((p) => [p.id, p])).values()]}
            columns={[
              { header: "Name", value: (p) => p.name },
              { header: "Email", value: (p) => p.email },
              { header: "Role", value: (p) => p.role },
              { header: "Team", value: (p) => p.team },
              { header: "What they cover", value: (p) => p.tags.join("; ") },
              { header: "Knowledge networks", value: (p) => p.knowledge.join("; ") },
              { header: "Department", value: (p) => p.department },
              { header: "Regional lens", value: (p) => p.regionalLens },
              { header: "Based in", value: (p) => p.country },
              { header: "Feed lead", value: (p) => (p.feedLead ? "Yes" : "No") },
              { header: "DEI board", value: (p) => (p.deiBoard ? "Yes" : "No") },
              // Away, never why: the reason is nobody else's business, and an
              // export is the easiest way for one to escape.
              { header: "Availability", value: (p) => (p.availability === "away" ? "Away" : "Here") },
            ]}
            small
          />
          {filtered && (
            <button
              className="btn small"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete("q");
                for (const key of FILTER_KEYS) next.delete(key);
                setParams(next, { replace: true });
              }}
            >
              {(() => {
                const n = active.length + (q ? 1 : 0);
                return `Clear ${n} ${n === 1 ? "filter" : "filters"}`;
              })()}
            </button>
          )}
        </div>
      </div>

      {groups.length === 0 && (
        <p className="none">
          {/* Narrowing by dropdown alone leaves nothing to quote, and
              “Nobody matches “”” is how that used to read. */}
          {q
            ? `Nobody matches “${q}”`
            : "Nobody is in every one of those at once"}
          . The directory covers names, teams, the categories people cover, knowledge
          networks, lenses and departments.
        </p>
      )}

      {/*
        Folded, the page becomes its own contents page: forty headings with
        counts, which is a list you can read, rather than four hundred rows,
        which is a list you scroll past.
      */}
      {groups.length > 1 && (
        <div className="dir-foldbar">
          <span className="muted small">
            {groups.length} {groups.length === 1 ? "group" : "groups"}
            {openCount < groups.length && ` · ${groups.length - openCount} folded`}
          </span>
          <button className="link-button" onClick={() => foldAll(openCount > 0)}>
            {openCount > 0 ? "Collapse all" : "Expand all"}
          </button>
        </div>
      )}

      <div className="dir-groups">
        {groups.map((group) => {
          const open = !folded[keyOf(group.name)];
          return (
            <section className={open ? "dir-group" : "dir-group shut"} key={group.name}>
              <button
                className="dir-group-head"
                aria-expanded={open}
                onClick={() => {
                  const next = { ...folded };
                  if (open) next[keyOf(group.name)] = true;
                  else delete next[keyOf(group.name)];
                  setFolded(next);
                  writeFolded(next);
                }}
              >
                <Icon name="chevron-down" size={13} className="dir-fold" />
                <h2>{group.name}</h2>
                <span className="count">{group.people.length}</span>
              </button>
              {open && (
                <div className="dir-rows">
                  {group.people.map((person) => (
                    <Row
                      key={person.id}
                      person={person}
                      hub={person.email ? hubBy.get(person.email) : undefined}
                      work={workOf}
                      by={by}
                      showLate={isManager}
                      onFacet={(key, value) => {
                        const next = new URLSearchParams(params);
                        next.set(key, value);
                        setParams(next, { replace: true });
                      }}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

function Row({
  person,
  hub,
  work,
  by,
  showLate,
  onFacet,
}: {
  person: DirectoryPerson;
  hub?: Person;
  work: Map<string, { open: number; late: number }>;
  by: string;
  /**
   * Whether this viewer may see that somebody is behind.
   *
   * How much work a person is carrying is shared — the content calendar is a
   * team artefact and anybody can look up anybody's deadlines. Being *late*
   * is not: it is performance, it belongs in the conversation between
   * somebody and their manager, and a directory that prints it beside a
   * hundred and fifty names has turned a phone book into a leaderboard.
   *
   * So it follows the same rule as the team's numbers on Performance —
   * managers and admins — rather than a second, looser one for the same fact.
   */
  showLate: boolean;
  onFacet: (key: string, value: string) => void;
}) {
  const theirs = hub ? work.get(hub.id) : undefined;
  /*
   * Whatever the grouping is already saying is left off the row: under
   * "Fashion Design" every row would otherwise repeat "Fashion Design".
   */
  const place = [
    by === "lens" ? null : person.regionalLens,
    by === "country" ? null : person.country,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="dir-row">
      <div className="dir-who">
        <Avatar id={person.id} name={person.name} />
        <div style={{ minWidth: 0 }}>
          <div className="dir-name">
            {hub ? <Link to={`/team/${hub.id}`}>{person.name}</Link> : person.name}
            {person.availability === "away" && (
              // Away, and never why: the reason is nobody else's business.
              <span className="dir-away" title="Away at the moment">
                Away
              </span>
            )}
          </div>
          <div className="dir-meta">
            {[person.role, by === "team" ? null : person.team, place]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </div>

      <div className="dir-tags">
        {person.tags.map((tag) => (
          <button key={tag} className="dir-tag" onClick={() => onFacet("tag", tag)}>
            {tag}
          </button>
        ))}
        {person.knowledge.map((area) => (
          <button
            key={area}
            className="dir-tag know"
            onClick={() => onFacet("knowledge", area)}
          >
            {area}
          </button>
        ))}
        {(["feedLead", "deiBoard"] as const)
          // The sheet carries DEI Board as a column *and* as a knowledge
          // network, so a badge beside the tag would say it twice.
          .filter((key) => person[key])
          .filter((key) => key !== "deiBoard" || !person.knowledge.some((k) => /dei/i.test(k)))
          .map((key) => (
            <span key={key} className="dir-badge">
              <Icon name={BADGE[key].icon} size={12} />
              {BADGE[key].label}
            </span>
          ))}
      </div>

      <div className="dir-work">
        {theirs && theirs.open > 0 && (
          <Link to={`/deadlines?forecaster=${hub!.id}`} className="dir-open">
            {theirs.open} open
            {showLate && theirs.late > 0 && <b> · {theirs.late} late</b>}
          </Link>
        )}
        {person.email && (
          <a className="dir-mail" href={`mailto:${person.email}`}>
            <Icon name="mail" size={14} />
            <span className="sr-only">Email {person.name}</span>
          </a>
        )}
      </div>
    </div>
  );
}
