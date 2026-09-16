import type { Viewer } from "../auth.js";
import type { DataSource } from "../types.js";
import { createConnectors, DatasetReader } from "./connectors.js";
import { applySpec, identities, project, usedFields } from "./query.js";
import type { StudioStore } from "./store.js";
import type { ViewDef, ViewPage } from "./types.js";

/**
 * Running a view, away from HTTP.
 *
 * This used to live inside the studio router, which was fine while a view was
 * only ever drawn in a browser. It is not fine now that a view can be posted
 * to somebody at eight in the morning: the scheduler has no request, no
 * response and nobody signed in, and making it call its own API over the
 * network to reach code in the same process would be silly.
 *
 * So the view runner is a thing, and both callers hold one. Both go through
 * the same `for` — same filters, same field list, same colour rules, same
 * "only mine" — which is the point: the table in somebody's inbox is the
 * table on their screen, not a second implementation that drifts.
 */
export class ViewRunner {
  /**
   * The dataset reader, shared rather than duplicated.
   *
   * It holds the cache of what each source last returned, so a second one
   * would mean a second cache and two answers to "what does this sheet say".
   * The studio's admin routes reach in here for that reason.
   */
  readonly reader: DatasetReader;
  /** The connectors themselves, for the admin page that lists what each needs. */
  readonly connectors: ReturnType<typeof createConnectors>;

  constructor(
    private readonly studio: StudioStore,
    data: DataSource,
  ) {
    this.connectors = createConnectors(data);
    this.reader = new DatasetReader(this.connectors, (id) => studio.secretFor(id));
  }

  /** A dataset plus its connection, or a sentence written for a person. */
  async resolve(datasetId: string) {
    const dataset = await this.studio.dataset(datasetId);
    if (!dataset) return { error: "No dataset with that id." } as const;
    const connection = await this.studio.connection(dataset.connectionId);
    if (!connection) return { error: "That dataset's connection has been removed." } as const;
    return { dataset, connection } as const;
  }

  /**
   * One view and its rows, as this person would see them.
   *
   * The viewer is not decoration. A view can filter to "mine", and its
   * audience decides whether the person may see it at all — so a view is
   * always run *as somebody*, and the caller says who. Emailing one means
   * running it once per recipient rather than once and posting copies.
   *
   * A failed source read comes back in the page rather than thrown: the view
   * still renders and says which sheet would not answer and why. A blank page
   * with a spinner is the thing this is replacing.
   */
  async for(view: ViewDef, viewer: Viewer, viewerName?: string): Promise<ViewPage> {
    const found = await this.resolve(view.datasetId);
    const shell = {
      view: {
        id: view.id,
        slug: view.slug,
        label: view.label,
        icon: view.icon,
        section: view.section,
        order: view.order,
        state: view.state,
        description: view.description,
        spec: view.spec,
      },
    };
    if ("error" in found) {
      return {
        ...shell,
        fields: [],
        source: { dataset: "—", connection: "—", kind: "smartsheet" },
        total: 0,
        rows: [],
        error: found.error,
      };
    }
    const { dataset, connection } = found;
    const source = { dataset: dataset.label, connection: connection.label, kind: connection.kind };
    try {
      const rows = await this.reader.rows(connection, dataset.ref, dataset.refreshSeconds);
      const fields = usedFields(view.spec, dataset.fields);
      const applied = applySpec(rows, view.spec, viewer, viewerName, dataset.fields);
      return {
        ...shell,
        fields,
        source,
        total: applied.total,
        // The rules run against the whole row rather than the projected one,
        // so a rule can key off a column the layout does not draw.
        rows: project(applied.rows, fields, view.spec, identities(viewer, viewerName), dataset.fields),
      };
    } catch (err) {
      return {
        ...shell,
        fields: dataset.fields,
        source,
        total: 0,
        rows: [],
        error: err instanceof Error ? err.message : "The source could not be read.",
      };
    }
  }
}
