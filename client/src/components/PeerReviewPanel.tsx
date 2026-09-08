import { useState } from "react";
import { Link } from "react-router-dom";
import { send } from "../lib/api";
import { formatLong, relativeDays } from "../lib/date";
import { personName } from "../lib/domain";
import { useViewer } from "../lib/viewer";
import type { ContentItem, PeerReview, Person } from "../types";
import { Avatar } from "./bits";

/**
 * Booking a peer review.
 *
 * The date lands in both people's calendars, and either of them can move or
 * cancel it — a review is an arrangement between two people, not something
 * one of them owns.
 */
export default function PeerReviewPanel({
  item,
  people,
  review,
  onChange,
}: {
  item: ContentItem;
  people: Person[];
  review: PeerReview | null;
  onChange: (next: PeerReview | null) => void;
}) {
  const { person, isManager } = useViewer();
  const [open, setOpen] = useState(false);
  const [reviewerId, setReviewerId] = useState(review?.reviewerId ?? "");
  const [reviewDate, setReviewDate] = useState(review?.reviewDate ?? "");
  const [note, setNote] = useState(review?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  const iAmAuthor = person?.id === item.forecasterId;
  const iAmReviewer = person?.id === review?.reviewerId;
  const canChange = iAmAuthor || iAmReviewer || isManager;

  // A piece cannot review itself, so its author is not an option.
  const candidates = people.filter((p) => p.role === "forecaster" && p.id !== item.forecasterId);

  async function save() {
    setBusy(true);
    setProblem(undefined);
    try {
      const next = await send<PeerReview>(`/content/${item.id}/peer-review`, "PUT", {
        reviewerId,
        reviewDate,
        note: note.trim() || undefined,
      });
      onChange(next);
      setOpen(false);
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setProblem(undefined);
    try {
      await send(`/content/${item.id}/peer-review`, "DELETE");
      onChange(null);
      setReviewerId("");
      setReviewDate("");
      setNote("");
      setOpen(false);
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card peer-card">
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        Peer review
      </div>

      {review && !open && (
        <>
          <Link to={`/team/${review.reviewerId}`} className="who" style={{ marginBottom: 10 }}>
            <Avatar id={review.reviewerId} name={personName(people, review.reviewerId)} size="lg" />
            <span>
              <span className="person-name">{personName(people, review.reviewerId)}</span>
              <span className="person-meta" style={{ display: "block" }}>
                {iAmReviewer ? "You are reviewing this" : "Reviewing this forecast"}
              </span>
            </span>
          </Link>
          <dl className="facts">
            <div className="fact">
              <dt>Review date</dt>
              <dd>{formatLong(review.reviewDate)}</dd>
            </div>
            <div className="fact">
              <dt>When</dt>
              <dd>{relativeDays(review.reviewDate)}</dd>
            </div>
            <div className="fact">
              <dt>Arranged by</dt>
              <dd>{personName(people, review.arrangedBy)}</dd>
            </div>
          </dl>
          {review.note && (
            <p style={{ fontSize: 12.5, color: "var(--ink-70)", margin: "10px 0 0" }}>
              {review.note}
            </p>
          )}
          <p className="signup-note" style={{ marginTop: 10 }}>
            In both calendars. Either of you can move or cancel it.
          </p>
          {canChange && (
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              <button className="btn" onClick={() => setOpen(true)}>
                Amend
              </button>
              <button className="btn ghost" onClick={remove} disabled={busy}>
                Remove
              </button>
            </div>
          )}
        </>
      )}

      {!review && !open && (
        <>
          <p style={{ fontSize: 12.5, color: "var(--ink-70)", margin: "0 0 12px" }}>
            No reviewer yet. Booking one puts the date in both your calendars.
          </p>
          {canChange ? (
            <button className="btn solid" onClick={() => setOpen(true)}>
              Add a peer reviewer
            </button>
          ) : (
            <span className="signup-note">Only {personName(people, item.forecasterId)} or a
              commissioning manager can set this.</span>
          )}
        </>
      )}

      {open && (
        <div className="peer-form">
          <label className="field">
            <span>Reviewer</span>
            <select value={reviewerId} onChange={(e) => setReviewerId(e.target.value)}>
              <option value="">Choose a colleague…</option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.vertical}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Review date</span>
            <input
              type="date"
              value={reviewDate}
              max={item.publicationDate}
              onChange={(e) => setReviewDate(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Note (optional)</span>
            <input
              type="text"
              placeholder="What you want them to look at"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <button
              className="btn solid"
              onClick={save}
              disabled={busy || !reviewerId || !reviewDate}
            >
              {busy ? "Saving…" : review ? "Save changes" : "Book it"}
            </button>
            <button className="btn ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          <p className="signup-note" style={{ marginTop: 4 }}>
            Copy is due {formatLong(item.submissionDate)} — a review before that is the
            point of it.
          </p>
          {problem && <div className="callout warn">{problem}</div>}
        </div>
      )}
    </div>
  );
}
