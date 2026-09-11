import { useEffect, useState } from "react";
import { send, useApi } from "../../lib/api";
import { Icon } from "../../lib/icons";
import type { ResourceLink } from "../../types";
import { ErrorNote, Loading } from "../../components/bits";

/**
 * The Resources menu, edited by the person who wants it changed.
 *
 * The whole reason this section exists is that useful links currently live in
 * chat, where they are found once and lost. A list that needs a developer to
 * add a row would go the same way — so it is edited here, saved to the Hub,
 * and appears in everybody's sidebar on their next page load.
 *
 * The list is saved whole rather than a row at a time. Six links reordered by
 * hand is one edit, and it means what is stored is exactly what the admin was
 * looking at when they pressed save.
 */

interface Draft extends ResourceLink {
  /** Stable across edits, unlike the id, which is made from the label. */
  key: string;
}

const draftOf = (link: ResourceLink, i: number): Draft => ({ ...link, key: `${link.id}-${i}` });

export default function Resources() {
  const saved = useApi<{ links: ResourceLink[] }>("/resources");
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (saved.data && rows === null) setRows(saved.data.links.map(draftOf));
  }, [saved.data, rows]);

  if (saved.error) return <ErrorNote message={saved.error} />;
  if (!rows) return <Loading what="the resources" />;

  const edit = (key: string, field: "label" | "url" | "note", value: string) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  const move = (i: number, by: number) => {
    const to = i + by;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    [next[i], next[to]] = [next[to], next[i]];
    setRows(next);
  };

  async function save() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await send<{ links: ResourceLink[]; dropped?: number }>(
        "/studio/resources",
        "PUT",
        { links: (rows ?? []).map(({ label, url, note: n }) => ({ label, url, note: n })) },
      );
      setRows(res.links.map(draftOf));
      setNote(
        res.dropped
          ? `Saved. ${res.dropped} row${res.dropped === 1 ? " was" : "s were"} left out — a link needs a name and an address starting http:// or https://.`
          : "Saved. It is in everyone's menu now.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "It could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <ErrorNote heading="That did not save." message={error} />}

      <div className="studio-bar">
        <p className="muted small" style={{ margin: 0 }}>
          These appear under <b>Resources</b> at the bottom of everybody's sidebar, in this
          order. They open in a new tab, so nobody loses where they were in the Hub.
        </p>
        <button
          className="btn"
          onClick={() =>
            setRows([...rows, { key: `new-${Date.now()}`, id: "", label: "", url: "" }])
          }
        >
          <Icon name="plus" /> Add a link
        </button>
      </div>

      {rows.length === 0 && (
        <p className="muted">
          Nothing here yet. Add the tools and documents people keep asking each other for.
        </p>
      )}

      <div className="resource-rows">
        {rows.map((row, i) => (
          <div className="resource-row" key={row.key}>
            <div className="resource-fields">
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  value={row.label}
                  onChange={(e) => edit(row.key, "label", e.target.value)}
                  placeholder="Moody2"
                />
              </label>
              <label className="field">
                <span className="field-label">Address</span>
                <input
                  value={row.url}
                  onChange={(e) => edit(row.key, "url", e.target.value)}
                  placeholder="https://…"
                />
              </label>
              <label className="field">
                <span className="field-label">What it is for (optional)</span>
                <input
                  value={row.note ?? ""}
                  onChange={(e) => edit(row.key, "note", e.target.value)}
                  placeholder="Chrome extension for building mood boards as you browse."
                />
              </label>
            </div>
            <div className="resource-controls">
              <button
                className="btn small"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Move ${row.label || "this link"} up`}
              >
                ↑
              </button>
              <button
                className="btn small"
                onClick={() => move(i, 1)}
                disabled={i === rows.length - 1}
                aria-label={`Move ${row.label || "this link"} down`}
              >
                ↓
              </button>
              <button
                className="btn small danger"
                onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
                aria-label={`Remove ${row.label || "this link"}`}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="studio-bar" style={{ marginTop: 16 }}>
        <span className="muted small">{note}</span>
        <button className="btn solid" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save the menu"}
        </button>
      </div>
    </>
  );
}
