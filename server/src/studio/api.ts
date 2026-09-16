import { Router } from "express";
import { requireAdmin, type Viewer, type ViewerRequest } from "../auth.js";
import { connectorCatalogue } from "./connectors.js";
import {
  applySpec,
  canSeeView,
  identities,
  project,
  RESERVED_SLUGS,
  slugify,
  usedFields,
} from "./query.js";
import { ViewRunner } from "./run.js";
import type { StudioStore } from "./store.js";
import {
  CONNECTOR_KINDS,
  EVERYONE,
  FILTER_OPS,
  LAYOUTS,
  TONES,
  type Audience,
  type ConnectorKind,
  type Filter,
  type FormatRule,
  type Layout,
  type Tone,
  type SlotPatch,
  type ViewDef,
  type ViewPage,
  type ViewSpec,
} from "./types.js";
import type { Role } from "../auth.js";
import type { DataSource } from "../types.js";

/**
 * The studio's API: an admin half that configures, and a runtime half that
 * serves what was configured.
 *
 * Two rules hold throughout. A credential never appears in a response — the
 * store's read shape has no column for it, and the connectors take it
 * straight from the store. And the audience rule is applied here rather than
 * in the client, so a slug someone forwarded is no way past it.
 */

const ROLES: Role[] = ["forecaster", "commissioning-manager", "admin"];

/** Anything a client sends is rebuilt field by field rather than trusted. */
function readSpec(body: unknown): ViewSpec {
  const raw = (body ?? {}) as Record<string, unknown>;
  const layout = LAYOUTS.includes(raw.layout as Layout) ? (raw.layout as Layout) : "table";
  const f = (raw.fields ?? {}) as Record<string, unknown>;
  const text = (v: unknown): string | undefined => {
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? undefined : s;
  };
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];

  const filters: Filter[] = (Array.isArray(raw.filters) ? raw.filters : [])
    .map((x) => x as Record<string, unknown>)
    .filter((x) => typeof x.field === "string" && FILTER_OPS.includes(x.op as Filter["op"]))
    .map((x) => ({
      field: String(x.field),
      op: x.op as Filter["op"],
      value: typeof x.value === "string" ? x.value : undefined,
    }));

  // Same shape as a filter, plus a tone from the closed list. A tone the
  // client made up is dropped rather than honoured: the palette means
  // something, and a view inventing its own red would break that meaning.
  const rules: FormatRule[] = (Array.isArray(raw.rules) ? raw.rules : [])
    .map((x) => x as Record<string, unknown>)
    .filter(
      (x) =>
        typeof x.field === "string" &&
        FILTER_OPS.includes(x.op as Filter["op"]) &&
        TONES.includes(x.tone as Tone),
    )
    .slice(0, 12)
    .map((x) => ({
      field: String(x.field),
      op: x.op as Filter["op"],
      value: typeof x.value === "string" ? x.value : undefined,
      tone: x.tone as Tone,
      label: typeof x.label === "string" ? x.label.trim().slice(0, 40) : undefined,
    }));

  const sortRaw = (raw.sort ?? null) as Record<string, unknown> | null;
  const sort =
    sortRaw && typeof sortRaw.field === "string" && sortRaw.field.trim() !== ""
      ? {
          field: String(sortRaw.field),
          direction: sortRaw.direction === "desc" ? ("desc" as const) : ("asc" as const),
        }
      : undefined;

  const size = Number(raw.pageSize);
  return {
    layout,
    fields: {
      title: text(f.title),
      subtitle: text(f.subtitle),
      body: text(f.body),
      date: text(f.date),
      endDate: text(f.endDate),
      status: text(f.status),
      group: text(f.group),
      person: text(f.person),
      image: text(f.image),
      link: text(f.link),
      columns: list(f.columns),
      meta: list(f.meta),
    },
    filters,
    rules,
    sort,
    // 0 means every row; anything silly is clamped rather than refused.
    pageSize: Number.isFinite(size) ? Math.max(0, Math.min(2000, Math.trunc(size))) : 100,
  };
}

