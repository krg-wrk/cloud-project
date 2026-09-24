import { useSearchParams } from "react-router-dom";
import { query, useApi } from "../lib/api";
import { monthLabel } from "../lib/date";
import { useViewer } from "../lib/viewer";
import type { Person, Taxonomy } from "../types";
import { ErrorNote, Loading } from "../components/bits";
import PageIntro from "../components/PageIntro";
import ShareLink from "../components/ShareLink";

/**
 * Whether the schedule follows the methodology, a group at a time.
 *
 * The grid answers one question — is each level of content pointed at the
 * year it should be working to — and it answers it by month, because that is
 * the shape of the argument: a group drifts over a season rather than on a
 * particular Tuesday. Rows that cannot be judged are shown rather than
 * hidden; an untagged forecast is the most actionable thing on the page.
 */

type Verdict = "on-plan" | "early" | "late" | "untagged" | "no-lead";

interface PlanRow {
  id: string;
  title: string;
  type: string;
  vertical: string;
  category: string | null;
  forecasterId: string;
  date: string;
  groupId: string | null;
  horizon: string | null;
  horizonYear: number | null;
  expected: number[] | null;
  alignment: Verdict;
}

interface PlanData {
  against: "submissionDate" | "publicationDate";
  groups: { id: string; name: string }[];
  rows: PlanRow[];
  tally: Record<Verdict, number>;
  workshops: { id: string; title: string; kind: string; startDate: string; endDate: string }[];
  holidays: { id: string; title: string; region: string | null; startDate: string; endDate: string }[];
}

/** The five verdicts, in the order somebody acts on them. */
const VERDICTS: { key: Verdict; label: string; why: string }[] = [
  { key: "late", label: "Behind", why: "Pointed at a nearer year than its level works to" },
  { key: "early", label: "Ahead", why: "Pointed further out than its level works to" },
  { key: "untagged", label: "Untagged", why: "No horizon recorded, so nothing can be said" },
  { key: "no-lead", label: "No lead agreed", why: "The format has no agreed lead time yet" },
  { key: "on-plan", label: "On plan", why: "Pointed at the year its level works to" },
];

const monthsOf = (year: string) =>
  Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

