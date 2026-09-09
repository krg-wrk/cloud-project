import { useState } from "react";
import { Link } from "react-router-dom";
import { send, useApi } from "../../lib/api";
import { Icon } from "../../lib/icons";
import type { Dataset, ViewDef } from "../../types";
import { ErrorNote, Loading } from "../../components/bits";
import ViewBuilder, { LAYOUT_LABELS, blankSpec } from "./ViewBuilder";

/** The views that exist, and the way into building another. */
export default function Views() {
  const views = useApi<ViewDef[]>("/studio/views");
  const datasets = useApi<Dataset[]>("/studio/datasets");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (views.error) return <ErrorNote message={views.error} />;
  if (views.loading || !views.data || !datasets.data) return <Loading what="the views" />;

  const rows = views.data;
  const ready = datasets.data.filter((d) => d.fields.length > 0);

  async function remove(view: ViewDef) {
    if (!window.confirm(`Remove the view "${view.label}"? /v/${view.slug} will stop working.`)) {
      return;
    }
    try {
      await send(`/studio/views/${view.id}`, "DELETE");
      views.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "It could not be removed.");
    }
  }

  async function setState(view: ViewDef, state: "draft" | "live") {
    try {
      await send(`/studio/views/${view.id}`, "PUT", { state });
      views.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "It could not be changed.");
    }
  }

  if (editing === "new" || (editing && rows.some((v) => v.id === editing))) {
    return (
      <ViewBuilder
        datasets={ready}
        existing={editing === "new" ? undefined : rows.find((v) => v.id === editing)}
        onDone={() => {
          setEditing(null);
          views.reload();
        }}
      />
    );
  }

  if (ready.length === 0) {
    return (
      <div className="empty">
        <Icon name="table" size={22} />
        <p>
          A view is built on a dataset whose columns have been read, and there are none yet.{" "}
          <Link to="/studio/datasets">Set one up first.</Link>
        </p>
      </div>
    );
  }

  return (
    <>
      {error && <ErrorNote message={error} />}

      <div className="studio-bar">
        <p className="muted small" style={{ margin: 0 }}>
          {rows.length === 0
            ? "No views yet."
            : `${rows.length} view${rows.length === 1 ? "" : "s"}, ${rows.filter((v) => v.state === "live").length} live.`}{" "}
          A draft is visible to admins only, so you can build one in the open.
        </p>
        <button className="btn solid" onClick={() => setEditing("new")}>
          <Icon name="plus" /> Build a view
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <Icon name="eye" size={22} />
          <p>Build a view and it appears in the sidebar for whoever it is aimed at.</p>
        </div>
      ) : (
        <div className="studio-list">
          {rows.map((view) => {
            const dataset = datasets.data?.find((d) => d.id === view.datasetId);
            return (
              <div className="studio-item" key={view.id}>
                <div className="studio-item-head">
                  <div>
                    <h2>
                      <Icon name={view.icon} size={17} /> {view.label}{" "}
                      <span className={view.state === "live" ? "tag state-live" : "tag state-draft"}>
                        {view.state === "live" ? "Live" : "Draft"}
                      </span>
                    </h2>
                    <p className="muted small">
                      <Link to={`/v/${view.slug}`} className="link-out">
                        /v/{view.slug}
                      </Link>{" "}
                      · {LAYOUT_LABELS[view.spec.layout]} · {view.section} ·{" "}
                      {dataset?.label ?? "dataset removed"}
                    </p>
                  </div>
                  <div className="studio-item-actions">
                    <button
                      className="btn"
                      onClick={() => void setState(view, view.state === "live" ? "draft" : "live")}
                    >
                      {view.state === "live" ? "Unpublish" : "Publish"}
                    </button>
                    <button className="btn" onClick={() => setEditing(view.id)}>
                      <Icon name="edit" /> Edit
                    </button>
                    <button className="btn danger" onClick={() => void remove(view)}>
                      <Icon name="trash" />
                    </button>
                  </div>
                </div>
                <dl className="studio-facts">
                  <div className="fact">
                    <dt>Who sees it</dt>
                    <dd>{describeAudience(view)}</dd>
                  </div>
                  <div className="fact">
                    <dt>Filters</dt>
                    <dd>
                      {view.spec.filters.length === 0 ? (
                        <span className="muted">every row</span>
                      ) : (
                        view.spec.filters.length
                      )}
                    </dd>
                  </div>
                  <div className="fact">
                    <dt>Last changed</dt>
                    <dd>{view.updatedBy}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

const ROLE_WORDS: Record<string, string> = {
  forecaster: "forecasters",
  "commissioning-manager": "commissioning managers",
  admin: "admins",
};

export function describeAudience(view: ViewDef): string {
  const a = view.audience;
  const parts: string[] = [];
  parts.push(
    a.roles === "all" ? "everyone" : a.roles.map((r) => ROLE_WORDS[r] ?? r).join(" and "),
  );
  if (a.verticals !== "all" && a.verticals.length > 0) {
    parts.push(`in ${a.verticals.join(", ")}`);
  }
  if (a.emails.length > 0) {
    parts.push(`plus ${a.emails.length} named ${a.emails.length === 1 ? "person" : "people"}`);
  }
  return parts.join(" ");
}

export { blankSpec };