function readAudience(body: unknown): Audience {
  const raw = (body ?? {}) as Record<string, unknown>;
  const roles =
    raw.roles === "all" || raw.roles == null
      ? ("all" as const)
      : (Array.isArray(raw.roles) ? raw.roles : []).filter((r): r is Role =>
          ROLES.includes(r as Role),
        );
  const verticals =
    raw.verticals === "all" || raw.verticals == null
      ? ("all" as const)
      : (Array.isArray(raw.verticals) ? raw.verticals : []).filter(
          (v): v is string => typeof v === "string" && v.trim() !== "",
        );
  const emails = (Array.isArray(raw.emails) ? raw.emails : [])
    .filter((e): e is string => typeof e === "string")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  // An empty role list would lock everyone out including the person who just
  // saved it, which is never what was meant.
  return {
    roles: roles === "all" || roles.length === 0 ? "all" : roles,
    verticals: verticals === "all" || verticals.length === 0 ? "all" : verticals,
    emails,
  };
}

/**
 * The studio's routes.
 *
 * The runner is passed in rather than made here, because the scheduler holds
 * the same one: a view posted to somebody's inbox has to be the view on their
 * screen, and two runners would mean two caches and two answers.
 */
export function createStudioRouter(
  studio: StudioStore,
  data: DataSource,
  runner = new ViewRunner(studio, data),
): Router {
  const router = Router();
  const reader = runner.reader;
  const connectors = runner.connectors;
  const resolve = (datasetId: string) => runner.resolve(datasetId);

  // --- Runtime: what the team sees --------------------------------------

  /**
   * The custom views this viewer may open, for the sidebar. Drafts come back
   * for an admin and are marked as such, so a view can be built in place.
   */
  router.get("/views", async (req: ViewerRequest, res) => {
    const viewer = req.viewer;
    if (!viewer?.active) {
      res.json([]);
      return;
    }
    res.json(
      (await studio.listViews())
        .filter((v) => canSeeView(v.audience, v.state, viewer))
        .map((v) => ({
          slug: v.slug,
          label: v.label,
          icon: v.icon,
          section: v.section,
          order: v.order,
          state: v.state,
        })),
    );
  });

  /**
   * One view and its rows.
   *
   * A failed source read is part of the response rather than a 500: the view
   * still renders, and says which sheet would not answer and why. A blank
   * page with a spinner is the thing this is replacing.
   */
  router.get("/views/:slug", async (req: ViewerRequest, res, next) => {
    try {
      const viewer = req.viewer;
      const view = await studio.viewBySlug(req.params.slug);
      if (!view || !viewer || !canSeeView(view.audience, view.state, viewer)) {
        res.status(404).json({ error: "No view at that address, or it is not yours to see." });
        return;
      }
      res.json(await runner.for(view, viewer, req.viewer?.name));
    } catch (err) {
      next(err);
    }
  });

  /**
   * The wording and layout of the built-in pages.
   *
   * Read by anyone signed in, because no page can render without it. There is
   * nothing sensitive in it — it is the app's own wording — and it carries
   * only what an admin has changed, so the client falls back to the defaults
   * it already has in code.
   */
  router.get("/customisation", async (req: ViewerRequest, res) => {
    if (!req.viewer?.active) {
      res.json({ slots: {} });
      return;
    }
    res.json({ slots: (await studio.listSlots()) });
  });

  /**
   * A slot id is a dotted path the client's registry declares — "content",
   * "content.facts.season". Validated to that shape so it stays a key and
   * cannot become anything else.
   */
  const SLOT_ID = /^[a-z][a-z0-9]*(\.[a-z0-9-]+)*$/;

  router.put("/studio/slots/:slot", async (req: ViewerRequest, res) => {
    const viewer = requireAdmin(req, res);
    if (!viewer) return;
    const slot = req.params.slot;
    if (!SLOT_ID.test(slot) || slot.length > 80) {
      res.status(400).json({ error: `"${slot}" is not a slot id.` });
      return;
    }
    const body = req.body ?? {};
    const patch: SlotPatch = {};
    if (body.label !== undefined) {
      if (body.label === null) patch.label = null;
      else if (typeof body.label === "string") {
        const trimmed = body.label.trim().slice(0, 200);
        // An empty rename means "use the default", which is a reset of that
        // one field rather than a heading with nothing in it.
        patch.label = trimmed === "" ? null : trimmed;
      }
    }
    if (typeof body.hidden === "boolean") patch.hidden = body.hidden;
    if (body.order !== undefined) {
      patch.order = body.order === null ? null : Number(body.order) || 0;
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "Nothing to change." });
      return;
    }
    await studio.setSlot(slot, patch, viewer.email);
    res.json({ slots: (await studio.listSlots()) });
  });

  router.delete("/studio/slots/:slot", async (req: ViewerRequest, res) => {
    if (!requireAdmin(req, res)) return;
    await studio.resetSlot(req.params.slot);
    res.json({ slots: (await studio.listSlots()) });
  });

  /** Reset a page, or the lot. The prefix is matched on the slot id. */
  router.delete("/studio/slots", async (req: ViewerRequest, res) => {
    if (!requireAdmin(req, res)) return;
    const prefix = typeof req.query.prefix === "string" ? req.query.prefix : undefined;
    if (prefix && !/^[a-z][a-z0-9.-]{0,79}$/.test(prefix)) {
      res.status(400).json({ error: "That is not a slot prefix." });
      return;
    }
    const cleared = await studio.resetSlots(prefix);
    res.json({ cleared, slots: (await studio.listSlots()) });
  });

  // --- Admin ------------------------------------------------------------

  /** What each connector needs, and which of them actually read today. */
  router.get("/studio/connectors", (req: ViewerRequest, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(connectorCatalogue(connectors));
  });

  router.get("/studio/connections", async (req: ViewerRequest, res) => {
    if (!requireAdmin(req, res)) return;
    res.json((await studio.listConnections()));
  });

  router.post("/studio/connections", async (req: ViewerRequest, res) => {
    const viewer = requireAdmin(req, res);
    if (!viewer) return;
    const body = req.body ?? {};
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const kind = body.kind as ConnectorKind;
    if (!label) {
      res.status(400).json({ error: "A connection needs a name." });
      return;
    }
    if (!CONNECTOR_KINDS.includes(kind)) {
      res.status(400).json({ error: `Unknown system "${String(body.kind)}".` });
      return;
    }
    res.status(201).json(
      (await studio.createConnection(
        {
          label,
          kind,
          settings: readSettings(body.settings),
          secretEnv: typeof body.secretEnv === "string" ? body.secretEnv.trim() : undefined,
          secret: typeof body.secret === "string" ? body.secret.trim() : undefined,
        },
        viewer.email,
      )),
    );
  });

  router.put("/studio/connections/:id", async (req: ViewerRequest, res) => {
    const viewer = requireAdmin(req, res);
    if (!viewer) return;
    const body = req.body ?? {};
    const updated = (await studio.updateConnection(
      req.params.id,
      {
        label: typeof body.label === "string" ? body.label.trim() : undefined,
        kind: CONNECTOR_KINDS.includes(body.kind as ConnectorKind)
          ? (body.kind as ConnectorKind)
          : undefined,
        settings: body.settings === undefined ? undefined : readSettings(body.settings),
        secretEnv: typeof body.secretEnv === "string" ? body.secretEnv.trim() : undefined,
        // Absent leaves the stored credential alone; "" clears it.
        secret: typeof body.secret === "string" ? body.secret.trim() : undefined,
      },
      viewer.email,
    ));
    if (!updated) {
      res.status(404).json({ error: "No connection with that id." });
      return;
    }
    reader.forget(req.params.id);
    res.json(updated);
  });

  router.delete("/studio/connections/:id", async (req: ViewerRequest, res) => {
    if (!requireAdmin(req, res)) return;
    if (!(await studio.deleteConnection(req.params.id))) {
      res.status(404).json({ error: "No connection with that id." });
      return;
    }
    reader.forget(req.params.id);
    res.status(204).end();
  });

  /** Test a connection, and remember the answer so the list can show it. */
  router.post("/studio/connections/:id/test", async (req: ViewerRequest, res, next) => {
    try {
      if (!requireAdmin(req, res)) return;
      const connection = await studio.connection(req.params.id);
      if (!connection) {
        res.status(404).json({ error: "No connection with that id." });
        return;
      }
      const result = await reader
        .connector(connection.kind)
        .probe(await reader.contextFor(connection));
      await studio.recordCheck(connection.id, result.ok, result.note);
      res.json({ ...result, connection: await studio.connection(connection.id) });
    } catch (err) {
      next(err);
    }
  });

  /** The tables this connection can see, for picking one without typing an id. */
  router.get("/studio/connections/:id/catalogue", async (req: ViewerRequest, res, next) => {
    try {
      if (!requireAdmin(req, res)) return;
      const connection = await studio.connection(req.params.id);
      if (!connection) {
        res.status(404).json({ error: "No connection with that id." });
        return;
      }
      const connector = reader.connector(connection.kind);
      if (!connector.catalogue) {
        res.json({ tables: [], note: `${connection.kind} cannot list its tables.` });
        return;
      }
      res.json({ tables: await connector.catalogue(await reader.contextFor(connection)) });
    } catch (err) {
      res.status(502).json({
        tables: [],
        note: err instanceof Error ? err.message : "The connection could not be read.",
      });
    }
  });

  router.get("/studio/datasets", async (req: ViewerRequest, res) => {
    if (!requireAdmin(req, res)) return;
    const connectionId =
      typeof req.query.connection === "string" ? req.query.connection : undefined;
    res.json((await studio.listDatasets(connectionId)));
  });

  router.post("/studio/datasets", async (req: ViewerRequest, res) => {
    const viewer = requireAdmin(req, res);
    if (!viewer) return;
    const body = req.body ?? {};
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const ref = typeof body.ref === "string" ? body.ref.trim() : "";
    const connectionId = typeof body.connectionId === "string" ? body.connectionId : "";
    if (!label || !ref || !connectionId) {
      res.status(400).json({ error: "A dataset needs a name, a connection and a table." });
      return;
    }
    if (!await studio.connection(connectionId)) {
      res.status(400).json({ error: "No connection with that id." });
      return;
    }
    res.status(201).json(
      (await studio.createDataset(
        { connectionId, label, ref, refreshSeconds: Number(body.refreshSeconds) || 60 },
        viewer.email,
      )),
    );
  });

  router.put("/studio/datasets/:id", async (req: ViewerRequest, res) => {
    const viewer = requireAdmin(req, res);
    if (!viewer) return;
    const body = req.body ?? {};
    const updated = (await studio.updateDataset(
      req.params.id,
      {
        label: typeof body.label === "string" ? body.label.trim() : undefined,
        ref: typeof body.ref === "string" ? body.ref.trim() : undefined,
        refreshSeconds: body.refreshSeconds == null ? undefined : Number(body.refreshSeconds),
      },
      viewer.email,
    ));
    if (!updated) {
      res.status(404).json({ error: "No dataset with that id." });
      return;
    }
    reader.forget(updated.connectionId);
    res.json(updated);
  });

  router.delete("/studio/datasets/:id", async (req: ViewerRequest, res) => {
    if (!requireAdmin(req, res)) return;
    if (!(await studio.deleteDataset(req.params.id))) {
      res.status(404).json({ error: "No dataset with that id." });
      return;
    }
    res.status(204).end();
  });

  /**
   * Read the source and store what columns it has.
   *
   * This is the step that makes the builder usable: once a dataset knows its
   * columns and their types, every field picker and filter in the view
   * builder is a list to choose from rather than a name to remember.
   */
  router.post("/studio/datasets/:id/discover", async (req: ViewerRequest, res, next) => {
    try {
      if (!requireAdmin(req, res)) return;
      const found = await resolve(req.params.id);
      if ("error" in found) {
        res.status(404).json({ error: found.error });
        return;
      }
      const { dataset, connection } = found;
      const described = await reader.connector(connection.kind).describe(
        await reader.contextFor(connection),
        dataset.ref,
      );
      reader.forget(connection.id, dataset.ref);
      res.json(
        (await studio.recordFields(
          dataset.id,
          described.fields,
          described.rowCount,
          described.truncated ?? false,
        )),
      );
    } catch (err) {
      if (err instanceof Error) {
        res.status(502).json({ error: err.message });
        return;
      }
      next(err);
    }
  });

  /** A sample of rows straight from the source, for checking a mapping. */
  router.get("/studio/datasets/:id/sample", async (req: ViewerRequest, res, next) => {
    try {
      if (!requireAdmin(req, res)) return;
      const found = await resolve(req.params.id);
      if ("error" in found) {
        res.status(404).json({ error: found.error });
        return;
      }
      const { dataset, connection } = found;
      const rows = await reader.rows(connection, dataset.ref, dataset.refreshSeconds);
      res.json({ total: rows.length, rows: rows.slice(0, 5), fields: dataset.fields });
    } catch (err) {
      if (err instanceof Error) {
        res.status(502).json({ error: err.message });
        return;
      }
      next(err);
    }
  });

  router.get("/studio/views", async (req: ViewerRequest, res) => {
    if (!requireAdmin(req, res)) return;
    res.json((await studio.listViews()));
  });

  router.post("/studio/views", async (req: ViewerRequest, res) => {
    const viewer = requireAdmin(req, res);
    if (!viewer) return;
    const body = req.body ?? {};
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const datasetId = typeof body.datasetId === "string" ? body.datasetId : "";
    if (!label || !datasetId) {
      res.status(400).json({ error: "A view needs a name and a dataset." });
      return;
    }
    if (!(await studio.dataset(datasetId))) {
      res.status(400).json({ error: "No dataset with that id." });
      return;
    }
    const slug = slugify(typeof body.slug === "string" && body.slug.trim() ? body.slug : label);
    const bad = await slugCheck(slug, undefined);
    if (bad) {
      res.status(400).json({ error: bad });
      return;
    }
    res.status(201).json(
      (await studio.createView(
        {
          slug,
          label,
          icon: typeof body.icon === "string" ? body.icon : undefined,
          section: typeof body.section === "string" ? body.section.trim() : undefined,
          order: Number(body.order) || 0,
          datasetId,
          description: typeof body.description === "string" ? body.description.trim() : undefined,
          spec: readSpec(body.spec),
          audience: readAudience(body.audience),
          state: body.state === "live" ? "live" : "draft",
        },
        viewer.email,
      )),
    );
  });

  /**
   * A view, copied.
   *
   * Most views are a variation on one that already exists — the same sheet
   * cut for a different vertical, the same columns with one filter changed —
   * and rebuilding that by hand is ten fields of retyping with a typo in one
   * of them. The copy takes everything except identity: a free slug, a label
   * saying it is a copy, and the draft state, because a duplicate that went
   * live the moment it was made would put an unfinished view in everybody's
   * sidebar.
   */
  router.post("/studio/views/:id/duplicate", async (req: ViewerRequest, res) => {
    const viewer = requireAdmin(req, res);
    if (!viewer) return;
    const source = await studio.view(req.params.id);
    if (!source) {
      res.status(404).json({ error: "No view with that id." });
      return;
    }

    const named = await copyName(source.label, async (slug) =>
      !RESERVED_SLUGS.has(slug) && (await studio.slugFree(slug, undefined)),
    );
    if (!named) {
      res.status(409).json({ error: "Too many copies of that view already." });
      return;
    }
    const { label, slug } = named;

    res.status(201).json(
      await studio.createView(
        {
          slug,
          label,
          icon: source.icon,
          section: source.section,
          // Straight after the one it came from, so it lands where it is
          // expected rather than at the foot of the group.
          order: source.order + 1,
          datasetId: source.datasetId,
          description: source.description,
          spec: source.spec,
          audience: source.audience,
          state: "draft",
        },
        viewer.email,
      ),
    );
  });

  router.put("/studio/views/:id", async (req: ViewerRequest, res) => {
    const viewer = requireAdmin(req, res);
    if (!viewer) return;
    const existing = await studio.view(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "No view with that id." });
      return;
    }
    const body = req.body ?? {};
    const slug =
      typeof body.slug === "string" && body.slug.trim()
        ? slugify(body.slug)
        : typeof body.label === "string" && body.label.trim() && !body.slug
          ? existing.slug
          : existing.slug;
    const bad = await slugCheck(slug, existing.id);
    if (bad) {
      res.status(400).json({ error: bad });
      return;
    }
    if (typeof body.datasetId === "string" && body.datasetId && !(await studio.dataset(body.datasetId))) {
      res.status(400).json({ error: "No dataset with that id." });
      return;
    }
    res.json(
      (await studio.updateView(
        req.params.id,
        {
          slug,
          label: typeof body.label === "string" ? body.label.trim() : undefined,
          icon: typeof body.icon === "string" ? body.icon : undefined,
          section: typeof body.section === "string" ? body.section.trim() : undefined,
          order: body.order == null ? undefined : Number(body.order) || 0,
          datasetId: typeof body.datasetId === "string" ? body.datasetId : undefined,
          description: typeof body.description === "string" ? body.description.trim() : undefined,
          spec: body.spec === undefined ? undefined : readSpec(body.spec),
          audience: body.audience === undefined ? undefined : readAudience(body.audience),
          state: body.state === "live" ? "live" : body.state === "draft" ? "draft" : undefined,
        },
        viewer.email,
      )),
    );
  });

  router.delete("/studio/views/:id", async (req: ViewerRequest, res) => {
    if (!requireAdmin(req, res)) return;
    if (!(await studio.deleteView(req.params.id))) {
      res.status(404).json({ error: "No view with that id." });
      return;
    }
    res.status(204).end();
  });

  /**
   * Render an unsaved spec.
   *
   * The builder posts what is on screen and gets back exactly what the view
   * would show, so a mapping is checked before anyone else sees it. It runs
   * as the admin, and says so on the page — a `mine` filter previews against
   * them, not against whoever the view is for.
   */
  router.post("/studio/preview", async (req: ViewerRequest, res, next) => {
    try {
      const viewer = requireAdmin(req, res);
      if (!viewer) return;
      const body = req.body ?? {};
      const found = await resolve(typeof body.datasetId === "string" ? body.datasetId : "");
      if ("error" in found) {
        res.status(400).json({ error: found.error });
        return;
      }
      const { dataset, connection } = found;
      const spec = readSpec(body.spec);
      const rows = await reader.rows(connection, dataset.ref, dataset.refreshSeconds);
      const fields = usedFields(spec, dataset.fields);
      const applied = applySpec(rows, spec, viewer, req.viewer?.name, dataset.fields);
      res.json({
        fields,
        source: { dataset: dataset.label, connection: connection.label, kind: connection.kind },
        total: applied.total,
        sourceRows: rows.length,
        rows: project(
          applied.rows,
          fields,
          spec,
          identities(viewer, req.viewer?.name),
          dataset.fields,
        ),
      });
    } catch (err) {
      if (err instanceof Error) {
        res.status(502).json({ error: err.message });
        return;
      }
      next(err);
    }
  });

  async function slugCheck(slug: string, exceptId: string | undefined): Promise<string | null> {
    if (!slug) return "That name does not make a usable address.";
    if (RESERVED_SLUGS.has(slug)) return `"${slug}" is reserved — pick another name.`;
    if (!(await studio.slugFree(slug, exceptId))) return `A view already lives at /v/${slug}.`;
    return null;
  }

  return router;
}

/**
 * What to call a copy, and where to put it.
 *
 * "Deadlines copy", then "Deadlines copy 2", then "copy 3" — counting rather
 * than refusing, so pressing Duplicate twice does the obvious thing instead
 * of returning an error about a slug. The label and the address are derived
 * from each other so they never disagree.
 *
 * `isFree` is passed in rather than reached for, which is what makes this
 * testable without a database: the rule being tested is the counting, not
 * the storage.
 *
 * Gives up after fifty, at which point somebody is holding a key down.
 */
export async function copyName(
  label: string,
  isFree: (slug: string) => Promise<boolean>,
  limit = 50,
): Promise<{ label: string; slug: string } | null> {
  for (let n = 1; n <= limit; n++) {
    const next = n === 1 ? `${label} copy` : `${label} copy ${n}`;
    const slug = slugify(next);
    if (await isFree(slug)) return { label: next, slug };
  }
  return null;
}

function readSettings(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    // A credential belongs in secret / secretEnv, never in the open settings.
    if (/token|secret|password|key/i.test(k)) continue;
    if (typeof v === "string") out[k] = v.trim();
  }
  return out;
}

export { EVERYONE };
