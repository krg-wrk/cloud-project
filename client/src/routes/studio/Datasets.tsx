import { useState } from "react";
import { Link } from "react-router-dom";
import { send, useApi } from "../../lib/api";
import { Icon } from "../../lib/icons";
import type { Connection, Dataset, Field, ViewDef } from "../../types";
import { ErrorNote, Loading } from "../../components/bits";
import { KIND_LABELS } from "./Connections";

/**
 * Datasets: which table out of a connection, and what is in it.
 *
 * "Read the columns" is the step that makes the view builder usable. Once a
 * dataset knows its columns and their types, every field picker downstream is
 * a list to choose from rather than a name to remember — and a filter on a
 * column with few enough values offers those values too.
 */
export default function Datasets() {
  const connections = useApi<Connection[]>("/studio/connections");
  const datasets = useApi<Dataset[]>("/studio/datasets");
  const views = useApi<ViewDef[]>("/studio/views");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  if (datasets.error) return <ErrorNote message={datasets.error} />;
  if (datasets.loading || !datasets.data || !connections.data) {
    return <Loading what="the datasets" />;
  }

  const rows = datasets.data;
  const conns = connections.data;

  async function discover(id: string) {
    setBusy(id);
    setError(null);
    try {
      await send<Dataset>(`/studio/datasets/${id}/discover`, "POST");
      datasets.reload();
      setOpen(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The columns could not be read.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(dataset: Dataset) {
    const used = (views.data ?? []).filter((v) => v.datasetId === dataset.id);
    const warning = used.length
      ? `\n\nThis will also remove ${used.length} view${used.length === 1 ? "" : "s"}: ${used.map((v) => v.label).join(", ")}.`
      : "";
    if (!window.confirm(`Remove the dataset "${dataset.label}"?${warning}`)) return;
    setBusy(dataset.id);
    try {
      await send(`/studio/datasets/${dataset.id}`, "DELETE");
      datasets.reload();
      views.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "It could not be removed.");
    } finally {
      setBusy(null);
    }
  }

  if (conns.length === 0) {
    return (
      <div className="empty">
        <Icon name="source" size={22} />
        <p>
          A dataset comes out of a connection, and there are none yet.{" "}
          <Link to="/studio/connections">Add one first.</Link>
        </p>
      </div>
    );
  }

  return (
    <>
      {error && <ErrorNote message={error} />}

      <div className="studio-bar">
        <p className="muted small" style={{ margin: 0 }}>
          {rows.length === 0
            ? "No datasets yet."
            : `${rows.length} dataset${rows.length === 1 ? "" : "s"}.`}{" "}
          A view binds to a column&rsquo;s id, not its title, so renaming or moving a column in
          the source does not break it — reading the columns again just refreshes the labels.
        </p>
        <button className="btn solid" onClick={() => setAdding(true)}>
          <Icon name="plus" /> Add a dataset
        </button>
      </div>

      {adding && (
        <DatasetForm
          connections={conns}
          onDone={(id) => {
            setAdding(false);
            datasets.reload();
            if (id) void discover(id);
          }}
        />
      )}

      {rows.length === 0 && !adding ? (
        <div className="empty">
          <Icon name="table" size={22} />
          <p>Pick a table out of one of your connections.</p>
        </div>
      ) : (
        <div className="studio-list">
          {rows.map((dataset) => {
            const connection = conns.find((c) => c.id === dataset.connectionId);
            const usedBy = (views.data ?? []).filter((v) => v.datasetId === dataset.id);
            return (
              <div className="studio-item" key={dataset.id}>
                <div className="studio-item-head">
                  <div>
                    <h2>{dataset.label}</h2>
                    <p className="muted small">
                      {connection ? connection.label : "connection removed"} ·{" "}
                      {connection ? KIND_LABELS[connection.kind] : "—"} ·{" "}
                      <code className="mono">{dataset.ref}</code>
                    </p>
                  </div>
                  <div className="studio-item-actions">
                    <button
                      className="btn"
                      onClick={() => void discover(dataset.id)}
                      disabled={busy === dataset.id}
                    >
                      <Icon name="refresh" />
                      {busy === dataset.id
                        ? "Reading…"
                        : dataset.fields.length
                          ? "Re-read columns"
                          : "Read columns"}
                    </button>
                    <button className="btn danger" onClick={() => void remove(dataset)}>
                      <Icon name="trash" />
                    </button>
                  </div>
                </div>

                <dl className="studio-facts">
                  <div className="fact">
                    <dt>Rows</dt>
                    <dd>
                      {dataset.rowCount == null ? (
                        <span className="muted">not read yet</span>
                      ) : (
                        <>
                          {dataset.rowCount.toLocaleString()}
                          {dataset.truncated && (
                            <span className="needs-score"> · read was capped</span>
                          )}
                        </>
                      )}
                    </dd>
                  </div>
                  <div className="fact">
                    <dt>Columns</dt>
                    <dd>
                      {dataset.fields.length || <span className="muted">not read yet</span>}
                    </dd>
                  </div>
                  <div className="fact">
                    <dt>Cached for</dt>
                    <dd>{dataset.refreshSeconds}s</dd>
                  </div>
                  <div className="fact">
                    <dt>Used by</dt>
                    <dd>
                      {usedBy.length === 0 ? (
                        <span className="muted">no views yet</span>
                      ) : (
                        usedBy.map((v) => v.label).join(", ")
                      )}
                    </dd>
                  </div>
                </dl>

                {dataset.fields.length > 0 && (
                  <>
                    <button
                      className="btn ghost"
                      onClick={() => setOpen(open === dataset.id ? null : dataset.id)}
                    >
                      {open === dataset.id ? "Hide" : "Show"} the {dataset.fields.length} columns
                    </button>
                    {open === dataset.id && <FieldTable fields={dataset.fields} />}
                  </>
                )}

                {dataset.fields.length === 0 && (
                  <p className="studio-note bad">
                    <Icon name="at-risk" size={14} />
                    Read the columns before building a view on this — otherwise there is nothing
                    to map.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

const TYPE_LABELS: Record<Field["type"], string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  boolean: "Yes / no",
  person: "Person",
  url: "Web address",
  list: "List",
};

function FieldTable({ fields }: { fields: Field[] }) {
  return (
    <div className="table-wrap" style={{ marginTop: 12 }}>
      <table className="schedule">
        <thead>
          <tr>
            <th scope="col">Column</th>
            <th scope="col">Reads as</th>
            <th scope="col">Values</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.key}>
              <td>
                {f.name}
                {/* The id a view actually binds to, so a rename is visibly
                    a change of label rather than of identity. */}
                {f.key !== f.name && <div className="muted mono">{f.key}</div>}
              </td>
              <td>{TYPE_LABELS[f.type]}</td>
              <td>
                {f.options ? (
                  <span className="field-options">
                    {f.options.slice(0, 6).map((o) => (
                      <span className="tag" key={o}>
                        {o}
                      </span>
                    ))}
                    {f.options.length > 6 && (
                      <span className="muted small">+{f.options.length - 6} more</span>
                    )}
                  </span>
                ) : (
                  <span className="muted small">free text</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DatasetForm({
  connections,
  onDone,
}: {
  connections: Connection[];
  onDone: (savedId?: string) => void;
}) {
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [ref, setRef] = useState("");
  const [refresh, setRefresh] = useState(60);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What this connection can offer, when the system can list its own tables.
  const catalogue = useApi<{ tables: { ref: string; label: string }[]; note?: string }>(
    connectionId ? `/studio/connections/${connectionId}/catalogue` : "/studio/connections",
  );
  const tables = connectionId ? (catalogue.data?.tables ?? []) : [];
  const connection = connections.find((c) => c.id === connectionId);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const saved = await send<Dataset>("/studio/datasets", "POST", {
        connectionId,
        label,
        ref,
        refreshSeconds: refresh,
      });
      onDone(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "It could not be saved.");
      setSaving(false);
    }
  }

  return (
    <div className="studio-item editing">
      <h2>New dataset</h2>
      {error && <ErrorNote message={error} />}

      <div className="studio-form">
        <div className="field">
          <label htmlFor="d-conn">Out of</label>
          <select
            id="d-conn"
            value={connectionId}
            onChange={(e) => {
              setConnectionId(e.target.value);
              setRef("");
            }}
          >
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} — {KIND_LABELS[c.kind]}
              </option>
            ))}
          </select>
        </div>

        {tables.length > 0 ? (
          <div className="field">
            <label htmlFor="d-table">Table</label>
            <select
              id="d-table"
              value={ref}
              onChange={(e) => {
                setRef(e.target.value);
                if (!label) {
                  setLabel(tables.find((t) => t.ref === e.target.value)?.label ?? "");
                }
              }}
            >
              <option value="">Choose one…</option>
              {tables.map((t) => (
                <option key={t.ref} value={t.ref}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="d-ref">
              {connection?.kind === "smartsheet" ? "Sheet or report id" : "Table or collection"}
            </label>
            <input
              id="d-ref"
              value={ref}
              placeholder={
                connection?.kind === "smartsheet" ? "6141831453742468 or report:614183…" : ""
              }
              onChange={(e) => setRef(e.target.value)}
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="d-label">Call it</label>
          <input
            id="d-label"
            value={label}
            placeholder="Commissioning schedule"
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="d-refresh">Cache for (seconds)</label>
          <input
            id="d-refresh"
            type="number"
            min={0}
            max={3600}
            value={refresh}
            onChange={(e) => setRefresh(Number(e.target.value))}
          />
        </div>
      </div>

      {catalogue.data?.note && (
        <p className="studio-note bad">
          <Icon name="at-risk" size={14} />
          {catalogue.data.note}
        </p>
      )}

      {connection?.kind === "smartsheet" && tables.length === 0 && (
        <p className="muted small">
          The id is the long number in the URL, or under File &rarr; Properties. A report works
          too — prefix it <code className="mono">report:</code>. Either way it has to be shared
          with the token&rsquo;s account.
        </p>
      )}

      <div className="studio-actions">
        <button
          className="btn solid"
          onClick={() => void save()}
          disabled={saving || !label || !ref}
        >
          {saving ? "Saving…" : "Add and read its columns"}
        </button>
        <button className="btn" onClick={() => onDone()}>
          Cancel
        </button>
      </div>
    </div>
  );
}
