import { useState } from "react";
import { send, useApi } from "../../lib/api";
import { formatLong } from "../../lib/date";
import { Icon } from "../../lib/icons";
import type { Connection, ConnectorInfo, ConnectorKind, Dataset } from "../../types";
import { ErrorNote, Loading } from "../../components/bits";

/**
 * Connections: where the Hub reads from.
 *
 * The credential is the careful part. It can be the name of an environment
 * variable, which is how a deployed Hub should hold one, or it can be pasted
 * here and kept in the Hub's own database. Either way it goes one direction
 * only: no response from any route carries it back, so this page can say a
 * credential is set and show its last four characters, and that is all it can
 * ever know about it.
 */

export const KIND_LABELS: Record<ConnectorKind, string> = {
  hub: "This Hub's own tables",
  smartsheet: "Smartsheet",
  "google-sheets": "Google Sheets",
  mongodb: "MongoDB",
  snowflake: "Snowflake",
};

const KIND_BLURBS: Record<ConnectorKind, string> = {
  hub: "The schedule, the team, the events and the 446 trend profiles the Hub already reads. No credential needed.",
  smartsheet: "Any sheet, by its id. Needs an API token, and the sheet shared with that token's account.",
  "google-sheets": "A spreadsheet and a tab, via a service account.",
  mongodb: "A collection, read-only.",
  snowflake: "A table or view, through a read-only role.",
};

