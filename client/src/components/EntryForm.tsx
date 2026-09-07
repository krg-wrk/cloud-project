import { useState } from "react";
import { send } from "../lib/api";
import { TODAY } from "../lib/date";
import type { EntryKind, PersonalEntry } from "../types";

const KINDS: { value: EntryKind; label: string; hint: string }[] = [
  { value: "reminder", label: "Reminder", hint: "Something to do by a date" },
  { value: "focus-time", label: "Focus time", hint: "Days blocked out to write" },
  { value: "milestone", label: "Milestone", hint: "A staging post of your own" },
  { value: "personal", label: "Personal", hint: "Anything else you want on your calendar" },
];

/**
 * A forecaster's own entries. Private to them — nobody else in the Hub sees
 * these, and they ride along in their calendar feed.
 */
export default function EntryForm({
  defaultDate,
  contentId,
  onSaved,
  onCancel,
}: {
  defaultDate?: string;
  contentId?: string;
  onSaved: (entry: PersonalEntry) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<EntryKind>("reminder");
  const [date, setDate] = useState(defaultDate ?? TODAY);
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  async function save() {
    setBusy(true);
    setProblem(undefined);
    try {
      const entry = await send<PersonalEntry>("/my/entries", "POST", {
        title,
        kind,
        date,
        endDate: endDate || undefined,
        note: note.trim() || undefined,
        contentId,
      });
      onSaved(entry);
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="entry-form">
      <div className="filters" style={{ marginBottom: 0 }}>
        <label className="field" style={{ flex: 1, minWidth: 240 }}>
          <span>What</span>
          <input
            type="text"
            autoFocus
            placeholder="Chase colour chips with the studio"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>
        <label className="field">
          <span>Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as EntryKind)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Until (optional)</span>
          <input
            type="date"
            value={endDate}
            min={date}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
        <label className="field" style={{ flex: 1, minWidth: 200 }}>
          <span>Note (optional)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>
        <div className="filters-right">
          <button className="btn solid" onClick={save} disabled={busy || !title.trim()}>
            {busy ? "Saving…" : "Add to my calendar"}
          </button>
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
      <p className="signup-note" style={{ marginTop: 8 }}>
        {KINDS.find((k) => k.value === kind)?.hint}. Private to you, and it appears in your
        calendar feed.
      </p>
      {problem && <div className="callout warn">{problem}</div>}
    </div>
  );
}
