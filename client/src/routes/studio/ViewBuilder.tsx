import { useEffect, useState } from "react";
import { send } from "../../lib/api";
import { Icon, ICON_PATHS } from "../../lib/icons";
import type {
  Audience,
  Dataset,
  Field,
  FilterOp,
  Layout,
  Me,
  Preview,
  ViewDef,
  ViewSpec,
} from "../../types";
import { ErrorNote } from "../../components/bits";
import { Body } from "../CustomView";

/**
 * The view builder.
 *
 * Left: what the view is, what shape it takes, which column carries what, and
 * who it is for. Right: the view itself, drawn by the same component that
 * will draw it for everyone else, from rows the server produced by running
 * the spec you are editing. So a mapping is checked against the real sheet
 * before anyone else sees it, and there is no second renderer to keep in
 * step with the first.
 */

export const LAYOUT_LABELS: Record<Layout, string> = {
  table: "Table",
  cards: "Cards",
  list: "List",
  calendar: "Calendar",
  board: "Board",
};

const LAYOUT_BLURBS: Record<Layout, string> = {
  table: "Every column, dense. Best for a working list you scan.",
  cards: "A tile each, with a picture if the sheet has one.",
  list: "One line each, with a date down the side.",
  calendar: "A month grid, laid out by a date column.",
  board: "Columns grouped by a value — a status, an owner, a stage.",
};

/**
 * Which roles a layout actually reads, in the order they matter. Showing a
 * picker a layout ignores is how a builder gets confusing.
 */
const ROLES_FOR: Record<Layout, (keyof ViewSpec["fields"])[]> = {
  table: ["columns", "link"],
  cards: ["title", "subtitle", "body", "status", "image", "link", "meta"],
  list: ["title", "subtitle", "date", "status", "link", "meta"],
  calendar: ["date", "title", "endDate"],
  board: ["group", "title", "subtitle", "date"],
};

const ROLE_LABELS: Record<string, string> = {
  title: "Title",
  subtitle: "Under the title",
  body: "Description",
  date: "Date",
  endDate: "End date",
  status: "Badge",
  group: "Group into columns by",
  person: "Person, for “mine”",
  image: "Picture",
  link: "Opens",
  columns: "Columns to show",
  meta: "Small facts",
};

const OP_LABELS: Record<FilterOp, string> = {
  is: "is",
  "is-not": "is not",
  contains: "contains",
  empty: "is empty",
  "not-empty": "is not empty",
  before: "is before",
  after: "is after",
  gt: "is more than",
  lt: "is less than",
  mine: "is me",
};

const ROLE_OPTIONS: Me["role"][] = ["forecaster", "commissioning-manager", "admin"];

const ICON_CHOICES = Object.keys(ICON_PATHS);

export function blankSpec(): ViewSpec {
  return { layout: "table", fields: { columns: [], meta: [] }, filters: [], pageSize: 100 };
}

