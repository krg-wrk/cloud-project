import { useMemo, type CSSProperties } from "react";
import { Icon } from "../lib/icons";
import type { MetricResult, Person } from "../types";
import { formatValue } from "./charts";

/**
 * The three panels the Performance page was missing.
 *
 * Not new numbers — every one of these is already computed and already on the
 * page as a tile. What was missing was the two questions a tile cannot
 * answer: *how does my output break down*, and *what does this metric even
 * mean*. Both were answered on a whiteboard and in a glossary nobody could
 * find; here they sit beside the figures they belong to.
 */

/** Pull one metric's value out of the result set. */
function valueOf(results: MetricResult[], id: string): number {
  const hit = results.find((r) => r.definition.id === id);
  return hit?.value ?? 0;
}

const OWNERSHIP: { id: string; label: string; colour: string; what: string }[] = [
  {
    id: "sole-owned",
    label: "Solely owned",
    colour: "var(--accent)",
    what: "You are the only person in the Owner column.",
  },
  {
    id: "co-owned",
    label: "Co-owned",
    colour: "var(--accent-soft)",
    what: "You and at least one other forecaster own it together.",
  },
  {
    id: "byline-contributions",
    label: "Byline",
    colour: "var(--event-workshop)",
    what: "You are credited on the byline but do not own it. Not a KPI on its own.",
  },
  {
    id: "freelance",
    label: "Freelance",
    colour: "var(--review)",
    what: "Commissioned out, with you named alongside the freelancer.",
  },
];

/**
 * How the output breaks down — the question a single "forecasts owned"
 * number cannot answer.
 *
 * One stacked bar rather than four tiles, because the point is the
 * proportions: eight solely owned out of ten is a different year from four
 * and four, and two numbers side by side make you do that arithmetic
 * yourself. The figures are still written out underneath, because a bar is
 * for the shape and a number is for the meeting.
 */
