import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { query, useApi } from "../lib/api";
import { Slot, useCustom } from "../lib/custom";
import { useRemembered } from "../lib/remember";
import { TODAY, formatShort, relativeDays } from "../lib/date";
import { STATUS_LABELS, STATUS_ORDER, isOverdue, personName } from "../lib/domain";
import { useViewer } from "../lib/viewer";
import type { BulkResult, ContentItem, Person, Taxonomy } from "../types";
import type { ReactNode } from "react";
import { ErrorNote, Loading, StatusPill, Who } from "../components/bits";
import ShareLink from "../components/ShareLink";
import SaveView from "../components/SaveView";
import ExportButton from "../components/ExportButton";
import BulkSchedule, { BulkResultNote } from "../components/BulkSchedule";
import PageIntro from "../components/PageIntro";

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

  const { data, error, loading, reload } = useApi<ContentItem[]>(`/content${query(filters)}`);

  /*
   * What is ticked, for changing several deadlines at once.
   *
   * A Set of ids rather than a flag on each row, so re-reading the schedule
   * after a write does not lose the selection — and so a row that the filters
   * have since moved out of view cannot stay silently ticked: the bar only
   * ever sends the ids that are still on screen.
   */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /*
   * How the last bulk change went, held here rather than in the bar.
   *
   * The bar goes when the selection does, and the selection goes as soon as
   * the change lands — those rows are done. But a change to a submission date
   * changes what the table is sorted by, so the rows just written have often
   * moved, sometimes off the page. The report is the only evidence left, so
   * it stays until it is dismissed.
   */
  const [result, setResult] = useState<BulkResult | null>(null);
  const canPick = me.canWriteSchedule;

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

  // Only what is both ticked and still listed. A filter changed after ticking
  // should narrow what happens, not hide rows that are about to be written.
  const selected = canPick ? rows.filter((r) => picked.has(r.id)).map((r) => r.id) : [];
  const allShown = rows.length > 0 && selected.length === rows.length;

  function toggle(id: string) {
    setPicked((was) => {
      const next = new Set(was);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <Slot id="deadlines.eyebrow" as="div" className="eyebrow" />
          <Slot id="deadlines.title" as="h1" className="page-title" />
          <PageIntro>
            <Slot id="deadlines.sub" as="span" />
          </PageIntro>
        </div>
      </div>

      <div className="filters">
        <div className="field">
          <Slot id="deadlines.filter.forecaster" as="label" labels="f-who" />
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
          <Slot id="deadlines.filter.vertical" as="label" labels="f-vertical" />
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
          <Slot id="deadlines.filter.type" as="label" labels="f-type" />
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
          <Slot id="deadlines.filter.status" as="label" labels="f-status" />
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
          <Slot id="deadlines.filter.search" as="label" labels="f-q" />
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
          {/* The file holds what the filters left, not the whole sheet. */}
          <ExportButton
            label="Deadlines"
            rows={rows}
            columns={[
              { header: "Title", value: (r) => r.title },
              { header: "Type", value: (r) => r.type },
              { header: "Vertical", value: (r) => r.vertical },
              { header: "Forecast horizon", value: (r) => r.forecastHorizon },
              { header: "Forecaster", value: (r) => personName(people.data ?? [], r.forecasterId) },
              { header: "Status", value: (r) => STATUS_LABELS[r.status] },
              { header: "Submission date", value: (r) => r.submissionDate },
              { header: "Publication date", value: (r) => r.publicationDate },
              { header: "Late", value: (r) => (isOverdue(r) ? "Yes" : "No") },
            ]}
            small
          />
          <SaveView suggest="Deadlines" />
          <ShareLink label="Copy link" />
        </div>
      </div>

      {/*
        The bar appears once something is ticked rather than sitting empty
        above the table, so a page nobody is editing looks exactly as it did.
      */}
      {selected.length > 0 && (
        <BulkSchedule
          ids={selected}
          onClear={() => setPicked(new Set())}
          onApplied={(got) => {
            setResult(got);
            setPicked(new Set());
            reload();
          }}
        />
      )}
      {result && <BulkResultNote result={result} onDismiss={() => setResult(null)} />}

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
                {canPick && (
                  <th scope="col" className="pick">
                    <input
                      type="checkbox"
                      checked={allShown}
                      aria-label={
                        allShown ? "Clear the selection" : `Select all ${rows.length} forecasts`
                      }
                      onChange={() =>
                        setPicked(allShown ? new Set() : new Set(rows.map((r) => r.id)))
                      }
                    />
                  </th>
                )}
                {columns.map((slot) => (
                  <th scope="col" key={slot.id} className={NUMERIC.has(slot.id) ? "num" : undefined}>
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
                  "deadlines.column.season": item.forecastHorizon,
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
                  <tr key={item.id} className={picked.has(item.id) ? "picked" : undefined}>
                    {canPick && (
                      <td className="pick">
                        <input
                          type="checkbox"
                          checked={picked.has(item.id)}
                          // Named, because a column of unlabelled boxes is a
                          // column of "checkbox, checkbox, checkbox" read aloud.
                          aria-label={`Select ${item.title}`}
                          onChange={() => toggle(item.id)}
                        />
                      </td>
                    )}
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
