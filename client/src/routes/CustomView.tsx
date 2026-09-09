import { useState } from "react";
import { useParams } from "react-router-dom";
import { useApi } from "../lib/api";
import {
  dayOfMonth,
  formatMedium,
  isSameMonth,
  isWeekend,
  monthGrid,
  monthKey,
  monthLabel,
  shiftMonth,
  TODAY,
} from "../lib/date";
import { Icon } from "../lib/icons";
import { personHue } from "../lib/domain";
import type { Field, ViewPage, ViewSpec } from "../types";
import { ErrorNote, Loading } from "../components/bits";
import ShareLink from "../components/ShareLink";
import type { CSSProperties } from "react";

/**
 * One renderer for every view the studio can build.
 *
 * The spec says which column carries the title, the date, the status and so
 * on; this draws it. Nothing here knows what a trend profile or a forecast
 * is, which is the point — a view over a sheet nobody has seen yet gets the
 * same typography, the same empty states and the same addressable URL as the
 * pages written by hand.
 */
export default function CustomView() {
  const { slug = "" } = useParams();
  const { data, error, loading } = useApi<ViewPage>(`/views/${encodeURIComponent(slug)}`);

  if (error) return <ErrorNote message={error} />;
  if (loading || !data) return <Loading what="the view" />;

  const { view, fields, source, rows, total } = data;
  const spec = view.spec;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {view.state === "draft" ? "Draft — only admins can see this" : view.section}
          </div>
          <h1 className="page-title">
            <Icon name={view.icon} size={26} /> {view.label}
          </h1>
          {view.description && <p className="page-sub">{view.description}</p>}
        </div>
        <div className="head-figures">
          <div className="figure">
            <b>{total}</b>
            <span>{total === 1 ? "Row" : "Rows"}</span>
          </div>
        </div>
      </div>

      {/*
        Where the rows came from, on the page rather than buried in the
        studio. Someone looking at an unfamiliar view should be able to see
        which sheet it is drawn from without asking.
      */}
      <div className="view-source">
        <span>
          <Icon name="source" size={13} /> {source.dataset}
        </span>
        <span className="muted">
          via {source.connection} · {SOURCE_LABELS[source.kind] ?? source.kind}
        </span>
        {spec.filters.length > 0 && (
          <span className="muted">
            {spec.filters.length === 1 ? "1 filter" : `${spec.filters.length} filters`} applied
          </span>
        )}
        {total > rows.length && (
          <span className="muted">
            showing the first {rows.length} of {total}
          </span>
        )}
        <span className="view-source-right">
          <ShareLink />
        </span>
      </div>

      {data.error ? (
        <ErrorNote message={data.error} />
      ) : rows.length === 0 ? (
        <div className="empty">
          <Icon name={view.icon} size={22} />
          <p>
            Nothing matches this view yet.
            {spec.filters.length > 0 && " Its filters may be narrower than the data."}
          </p>
        </div>
      ) : (
        <Body spec={spec} fields={fields} rows={rows} />
      )}
    </>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  hub: "the Hub's own tables",
  smartsheet: "Smartsheet",
  "google-sheets": "Google Sheets",
  mongodb: "MongoDB",
  snowflake: "Snowflake",
};

export function Body({
  spec,
  fields,
  rows,
}: {
  spec: ViewSpec;
  fields: Field[];
  rows: Record<string, string>[];
}) {
  switch (spec.layout) {
    case "cards":
      return <Cards spec={spec} fields={fields} rows={rows} />;
    case "list":
      return <Rows spec={spec} rows={rows} />;
    case "calendar":
      return <Month spec={spec} rows={rows} />;
    case "board":
      return <Board spec={spec} rows={rows} />;
    default:
      return <Table spec={spec} fields={fields} rows={rows} />;
  }
}

const cell = (row: Record<string, string>, field?: string) => (field ? (row[field] ?? "") : "");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/**
 * A date as a person reads it, or the cell as it stands.
 *
 * The column was chosen by hand in the builder, so it may well not hold
 * dates. Formatting one anyway yields "Invalid Date", which is worse than
 * showing what is actually in the sheet.
 */
function when(value: string): string {
  if (!value) return "—";
  return ISO_DATE.test(value) ? formatMedium(value.slice(0, 10)) : value;
}

/** A row's stable key: the source row id, or its position as a fallback. */
const rowKey = (row: Record<string, string>, i: number) => row._row || String(i);

/**
 * An outbound link from a cell, only ever http or https.
 *
 * The address comes from a sheet, so `javascript:` would otherwise be a way
 * in. Anything that is not a web address renders as text.
 */