export function OwnershipMix({ results }: { results: MetricResult[] }) {
  const parts = OWNERSHIP.map((o) => ({ ...o, value: valueOf(results, o.id) }));
  const total = parts.reduce((n, p) => n + p.value, 0);

  if (total === 0) {
    return (
      <p className="muted small">
        Nothing owned or credited in this range, so there is no mix to show.
      </p>
    );
  }

  return (
    <div className="mix">
      <div
        className="mix-bar"
        role="img"
        aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}
      >
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <span
              key={p.id}
              className="mix-slice"
              style={
                {
                  "--slice": p.colour,
                  // The flex basis carries the proportion, so the bar is the
                  // data rather than a picture of it.
                  flexGrow: p.value,
                } as CSSProperties
              }
              title={`${p.label}: ${p.value} of ${total}`}
            />
          ))}
      </div>

      <dl className="mix-keys">
        {parts.map((p) => (
          <div key={p.id} className={p.value === 0 ? "mix-key zero" : "mix-key"}>
            <dt>
              <span className="mix-dot" style={{ "--slice": p.colour } as CSSProperties} />
              {p.label}
            </dt>
            {/* Two definitions against the one term: the figure, which lines
                up in its own column, and the sentence, which spans the row
                underneath so it can read left to right like prose. */}
            <dd className="mix-num">
              <b>{p.value}</b>
              <span className="muted small">
                {total > 0 ? ` ${Math.round((p.value / total) * 100)}%` : ""}
              </span>
            </dd>
            <dd className="mix-what">{p.what}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The tier mix, as a ring.
 *
 * Three numbers that always sum to the whole, which is the one shape a ring
 * is genuinely better at than a bar: the question is "how much of my year was
 * Tier 1", and that is an angle rather than a length. Drawn with one SVG
 * circle per tier and a stroke-dasharray, so there is no library and no path
 * arithmetic to get wrong.
 */
export function TierRing({ results }: { results: MetricResult[] }) {
  const tiers = useMemo(
    () =>
      [
        { id: "tier-1", label: "Tier 1 — Decide", colour: "var(--accent)" },
        { id: "tier-2", label: "Tier 2 — Understand", colour: "var(--kind-lunch-and-learn)" },
        { id: "tier-3", label: "Tier 3 — Track", colour: "var(--event-workshop)" },
      ].map((t) => ({ ...t, value: valueOf(results, t.id) })),
    [results],
  );

  const total = tiers.reduce((n, t) => n + t.value, 0);
  if (total === 0) {
    return <p className="muted small">No tiered work in this range.</p>;
  }

  // A circle of radius 50 has a circumference of 2πr; every arc is a slice of
  // it, laid end to end by pushing each one's offset along by what came before.
  const R = 50;
  const C = 2 * Math.PI * R;
  let used = 0;

  return (
    <div className="ring-wrap">
      <svg className="ring" viewBox="0 0 120 120" role="img" aria-label={
        tiers.map((t) => `${t.label}: ${t.value}`).join(", ")
      }>
        <circle cx="60" cy="60" r={R} className="ring-track" />
        {tiers.map((t) => {
          const length = (t.value / total) * C;
          const offset = used;
          used += length;
          if (t.value === 0) return null;
          return (
            <circle
              key={t.id}
              cx="60"
              cy="60"
              r={R}
              className="ring-arc"
              style={{ stroke: t.colour }}
              strokeDasharray={`${length} ${C - length}`}
              // -90deg so the first slice starts at twelve o'clock, which is
              // where an eye starts reading a dial.
              strokeDashoffset={-offset}
            />
          );
        })}
        <text x="60" y="58" className="ring-total">
          {total}
        </text>
        <text x="60" y="74" className="ring-caption">
          pieces
        </text>
      </svg>

      <dl className="mix-keys">
        {tiers.map((t) => (
          <div key={t.id} className="mix-key">
            <dt>
              <span className="mix-dot" style={{ "--slice": t.colour } as CSSProperties} />
              {t.label}
            </dt>
            <dd className="mix-num">
              <b>{t.value}</b>
              <span className="muted small"> {Math.round((t.value / total) * 100)}%</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * A manager's team, by grade, with the number being looked at beside each.
 *
 * The dropdown that used to be the only way in is still there, and it is
 * right for "show me Rina". It is wrong for "how is the team doing", which is
 * the question a manager opens this page with — a list answers it before
 * anybody clicks anything, and clicking a row is then the same thing the
 * dropdown did.
 *
 * Grouped by grade because output is read against the average for a grade:
 * putting a Strategist's twelve next to a Director's three without that
 * context is how a number becomes an accusation.
 */
export function TeamPanel({
  rows,
  metricLabel,
  unit,
  better,
  selectedId,
  youId,
  onPick,
}: {
  rows: { personId: string; value: number | null; person: Person | null }[];
  metricLabel: string;
  unit: "count" | "percent" | "days";
  better: "higher" | "lower";
  selectedId: string;
  youId: string;
  onPick: (id: string) => void;
}) {
  const byGrade = useMemo(() => {
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const grade = row.person?.forecasterRole ?? "Unlisted";
      groups.set(grade, [...(groups.get(grade) ?? []), row]);
    }
    // The order the team itself uses, with anything unexpected after it.
    const known = ["Director", "Head Of", "Senior", "Strategist"];
    return [...groups.entries()]
      .map(([grade, people]) => {
        // Ranked inside the grade, which is the only ranking that means
        // anything: the metric's own sense of "better" decides which end is
        // the top, so days-late does not read as a leaderboard upside down.
        const ranked = [...people].sort((a, b) => {
          const av = a.value ?? 0;
          const bv = b.value ?? 0;
          return better === "lower" ? av - bv : bv - av;
        });
        return [grade, ranked] as const;
      })
      .sort(
        (a, b) =>
          (known.indexOf(a[0]) + 1 || 99) - (known.indexOf(b[0]) + 1 || 99) ||
          a[0].localeCompare(b[0]),
      );
  }, [rows, better]);

  const best = Math.max(1, ...rows.map((r) => r.value ?? 0));

  return (
    <div className="team-panel">
      {byGrade.map(([grade, people]) => (
        <section key={grade}>
          <h3 className="team-grade">{grade}</h3>
          {people.map((row) => (
            <button
              key={row.personId}
              className={row.personId === selectedId ? "team-row on" : "team-row"}
              onClick={() => onPick(row.personId)}
              aria-pressed={row.personId === selectedId}
            >
              <span className="team-name">
                {row.person?.name ?? row.personId}
                {row.personId === youId && <span className="team-you">You</span>}
              </span>
              <span className="team-vertical">{row.person?.vertical ?? ""}</span>
              {/* The bar is the comparison; the number is the fact. */}
              <span className="team-track" aria-hidden="true">
                <span
                  className="team-fill"
                  style={{ width: `${((row.value ?? 0) / best) * 100}%` }}
                />
              </span>
              <span className="team-value">{formatValue(row.value, unit)}</span>
            </button>
          ))}
        </section>
      ))}
      <p className="muted small team-foot">
        <Icon name="info" size={12} /> {metricLabel}, this range, {better === "lower" ? "least" : "most"}{" "}
        first within each grade. Pick anyone to open their whole set of numbers.
      </p>
    </div>
  );
}

/**
 * What every metric means, in one place.
 *
 * It existed as a column in a deck and a tab in a spreadsheet, which is two
 * places nobody looks while staring at a number they do not recognise. The
 * definitions are the metrics' own — the same text the API already serves —
 * so there is no second copy to fall out of step.
 */
export function Glossary({ results }: { results: MetricResult[] }) {
  const groups = [...new Set(results.map((r) => r.definition.group))];
  return (
    <div className="glossary">
      {groups.map((group) => (
        <section key={group}>
          <h3 className="glossary-group">{group}</h3>
          <dl>
            {results
              .filter((r) => r.definition.group === group)
              .map((r) => (
                <div key={r.definition.id}>
                  <dt>
                    {r.definition.label}
                    {r.definition.notKpi && <span className="glossary-tag">not a KPI</span>}
                    {/* The same word the tiles use, rather than a second name
                        for the same thing on the page that explains them. */}
                    {r.definition.source === "supplied" && (
                      <span className="glossary-tag">supplied</span>
                    )}
                  </dt>
                  <dd>{r.definition.description}</dd>
                </div>
              ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
