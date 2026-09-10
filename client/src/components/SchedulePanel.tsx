import { useState } from "react";
import { send, useApi } from "../lib/api";
import { Slot } from "../lib/custom";
import { formatShort } from "../lib/date";
import { STATUS_LABELS } from "../lib/domain";
import { Icon } from "../lib/icons";
import type { CellChange, ContentItem, SchedulePreview, ScheduleState, Status } from "../types";
import { ErrorNote } from "./bits";

/**
 * Changing the commissioning sheet, from the Hub.
 *
 * The schedule belongs to the commissioning managers and everything else the
 * Hub does with it is read-only. This is the exception, and it is built as
 * one: five columns, managers and admins only, off unless the deployment
 * turned it on, and nothing happens until somebody has seen exactly which
 * cells will change.
 *
 * The confirmation is the point. A form that saves on click would be quicker
 * and would also, once, quietly overwrite a manager's Friday afternoon — so
 * pressing Review asks the server what would change and shows it back cell by
 * cell, and pressing Apply sends that description with the change so the two
 * cannot disagree.
 */

const STATUSES: Status[] = [
  "not-started",
  "in-progress",
  "submitted",
  "in-review",
  "published",
  "at-risk",
];

/** What the form holds, which starts as whatever the sheet says. */
interface Draft {
  status: Status;
  submissionDate: string;
  publicationDate: string;
  submittedOn: string;
  notes: string;
}

const draftOf = (item: ContentItem): Draft => ({
  status: item.status,
  submissionDate: item.submissionDate ?? "",
  publicationDate: item.publicationDate ?? "",
  submittedOn: item.submittedOn ?? "",
  notes: item.notes ?? "",
});

/**
 * A cell's value in the words the Hub uses everywhere else.
 *
 * The wire carries the Hub's own vocabulary — `not-started`, `2026-09-24` —
 * because that is what the rest of the API speaks. Both the confirmation and
 * the log read it through here, so a person is never shown a slug.
 */
function say(field: CellChange["field"], value: string): string {
  if (!value) return "empty";
  if (field === "status") return STATUS_LABELS[value as Status] ?? value;
  if (field === "notes") return `“${value}”`;
  return formatShort(value);
}

/** One cell, as the confirmation reads it out. */
function Change({ change }: { change: CellChange }) {
  const show = (value: string) =>
    value ? say(change.field, value) : <em className="muted">empty</em>;
  return (
    <li>
      <b>{change.column}</b>
      <span className="sched-from">{show(change.from)}</span>
      <Icon name="back" size={12} />
      <span className="sched-to">{show(change.to)}</span>
    </li>
  );
}

