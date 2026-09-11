import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApi } from "../lib/api";
import { Slot } from "../lib/custom";
import { Icon } from "../lib/icons";
import { isOutstanding, isOverdue } from "../lib/domain";
import type { ContentItem, DirectoryPage, DirectoryPerson, Person } from "../types";
import { Avatar, ErrorNote, Loading } from "../components/bits";

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
 * - **Denser.** The canvas gives a whole card to a name and a region. A team
 *   of a hundred and fifty is a scrolling problem, so this is a row.
 */

const BADGE = {
  feedLead: { label: "Feed lead", icon: "feed" },
  deiBoard: { label: "DEI board", icon: "people" },
};

export default function Directory() {
  const [params, setParams] = useSearchParams();
  const by = params.get("by") ?? "team";
  const q = params.get("q") ?? "";

  const page = useApi<DirectoryPage>(
    `/directory?by=${encodeURIComponent(by)}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
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
  const filtered = q.trim().length > 0;

  return (
    <>
      <div className="page-head">
        <div>
          <Slot id="team.eyebrow" as="div" className="eyebrow" />
          <Slot id="team.title" as="h1" className="page-title" />
          <Slot id="team.sub" as="p" className="page-sub" />
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
            placeholder="A name, a category, a knowledge network, a region"
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
        {filtered && (
          <div className="filters-right">
            <button className="btn small" onClick={() => set("q", "")}>
              Clear
            </button>
          </div>
        )}
      </div>

      {groups.length === 0 && (
        <p className="none">
          Nobody matches “{q}”. The directory covers names, teams, the categories people
          cover, knowledge networks and regions.
        </p>
      )}

      <div className="dir-groups">
        {groups.map((group) => (
          <section className="dir-group" key={group.name}>
            <div className="dir-group-head">
              <h2>{group.name}</h2>
              <span className="count">{group.people.length}</span>
            </div>
            <div className="dir-rows">
              {group.people.map((person) => (
                <Row
                  key={person.id}
                  person={person}
                  hub={person.email ? hubBy.get(person.email) : undefined}
                  work={workOf}
                  by={by}
                  onFacet={(key, value) => {
                    const next = new URLSearchParams(params);
                    next.set("by", key);
                    next.set("q", value);
                    setParams(next, { replace: true });
                  }}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function Row({
  person,
  hub,
  work,
  by,
  onFacet,
}: {
  person: DirectoryPerson;
  hub?: Person;
  work: Map<string, { open: number; late: number }>;
  by: string;
  onFacet: (key: string, value: string) => void;
}) {
  const theirs = hub ? work.get(hub.id) : undefined;
  /*
   * Whatever the grouping is already saying is left off the row: under
   * "Fashion Design" every row would otherwise repeat "Fashion Design".
   */
  const place = [by === "region" ? null : person.region, person.country]
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
            {theirs.open} open{theirs.late > 0 && <b> · {theirs.late} late</b>}
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