export default function Plan() {
  const [params, setParams] = useSearchParams();
  const { me } = useViewer();
  const people = useApi<Person[]>("/people");
  const taxonomy = useApi<Taxonomy>("/taxonomy");

  const year = params.get("year") ?? String(new Date().getFullYear());
  const against = params.get("dateField") === "submissionDate" ? "submissionDate" : "publicationDate";
  const layers = params.get("layers") ?? "";
  const only = params.get("alignment") ?? "";

  const filters = {
    dateField: against,
    from: `${year}-01-01`,
    to: `${year}-12-31`,
    type: params.get("type") || undefined,
    vertical: params.get("vertical") || undefined,
    category: params.get("category") || undefined,
    forecaster: params.get("forecaster") || undefined,
    group: params.get("group") || undefined,
    layers: layers || undefined,
  };
  const { data, error, loading } = useApi<PlanData>(`/plan${query(filters)}`);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  function toggleLayer(name: string) {
    const on = layers.split(",").filter(Boolean);
    setParam("layers", on.includes(name) ? on.filter((l) => l !== name).join(",") : [...on, name].join(","));
  }

  if (!me.seesWholeTeam) {
    return (
      <div className="page-head">
        <div>
          <div className="eyebrow">Commissioning</div>
          <h1 className="page-title">The plan</h1>
          <p className="page-sub">
            The commissioning plan is for commissioning managers. Your own work is on{" "}
            Deadlines, and the calendar shows what is coming.
          </p>
        </div>
      </div>
    );
  }

  if (error) return <ErrorNote message={error} />;
  if (loading || !data || !people.data) return <Loading what="the plan" />;

  const months = monthsOf(year);
  const shown = only ? data.rows.filter((r) => r.alignment === only) : data.rows;

  /** One cell per group and month, so the grid is built once rather than filtered 120 times. */
  const cells = new Map<string, PlanRow[]>();
  for (const row of shown) {
    const key = `${row.groupId ?? "ungrouped"}|${row.date.slice(0, 7)}`;
    const at = cells.get(key);
    if (at) at.push(row);
    else cells.set(key, [row]);
  }

  const groups = [...data.groups, { id: "ungrouped", name: "Not in a group" }];
  const holidaysByMonth = new Map<string, number>();
  for (const h of data.holidays) {
    const m = h.startDate.slice(0, 7);
    holidaysByMonth.set(m, (holidaysByMonth.get(m) ?? 0) + 1);
  }
  const workshopsByMonth = new Map<string, number>();
  for (const w of data.workshops) {
    const m = w.startDate.slice(0, 7);
    workshopsByMonth.set(m, (workshopsByMonth.get(m) ?? 0) + 1);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Commissioning</div>
          <h1 className="page-title">The plan</h1>
          <PageIntro>
            Whether each level of content is pointed at the year it works to, month by
            month. Read against the {against === "submissionDate" ? "submission" : "live"} date.
          </PageIntro>
        </div>
        <ShareLink label="Copy link to this view" />
      </div>

      <div className="filters">
        <div className="field">
          <label htmlFor="p-year">Year</label>
          <select id="p-year" value={year} onChange={(e) => setParam("year", e.target.value)}>
            {["2025", "2026", "2027", "2028"].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="p-date">Measured against</label>
          <select id="p-date" value={against} onChange={(e) => setParam("dateField", e.target.value)}>
            <option value="submissionDate">Submission date</option>
            <option value="publicationDate">Live date</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="p-group">Group</label>
          <select id="p-group" value={params.get("group") ?? ""} onChange={(e) => setParam("group", e.target.value)}>
            <option value="">All groups</option>
            {data.groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="p-type">Format</label>
          <select id="p-type" value={params.get("type") ?? ""} onChange={(e) => setParam("type", e.target.value)}>
            <option value="">All formats</option>
            {(taxonomy.data?.contentTypes ?? []).map((t) => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="p-vertical">Vertical</label>
          <select id="p-vertical" value={params.get("vertical") ?? ""} onChange={(e) => setParam("vertical", e.target.value)}>
            <option value="">All verticals</option>
            {[...new Set(data.rows.map((r) => r.vertical))].sort().map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="p-category">Category</label>
          <select id="p-category" value={params.get("category") ?? ""} onChange={(e) => setParam("category", e.target.value)}>
            <option value="">All categories</option>
            {[...new Set(data.rows.map((r) => r.category).filter(Boolean))].sort().map((c) => (
              <option key={c as string} value={c as string}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="p-who">Forecaster</label>
          <select id="p-who" value={params.get("forecaster") ?? ""} onChange={(e) => setParam("forecaster", e.target.value)}>
            <option value="">Everyone</option>
            {(people.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Layers a plan is read against. Leave and activity days are deliberately
          not offered: they say who is available, not what is being forecast. */}
      <div className="filters" style={{ paddingTop: 0 }}>
        <button
          className={layers.includes("workshops") ? "btn solid" : "btn"}
          onClick={() => toggleLayer("workshops")}
        >
          Workshops and R&amp;D
        </button>
        <button
          className={layers.includes("holidays") ? "btn solid" : "btn"}
          onClick={() => toggleLayer("holidays")}
        >
          Public holidays
        </button>
      </div>

      <div className="plan-tally">
        {VERDICTS.map((v) => (
          <button
            key={v.key}
            className={`plan-chip plan-${v.key}${only === v.key ? " on" : ""}`}
            title={v.why}
            onClick={() => setParam("alignment", only === v.key ? "" : v.key)}
          >
            <b>{data.tally[v.key]}</b> {v.label}
          </button>
        ))}
      </div>

      <div className="plan-scroll">
        <table className="plan-grid">
          <thead>
            <tr>
              <th scope="col">Group</th>
              {months.map((m) => (
                <th key={m} scope="col">{monthLabel(m).split(" ")[0]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id}>
                <th scope="row">{g.name}</th>
                {months.map((m) => {
                  const here = cells.get(`${g.id}|${m}`) ?? [];
                  if (!here.length) return <td key={m} className="plan-cell" />;
                  const worst =
                    here.find((r) => r.alignment === "late")?.alignment ??
                    here.find((r) => r.alignment === "early")?.alignment ??
                    here.find((r) => r.alignment === "untagged")?.alignment ??
                    here[0].alignment;
                  const years = [...new Set(here.map((r) => r.horizonYear).filter(Boolean))].sort();
                  return (
                    <td key={m} className={`plan-cell plan-${worst}`} title={here.map((r) => r.title).slice(0, 8).join("\n")}>
                      <b>{here.length}</b>
                      {years.length > 0 && <span className="plan-years">{years.join(", ")}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {(layers.includes("workshops") || layers.includes("holidays")) && (
              <tr className="plan-layer">
                <th scope="row">Alongside</th>
                {months.map((m) => (
                  <td key={m} className="plan-cell">
                    {layers.includes("workshops") && workshopsByMonth.get(m) ? (
                      <span className="plan-aside">{workshopsByMonth.get(m)} workshops</span>
                    ) : null}
                    {layers.includes("holidays") && holidaysByMonth.get(m) ? (
                      <span className="plan-aside">{holidaysByMonth.get(m)} holidays</span>
                    ) : null}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {shown.length === 0 && (
        <div className="empty">
          Nothing in {year} matches those filters. The plan reads the whole schedule, so a
          year with no rows usually means the filters rather than the sheet.
        </div>
      )}
    </>
  );
}
