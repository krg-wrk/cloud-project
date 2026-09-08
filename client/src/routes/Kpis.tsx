import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { query, useApi } from "../lib/api";
import { formatLong } from "../lib/date";
import { useViewer } from "../lib/viewer";
import type { KpiResponse, MetricResult, TeamKpiResponse } from "../types";
import { ErrorNote, Loading } from "../components/bits";
import { PeriodBars, SeriesTable, SparkBars, TeamBars, formatValue } from "../components/charts";
import ShareLink from "../components/ShareLink";

const RANGES: { value: string; label: string }[] = [
  { value: "this-quarter", label: "This quarter" },
  { value: "last-quarter", label: "Last quarter" },
  { value: "year-to-date", label: "Year to date" },
  { value: "last-6-months", label: "Last 6 months" },
  { value: "last-12-months", label: "Last 12 months" },
];

/** Whether a change is good news depends on the metric, not its sign. */
function changeTone(result: MetricResult): "good" | "bad" | "flat" {
  if (result.value === null || result.previous === null) return "flat";
  const delta = result.value - result.previous;
  if (delta === 0) return "flat";
  const up = delta > 0;
  return (result.definition.better === "higher") === up ? "good" : "bad";
}

function changeText(result: MetricResult): string | null {
  if (result.value === null || result.previous === null) return null;
  const delta = result.value - result.previous;
  if (delta === 0) return "level with the period before";
  const rounded = Math.round(Math.abs(delta) * 10) / 10;
  const word = delta > 0 ? "up" : "down";
  const unit = result.definition.unit === "percent" ? " points" : "";
  return `${word} ${rounded}${unit} on the period before`;
}

