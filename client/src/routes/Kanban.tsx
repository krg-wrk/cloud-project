import { Link } from "react-router-dom";
import { TODAY, formatShort, monthKey, monthLabel, relativeDays } from "../lib/date";
import { STATUS_LABELS, STATUS_ORDER, isOverdue, personName } from "../lib/domain";
import { Icon } from "../lib/icons";
import type { CSSProperties } from "react";
import type { ContentItem, Person, Status } from "../types";
import { StatusPill } from "../components/bits";

/**
 * The schedule as a board.
 *
 * The same forecasts the calendar draws, stacked in columns instead of dates.
 * A month grid answers "what lands on the 14th"; a board answers "how much is
 * still to write, and who is holding it" — which is the question a
 * commissioning manager actually opens the Hub with.
 *
 * It is a view of the calendar rather than a page of its own, for the reason
 * the Hub has five nav groups and not fifteen: it reads the same schedule,
 * obeys the same filters, and lives at the same address. A fourth button
 * beside Month, Week and Day costs nothing; a sixth menu item costs
 * everybody a little attention, for ever.
 */

/** What the columns are cut on. */
export type GroupBy = "status" | "month" | "type" | "forecaster" | "vertical";

export const GROUPINGS: { id: GroupBy; label: string }[] = [
  { id: "status", label: "Status" },
  { id: "month", label: "Month" },
  { id: "type", label: "Content type" },
  { id: "forecaster", label: "Forecaster" },
  { id: "vertical", label: "Vertical" },
];

/**
 * What a card can carry.
 *
 * Everything a forecast knows that is worth seeing without opening it. The
 * default is the four a manager scans for; the rest are there because
 * somebody's week is about seasons, or about who is reviewing.
 */
export type CardField =
  | "forecaster"
  | "manager"
  | "type"
  | "vertical"
  | "season"
  | "submission"
  | "publication"
  | "status"
  | "notes";

export const CARD_FIELDS: { id: CardField; label: string }[] = [
  { id: "status", label: "Status" },
  { id: "forecaster", label: "Forecaster" },
  { id: "manager", label: "Commissioning manager" },
  { id: "type", label: "Content type" },
  { id: "vertical", label: "Vertical" },
  { id: "season", label: "Forecast horizon" },
  { id: "submission", label: "Submission date" },
  { id: "publication", label: "Publication date" },
  { id: "notes", label: "Notes" },
];

/** What a card shows before anybody changes it. */
export const DEFAULT_CARD_FIELDS: CardField[] = [
  "status",
  "forecaster",
  "vertical",
  "submission",
];

/** The chosen fields as a URL value, and back — `""` means the default. */
export function readCardFields(value: string | null): CardField[] {
  if (value === null) return DEFAULT_CARD_FIELDS;
  const known = new Set(CARD_FIELDS.map((f) => f.id as string));
  // Order comes from CARD_FIELDS, not from the URL: a card should look the
  // same whichever order somebody happened to tick the boxes in.
  const asked = new Set(value.split(",").filter((f) => known.has(f)));
  return CARD_FIELDS.filter((f) => asked.has(f.id)).map((f) => f.id);
}

export function writeCardFields(fields: CardField[]): string {
  const same =
    fields.length === DEFAULT_CARD_FIELDS.length &&
    DEFAULT_CARD_FIELDS.every((f) => fields.includes(f));
  // The default stays out of the URL, so an unchanged board is a clean link.
  return same ? "" : fields.join(",");
}

interface Column {
  key: string;
  label: string;
  /** A status column carries its own colour; the rest take the accent. */
  colour?: string;
  items: ContentItem[];
}

/**
 * Cut the forecasts into columns.
 *
 * Status is ordered by the workflow rather than alphabetically, and every
 * status gets a column even when it is empty — an empty "At risk" is
 * information, and a board whose columns move about as the data changes is
 * one nobody can learn the shape of. Every other grouping shows only the
 * values actually present, because a column per content type we have not
 * commissioned this quarter is just noise.
 */
