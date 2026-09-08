import { useState } from "react";
import type { MetricDefinition, MetricResult, Person } from "../types";

/**
 * Charts for the KPI page.
 *
 * All single-measure, so there is no categorical palette to get wrong: one
 * hue (Future Dusk) carries every bar, and where one bar needs emphasis it
 * takes the full accent while the rest take a lighter step of the same hue.
 * Both steps clear 3:1 against the surface and are 15+ ΔE apart, so they are
 * told apart by full-colour and colour-blind readers alike — and every bar in
 * the ranked chart is labelled with its value, so identity is never colour
 * alone.
 */

const ACCENT = "var(--accent)";
const ACCENT_SOFT = "var(--accent-soft)";

export function formatValue(
  value: number | null,
  unit: MetricDefinition["unit"],
): string {
  if (value === null) return "—";
  if (unit === "percent") return `${Math.round(value)}%`;
  if (unit === "days") return `${value}`;
  return String(value);
}

export function unitSuffix(unit: MetricDefinition["unit"]): string {
  return unit === "days" ? " days" : "";
}

/**
 * A tile's sparkline: one bar per period, no axis, no labels. It shows shape,
 * and the figure above it carries the number.
 */
export function SparkBars({
  series,
  unit,
}: {
  series: MetricResult["series"];
  unit: MetricDefinition["unit"];
}) {
  const values = series.map((p) => p.value ?? 0);
  // Nothing to show a shape of — a row of flat stubs reads as a stray axis.
  if (values.every((v) => v === 0)) return null;
  const max = Math.max(...values, 1);
  const width = 100;
  const height = 26;
  const gap = 2;
  const barWidth = Math.max(2, (width - gap * (series.length - 1)) / series.length);

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Trend by period: ${series
        .map((p) => `${p.label} ${formatValue(p.value, unit)}`)
        .join(", ")}`}
    >
      {series.map((point, i) => {
        const value = point.value ?? 0;
        // Zero is drawn as a track stub in the rule colour, so an empty month
        // reads as "nothing here" rather than as a very small value.
        const zero = value === 0;
        const barHeight = zero ? 1 : Math.max(1.5, (value / max) * height);
        return (
          <rect
            key={point.period}
            x={i * (barWidth + gap)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            rx={zero ? 0 : 1}
            fill={zero ? "var(--rule)" : ACCENT_SOFT}
          />
        );
      })}
    </svg>
  );
}

/**
 * The selected metric by period. Bars anchored to the baseline, a recessive
 * grid, the last value labelled, and a hover tooltip on every bar — an SVG
 * chart in a browser should answer "what is that one" without a click.
 */
export function PeriodBars({ result }: { result: MetricResult }) {
  const [hover, setHover] = useState<number | null>(null);
  const { series, definition } = result;

  const values = series.map((p) => p.value ?? 0);
  const max = Math.max(...values, definition.target ?? 0, 1);
  const height = 190;
  const padTop = 14;
  const padBottom = 26;
  const plot = height - padTop - padBottom;
  const gap = 6;
  const slot = 100 / series.length;

  const y = (value: number) => padTop + plot - (value / max) * plot;

  return (
    <div className="chart-wrap">
      <svg
        className="chart"
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${definition.label} by period`}
      >
        {/* Grid at quarter steps, behind the marks and deliberately faint. */}
        {[0.25, 0.5, 0.75, 1].map((step) => (
          <line
            key={step}
            x1={0}
            x2={100}
            y1={y(max * step)}
            y2={y(max * step)}
            stroke="var(--rule)"
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {definition.target !== undefined && definition.target <= max && (
          <line
            x1={0}
            x2={100}
            y1={y(definition.target)}
            y2={y(definition.target)}
            stroke="var(--ink-45)"
            strokeWidth={1}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {series.map((point, i) => {
          const value = point.value ?? 0;
          const top = y(value);
          const barHeight = Math.max(point.value === null ? 0 : 1, padTop + plot - top);
          return (
            <g key={point.period}>
              <rect
                x={i * slot + gap / 2}
                y={top}
                width={slot - gap}
                height={barHeight}
                rx={1.5}
                fill={hover === i ? ACCENT : ACCENT}
                opacity={hover === null || hover === i ? 1 : 0.55}
              />
              {/* Hit target spans the full slot, so hovering is forgiving. */}
              <rect
                x={i * slot}
                y={padTop}
                width={slot}
                height={plot}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}

        <line
          x1={0}
          x2={100}
          y1={padTop + plot}
          y2={padTop + plot}
          stroke="var(--rule-strong)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Period labels sit outside the SVG so they never stretch with it. */}
      <div className="chart-axis" style={{ gridTemplateColumns: `repeat(${series.length}, 1fr)` }}>
        {series.map((point, i) => (
          <span key={point.period} className={hover === i ? "on" : undefined}>
            {point.label}
          </span>
        ))}
      </div>

      <div className="chart-readout" aria-live="polite">
        {hover === null ? (
          <>
            <strong>{formatValue(series[series.length - 1]?.value ?? null, definition.unit)}</strong>{" "}
            in {series[series.length - 1]?.label}
            {definition.target !== undefined && (
              <span className="chart-target">
                {" · target "}
                {formatValue(definition.target, definition.unit)}
              </span>
            )}
          </>
        ) : (
          <>
            <strong>{formatValue(series[hover].value, definition.unit)}</strong>
            {unitSuffix(definition.unit)} in {series[hover].label}
            {series[hover].value === null && " — no data"}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * One metric across the team, ranked. The signed-in person's own bar takes
 * the accent; everyone else takes the lighter step. Values are labelled on
 * every bar, and names are on the axis, so nothing depends on colour.
 */
export function TeamBars({
  rows,
  definition,
  highlightId,
}: {
  rows: { personId: string; value: number | null; person: Person | null }[];
  definition: MetricDefinition;
  highlightId?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value ?? 0), definition.target ?? 0, 1);

  return (
    <div className="team-bars">
      {rows.map((row) => {
        const mine = row.personId === highlightId;
        const width = ((row.value ?? 0) / max) * 100;
        return (
          <div className={`team-bar${mine ? " mine" : ""}`} key={row.personId}>
            <span className="team-bar-name">
              {row.person?.name ?? row.personId}
              {mine && <span className="team-bar-you"> you</span>}
            </span>
            <span className="team-bar-track">
              <span
                className="team-bar-fill"
                style={{
                  width: `${Math.max(row.value === null ? 0 : 0.8, width)}%`,
                  background: mine ? ACCENT : ACCENT_SOFT,
                }}
              />
            </span>
            <span className="team-bar-value">
              {formatValue(row.value, definition.unit)}
              {row.value === null && <span className="team-bar-none"> no data</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The table behind every chart, for anyone who would rather read numbers. */
export function SeriesTable({ results }: { results: MetricResult[] }) {
  const periods = results[0]?.series ?? [];
  return (
    <div className="table-wrap">
      <table className="schedule">
        <thead>
          <tr>
            <th>Metric</th>
            {periods.map((p) => (
              <th key={p.period} style={{ textAlign: "right" }}>
                {p.label}
              </th>
            ))}
            <th style={{ textAlign: "right" }}>Range</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr key={result.definition.id}>
              <td>{result.definition.label}</td>
              {result.series.map((point) => (
                <td key={point.period} className="num" style={{ textAlign: "right" }}>
                  {formatValue(point.value, result.definition.unit)}
                </td>
              ))}
              <td className="num" style={{ textAlign: "right", fontWeight: 500 }}>
                {formatValue(result.value, result.definition.unit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
