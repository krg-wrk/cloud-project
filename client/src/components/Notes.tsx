import { useState } from "react";
import { send, useApi } from "../lib/api";
import { Slot } from "../lib/custom";
import { formatLong } from "../lib/date";
import { personName } from "../lib/domain";
import { useViewer } from "../lib/viewer";
import type { ContentNote, Person } from "../types";
import { Avatar } from "./bits";

interface NotesResponse {
  notes: ContentNote[];
  canWrite: boolean;
  aiNotes: boolean;
}

/**
 * Working notes on a forecast. Everyone on the forecast can read them; the
 * forecaster and their commissioning manager can write.
 *
 * An AI draft comes back into the box for editing rather than being saved —
 * the forecaster decides what lands on the forecast, and anything kept stays
 * labelled as an AI note.
 */
export default function Notes({
  contentId,
  people,
  headingSlot,
}: {
  contentId: string;
  people: Person[];
  /** The registry slot that names this section, so it can be renamed. */
  headingSlot?: string;
}) {
  const { person } = useViewer();
  const { data, error, reload } = useApi<NotesResponse>(`/content/${contentId}/notes`);

  const [draft, setDraft] = useState("");
  const [isAiDraft, setIsAiDraft] = useState(false);
  const [aiModel, setAiModel] = useState<string>();
  const [steer, setSteer] = useState("");
  const [busy, setBusy] = useState<"save" | "ai" | null>(null);
  const [problem, setProblem] = useState<string>();
  const [editing, setEditing] = useState<string>();
  const [editBody, setEditBody] = useState("");

  async function save() {
    const body = draft.trim();
    if (!body) return;
    setBusy("save");
    setProblem(undefined);
    try {
      await send(`/content/${contentId}/notes`, "POST", {
        body,
        source: isAiDraft ? "ai" : "human",
        model: aiModel,
      });
      setDraft("");
      setIsAiDraft(false);
      setAiModel(undefined);
      setSteer("");
      reload();
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function askAi() {
    setBusy("ai");
    setProblem(undefined);
    try {
      const res = await send<{ draft: string; model: string }>(
        `/content/${contentId}/notes/draft`,
        "POST",
        { steer: steer.trim() || undefined },
      );
      // Into the box, not onto the forecast — it is a draft until someone keeps it.
      setDraft(res.draft);
      setIsAiDraft(true);
      setAiModel(res.model);
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit(id: string) {
    const body = editBody.trim();
    if (!body) return;
    try {
      await send(`/notes/${id}`, "PATCH", { body });
      setEditing(undefined);
      reload();
    } catch (err) {
      setProblem((err as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await send(`/notes/${id}`, "DELETE");
      reload();
    } catch (err) {
      setProblem((err as Error).message);
    }
  }

  if (error) return <div className="callout warn">{error}</div>;

  const notes = data?.notes ?? [];

  return (
    <>
      <div className="section-head">
        <Slot
          id={headingSlot ?? "content.section.notes"}
          as="h2"
          className="section-title"
          suffix={notes.length > 0 ? ` (${notes.length})` : undefined}
        />
        {data && !data.canWrite && (
          <span style={{ fontSize: 12, color: "var(--ink-45)" }}>Read only</span>
        )}
      </div>

      {data?.canWrite && (
        <div className="note-composer">
          <textarea
            className="note-input"
            rows={isAiDraft ? 10 : 3}
            /* The placeholder is a prompt, not a name: it goes as you type. */
            aria-label="A note on this forecast"
            placeholder="What are you thinking about this forecast? Angles, evidence to chase, anything the deadline makes tight."
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (isAiDraft) setIsAiDraft(false);
            }}
          />

          {isAiDraft && (
            <div className="ai-banner">
              <strong>AI draft — yours to edit.</strong> Nothing is saved until you keep it,
              and it will be labelled as an AI note. Check anything it asserts.
            </div>
          )}

          <div className="composer-row">
            <button className="btn solid" onClick={save} disabled={!draft.trim() || busy !== null}>
              {busy === "save" ? "Saving…" : isAiDraft ? "Keep this note" : "Add note"}
            </button>

            {data.aiNotes ? (
              <>
                <input
                  className="steer"
                  aria-label="Steer the AI draft (optional)"
                  placeholder="Steer the draft (optional) — e.g. focus on the colour story"
                  value={steer}
                  onChange={(e) => setSteer(e.target.value)}
                />
                <button className="btn" onClick={askAi} disabled={busy !== null}>
                  {busy === "ai" ? "Drafting…" : "Draft with AI"}
                </button>
              </>
            ) : (
              <button className="btn" onClick={askAi} disabled={busy !== null} title="Not configured yet">
                Draft with AI
              </button>
            )}

            {draft && (
              <button
                className="btn ghost"
                onClick={() => {
                  setDraft("");
                  setIsAiDraft(false);
                }}
              >
                Discard
              </button>
            )}
          </div>

          {problem && <div className="callout warn">{problem}</div>}
        </div>
      )}

      {notes.length === 0 ? (
        <div className="empty">No notes on this forecast yet.</div>
      ) : (
        <div className="note-list">
          {notes.map((note) => (
            <article key={note.id} className={`note${note.source === "ai" ? " note-ai" : ""}`}>
              <header className="note-head">
                <span className="who">
                  <Avatar id={note.authorId} name={personName(people, note.authorId)} />
                  <span>{personName(people, note.authorId)}</span>
                </span>
                {note.source === "ai" && (
                  <span className="tag" title={note.model}>
                    AI draft{note.model ? ` · ${note.model}` : ""}
                  </span>
                )}
                <span className="note-when">
                  {formatLong(note.createdAt.slice(0, 10))}
                  {note.updatedAt !== note.createdAt && " · edited"}
                </span>
                {(note.authorId === person?.id || data?.canWrite) && (
                  <span className="note-actions">
                    {editing === note.id ? (
                      <>
                        <button className="btn" onClick={() => saveEdit(note.id)}>
                          Save
                        </button>
                        <button className="btn ghost" onClick={() => setEditing(undefined)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn ghost"
                          onClick={() => {
                            setEditing(note.id);
                            setEditBody(note.body);
                          }}
                        >
                          Edit
                        </button>
                        <button className="btn ghost" onClick={() => remove(note.id)}>
                          Delete
                        </button>
                      </>
                    )}
                  </span>
                )}
              </header>
              {editing === note.id ? (
                <textarea
                  className="note-input"
                  rows={6}
                  aria-label="Edit this note"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                />
              ) : (
                <div className="note-body">{note.body}</div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