export function columnsFor(
  items: ContentItem[],
  by: GroupBy,
  people: Person[],
): Column[] {
  if (by === "status") {
    return STATUS_ORDER.map((status) => ({
      key: status,
      label: STATUS_LABELS[status],
      colour: `var(--status-${status})`,
      items: items.filter((i) => i.status === status),
    }));
  }

  const keyOf = (item: ContentItem): string => {
    switch (by) {
      case "month":
        return monthKey(item.submissionDate || item.publicationDate || TODAY);
      case "type":
        return item.type || "Unset";
      case "forecaster":
        return item.forecasterId || "";
      case "vertical":
        return item.vertical || "Unset";
    }
  };

  const groups = new Map<string, ContentItem[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const labelOf = (key: string): string => {
    if (by === "month") return monthLabel(key);
    if (by === "forecaster") return key ? personName(people, key) : "Unassigned";
    return key;
  };

  return [...groups.keys()]
    .sort((a, b) =>
      // Months read in time order; everything else alphabetically, with the
      // numeric collator so "S/S 28" sorts after "S/S 9" rather than before.
      by === "month" ? a.localeCompare(b) : labelOf(a).localeCompare(labelOf(b), "en", { numeric: true }),
    )
    .map((key) => ({ key, label: labelOf(key), items: groups.get(key) ?? [] }));
}

/** Soonest first inside a column, and anything undated at the end. */
function byDate(a: ContentItem, b: ContentItem): number {
  const x = a.submissionDate || a.publicationDate || "9999";
  const y = b.submissionDate || b.publicationDate || "9999";
  return x.localeCompare(y);
}

export default function Kanban({
  items,
  by,
  fields,
  people,
}: {
  items: ContentItem[];
  by: GroupBy;
  fields: CardField[];
  people: Person[];
}) {
  const columns = columnsFor(items, by, people);
  const shown = new Set(fields);

  if (items.length === 0) {
    return (
      <div className="empty">
        <Icon name="board" size={22} />
        <p>
          Nothing in this range. Widen it with the control above, or clear a filter.
        </p>
      </div>
    );
  }

  return (
    <div className="kanban-scroll">
      <div className="kanban">
        {columns.map((column) => (
          <section className="kanban-col" key={column.key}>
            <header
              className="kanban-col-head"
              style={
                column.colour
                  ? ({ "--col-colour": column.colour } as CSSProperties)
                  : undefined
              }
            >
              <h2>{column.label}</h2>
              <span className="kanban-count">{column.items.length}</span>
            </header>

            <div className="kanban-cards">
              {column.items.length === 0 ? (
                <p className="kanban-none">Nothing here</p>
              ) : (
                [...column.items].sort(byDate).map((item) => (
                  <Link
                    className={isOverdue(item) ? "kanban-card late" : "kanban-card"}
                    to={`/content/${item.id}`}
                    key={item.id}
                  >
                    <span className="kanban-title">{item.title}</span>

                    {/* The pill first, because it is the thing read at a
                        glance, and it is a shape as well as a colour. */}
                    {shown.has("status") && <StatusPill status={item.status as Status} />}

                    <span className="kanban-meta">
                      {shown.has("forecaster") && (
                        <span title="Forecaster">
                          <Icon name="people" size={12} />
                          {personName(people, item.forecasterId)}
                        </span>
                      )}
                      {shown.has("manager") && item.managerId && (
                        <span title="Commissioning manager">
                          <Icon name="review" size={12} />
                          {personName(people, item.managerId)}
                        </span>
                      )}
                      {shown.has("type") && item.type && (
                        <span title="Content type">
                          <Icon name="note" size={12} />
                          {item.type}
                        </span>
                      )}
                      {shown.has("vertical") && item.vertical && (
                        <span title="Vertical">
                          <Icon name="tier" size={12} />
                          {item.vertical}
                        </span>
                      )}
                      {shown.has("season") && item.forecastHorizon && (
                        <span title="Forecast horizon">
                          <Icon name="calendar" size={12} />
                          {item.forecastHorizon}
                        </span>
                      )}
                      {shown.has("submission") && item.submissionDate && (
                        <span
                          className={isOverdue(item) ? "kanban-late" : undefined}
                          title="Submission deadline"
                        >
                          <Icon name="deadlines" size={12} />
                          {formatShort(item.submissionDate)}
                          {isOverdue(item) && ` · ${relativeDays(item.submissionDate)}`}
                        </span>
                      )}
                      {shown.has("publication") && item.publicationDate && (
                        <span title="Publication date">
                          <Icon name="published" size={12} />
                          {formatShort(item.publicationDate)}
                        </span>
                      )}
                    </span>

                    {shown.has("notes") && item.notes && (
                      <span className="kanban-note">{item.notes}</span>
                    )}
                  </Link>
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
