import { useState } from "react";
import { send } from "../lib/api";
import { formatShort } from "../lib/date";
import { STATUS_LABELS } from "../lib/domain";
import { Icon } from "../lib/icons";
import type { BulkPreview, BulkResult, BulkRow, CellChange, Status } from "../types";
import { ErrorNote } from "./bits";

/**
 * Changing the same thing on several rows at once.
 *
 * The reason this exists is the one the team gave: a season slips, and forty
 * deadlines move. Doing that one row at a time is forty confirmations, and
 * forty chances to mistype a date.
 *
 * It is built on top of the single-row panel's rules rather than beside them.
 * The same five fields, the same two steps, the same echo of what the sheet
 * said before. What is different is that it says up front how the selection
 * breaks down — these will change, these already say it, these you may not
 * touch — because with one row that is one sentence and with thirty it is the
 * whole decision.
 *
 * Three fields, not five. Notes are per-piece by definition and setting the
 * same note on thirty rows is worse than no feature; the actual submission
 * date is a record of when something happened, and thirty things did not all
 * happen on the same day. What moves in bulk is a status and the two planned
 * dates.
 */

const STATUSES: Status[] = [
  "not-started",
  "in-progress",
  "submitted",
  "in-review",
  "published",
  "at-risk",
];

/** The fields the bar offers. Blank means "leave this one alone". */
interface Draft {
  status: string;
  submissionDate: string;
  publicationDate: string;
}

const EMPTY: Draft = { status: "", submissionDate: "", publicationDate: "" };

/**
 * Only the fields somebody filled in.
 *
 * A blank box means "don't touch this", not "clear it" — the opposite of the
 * single-row form, where a cleared box does clear the cell. The difference is
 * that this form starts empty against rows that all say something different,
 * so treating blank as "clear" would wipe two columns every time somebody
 * changed a status.
 */
function asked(draft: Draft): Partial<Draft> {
  const out: Partial<Draft> = {};
  if (draft.status) out.status = draft.status;
  if (draft.submissionDate) out.submissionDate = draft.submissionDate;
  if (draft.publicationDate) out.publicationDate = draft.publicationDate;
  return out;
}

/** A cell's value in the words the rest of the Hub uses. */
function say(field: CellChange["field"], value: string): string {
  if (!value) return "empty";
  if (field === "status") return STATUS_LABELS[value as Status] ?? value;
  if (field === "notes") return `“${value}”`;
  return formatShort(value);
}

/** One row of the confirmation: what it is called, and what would change on it. */
function Row({ row }: { row: BulkRow }) {
  if (row.problem) {
    return (
      <li className="bad">
        <b>{row.title}</b>
        <span className="muted small">{row.problem}</span>
      </li>
    );
  }
  if (row.already || !row.changes?.length) {
    return (
      <li className="bulk-same">
        <b>{row.title}</b>
        <span className="muted small">already says that</span>
      </li>
    );
  }
  return (
    <li>
      <b>{row.title}</b>
      <span className="bulk-cells">
        {row.changes.map((c) => (
          <span key={c.field} className="bulk-cell">
            {c.column}: <span className="sched-from">{say(c.field, c.from)}</span>
            <Icon name="back" size={10} />
            <span className="sched-to">{say(c.field, c.to)}</span>
          </span>
        ))}
      </span>
    </li>
  );
}

/**
 * How it went, once the selection is gone.
 *
 * Kept apart from the bar because it has to outlive it. Changing a submission
 * date changes what the table is sorted by, so the rows that were just
 * written have usually moved — sometimes off the page. If the report lived
 * inside the bar and the bar cleared with the selection, the only evidence
 * that anything happened would disappear along with the rows.
 */