export default function Connections() {
  const connectors = useApi<ConnectorInfo[]>("/studio/connectors");
  const connections = useApi<Connection[]>("/studio/connections");
  const datasets = useApi<Dataset[]>("/studio/datasets");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState<Record<string, string>>({});

  if (connections.error) return <ErrorNote message={connections.error} />;
  if (connections.loading || !connections.data) return <Loading what="the connections" />;

  const rows = connections.data;
  const info = connectors.data ?? [];

  async function test(id: string) {
    setBusy(id);
    setError(null);
    try {
      const result = await send<{ ok: boolean; note: string }>(
        `/studio/connections/${id}/test`,
        "POST",
      );
      setTested({ ...tested, [id]: result.note });
      connections.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The test failed.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(connection: Connection) {
    const used = (datasets.data ?? []).filter((d) => d.connectionId === connection.id);
    const warning = used.length
      ? `\n\nThis will also remove ${used.length} dataset${used.length === 1 ? "" : "s"} and any views built on ${used.length === 1 ? "it" : "them"}.`
      : "";
    if (!window.confirm(`Remove the connection "${connection.label}"?${warning}`)) return;
    setBusy(connection.id);
    try {
      await send(`/studio/connections/${connection.id}`, "DELETE");
      connections.reload();
      datasets.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "It could not be removed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {error && <ErrorNote message={error} />}

      <div className="studio-bar">
        <p className="muted small" style={{ margin: 0 }}>
          {rows.length === 0
            ? "Nothing connected yet."
            : `${rows.length} connection${rows.length === 1 ? "" : "s"}.`}{" "}
          Credentials are held on the server and are never sent back to this page.
        </p>
        <button className="btn solid" onClick={() => setAdding(true)}>
          <Icon name="plus" /> Add a connection
        </button>
      </div>

      {adding && (
        <ConnectionForm
          connectors={info}
          onDone={(saved) => {
            setAdding(false);
            connections.reload();
            if (saved) void test(saved);
          }}
        />
      )}

      {rows.length === 0 && !adding ? (
        <div className="empty">
          <Icon name="source" size={22} />
          <p>
            Add a connection to start. <strong>This Hub&rsquo;s own tables</strong> needs no
            credential and is the quickest way to see what the studio does.
          </p>
        </div>
      ) : (
        <div className="studio-list">
          {rows.map((connection) =>
            editing === connection.id ? (
              <ConnectionForm
                key={connection.id}
                connectors={info}
                existing={connection}
                onDone={() => {
                  setEditing(null);
                  connections.reload();
                }}
              />
            ) : (
              <div className="studio-item" key={connection.id}>
                <div className="studio-item-head">
                  <div>
                    <h2>
                      {connection.label}
                      {!info.find((i) => i.kind === connection.kind)?.live && (
                        <span className="tag state-draft" style={{ marginLeft: 8 }}>
                          Not wired up yet
                        </span>
                      )}
                    </h2>
                    <p className="muted small">
                      {KIND_LABELS[connection.kind]} ·{" "}
                      {(datasets.data ?? []).filter((d) => d.connectionId === connection.id)
                        .length}{" "}
                      datasets
                    </p>
                  </div>
                  <div className="studio-item-actions">
                    <button
                      className="btn"
                      onClick={() => void test(connection.id)}
                      disabled={busy === connection.id}
                    >
                      <Icon name="refresh" />
                      {busy === connection.id ? "Testing…" : "Test"}
                    </button>
                    <button className="btn" onClick={() => setEditing(connection.id)}>
                      <Icon name="edit" /> Edit
                    </button>
                    <button className="btn danger" onClick={() => void remove(connection)}>
                      <Icon name="trash" />
                    </button>
                  </div>
                </div>

                <dl className="studio-facts">
                  <div className="fact">
                    <dt>Credential</dt>
                    <dd>
                      {connection.kind === "hub" ? (
                        <span className="muted">None needed</span>
                      ) : connection.secretEnv ? (
                        <span>
                          <Icon name="lock" size={13} /> from{" "}
                          <code className="mono">{connection.secretEnv}</code>
                        </span>
                      ) : connection.hasSecret ? (
                        <span>
                          <Icon name="lock" size={13} /> stored{" "}
                          <code className="mono">{connection.secretHint}</code>
                        </span>
                      ) : (
                        <span className="needs-score">Not set</span>
                      )}
                    </dd>
                  </div>
                  {Object.entries(connection.settings).map(([k, v]) => (
                    <div className="fact" key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                  {connection.checkedAt && (
                    <div className="fact">
                      <dt>Last tested</dt>
                      <dd>{formatLong(connection.checkedAt.slice(0, 10))}</dd>
                    </div>
                  )}
                </dl>

                {(tested[connection.id] || connection.checkNote) && (
                  <p
                    className={
                      connection.checkOk ? "studio-note ok" : "studio-note bad"
                    }
                  >
                    <Icon name={connection.checkOk ? "published" : "at-risk"} size={14} />
                    {tested[connection.id] || connection.checkNote}
                  </p>
                )}
              </div>
            ),
          )}
        </div>
      )}
    </>
  );
}

function ConnectionForm({
  connectors,
  existing,
  onDone,
}: {
  connectors: ConnectorInfo[];
  existing?: Connection;
  onDone: (savedId?: string) => void;
}) {
  const [label, setLabel] = useState(existing?.label ?? "");
  const [kind, setKind] = useState<ConnectorKind>(existing?.kind ?? "hub");
  const [settings, setSettings] = useState<Record<string, string>>(existing?.settings ?? {});
  const [secretEnv, setSecretEnv] = useState(existing?.secretEnv ?? "");
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spec = connectors.find((c) => c.kind === kind);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { label, kind, settings, secretEnv };
      // An untouched box must not wipe a stored credential, so it is only
      // sent when something was typed.
      if (secret) body.secret = secret;
      const saved = existing
        ? await send<Connection>(`/studio/connections/${existing.id}`, "PUT", body)
        : await send<Connection>("/studio/connections", "POST", body);
      onDone(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "It could not be saved.");
      setSaving(false);
    }
  }

  return (
    <div className="studio-item editing">
      <h2>{existing ? `Edit ${existing.label}` : "New connection"}</h2>
      {error && <ErrorNote message={error} />}

      <div className="studio-form">
        <div className="field">
          <label htmlFor="c-label">Name it</label>
          <input
            id="c-label"
            value={label}
            placeholder="Commissioning sheets"
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="c-kind">System</label>
          <select
            id="c-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as ConnectorKind)}
          >
            {connectors.map((c) => (
              <option key={c.kind} value={c.kind}>
                {KIND_LABELS[c.kind]}
                {c.live ? "" : " — not wired up yet"}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="muted small">{KIND_BLURBS[kind]}</p>

      {spec && !spec.live && (
        <p className="studio-note bad">
          <Icon name="at-risk" size={14} />
          {KIND_LABELS[kind]} is modelled but its reader is not built yet. You can save the
          connection; it will not return rows.
        </p>
      )}

      {(spec?.needs.settings ?? []).length > 0 && (
        <div className="studio-form">
          {spec?.needs.settings.map((s) => (
            <div className="field" key={s.key}>
              <label htmlFor={`c-${s.key}`}>
                {s.label}
                {s.required ? "" : " (optional)"}
              </label>
              <input
                id={`c-${s.key}`}
                value={settings[s.key] ?? ""}
                placeholder={s.placeholder}
                onChange={(e) => setSettings({ ...settings, [s.key]: e.target.value })}
              />
            </div>
          ))}
        </div>
      )}

      {kind !== "hub" && (
        <>
          <div className="studio-form">
            <div className="field">
              <label htmlFor="c-env">Read the credential from an environment variable</label>
              <input
                id="c-env"
                value={secretEnv}
                placeholder="SMARTSHEET_TOKEN"
                onChange={(e) => setSecretEnv(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="c-secret">
                …or paste it here
                {existing?.hasSecret && ` (${existing.secretHint} is stored)`}
              </label>
              <input
                id="c-secret"
                type="password"
                autoComplete="off"
                value={secret}
                placeholder={existing?.hasSecret ? "Leave blank to keep it" : ""}
                onChange={(e) => setSecret(e.target.value)}
              />
            </div>
          </div>
          <p className="muted small">
            {spec?.needs.credential} An environment variable is the better of the two — it keeps
            the credential out of the database and out of any backup of it. Pasting one is for
            trying something out.
          </p>
        </>
      )}

      <div className="studio-actions">
        <button className="btn solid" onClick={() => void save()} disabled={saving || !label}>
          {saving ? "Saving…" : existing ? "Save changes" : "Add and test"}
        </button>
        <button className="btn" onClick={() => onDone()}>
          Cancel
        </button>
      </div>
    </div>
  );
}