export default function SchedulePanel({
  item,
  headingSlot,
  onApplied,
}: {
  item: ContentItem;
  headingSlot: string;
  /** So the page can re-read the forecast once the sheet has changed. */
  onApplied: () => void;
}) {
  const state = useApi<ScheduleState>(`/content/${item.id}/schedule`);
  const [draft, setDraft] = useState<Draft>(() => draftOf(item));
  const [preview, setPreview] = useState<SchedulePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Nothing to show a forecaster, and nothing to show at all in a Hub that
  // only reads. The page leaves the section out rather than explaining a
  // control that is not there.
  if (!state.data || !state.data.canWrite) return null;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    // The confirmation described the old draft.
    setPreview(null);
    setDone(null);
  };

  async function review() {
    setBusy(true);
    setError(null);
    try {
      const got = await send<SchedulePreview>(`/content/${item.id}/schedule/preview`, "POST", draft);
      setPreview(got);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The change could not be worked out.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      await send(`/content/${item.id}/schedule`, "POST", {
        changes: draft,
        // Sent back exactly as it came, so what is applied is what was shown.
        expect: preview.expect,
      });
      setDone(`${preview.changes.length} cell${preview.changes.length === 1 ? "" : "s"} changed.`);
      setPreview(null);
      state.reload();
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The sheet refused the change.");
      // The row has moved on, so the description is stale either way.
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  const touched = JSON.stringify(draft) !== JSON.stringify(draftOf(item));

  return (
    <div className="panel sched">
      <div className="sched-head">
        <Slot id={headingSlot} as="h2" className="section-title" />
        <p className="muted small">
          Writes to <b>{state.data.target}</b>. Everything else about the schedule is
          commissioning&rsquo;s to set.
        </p>
      </div>

      {error && <ErrorNote message={error} />}
      {done && (
        <p className="sched-done">
          <Icon name="submitted" size={14} /> {done}
        </p>
      )}

      <div className="sched-form">
        <div className="field">
          <label htmlFor="sched-status">Status</label>
          <select
            id="sched-status"
            value={draft.status}
            onChange={(e) => set("status", e.target.value as Status)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sched-sub">Submission date</label>
          <input
            id="sched-sub"
            type="date"
            value={draft.submissionDate}
            onChange={(e) => set("submissionDate", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="sched-pub">Publication date</label>
          <input
            id="sched-pub"
            type="date"
            value={draft.publicationDate}
            onChange={(e) => set("publicationDate", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="sched-on">Actual submission</label>
          <input
            id="sched-on"
            type="date"
            value={draft.submittedOn}
            onChange={(e) => set("submittedOn", e.target.value)}
          />
          <span className="muted small">What the timeliness figures measure.</span>
        </div>
        <div className="field wide">
          <label htmlFor="sched-notes">Notes</label>
          <textarea
            id="sched-notes"
            rows={2}
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
      </div>

      {/*
        Two steps, always. The first is a question to the server about what
        would happen; only the second changes anything.
      */}
      {!preview ? (
        <div className="sched-actions">
          <button className="btn" onClick={() => void review()} disabled={busy || !touched}>
            {busy ? "Working it out…" : "Review the change"}
          </button>
          {touched && (
            <button
              className="btn ghost"
              onClick={() => {
                setDraft(draftOf(item));
                setPreview(null);
                setDone(null);
              }}
            >
              Put it back
            </button>
          )}
          {!touched && <span className="muted small">Change something to review it.</span>}
        </div>
      ) : preview.changes.length === 0 ? (
        <p className="studio-note">
          Nothing to change &mdash; every field already says that.
          {preview.refused.length > 0 && ` ${preview.refused.join("; ")}.`}
        </p>
      ) : (
        <div className="sched-confirm">
          <p className="sched-confirm-head">
            This will change {preview.changes.length} cell
            {preview.changes.length === 1 ? "" : "s"} on <b>{preview.target}</b>, row{" "}
            <code className="mono">{preview.row}</code>:
          </p>
          <ul className="sched-changes">
            {preview.changes.map((change) => (
              <Change key={change.field} change={change} />
            ))}
          </ul>
          {preview.refused.length > 0 && (
            <p className="studio-note bad">
              <Icon name="at-risk" size={14} />
              Not included: {preview.refused.join("; ")}.
            </p>
          )}
          <div className="sched-actions">
            <button className="btn solid" onClick={() => void apply()} disabled={busy}>
              {busy ? "Changing the sheet…" : "Apply to the sheet"}
            </button>
            <button className="btn" onClick={() => setPreview(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/*
        Smartsheet keeps cell history and the Hub is taking a slice of that
        work off it, so it keeps its own — including the refusals.
      */}
      {state.data.history.length > 0 && (
        <div className="sched-log">
          <div className="eyebrow">Changed from the Hub</div>
          <ul>
            {state.data.history.map((entry) => (
              <li key={entry.id} className={entry.ok ? undefined : "bad"}>
                <span className="muted small">
                  {entry.at.slice(0, 16).replace("T", " ")} · {entry.byEmail}
                </span>
                {entry.ok ? (
                  <span className="sched-log-change">
                    {entry.changes
                      .map(
                        (change) =>
                          `${change.column}: ${say(change.field, change.from)} → ` +
                          `${say(change.field, change.to)}`,
                      )
                      .join(", ")}
                  </span>
                ) : (
                  <span>Refused &mdash; {entry.problem}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
