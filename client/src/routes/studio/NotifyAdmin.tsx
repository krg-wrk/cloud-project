import { useState } from "react";
import { send, useApi } from "../../lib/api";
import { Icon } from "../../lib/icons";
import type { AutomationRule, NotifyLog, RunResult } from "../../types";
import { ErrorNote, Loading } from "../../components/bits";
import { since } from "./Freshness";

/**
 * Notifications, from the sending end.
 *
 * The dry run is the point of this page. A feature whose failure mode is two
 * hundred people getting an email at three in the morning needs a way to
 * find out what it is about to do, and pressing a button labelled "send" to
 * find out is not it. So the preview is the default and the real send is a
 * second, differently coloured press with the count in front of you.
 *
 * The log underneath answers the other question an admin gets asked: "I
 * ticked Google Chat and nothing arrived." The reason is a row in here.
 */

const KIND_LABEL: Record<string, string> = {
  digest: "The week ahead",
  deadline: "Deadline",
  review: "Proof points",
};

const CHANNEL_LABEL: Record<string, string> = {
  inApp: "In the Hub",
  email: "Email",
  chat: "Google Chat",
};

export default function NotifyAdmin() {
  const log = useApi<NotifyLog>("/notifications/log");
  const [preview, setPreview] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState("");

  if (log.error) return <ErrorNote message={log.error} />;
  if (!log.data) return <Loading what="the notification log" />;

  const l = log.data;

  async function run(send_: boolean) {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (send_) params.set("send", "1");
      if (date) params.set("date", date);
      const query = params.toString();
      const result = await send<RunResult>(
        `/notifications/run${query ? `?${query}` : ""}`,
        "POST",
      );
      setPreview(result);
      if (send_) log.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The run failed.");
    } finally {
      setBusy(false);
    }
  }

  const waiting = preview?.deliveries.filter((d) => d.ok && d.problem === "dry run — nothing sent");

  return (
    <>
      {error && <ErrorNote message={error} />}

      <div className="studio-bar">
        <p className="muted small" style={{ margin: 0 }}>
          {l.scheduled
            ? "The schedule is on: deadline notices daily, the digest on Mondays."
            : "Nothing sends itself. The schedule is off, so notices only go out when somebody presses the button below."}{" "}
          {l.chose} of {l.team} have chosen their own settings; the rest get the default, which is
          the bell and nothing else.
        </p>
        <button className="btn" onClick={() => log.reload()}>
          <Icon name="refresh" /> Refresh
        </button>
      </div>

      <div className="studio-item">
        <div className="studio-item-head">
          <div>
            <h2>Channels</h2>
            <p className="muted small">
              In-app always works. The other two need pointing at something, and neither sends a
              byte until they are &mdash; a forecaster who ticks email before that gets nothing
              and is told so on their own settings page.
            </p>
          </div>
        </div>
        <dl className="studio-facts">
          {l.channels.map((c) => (
            <div className="fact" key={c.channel}>
              <dt>{CHANNEL_LABEL[c.channel] ?? c.channel}</dt>
              <dd>
                <span className={c.ready ? "ok-text" : "needs-score"}>
                  {c.ready ? "ready" : "not set up"}
                </span>
                <div className="muted small">{c.note}</div>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="studio-item" id="notify-run">
        <div className="studio-item-head">
          <div>
            <h2>Run it</h2>
            <p className="muted small">
              The preview builds every notice and works out where each would go, and sends
              nothing. Read it before you send: a mistake here reaches the whole team at once.
            </p>
          </div>
          <div className="studio-item-actions">
            <label className="field small">
              <span>As if it were</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Run as if it were this date"
              />
            </label>
            <button className="btn" onClick={() => void run(false)} disabled={busy}>
              <Icon name="eye" /> Preview
            </button>
          </div>
        </div>

        {preview && (
          <>
            <p className="studio-note">{preview.summary}</p>
            {preview.built === 0 ? (
              <p className="muted small">
                Nothing is waiting. No deadline is at three days, due today or overdue, and the
                digest only builds on a Monday &mdash; pick a Monday above to see one.
              </p>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="schedule">
                    <thead>
                      <tr>
                        <th scope="col">Who</th>
                        <th scope="col">What</th>
                        <th scope="col">Where</th>
                        <th scope="col">Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.deliveries.map((d) => (
                        <tr key={`${d.key}-${d.channel}`}>
                          <td>{preview.names?.[d.personId] ?? d.personId}</td>
                          <td>{KIND_LABEL[d.kind] ?? d.kind}</td>
                          <td>{CHANNEL_LABEL[d.channel] ?? d.channel}</td>
                          <td className={d.ok ? "said" : "said needs-score"}>
                            {d.problem ?? "sent"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {preview.dry && (
                  <div className="studio-item-actions" style={{ marginTop: 14 }}>
                    <button
                      className="btn danger"
                      onClick={() => void run(true)}
                      disabled={busy || !waiting?.length}
                    >
                      <Icon name="send" /> Send {waiting?.length ?? 0} for real
                    </button>
                    <span className="muted small">
                      Anything already sent is skipped, so this cannot repeat itself.
                    </span>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <Rules onError={setError} />

      <div className="studio-item" id="notify-log">
        <div className="studio-item-head">
          <div>
            <h2>What went out</h2>
            <p className="muted small">
              The last hundred attempts, newest first. Failures are kept and retried on the next
              run; a success is never repeated.
            </p>
          </div>
        </div>

        {l.sends.length === 0 ? (
          <p className="studio-note">Nothing has been sent yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="schedule">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">What</th>
                  <th scope="col">Where</th>
                  <th scope="col">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {l.sends.map((row) => (
                  <tr key={`${row.key}-${row.channel}`}>
                    <td className="muted">{since(row.at)} ago</td>
                    <td>{l.names[row.personId] ?? row.personId}</td>
                    <td>{KIND_LABEL[row.kind] ?? row.kind}</td>
                    <td>{CHANNEL_LABEL[row.channel] ?? row.channel}</td>
                    <td className={row.ok ? "said" : "said needs-score"}>
                      {row.ok ? "sent" : (row.problem ?? "failed")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* ---- Rules --------------------------------------------------------------
 *
 * The narrowest useful version of what AppSheet and Monday call automation:
 * notice a shape in the schedule, and tell the person who can do something
 * about it. A rule cannot change anything — every action is "tell somebody" —
 * and the page says so, because the first question anybody asks of a feature
 * like this is what it is allowed to touch.
 * ------------------------------------------------------------------------- */

interface RuleVocabulary {
  rules: AutomationRule[];
  fields: { key: string; label: string; type: string; options?: string[]; hint?: string }[];
  ops: { op: string; label: string }[];
  audiences: { value: string; label: string }[];
}

function Rules({ onError }: { onError: (message: string | null) => void }) {
  const data = useApi<RuleVocabulary>("/notifications/rules");
  const [editing, setEditing] = useState<AutomationRule | null>(null);

  if (data.error) return <ErrorNote message={data.error} />;
  if (!data.data) return null;
  const { rules, fields, ops, audiences } = data.data;

  const blank = (): AutomationRule => ({
    id: `rule-${Date.now().toString(36)}`,
    label: "",
    enabled: true,
    when: [{ field: fields[0].key, op: "is", value: "" }],
    tell: "owner",
    message: "",
    createdAt: "",
    updatedAt: "",
    updatedBy: "",
  });

  async function toggle(rule: AutomationRule) {
    try {
      await send(`/notifications/rules/${rule.id}`, "PUT", { ...rule, enabled: !rule.enabled });
      data.reload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "It could not be changed.");
    }
  }

  async function remove(rule: AutomationRule) {
    if (!window.confirm(`Remove the rule "${rule.label}"?`)) return;
    try {
      await send(`/notifications/rules/${rule.id}`, "DELETE");
      data.reload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "It could not be removed.");
    }
  }

  return (
    <div className="studio-item">
      <div className="studio-item-head">
        <div>
          <h2>Rules</h2>
          <p className="muted small">
            Something to watch the schedule for, and who to tell about it. A rule only ever
            tells somebody &mdash; it cannot change a status, a date or anything else on the
            sheet. They are checked on each run, alongside the deadlines and the digest, and
            each one lands on whichever channel that person chose for rule alerts.
          </p>
        </div>
        {!editing && (
          <button className="btn solid" onClick={() => setEditing(blank())}>
            <Icon name="plus" /> Write a rule
          </button>
        )}
      </div>

      {editing ? (
        <RuleForm
          rule={editing}
          fields={fields}
          ops={ops}
          audiences={audiences}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            data.reload();
          }}
          onError={onError}
        />
      ) : rules.length === 0 ? (
        <p className="studio-note">
          None yet. A first one worth having: <b>Past its deadline and not in</b> is{" "}
          <b>filled in</b>, telling the forecaster who owns it.
        </p>
      ) : (
        <ul className="rule-list">
          {rules.map((rule) => (
            <li key={rule.id} className={rule.enabled ? "rule-item" : "rule-item off"}>
              <div>
                <b>{rule.label}</b>
                <p className="muted small">
                  {rule.when
                    .map((c) => {
                      const field = fields.find((f) => f.key === c.field);
                      const op = ops.find((o) => o.op === c.op);
                      return `${field?.label ?? c.field} ${op?.label ?? c.op} ${c.value ?? ""}`.trim();
                    })
                    .join(", and ")}{" "}
                  &rarr;{" "}
                  {audiences.find((a) => a.value === rule.tell)?.label ?? rule.tell}
                  {rule.tell === "named" && rule.namedEmail ? ` (${rule.namedEmail})` : ""}
                </p>
              </div>
              <div className="studio-item-actions">
                <button className="btn" onClick={() => void toggle(rule)}>
                  {rule.enabled ? "Turn off" : "Turn on"}
                </button>
                <button className="btn" onClick={() => setEditing(rule)}>
                  <Icon name="edit" /> Edit
                </button>
                <button
                  className="btn danger"
                  onClick={() => void remove(rule)}
                  aria-label={`Remove the rule ${rule.label}`}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RuleForm({
  rule: initial,
  fields,
  ops,
  audiences,
  onCancel,
  onSaved,
  onError,
}: {
  rule: AutomationRule;
  fields: RuleVocabulary["fields"];
  ops: RuleVocabulary["ops"];
  audiences: RuleVocabulary["audiences"];
  onCancel: () => void;
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  const [rule, setRule] = useState(initial);
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (patch: Partial<AutomationRule>) => setRule({ ...rule, ...patch });
  const setCondition = (i: number, patch: Partial<AutomationRule["when"][number]>) =>
    set({ when: rule.when.map((c, j) => (i === j ? { ...c, ...patch } : c)) });

  /**
   * What it would say today, before it says anything.
   *
   * The difference between an admin trying a rule and an admin not daring to:
   * a rule that turns out to match four hundred pieces is one nobody wants to
   * discover by switching it on.
   */
  async function look() {
    setBusy(true);
    onError(null);
    try {
      setPreview((await send("/notifications/rules/preview", "POST", rule)) as RulePreview);
    } catch (err) {
      onError(err instanceof Error ? err.message : "It could not be previewed.");
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rule-form">
      <div className="studio-form">
        <label className="field">
          <span>Call it</span>
          <input
            value={rule.label}
            maxLength={80}
            placeholder="Something is late"
            onChange={(e) => set({ label: e.target.value })}
          />
        </label>
      </div>

      <div className="eyebrow" style={{ marginTop: 14 }}>
        When all of these are true
      </div>
      {rule.when.map((c, i) => {
        const field = fields.find((f) => f.key === c.field);
        const needsValue = !["empty", "not-empty"].includes(c.op);
        return (
          <div className="filter-row" key={i}>
            <select
              value={c.field}
              onChange={(e) => setCondition(i, { field: e.target.value, value: "" })}
              aria-label="Column"
            >
              {fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              value={c.op}
              onChange={(e) => setCondition(i, { op: e.target.value as typeof c.op })}
              aria-label="Test"
            >
              {ops.map((o) => (
                <option key={o.op} value={o.op}>
                  {o.label}
                </option>
              ))}
            </select>
            {needsValue &&
              (field?.options ? (
                <select
                  value={c.value ?? ""}
                  onChange={(e) => setCondition(i, { value: e.target.value })}
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
                  value={c.value ?? ""}
                  placeholder={field?.type === "number" ? "3" : "value"}
                  onChange={(e) => setCondition(i, { value: e.target.value })}
                  aria-label="Value"
                />
              ))}
            {rule.when.length > 1 && (
              <button
                className="btn danger"
                onClick={() => set({ when: rule.when.filter((_, j) => j !== i) })}
                aria-label="Remove this condition"
              >
                <Icon name="trash" />
              </button>
            )}
            {field?.hint && <span className="muted small">{field.hint}</span>}
          </div>
        );
      })}
      <button
        className="btn"
        disabled={rule.when.length >= 8}
        onClick={() => set({ when: [...rule.when, { field: fields[0].key, op: "is", value: "" }] })}
      >
        <Icon name="plus" /> And
      </button>

      <div className="studio-form" style={{ marginTop: 16 }}>
        <label className="field">
          <span>Tell</span>
          <select
            value={rule.tell}
            onChange={(e) => set({ tell: e.target.value as AutomationRule["tell"] })}
          >
            {audiences.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        {rule.tell === "named" && (
          <label className="field">
            <span>Their address</span>
            <input
              value={rule.namedEmail ?? ""}
              placeholder="name@wgsn.com"
              onChange={(e) => set({ namedEmail: e.target.value })}
            />
          </label>
        )}
      </div>

      <label className="field" style={{ marginTop: 12 }}>
        <span>What to say</span>
        <textarea
          rows={2}
          value={rule.message}
          maxLength={400}
          placeholder="{title} is {days} past its deadline and has not come in."
          onChange={(e) => set({ message: e.target.value })}
        />
      </label>
      <p className="muted small">
        <code>{"{title}"}</code>, <code>{"{days}"}</code> and <code>{"{status}"}</code> are
        filled in from the piece it is about. <code>{"{days}"}</code> brings its own unit
        &mdash; &ldquo;1 day&rdquo;, &ldquo;7 days&rdquo; &mdash; so write
        &ldquo;{"{days}"} past its deadline&rdquo; rather than
        &ldquo;{"{days}"} days&rdquo;.
      </p>

      <div className="composer-row" style={{ marginTop: 14 }}>
        <button className="btn" disabled={busy} onClick={() => void look()}>
          <Icon name="eye" /> What would it say?
        </button>
        <button
          className="btn solid"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            onError(null);
            try {
              await send(`/notifications/rules/${rule.id}`, "PUT", rule);
              onSaved();
            } catch (err) {
              onError(err instanceof Error ? err.message : "It could not be saved.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Save it
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {preview && (
        <div className="rule-preview">
          <b>
            {preview.matched === 0
              ? "Nothing matches it today."
              : `${preview.matched} ${preview.matched === 1 ? "piece" : "pieces"} match it today.`}
          </b>
          {preview.examples.length > 0 && (
            <ul>
              {preview.examples.map((e, i) => (
                <li key={i}>
                  <span className="muted small">{e.who}</span> {e.body}
                </li>
              ))}
            </ul>
          )}
          {preview.matched > preview.examples.length && (
            <p className="muted small">
              …and {preview.matched - preview.examples.length} more.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface RulePreview {
  matched: number;
  examples: { who: string; body: string; link?: string }[];
}