function MetricTile({
  result,
  selected,
  onSelect,
}: {
  result: MetricResult;
  selected: boolean;
  onSelect: () => void;
}) {
  const { definition } = result;
  const tone = changeTone(result);
  const change = changeText(result);

  return (
    <button
      className={`kpi-tile${selected ? " on" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="kpi-label">{definition.label}</span>
      <span className="kpi-value">{formatValue(result.value, definition.unit)}</span>
      {definition.target !== undefined && (
        <span className="kpi-target">
          Target {formatValue(definition.target, definition.unit)}
          {definition.better === "lower" ? " or under" : " or better"}
        </span>
      )}

      {result.awaitingData ? (
        <span className="kpi-awaiting">Awaiting data</span>
      ) : (
        <>
          {/* The word carries the direction; colour only reinforces it. */}
          {change && <span className={`kpi-change ${tone}`}>{change}</span>}
          <SparkBars series={result.series} unit={definition.unit} />
        </>
      )}

      {definition.source === "supplied" && <span className="kpi-source">Supplied</span>}
    </button>
  );
}

export default function Kpis() {
  const [params, setParams] = useSearchParams();
  const { me, people, isManager } = useViewer();

  const range = params.get("range") ?? "last-6-months";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const person = params.get("person") ?? me.personId ?? "";
  const [showTable, setShowTable] = useState(false);

  const path = `/kpis${query({
    person: person || undefined,
    range: range === "custom" ? "custom" : range,
    from: range === "custom" ? from : undefined,
    to: range === "custom" ? to : undefined,
  })}`;
  const kpis = useApi<KpiResponse>(path);

  const results = kpis.data?.metrics ?? [];
  const selectedId = params.get("metric") ?? "";
  const selected = results.find((r) => r.definition.id === selectedId) ?? results[0];

  const teamPath =
    isManager && selected
      ? `/kpis/team${query({
          metric: selected.definition.id,
          range: range === "custom" ? "custom" : range,
          from: range === "custom" ? from : undefined,
          to: range === "custom" ? to : undefined,
        })}`
      : null;
  const team = useApi<TeamKpiResponse>(teamPath ?? "/health");

  function setParam(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  }

  if (kpis.error) return <ErrorNote message={kpis.error} />;

  const groups = [...new Set(results.map((r) => r.definition.group))];
  const subject = kpis.data?.person;
  const awaiting = results.filter((r) => r.awaitingData);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {subject ? `${subject.name} · ${subject.vertical ?? "Commissioning"}` : "KPIs"}
          </div>
          <h1 className="page-title">Performance</h1>
          <p className="page-sub">
            {isManager
              ? "How the work is going, per forecaster and across the team. Pick a range, pick a metric, and the URL holds both."
              : "How your year is going. Pick a range and a metric — the URL holds both, so a view is a link."}
          </p>
        </div>
        <ShareLink label="Copy link" />
      </div>

      <div className="filters">
        <div className="field">
          <label>Range</label>
          <div className="kind-rail">
            {RANGES.map((r) => (
              <button
                key={r.value}
                className={range === r.value ? "btn accent" : "btn"}
                onClick={() => setParam("range", r.value)}
              >
                {r.label}
              </button>
            ))}
            <button
              className={range === "custom" ? "btn accent" : "btn"}
              onClick={() => setParam("range", "custom")}
            >
              Custom
            </button>
          </div>
        </div>

        {range === "custom" && (
          <>
            <label className="field">
              <span style={{ display: "none" }}>From</span>
              <label>From</label>
              <input type="date" value={from} onChange={(e) => setParam("from", e.target.value)} />
            </label>
            <label className="field">
              <label>To</label>
              <input type="date" value={to} onChange={(e) => setParam("to", e.target.value)} />
            </label>
          </>
        )}

        {isManager && (
          <div className="field">
            <label htmlFor="kpi-person">Forecaster</label>
            <select
              id="kpi-person"
              value={person}
              onChange={(e) => setParam("person", e.target.value)}
            >
              {people
                .filter((p) => p.role === "forecaster")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
        )}

        <div className="filters-right">
          {kpis.data && (
            <span style={{ fontSize: 12, color: "var(--ink-45)" }}>
              {formatLong(kpis.data.range.from)} — {formatLong(kpis.data.range.to)}
            </span>
          )}
          <button className={showTable ? "btn accent" : "btn"} onClick={() => setShowTable((v) => !v)}>
            {showTable ? "Charts" : "Table"}
          </button>
        </div>
      </div>

      {kpis.loading && !kpis.data ? (
        <Loading what="the numbers" />
      ) : showTable ? (
        <SeriesTable results={results} />
      ) : (
        <>
          {groups.map((group) => (
            <section className="section" key={group}>
              <div className="section-head">
                <h2 className="section-title">{group}</h2>
              </div>
              <div className="kpi-grid">
                {results
                  .filter((r) => r.definition.group === group)
                  .map((result) => (
                    <MetricTile
                      key={result.definition.id}
                      result={result}
                      selected={selected?.definition.id === result.definition.id}
                      onSelect={() => setParam("metric", result.definition.id)}
                    />
                  ))}
              </div>
            </section>
          ))}

          {selected && (
            <section className="section">
              <div className="section-head">
                <h2 className="section-title">
                  {selected.definition.label} by{" "}
                  {kpis.data?.range.bucket === "quarter" ? "quarter" : "month"}
                </h2>
                <span style={{ fontSize: 12, color: "var(--ink-45)" }}>
                  {selected.definition.source === "derived"
                    ? "Worked out from the schedule"
                    : "Supplied from outside the Hub"}
                </span>
              </div>
              <p className="page-sub" style={{ marginTop: 0, marginBottom: 14 }}>
                {selected.definition.description}
              </p>
              {selected.awaitingData ? (
                <div className="empty">
                  No readings for this metric yet — it comes from outside the Hub.
                </div>
              ) : (
                <PeriodBars result={selected} />
              )}
            </section>
          )}

          {isManager && selected && team.data?.definition && !selected.awaitingData && (
            <section className="section">
              <div className="section-head">
                <h2 className="section-title">
                  {team.data.definition.label} across the team
                </h2>
                <span style={{ fontSize: 12, color: "var(--ink-45)" }}>
                  {team.data.definition.better === "higher" ? "Most first" : "Least first"}
                </span>
              </div>
              <TeamBars
                rows={team.data.rows}
                definition={team.data.definition}
                highlightId={person}
              />
            </section>
          )}

          {awaiting.length > 0 && (
            <div className="callout">
              <strong>
                {awaiting.length} metric{awaiting.length === 1 ? "" : "s"} awaiting data.
              </strong>{" "}
              {awaiting.map((r) => r.definition.label).join(", ")} come from outside the Hub.
              The shape is set — point the KPI sheet at them and the numbers appear here.
            </div>
          )}
        </>
      )}
    </>
  );
}