function LinkOut({ url, children }: { url: string; children: React.ReactNode }) {
  if (!/^https?:\/\//i.test(url)) return <>{children}</>;
  return (
    <a className="link-out" href={url} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}

function Table({
  spec,
  fields,
  rows,
}: {
  spec: ViewSpec;
  fields: Field[];
  rows: Record<string, string>[];
}) {
  // No columns chosen yet: show what the view carries rather than nothing.
  const columns =
    spec.fields.columns && spec.fields.columns.length > 0
      ? spec.fields.columns
      : fields.map((f) => f.name);
  const link = spec.fields.link;
  const typeOf = (name: string) => fields.find((f) => f.name === name)?.type;

  return (
    <div className="table-wrap">
      <table className="schedule">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} className={typeOf(c) === "number" ? "num" : undefined}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)}>
              {columns.map((c, j) => {
                const value = cell(row, c);
                const type = typeOf(c);
                return (
                  <td key={c} className={type === "number" ? "num" : undefined}>
                    {j === 0 && link ? (
                      <LinkOut url={cell(row, link)}>{value}</LinkOut>
                    ) : type === "url" ? (
                      <LinkOut url={value}>{value.replace(/^https?:\/\//, "")}</LinkOut>
                    ) : (
                      value
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cards({
  spec,
  fields,
  rows,
}: {
  spec: ViewSpec;
  fields: Field[];
  rows: Record<string, string>[];
}) {
  const f = spec.fields;
  const image = f.image;
  const typeOf = (name: string) => fields.find((x) => x.name === name)?.type;

  return (
    <div className="view-cards">
      {rows.map((row, i) => {
        const title = cell(row, f.title) || "Untitled";
        const url = cell(row, f.link);
        const body = (
          <>
            {image && (
              // The stand-in is the floor and the image covers it, so a cover
              // that is missing, slow or unreachable still leaves a card.
              <figure
                className="view-cover"
                style={{ "--hue": personHue(rowKey(row, i)) } as CSSProperties}
              >
                <span className="cover-fallback" aria-hidden>
                  <Icon name="image" size={18} />
                </span>
                {cell(row, image) && (
                  <img src={cell(row, image)} alt="" loading="lazy" />
                )}
              </figure>
            )}
            <div className="view-card-body">
              {f.status && cell(row, f.status) && (
                <span className="tag">{cell(row, f.status)}</span>
              )}
              <h2 className="view-card-title">{title}</h2>
              {f.subtitle && cell(row, f.subtitle) && (
                <p className="view-card-sub">{cell(row, f.subtitle)}</p>
              )}
              {f.body && cell(row, f.body) && (
                <p className="view-card-text">{cell(row, f.body)}</p>
              )}
              {(f.meta ?? []).some((m) => cell(row, m)) && (
                <div className="view-card-meta">
                  {(f.meta ?? [])
                    .filter((m) => cell(row, m))
                    .map((m) => (
                      <span key={m} title={m}>
                        {typeOf(m) === "url" ? (
                          <LinkOut url={cell(row, m)}>
                            <Icon name="link" size={13} />
                          </LinkOut>
                        ) : (
                          cell(row, m)
                        )}
                      </span>
                    ))}
                </div>
              )}
            </div>
          </>
        );
        return /^https?:\/\//i.test(url) ? (
          <a
            key={rowKey(row, i)}
            className="view-card"
            href={url}
            target="_blank"
            rel="noreferrer noopener"
          >
            {body}
          </a>
        ) : (
          <div key={rowKey(row, i)} className="view-card">
            {body}
          </div>
        );
      })}
    </div>
  );
}

function Rows({ spec, rows }: { spec: ViewSpec; rows: Record<string, string>[] }) {
  const f = spec.fields;
  return (
    <div className="view-rows">
      {rows.map((row, i) => {
        const url = cell(row, f.link);
        const inner = (
          <>
            {f.date && <div className="view-row-when">{when(cell(row, f.date))}</div>}
            <div className="view-row-main">
              <div className="row-title">{cell(row, f.title) || "Untitled"}</div>
              <div className="view-row-meta">
                {[f.subtitle, ...(f.meta ?? [])]
                  .filter((m): m is string => Boolean(m))
                  .map((m) => cell(row, m))
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            {f.status && cell(row, f.status) && (
              <span className="tag">{cell(row, f.status)}</span>
            )}
          </>
        );
        return /^https?:\/\//i.test(url) ? (
          <a
            key={rowKey(row, i)}
            className="view-row"
            href={url}
            target="_blank"
            rel="noreferrer noopener"
          >
            {inner}
          </a>
        ) : (
          <div key={rowKey(row, i)} className="view-row">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A month grid from the view's date column.
 *
 * The month shown is the one the data is mostly in rather than today, because
 * a view of last quarter's deliveries opening on an empty September is not
 * useful. Multi-day rows are marked on each day they cover — the lane-packed
 * bars on the Calendar page are worth having but they belong to a page that
 * knows what its entries are.
 */
function Month({ spec, rows }: { spec: ViewSpec; rows: Record<string, string>[] }) {
  const dateField = spec.fields.date;
  if (!dateField) {
    return (
      <div className="empty">
        <Icon name="calendar" size={22} />
        <p>This view has no date column chosen yet, so there is nothing to lay out.</p>
      </div>
    );
  }
  return <MonthGrid spec={spec} rows={rows} dateField={dateField} />;
}

function MonthGrid({
  spec,
  rows,
  dateField,
}: {
  spec: ViewSpec;
  rows: Record<string, string>[];
  dateField: string;
}) {

  const dated = rows
    .map((row, i) => ({ row, i, date: cell(row, dateField).slice(0, 10) }))
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date));

  const [key, setKey] = useState(() => openingMonth(dated.map((x) => x.date)));

  const byDate = new Map<string, typeof dated>();
  for (const item of dated) {
    const list = byDate.get(item.date) ?? [];
    list.push(item);
    byDate.set(item.date, list);
  }

  const undatedCount = rows.length - dated.length;
  const earlier = dated.filter((x) => x.date.slice(0, 7) < key).length;
  const later = dated.filter((x) => x.date.slice(0, 7) > key).length;

  return (
    <>
      {/*
        A month stepper, because a view whose rows span a year is otherwise
        stuck on whichever month it opened. The count beside each arrow says
        how many rows are waiting that way, so stepping through an empty
        stretch is not guesswork.
      */}
      <div className="cal-bar">
        <div className="cal-nav">
          <button
            className="btn"
            onClick={() => setKey(shiftMonth(key, -1))}
            aria-label="The month before"
          >
            &larr;
          </button>
          <span className="cal-period">{monthLabel(key)}</span>
          <button
            className="btn"
            onClick={() => setKey(shiftMonth(key, 1))}
            aria-label="The month after"
          >
            &rarr;
          </button>
          {key !== monthKey(TODAY) && (
            <button className="btn ghost" onClick={() => setKey(monthKey(TODAY))}>
              This month
            </button>
          )}
        </div>
        <span className="muted small">
          {earlier} {earlier === 1 ? "row" : "rows"} before this month · {later} after
        </span>
      </div>
      <div className="calendar-scroll">
        <div className="calendar">
          <div className="cal-head">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          {monthGrid(key).map((week, w) => (
            <div className="cal-week" key={w}>
              <div className="cal-days">
                {week.map((date) => {
              const items = byDate.get(date) ?? [];
                  const classes = ["cal-day"];
                  if (!isSameMonth(date, key)) classes.push("outside");
                  if (isWeekend(date)) classes.push("weekend");
                  if (date === TODAY) classes.push("today");
                  return (
                    <div className={classes.join(" ")} key={date}>
                      <span className="cal-daynum">{dayOfMonth(date)}</span>
                      {items.slice(0, 4).map(({ row, i }) => (
                        <span
                          className="cal-chip"
                          key={rowKey(row, i)}
                          title={cell(row, spec.fields.title)}
                        >
                          <span className="chip-title">
                            {cell(row, spec.fields.title) || "Untitled"}
                          </span>
                        </span>
                      ))}
                      {items.length > 4 && <span className="cal-more">+{items.length - 4}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {undatedCount > 0 && (
        <p className="muted small" style={{ marginTop: 12 }}>
          {undatedCount} {undatedCount === 1 ? "row has" : "rows have"} no usable date and are not
          on the grid.
        </p>
      )}
    </>
  );
}

/**
 * Which month to open on.
 *
 * This month if anything falls in it, because that is where someone looking
 * at a schedule starts. Otherwise the nearest month that has rows in it,
 * forwards for preference — a view of work still to come is the usual case,
 * and an empty grid is the one thing it must not open on.
 */
function openingMonth(dates: string[]): string {
  const here = monthKey(TODAY);
  if (dates.length === 0) return here;
  const months = [...new Set(dates.map((d) => d.slice(0, 7)))].sort();
  if (months.includes(here)) return here;
  return months.find((m) => m > here) ?? months[months.length - 1];
}


/**
 * Columns by the group field — the "board" AppSheet calls a deck.
 *
 * Blank values get their own column at the end rather than being dropped: on
 * a real sheet an unset status is usually the column you most want to see.
 */
function Board({ spec, rows }: { spec: ViewSpec; rows: Record<string, string>[] }) {
  const group = spec.fields.group ?? spec.fields.status;
  if (!group) {
    return (
      <div className="empty">
        <Icon name="board" size={22} />
        <p>This view has no column to group by yet, so there are no columns to draw.</p>
      </div>
    );
  }

  const columns = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const value = cell(row, group).trim() || "—";
    const list = columns.get(value) ?? [];
    list.push(row);
    columns.set(value, list);
  }
  const ordered = [...columns].sort((a, b) =>
    a[0] === "—" ? 1 : b[0] === "—" ? -1 : a[0].localeCompare(b[0]),
  );

  return (
    <div className="board">
      {ordered.map(([value, items]) => (
        <div className="board-column" key={value}>
          <div className="board-head">
            <span>{value === "—" ? "Not set" : value}</span>
            <b>{items.length}</b>
          </div>
          {items.map((row, i) => (
            <div className="board-card" key={rowKey(row, i)}>
              <div className="board-card-title">{cell(row, spec.fields.title) || "Untitled"}</div>
              {spec.fields.subtitle && cell(row, spec.fields.subtitle) && (
                <div className="board-card-sub">{cell(row, spec.fields.subtitle)}</div>
              )}
              {spec.fields.date && cell(row, spec.fields.date) && (
                <div className="board-card-when">{when(cell(row, spec.fields.date))}</div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