export default function ViewBuilder({
  datasets,
  existing,
  onDone,
}: {
  datasets: Dataset[];
  existing?: ViewDef;
  onDone: () => void;
}) {
  const [label, setLabel] = useState(existing?.label ?? "");
  const [slug, setSlug] = useState(existing?.slug ?? "");
  const [icon, setIcon] = useState(existing?.icon ?? "table");
  const [section, setSection] = useState(existing?.section ?? "Your work");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [datasetId, setDatasetId] = useState(existing?.datasetId ?? datasets[0]?.id ?? "");
  const [spec, setSpec] = useState<ViewSpec>(existing?.spec ?? blankSpec());
  const [audience, setAudience] = useState<Audience>(
    existing?.audience ?? { roles: "all", verticals: "all", emails: [] },
  );
  const [state, setViewState] = useState<"draft" | "live">(existing?.state ?? "draft");
  const [emailsText, setEmailsText] = useState((existing?.audience.emails ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dataset = datasets.find((d) => d.id === datasetId);
  const fields = dataset?.fields ?? [];

  const preview = usePreview(datasetId, spec);

  function setField(role: keyof ViewSpec["fields"], value: string) {
    setSpec({ ...spec, fields: { ...spec.fields, [role]: value || undefined } });
  }

  function toggleInList(role: "columns" | "meta", name: string) {
    const current = spec.fields[role] ?? [];
    const next = current.includes(name)
      ? current.filter((c) => c !== name)
      : [...current, name];
    setSpec({ ...spec, fields: { ...spec.fields, [role]: next } });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        label,
        slug: slug || undefined,
        icon,
        section,
        description,
        datasetId,
        spec,
        audience: { ...audience, emails: parseEmails(emailsText) },
        state,
      };
      if (existing) await send(`/studio/views/${existing.id}`, "PUT", body);
      else await send("/studio/views", "POST", body);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "It could not be saved.");
      setSaving(false);
    }
  }

  return (
    <div className="builder">
      <div className="builder-panel">
        {error && <ErrorNote message={error} />}

        <section className="builder-step">
          <h2 className="section-title">
            <Icon name="note" /> What it is
          </h2>
          <div className="studio-form">
            <div className="field">
              <label htmlFor="v-label">Name</label>
              <input
                id="v-label"
                value={label}
                placeholder="Beauty deadlines"
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="v-slug">Address</label>
              <div className="slug-field">
                <span>/v/</span>
                <input
                  id="v-slug"
                  value={slug}
                  placeholder={autoSlug(label)}
                  onChange={(e) => setSlug(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="v-section">Sidebar group</label>
              <input
                id="v-section"
                value={section}
                list="v-sections"
                onChange={(e) => setSection(e.target.value)}
              />
              <datalist id="v-sections">
                <option value="Your work" />
                <option value="The team" />
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="v-icon">Icon</label>
              <div className="icon-field">
                <Icon name={icon} size={18} />
                <select id="v-icon" value={icon} onChange={(e) => setIcon(e.target.value)}>
                  {ICON_CHOICES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="field">
            <label htmlFor="v-desc">A line about it (optional)</label>
            <input
              id="v-desc"
              value={description}
              placeholder="What this view is for, so nobody has to guess."
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </section>

        <section className="builder-step">
          <h2 className="section-title">
            <Icon name="source" /> Where the rows come from
          </h2>
          <div className="field">
            <label htmlFor="v-dataset">Dataset</label>
            <select
              id="v-dataset"
              value={datasetId}
              onChange={(e) => {
                // The columns are different, so a mapping made against the old
                // ones would be nonsense. Start the mapping again, keep the rest.
                setDatasetId(e.target.value);
                setSpec({ ...blankSpec(), layout: spec.layout, pageSize: spec.pageSize });
              }}
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label} — {d.fields.length} columns, {d.rowCount ?? "?"} rows
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="builder-step">
          <h2 className="section-title">
            <Icon name="cards" /> Shape
          </h2>
          <div className="layout-picker">
            {(Object.keys(LAYOUT_LABELS) as Layout[]).map((l) => (
              <button
                key={l}
                className={spec.layout === l ? "layout-option on" : "layout-option"}
                onClick={() => setSpec({ ...spec, layout: l })}
                title={LAYOUT_BLURBS[l]}
              >
                <Icon name={l === "calendar" ? "calendar" : l} size={20} />
                {LAYOUT_LABELS[l]}
              </button>
            ))}
          </div>
          <p className="muted small">{LAYOUT_BLURBS[spec.layout]}</p>
        </section>

        <section className="builder-step">
          <h2 className="section-title">
            <Icon name="table" /> Which column carries what
          </h2>
          {fields.length === 0 ? (
            <p className="studio-note bad">
              <Icon name="at-risk" size={14} />
              This dataset&rsquo;s columns have not been read yet.
            </p>
          ) : (
            <div className="studio-form">
              {ROLES_FOR[spec.layout].map((role) =>
                role === "columns" || role === "meta" ? (
                  <div className="field wide" key={role}>
                    <label>{ROLE_LABELS[role]}</label>
                    <div className="chip-picker">
                      {fields.map((f) => (
                        <button
                          key={f.key}
                          className={
                            (spec.fields[role] ?? []).includes(f.key) ? "chip on" : "chip"
                          }
                          onClick={() => toggleInList(role, f.key)}
                          title={f.name}
                        >
                          {f.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="field" key={role}>
                    <label htmlFor={`r-${role}`}>{ROLE_LABELS[role]}</label>
                    <select
                      id={`r-${role}`}
                      value={(spec.fields[role] as string) ?? ""}
                      onChange={(e) => setField(role, e.target.value)}
                    >
                      <option value="">Not set</option>
                      {suggested(fields, role).map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ),
              )}
            </div>
          )}
        </section>

        <section className="builder-step">
          <h2 className="section-title">
            <Icon name="deadlines" /> Which rows
          </h2>
          <Filters spec={spec} fields={fields} onChange={setSpec} />
          <div className="studio-form" style={{ marginTop: 12 }}>
            <div className="field">
              <label htmlFor="v-sort">Sort by</label>
              <select
                id="v-sort"
                value={spec.sort?.field ?? ""}
                onChange={(e) =>
                  setSpec({
                    ...spec,
                    sort: e.target.value
                      ? { field: e.target.value, direction: spec.sort?.direction ?? "asc" }
                      : undefined,
                  })
                }
              >
                <option value="">Source order</option>
                {fields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            {spec.sort && (
              <div className="field">
                <label htmlFor="v-dir">Direction</label>
                <select
                  id="v-dir"
                  value={spec.sort.direction}
                  onChange={(e) =>
                    setSpec({
                      ...spec,
                      sort: { field: spec.sort!.field, direction: e.target.value as "asc" | "desc" },
                    })
                  }
                >
                  <option value="asc">A to Z, earliest first</option>
                  <option value="desc">Z to A, latest first</option>
                </select>
              </div>
            )}
            <div className="field">
              <label htmlFor="v-page">Rows to show</label>
              <input
                id="v-page"
                type="number"
                min={0}
                max={2000}
                value={spec.pageSize}
                onChange={(e) => setSpec({ ...spec, pageSize: Number(e.target.value) })}
              />
            </div>
          </div>
          <p className="muted small">0 shows every matching row.</p>
        </section>

        <section className="builder-step">
          <h2 className="section-title">
            <Icon name="people" /> Who sees it
          </h2>
          <div className="field">
            <label>Roles</label>
            <div className="chip-picker">
              <button
                className={audience.roles === "all" ? "chip on" : "chip"}
                onClick={() => setAudience({ ...audience, roles: "all" })}
              >
                Everyone
              </button>
              {ROLE_OPTIONS.map((r) => {
                const on = audience.roles !== "all" && audience.roles.includes(r);
                return (
                  <button
                    key={r}
                    className={on ? "chip on" : "chip"}
                    onClick={() => {
                      const current = audience.roles === "all" ? [] : audience.roles;
                      const next = on ? current.filter((x) => x !== r) : [...current, r];
                      setAudience({ ...audience, roles: next.length === 0 ? "all" : next });
                    }}
                  >
                    {r === "commissioning-manager" ? "Commissioning managers" : `${r}s`}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="field">
            <label htmlFor="v-emails">And these people, whatever their role</label>
            <input
              id="v-emails"
              value={emailsText}
              placeholder="someone@wgsn.com, someone.else@wgsn.com"
              onChange={(e) => setEmailsText(e.target.value)}
            />
          </div>
          <p className="muted small">
            Admins always see every view, including drafts. The rule is applied on the server, so
            a link to a view is no way round it.
          </p>
        </section>

        <div className="builder-save">
          <div className="field">
            <label htmlFor="v-state">State</label>
            <select
              id="v-state"
              value={state}
              onChange={(e) => setViewState(e.target.value as "draft" | "live")}
            >
              <option value="draft">Draft — admins only</option>
              <option value="live">Live — in the sidebar for its audience</option>
            </select>
          </div>
          <button
            className="btn solid"
            onClick={() => void save()}
            disabled={saving || !label || !datasetId}
          >
            {saving ? "Saving…" : existing ? "Save changes" : "Create the view"}
          </button>
          <button className="btn" onClick={onDone}>
            Cancel
          </button>
        </div>
      </div>

      <div className="builder-preview">
        <div className="preview-head">
          <h2 className="section-title">
            <Icon name="eye" /> Preview
          </h2>
          {preview.data && (
            <span className="muted small">
              {preview.data.total} of {preview.data.sourceRows} rows match
            </span>
          )}
        </div>

        {/*
          Drawn by the same component the real page uses, from rows the server
          produced — so what is on screen here is what the view will show,
          not an approximation of it.
        */}
        <div className="preview-body">
          {preview.error ? (
            <ErrorNote message={preview.error} />
          ) : preview.loading ? (
            <p className="muted small">Reading the source…</p>
          ) : !preview.data ? (
            <p className="muted small">Choose a dataset to see it.</p>
          ) : preview.data.rows.length === 0 ? (
            <div className="empty">
              <Icon name="eye" size={20} />
              <p>
                No rows match.
                {spec.filters.some((f) => f.op === "mine") &&
                  " A “is me” filter previews against you, not against whoever the view is for."}
              </p>
            </div>
          ) : (
            <Body spec={spec} fields={preview.data.fields} rows={preview.data.rows} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The preview, debounced.
 *
 * Every keystroke in the builder changes the spec, and each preview is a read
 * of the source, so it waits for the typing to stop. The dataset's rows are
 * cached server-side, so this is cheap after the first.
 */
function usePreview(datasetId: string, spec: ViewSpec) {
  const [debounced, setDebounced] = useState(spec);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(spec), 350);
    return () => clearTimeout(timer);
  }, [spec]);

  const [state, setState] = useState<{
    data?: Preview;
    error?: string;
    loading: boolean;
  }>({ loading: true });

  useEffect(() => {
    if (!datasetId) {
      setState({ loading: false });
      return;
    }
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    send<Preview>("/studio/preview", "POST", { datasetId, spec: debounced })
      .then((data) => live && setState({ data, loading: false }))
      .catch((err: Error) => live && setState({ error: err.message, loading: false }));
    return () => {
      live = false;
    };
  }, [datasetId, debounced]);

  return state;
}

/**
 * The columns worth offering for a role, most likely first.
 *
 * A date role listing sixty text columns before the three date ones is the
 * difference between a builder you can use and one you fight. Everything is
 * still offered — a sheet's types are not always right — just not first.
 */
function suggested(fields: Field[], role: keyof ViewSpec["fields"]): Field[] {
  const wants: Partial<Record<string, Field["type"][]>> = {
    date: ["date"],
    endDate: ["date"],
    image: ["url"],
    link: ["url"],
    person: ["person", "text"],
    status: ["text", "list"],
    group: ["text", "list", "person"],
  };
  const preferred = wants[role];
  if (!preferred) return fields;
  const first = fields.filter((f) => preferred.includes(f.type));
  const rest = fields.filter((f) => !preferred.includes(f.type));
  return [...first, ...rest];
}

function Filters({
  spec,
  fields,
  onChange,
}: {
  spec: ViewSpec;
  fields: Field[];
  onChange: (spec: ViewSpec) => void;
}) {
  function update(i: number, patch: Partial<ViewSpec["filters"][number]>) {
    const next = spec.filters.map((f, j) => (i === j ? { ...f, ...patch } : f));
    onChange({ ...spec, filters: next });
  }

  return (
    <>
      {spec.filters.length === 0 && (
        <p className="muted small">No filters — every row in the dataset.</p>
      )}
      {spec.filters.map((filter, i) => {
        const field = fields.find((f) => f.key === filter.field);
        const needsValue = !["empty", "not-empty", "mine"].includes(filter.op);
        return (
          <div className="filter-row" key={i}>
            <select
              value={filter.field}
              onChange={(e) => update(i, { field: e.target.value })}
              aria-label="Column"
            >
              {fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.name}
                </option>
              ))}
            </select>
            <select
              value={filter.op}
              onChange={(e) => update(i, { op: e.target.value as FilterOp })}
              aria-label="Test"
            >
              {(Object.keys(OP_LABELS) as FilterOp[]).map((op) => (
                <option key={op} value={op}>
                  {OP_LABELS[op]}
                </option>
              ))}
            </select>
            {needsValue ? (
              field?.options ? (
                <select
                  value={filter.value ?? ""}
                  onChange={(e) => update(i, { value: e.target.value })}
                  aria-label="Value"
                >
                  <option value="">Choose…</option>
                  {field.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={filter.value ?? ""}
                  placeholder={field?.type === "date" ? "2026-09-01" : "value"}
                  onChange={(e) => update(i, { value: e.target.value })}
                  aria-label="Value"
                />
              )
            ) : (
              <span className="muted small">
                {filter.op === "mine" ? "matched against whoever is signed in" : ""}
              </span>
            )}
            <button
              className="btn danger"
              onClick={() =>
                onChange({ ...spec, filters: spec.filters.filter((_, j) => j !== i) })
              }
              aria-label="Remove this filter"
            >
              <Icon name="trash" />
            </button>
          </div>
        );
      })}
      <button
        className="btn"
        disabled={fields.length === 0}
        onClick={() =>
          onChange({
            ...spec,
            filters: [...spec.filters, { field: fields[0].key, op: "is", value: "" }],
          })
        }
      >
        <Icon name="plus" /> Add a filter
      </button>
    </>
  );
}

function autoSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseEmails(text: string): string[] {
  return text
    .split(/[,\s;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
}
