import { useEffect, useRef, useState } from "react";
import { send } from "../lib/api";
import { Icon } from "../lib/icons";
import type { Field, ViewEditPreview } from "../types";

/**
 * One cell of a view, changed in place.
 *
 * The confirmation is the point, and it is the same two steps the
 * commissioning sheet's write-back uses. A box that saved on blur would be
 * quicker and would also, once, quietly overwrite somebody's Friday afternoon:
 * the sheet is a live document that other people have open, and the Hub is
 * reaching into it from a page that may be a minute out of date.
 *
 * So pressing Enter does not write anything. It asks the server what would
 * change — which re-reads the row — and the answer comes back as "Status reads
 * Writing, and would read Delivered, on the commissioning schedule". Only then
 * is there a button that changes it.
 *
 * `expect` travels back to the server exactly as it arrived. It is never
 * rebuilt from what the box holds now, because that would compare a value
 * against itself and the check would always pass.
 */
export default function EditCell({
  slug,
  field,
  row,
  value,
  rowName,
  onSaved,
}: {
  /** The view's address, which is what the write route is keyed by. */
  slug: string;
  field: Field;
  /** The source's own row id. */
  row: string;
  /** The cell as the view drew it. */
  value: string;
  /** What this row is, for a screen reader: "Change Status on Big Ideas S/S 28". */
  rowName: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [preview, setPreview] = useState<ViewEditPreview>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  // A fresh read of the view can bring a new value for this cell — somebody
  // else's edit, or this one having landed. The box follows it while closed.
  useEffect(() => {
    if (!open) setDraft(value);
  }, [value, open]);

  function close() {
    setOpen(false);
    setPreview(undefined);
    setProblem(undefined);
    setDraft(value);
    opener.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // Next tick, or the click that opened it closes it again.
    const id = setTimeout(() => document.addEventListener("mousedown", away));
    document.addEventListener("keydown", key);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  });

  async function review() {
    if (draft.trim() === value.trim()) {
      setProblem("That is what it says already.");
      return;
    }
    setBusy(true);
    setProblem(undefined);
    try {
      setPreview(
        await send<ViewEditPreview>(`/views/${encodeURIComponent(slug)}/edit/preview`, "POST", {
          row,
          changes: { [field.key]: draft },
        }),
      );
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!preview) return;
    setBusy(true);
    setProblem(undefined);
    try {
      await send(`/views/${encodeURIComponent(slug)}/edit`, "POST", {
        row,
        changes: { [field.key]: draft },
        expect: preview.expect,
      });
      setOpen(false);
      setPreview(undefined);
      onSaved();
    } catch (err) {
      // The row has moved on, so the confirmation no longer describes what
      // would happen. Dropping it forces another look rather than leaving a
      // stale Apply button on screen.
      setPreview(undefined);
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        ref={opener}
        type="button"
        className="cell-edit"
        aria-label={`Change ${field.name} on ${rowName}`}
        onClick={() => setOpen(true)}
      >
        <span className="cell-edit-value">{value || <span className="cell-edit-blank">—</span>}</span>
        <Icon name="edit" size={12} />
      </button>
    );
  }

  return (
    <div className="cell-editor" ref={box}>
      <Input field={field} value={draft} onChange={setDraft} onEnter={() => void review()} />

      {preview ? (
        /*
          What the sheet says right now, against what it would say. The `from`
          is a fresh read rather than the value on the page, so a cell somebody
          else has already changed shows their value here — which is the moment
          to notice it.
        */
        <div className="cell-confirm" role="dialog" aria-label={`Confirm the change to ${field.name}`}>
          {preview.cells.map((c) => (
            <p key={c.field} className="cell-confirm-line">
              <b>{c.name}</b> reads <q>{c.from || "nothing"}</q> and would read <q>{c.to || "nothing"}</q>.
            </p>
          ))}
          <p className="cell-confirm-where">on {preview.target}</p>
          <div className="cell-actions">
            <button className="btn solid small" onClick={() => void apply()} disabled={busy}>
              {busy ? "Changing the sheet…" : "Change it"}
            </button>
            <button className="btn ghost small" onClick={close} disabled={busy}>
              Leave as it is
            </button>
          </div>
        </div>
      ) : (
        <div className="cell-actions">
          <button className="btn small" onClick={() => void review()} disabled={busy}>
            {busy ? "Working it out…" : "Review"}
          </button>
          <button className="btn ghost small" onClick={close} disabled={busy}>
            Cancel
          </button>
        </div>
      )}

      {problem && <p className="studio-note bad">{problem}</p>}
    </div>
  );
}

/**
 * The right control for the column.
 *
 * A checkbox is the one closed list, and gets a picker: the view renders it as
 * Yes or No, so those are the two things to offer. A date gets a date box,
 * which is also the surest way to send the format the sheet wants.
 *
 * Everything else is a text box, and a column whose values the studio sampled
 * offers them through a datalist &mdash; a suggestion rather than a
 * restriction. Those values are "the few distinct things this column happens
 * to hold", not a picklist, so making them the only choices would mean a
 * status column of six values could never gain a seventh.
 */
function Input({
  field,
  value,
  onChange,
  onEnter,
}: {
  field: Field;
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
}) {
  const label = `${field.name}, new value`;
  const stop = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onEnter();
    }
  };

  if (field.type === "boolean") {
    return (
      <select
        className="cell-input"
        aria-label={label}
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={stop}
      >
        <option value="">—</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    );
  }

  const suggestions = field.type === "date" ? undefined : field.options;
  const listId = suggestions ? `cell-opts-${field.key}` : undefined;

  return (
    <>
      <input
        className="cell-input"
        aria-label={label}
        autoFocus
        list={listId}
        type={field.type === "date" ? "date" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={stop}
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </>
  );
}
