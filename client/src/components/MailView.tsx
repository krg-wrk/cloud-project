import { useEffect, useRef, useState } from "react";
import { send, useApi } from "../lib/api";
import { useDialog } from "../lib/dialog";
import { Icon } from "../lib/icons";
import type { ViewMail, ViewMails } from "../types";

/**
 * Have this view sent to you, on a morning you choose.
 *
 * The Hub's line has been that a view is an address: you open it and it is
 * true today. This is the one thing that does not cover — the list you want
 * before you have opened anything, waiting when the laptop is.
 *
 * It sends to you and nobody else. Not a simplification: a view can narrow
 * itself to the signed-in person's own work and its audience decides who may
 * open it at all, so there is no such thing as "the rows of this view"
 * without somebody to be. A list of other recipients would mean posting one
 * person's rows to another.
 */

/** So every mounted copy refreshes when one of them changes something. */
const MAILS_CHANGED = "forecasters-hub:view-mails";

export function announceMailChange(): void {
  window.dispatchEvent(new Event(MAILS_CHANGED));
}

export function useViewMails() {
  const mails = useApi<ViewMails>("/notifications/views");
  useEffect(() => {
    const onChange = () => mails.reload();
    window.addEventListener(MAILS_CHANGED, onChange);
    return () => window.removeEventListener(MAILS_CHANGED, onChange);
  });
  return mails;
}

const CADENCES: { value: ViewMail["cadence"]; label: string }[] = [
  { value: "weekdays", label: "Every weekday morning" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Once a week" },
];

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default function MailView({ viewId }: { viewId: string }) {
  const mails = useViewMails();
  const [open, setOpen] = useState(false);

  // Nothing to offer in a Hub that cannot send email. The button is left out
  // rather than shown disabled: a control that does nothing and will not say
  // why is worse than no control.
  if (!mails.data?.ready) return null;

  const already = mails.data.mails.find((m) => m.viewId === viewId);

  return (
    <span className="mailview">
      <button
        className={already?.enabled ? "btn small on" : "btn small"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={already ? already.words : "Have this view emailed to you"}
      >
        <Icon name="mail" size={14} />
        {already?.enabled ? "Emailed to you" : "Email me this"}
      </button>
      {open && <MailMenu viewId={viewId} already={already} onClose={() => setOpen(false)} />}
    </span>
  );
}

function MailMenu({
  viewId,
  already,
  onClose,
}: {
  viewId: string;
  already?: ViewMail;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [cadence, setCadence] = useState<ViewMail["cadence"]>(already?.cadence ?? "weekdays");
  const [weekday, setWeekday] = useState(already?.weekday ?? 1);
  const [hour, setHour] = useState(already?.hour ?? 8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [said, setSaid] = useState("");
  useDialog(box, onClose);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    // Next tick, or the click that opened it closes it again.
    const id = setTimeout(() => document.addEventListener("mousedown", away));
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", away);
    };
  }, [onClose]);

  async function act(run: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await run();
      announceMailChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mailview-menu" ref={box} role="dialog" aria-label="Email this view">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          void act(async () => {
            await send(`/notifications/views/${viewId}`, "PUT", { cadence, weekday, hour });
            onClose();
          });
        }}
      >
        <p className="mailview-what">
          Sent to you, and only you &mdash; a view can be filtered to your own work, so
          it is built fresh for whoever it goes to.
        </p>

        <label className="field">
          <span className="field-label">How often</span>
          <select
            value={cadence}
            onChange={(e) => setCadence(e.target.value as ViewMail["cadence"])}
          >
            {CADENCES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        {cadence === "weekly" && (
          <label className="field">
            <span className="field-label">Which day</span>
            <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          <span className="field-label">What time</span>
          <select value={hour} onChange={(e) => setHour(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>

        <div className="mailview-actions">
          <button className="btn accent small" disabled={busy}>
            {already ? "Change it" : "Send it to me"}
          </button>
          {/*
            Nothing else here lets somebody see what an email will look like
            before waiting a day for it. It does not count as the morning's
            send, so checking at four in the afternoon costs nothing.
          */}
          {already && (
            <button
              type="button"
              className="btn small"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const got = await send<{ problem?: string; rows: number }>(
                    `/notifications/views/${already.id}/now`,
                    "POST",
                  );
                  setSaid(
                    got.problem
                      ? `It could not be sent — ${got.problem}`
                      : `Sent, with ${got.rows} ${got.rows === 1 ? "row" : "rows"} in it.`,
                  );
                })
              }
            >
              Send one now
            </button>
          )}
          {already && (
            <button
              type="button"
              className="btn small danger"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await send(`/notifications/views/${already.id}`, "DELETE");
                  onClose();
                })
              }
            >
              Stop
            </button>
          )}
        </div>

        {said && <p className="studio-note">{said}</p>}
        {error && <p className="studio-note bad">{error}</p>}
        {already?.lastProblem && (
          <p className="studio-note bad">
            The last one did not go &mdash; {already.lastProblem}
          </p>
        )}
      </form>
    </div>
  );
}
