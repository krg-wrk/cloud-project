import { Link, useSearchParams } from "react-router-dom";
import { query, useApi } from "../lib/api";
import { TODAY, formatShort, relativeDays } from "../lib/date";
import { STATUS_LABELS, STATUS_ORDER, isOverdue, personName } from "../lib/domain";
import { useViewer } from "../lib/viewer";
import type { ContentItem, Person } from "../types";
import { ErrorNote, Loading, StatusPill, Who } from "../components/bits";
import ShareLink from "../components/ShareLink";

const VERTICALS = [
  "Womenswear", "Menswear", "Beauty", "Interiors & Lifestyle",
  "Footwear & Accessories", "Food & Drink", "Consumer Tech", "Kidswear",
];

const TYPES = [
  "Big Idea", "Season Forecast", "Catwalk Report", "Colour Forecast",
  "Consumer Attitudes", "Trend Curve", "Case Study", "Market Report",
];

export default function Deadlines() {
  const [params, setParams] = useSearchParams();
  const { person, isManager } = useViewer();
  const people = useApi<Person[]>("/people");

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

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Submission deadlines</div>
          <h1 className="page-title">Deadlines</h1>
          <p className="page-sub">
            Every commissioned forecast and the date its copy is due. Filter it,
            then send the link — whoever opens it sees the same list.
          </p>
        </div>
      </div>

      <div className="filters">
        <div className="field">
          <label htmlFor="f-who">Forecaster</label>
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
          <label htmlFor="f-vertical">Vertical</label>
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
          <label htmlFor="f-type">Type</label>
          <select
            id="f-type"
            value={params.get("type") ?? ""}
            onChange={(e) => setParam("type", e.target.value)}
          >
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-status">Status</label>
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
          <label htmlFor="f-q">Search</label>
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
          <table className="schedule">
            <thead>
              <tr>
                <th>Due</th>
                <th>Title</th>
                <th>Type</th>
                <th>Vertical</th>
                <th>Season</th>
                <th>Forecaster</th>
                <th>Publishes</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td className={isOverdue(item) ? "num overdue" : "num"}>
                    {formatShort(item.submissionDate)}
                    <div style={{ fontSize: 10, opacity: 0.7 }}>
                      {relativeDays(item.submissionDate)}
                    </div>
                  </td>
                  <td>
                    <Link to={`/content/${item.id}`} className="row-title">
                      {item.title}
                    </Link>
                  </td>
                  <td>{item.type}</td>
                  <td>{item.vertical}</td>
                  <td className="num">{item.season}</td>
                  <td>
                    <Link to={`/team/${item.forecasterId}`}>
                      <Who
                        id={item.forecasterId}
                        name={personName(people.data ?? [], item.forecasterId)}
                      />
                    </Link>
                  </td>
                  <td className="num">{formatShort(item.publicationDate)}</td>
                  <td>
                    <StatusPill status={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