export function BulkResultNote({
  result,
  onDismiss,
}: {
  result: BulkResult;
  onDismiss: () => void;
}) {
  return (
    <div className="bulk bulk-result" role="status">
      <p className="sched-done">
        <Icon name="submitted" size={14} />
        {result.done.length} forecast{result.done.length === 1 ? "" : "s"} changed
        {result.already.length > 0 && `, ${result.already.length} already said it`}
        {result.failed.length > 0 && `, ${result.failed.length} could not be changed`}.
        <button className="btn ghost small" onClick={onDismiss}>
          Dismiss
        </button>
      </p>
      {/* Named one by one: a count of failures is not something anybody can act on. */}
      {result.failed.length > 0 && (
        <ul className="bulk-rows">
          {result.failed.map((row) => (
            <li key={row.id} className="bad">
              <b>{row.title}</b>
              <span className="muted small">{row.problem}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function BulkSchedule({
  ids,
  onClear,
  onApplied,
}: {
  /** What is ticked, in the order the page lists it. */
  ids: string[];
  onClear: () => void;
  /**
   * How it went. The page re-reads the schedule, drops the selection — the
   * work on those rows is done — and shows the report itself.
   */
  onApplied: (result: BulkResult) => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [preview, setPreview] = useState<BulkPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changes = asked(draft);
  const anything = Object.keys(changes).length > 0;

  const set = <K extends keyof Draft>(key: K, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    // The confirmation described the old draft.
    setPreview(null);
  };

  async function review() {
    setBusy(true);
    setError(null);
    try {
      setPreview(
        await send<BulkPreview>("/content/schedule/bulk/preview", "POST", { ids, changes }),
      );
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
      const got = await send<BulkResult>("/content/schedule/bulk", "POST", {
        ids,
        changes,
        // Sent back exactly as it came, per row, so what is applied is what
        // was shown — and a row somebody else has edited since is refused
        // rather than overwritten.
        expect: Object.fromEntries(
          preview.rows.filter((r) => r.expect).map((r) => [r.id, r.expect]),
        ),
      });
      setPreview(null);
      setDraft(EMPTY);
      onApplied(got);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The sheet refused the changes.");
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bulk" role="region" aria-label="Change the selected forecasts">
      <div className="bulk-bar">
        <span className="bulk-count">
          <b>{ids.length}</b> selected
        </span>

        <div className="field">
          <label htmlFor="bulk-status">Status</label>
          <select
            id="bulk-status"
            value={draft.status}
            onChange={(e) => set("status", e.target.value)}
          >
            <option value="">Leave as it is</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="bulk-sub">Submission date</label>
          <input
            id="bulk-sub"
            type="date"
            value={draft.submissionDate}
            onChange={(e) => set("submissionDate", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="bulk-pub">Publication date</label>
          <input
            id="bulk-pub"
            type="date"
            value={draft.publicationDate}
            onChange={(e) => set("publicationDate", e.target.value)}
          />
        </div>

        <div className="bulk-actions">
          <button className="btn" onClick={() => void review()} disabled={busy || !anything}>
            {busy && !preview ? "Working it out…" : "Review the change"}
          </button>
          <button className="btn ghost" onClick={onClear} disabled={busy}>
            Clear selection
          </button>
        </div>
      </div>

      <p className="muted small bulk-hint">
        A box left blank is left alone. Only these three change in bulk &mdash; notes and
        the actual submission date belong to one piece each.
      </p>

      {error && <ErrorNote message={error} />}

      {/*
        Two steps, always, as with one row. The first asks the server what
        would happen; only the second changes anything.
      */}
      {preview && (
        <div className="bulk-confirm">
          <p className="sched-confirm-head">
            {preview.willChange === 0 ? (
              <>Nothing to change &mdash; every selected forecast already says that.</>
            ) : (
              <>
                This will change <b>{preview.willChange}</b> forecast
                {preview.willChange === 1 ? "" : "s"} on <b>{preview.target}</b>
                {preview.already > 0 && <>, leave {preview.already} that already say it</>}
                {preview.blocked > 0 && <>, and skip {preview.blocked} you may not change</>}.
              </>
            )}
          </p>
          <ul className="bulk-rows">
            {preview.rows.map((row) => (
              <Row key={row.id} row={row} />
            ))}
          </ul>
          <div className="bulk-actions">
            <button
              className="btn solid"
              onClick={() => void apply()}
              disabled={busy || preview.willChange === 0}
            >
              {busy ? "Changing the sheet…" : `Apply to ${preview.willChange} forecasts`}
            </button>
            <button className="btn" onClick={() => setPreview(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
