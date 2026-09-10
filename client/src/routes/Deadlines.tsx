import { Link, useSearchParams } from "react-router-dom";
import { query, useApi } from "../lib/api";
import { Slot, useCustom } from "../lib/custom";
import { useRemembered } from "../lib/remember";
import { TODAY, formatShort, relativeDays } from "../lib/date";
import { STATUS_LABELS, STATUS_ORDER, isOverdue, personName } from "../lib/domain";
import { useViewer } from "../lib/viewer";
import type { ContentItem, Person, Taxonomy } from "../types";
import type { ReactNode } from "react";
import { ErrorNote, Loading, StatusPill, Who } from "../components/bits";
import ShareLink from "../components/ShareLink";

/** Columns that hold a figure or a date, so they set in the mono face. */
const NUMERIC = new Set([
  "deadlines.column.season",
  "deadlines.column.publication",
]);

const VERTICALS = [
  "Womenswear", "Menswear", "Beauty", "Interiors & Lifestyle",
  "Footwear & Accessories", "Food & Drink", "Consumer Tech", "Kidswear",
];

/** The filters this page owns, and therefore remembers per person. */
const REMEMBERED = ["forecaster", "vertical", "type", "status", "q"];

export default function Deadlines() {
  const [params, setParams] = useSearchParams();
  const { person, isManager, me } = useViewer();
  const custom = useCustom();

  // What this person last filtered to, when the address carries nothing.
  useRemembered("deadlines", me.email, REMEMBERED, params, setParams);
  const people = useApi<Person[]>("/people");
  // The formats we publish, and their tiers, come from the taxonomy.
  const taxonomy = useApi<Taxonomy>("/taxonomy");

  // A forecaster's default view is their own list; the filter can widen it.
  const forecaster =
    params.get("forecaster") ?? (isManager ? "" : (person?.id ?? ""));
  const filters = {
    forecaster: forecaster || undefined,
    vertical: params.get("vertical") || undefined,
    type: params.get("type") || undefined,
    status: params.get("status") || undefined,
    q: params.get("q") || undefined,
    dateField: "submissionDate" as const,
  };

  const { data, error, loading } = useApi<ContentItem[]>(`/content${query(filters)}`);

  function setParam(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  }

  if (error) return <ErrorNote message={error} />;

  const rows = data ?? [];
  const upcoming = rows.filter((r) => r.submissionDate >= TODAY);
  const columns = custom.group("deadlines.column");

  return (
    <>
      <div className="page-head">
        <div>
          <Slot id="deadlines.eyebrow" as="div" className="eyebrow" />
          <Slot id="deadlines.title" as="h1" className="page-title" />
          <Slot id="deadlines.sub" as="p" className="page-sub" />
        </div>
      </div>

      <div className="filters">
        <div className="field">
          <Slot id="deadlines.filter.forecaster" as="label" />
          <select
            id="f-who"
            value={forecaster}
            onChange={(e) => setParam("forecaster", e.target.value)}
          >
            <option value="">Everyone</option>
            {(people.data ?? [])
              .filter((p) => p.role === "forecaster")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
        <div className="field">
          <Slot id="deadlines.filter.vertical" as="label" />
          <select
            id="f-vertical"
            value={params.get("vertical") ?? ""}
            onChange={(e) => setParam("vertical", e.target.value)}
          >
            <option value="">All verticals</option>
            {VERTICALS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <Slot id="deadlines.filter.type" as="label" />
          <select
            id="f-type"
            value={params.get("type") ?? ""}
            onChange={(e) => setParam("type", e.target.value)}
          >
            <option value="">All formats</option>
            {(taxonomy.data?.contentTypes ?? []).map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} — Tier {t.tier}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <Slot id="deadlines.filter.status" as="label" />
          <select
            id="f-status"
            value={params.get("status") ?? ""}
            onChange={(e) => setParam("status", e.target.value)}
          >
            <option value="">Any status</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <Slot id="deadlines.filter.search" as="label" />
          <input
            id="f-q"
            type="search"
            placeholder="Title, season, vertical…"
            value={params.get("q") ?? ""}
            onChange={(e) => setParam("q", e.target.value)}
          />
        </div>
        <div className="filters-right">
          <span style={{ fontSize: 12, color: "var(--ink-45)" }}>
            {rows.length} forecasts · {upcoming.length} still to come
          </span>
          <ShareLink label="Copy link" />
        </div>
      </div>

      {loading || !data ? (
        <Loading what="deadlines" />
      ) : rows.length === 0 ? (
        <div className="empty">Nothing matches those filters.</div>
      ) : (
        <div className="table-wrap">
          {/*
            The columns are the admin's: which ones, in what order, called
            what. Each is a cell renderer keyed by its slot id, so hiding one
            drops it from the head and the body together.
          */}
          <table className="schedule">
            <thead>
              <tr>
                {columns.map((slot) => (
                  <th key={slot.id} className={NUMERIC.has(slot.id) ? "num" : undefined}>
                    <Slot id={slot.id} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const cells: Record<string, ReactNode> = {
                  "deadlines.column.submission": (
                    <>
                      {formatShort(item.submissionDate)}
                      <div style={{ fontSize: 10, opacity: 0.7 }}>
                        {relativeDays(item.submissionDate)}
                      </div>
                    </>
                  ),
                  "deadlines.column.title": (
                    <Link to={`/content/${item.id}`} className="row-title">
                      {item.title}
                    </Link>
                  ),
                  "deadlines.column.type": item.type,
                  "deadlines.column.vertical": item.vertical,
                  "deadlines.column.season": item.season,
                  "deadlines.column.forecaster": (
                    <Link to={`/team/${item.forecasterId}`}>
                      <Who
                        id={item.forecasterId}
                        name={personName(people.data ?? [], item.forecasterId)}
                      />
                    </Link>
                  ),
                  "deadlines.column.publication": formatShort(item.publicationDate),
                  "deadlines.column.status": <StatusPill status={item.status} />,
                };
                return (
                  <tr key={item.id}>
                    {columns.map((slot) => (
                      <td
                        key={slot.id}
                        className={
                          slot.id === "deadlines.column.submission"
                            ? isOverdue(item)
                              ? "num overdue"
                              : "num"
                            : NUMERIC.has(slot.id)
                              ? "num"
                              : undefined
                        }
                      >
                        {cells[slot.id]}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
