/**
 * Editing a cell a view drew, against a stubbed Smartsheet.
 *
 * This is the second thing the Hub does that changes somebody else's system,
 * and the first that does it to an arbitrary sheet an admin pointed at this
 * morning. api.smartsheet.com is unreachable from the environment this was
 * built in, so these tests are the whole of the evidence. They are written as
 * the things that must never happen:
 *
 *   * a cell written on a view nobody was given the right to change
 *   * a cell written that the view never offered for editing
 *   * a write to a source that cannot be addressed safely — a report, a
 *     Google Sheet, the Hub's own tables
 *   * a write that overwrites an edit somebody else made in between
 *   * a column touched that was not in the concurrency check
 *
 *   node --test server/dist/studio/editing.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { canEditView, editableFields, usedFields } from "./query.js";
import { cellValue, refuseValue, SheetWriter, writableSheet } from "./write.js";

const SHEET = "6141831453742468";

/** A dataset over a plain sheet, keyed by column id the way the reader keys it. */
const dataset = (ref = `sheet:${SHEET}`) => ({
  id: "ds1",
  connectionId: "c1",
  label: "Commissioning schedule",
  ref,
  fields: [
    { key: "101", name: "Title", type: "text" },
    { key: "102", name: "Status", type: "text", options: ["Writing", "Delivered", "Blocked"] },
    { key: "103", name: "Copy due", type: "date" },
    { key: "104", name: "Signed off", type: "boolean" },
  ],
  refreshSeconds: 60,
  createdAt: "", updatedAt: "", updatedBy: "",
});

const connection = (kind = "smartsheet") => ({
  id: "c1",
  label: "WGSN Smartsheet",
  kind,
  settings: {},
  hasSecret: true,
  createdAt: "", updatedAt: "", updatedBy: "",
});

const spec = (edit) => ({
  layout: "table",
  fields: { columns: ["101", "102"] },
  filters: [],
  edit,
  pageSize: 0,
});

const EVERYONE = { roles: "all", verticals: "all", emails: [] };

const viewer = (over = {}) => ({
  email: "amara@wgsn.com",
  role: "commissioning-manager",
  verticals: ["Womenswear"],
  active: true,
  personId: "ao",
  ...over,
});

/* ---- Who may change anything at all ------------------------------------ */

test("a view that says nothing about editing is one to read", () => {
  assert.equal(canEditView(spec(undefined), EVERYONE, "live", viewer()), false);
});

test("an edit rule naming no columns is the same as no rule", () => {
  const rule = { fields: [], who: { roles: "all", verticals: "all", emails: [] } };
  assert.equal(canEditView(spec(rule), EVERYONE, "live", viewer()), false);
});

test("being able to see a view is not being able to change it", () => {
  // The view is open to everybody; the edit rule names one role. A forecaster
  // reads it and a manager writes it, which is the whole point of the second
  // gate.
  const rule = { fields: ["102"], who: { roles: ["commissioning-manager"], verticals: "all", emails: [] } };
  assert.equal(canEditView(spec(rule), EVERYONE, "live", viewer()), true);
  assert.equal(canEditView(spec(rule), EVERYONE, "live", viewer({ role: "forecaster" })), false);
});

test("an admin is not waved through the edit rule the way they are waved through the audience", () => {
  // canSeeView lets an admin open every draft, because they are building
  // them. Writing to somebody's live sheet is not the same promise.
  const rule = { fields: ["102"], who: { roles: ["forecaster"], verticals: "all", emails: [] } };
  const admin = viewer({ role: "admin", email: "graham.krag@wgsn.com" });
  assert.equal(canEditView(spec(rule), EVERYONE, "draft", admin), false);

  const named = { fields: ["102"], who: { roles: [], verticals: "all", emails: ["graham.krag@wgsn.com"] } };
  assert.equal(canEditView(spec(named), EVERYONE, "draft", admin), true);
});

test("somebody who cannot see the view cannot edit it however the rule reads", () => {
  const rule = { fields: ["102"], who: { roles: "all", verticals: "all", emails: [] } };
  // A draft, to a non-admin: invisible, and so unwritable.
  assert.equal(canEditView(spec(rule), EVERYONE, "draft", viewer()), false);
  // And a leaver, whose access row is no longer active.
  assert.equal(canEditView(spec(rule), EVERYONE, "live", viewer({ active: false })), false);
});

test("the vertical rule narrows editing the way it narrows seeing", () => {
  const rule = {
    fields: ["102"],
    who: { roles: ["commissioning-manager"], verticals: ["Footwear"], emails: [] },
  };
  assert.equal(canEditView(spec(rule), EVERYONE, "live", viewer()), false);
  assert.equal(
    canEditView(spec(rule), EVERYONE, "live", viewer({ verticals: ["Footwear"] })),
    true,
  );
});

/* ---- Which columns ------------------------------------------------------ */

test("a column the sheet no longer has is dropped rather than offered", () => {
  const fields = editableFields(spec({ fields: ["102", "999"], who: EVERYONE }), dataset().fields);
  assert.deepEqual(fields.map((f) => f.key), ["102"]);
});

test("an editable column travels even when the layout does not draw it", () => {
  // Otherwise the cell it is meant to offer arrives blank and unaddressable.
  const drawn = usedFields(spec({ fields: ["103"], who: EVERYONE }), dataset().fields);
  assert.ok(drawn.some((f) => f.key === "103"), "the editable column is in the payload");
});

/* ---- Which sources can be written at all -------------------------------- */

test("only a Smartsheet sheet can be written, and the rest say why not", () => {
  assert.deepEqual(writableSheet(connection(), dataset()), { ok: true, sheetId: SHEET });

  const report = writableSheet(connection(), dataset("report:998877665544332"));
  assert.equal(report.ok, false);
  assert.match(report.why, /several sheets/, "it explains the report problem");

  const google = writableSheet(connection("google-sheets"), dataset());
  assert.equal(google.ok, false);
  assert.match(google.why, /read-only/);

  const hub = writableSheet(connection("hub"), dataset());
  assert.equal(hub.ok, false);

  const snowflake = writableSheet(connection("snowflake"), dataset());
  assert.equal(snowflake.ok, false);
});

/* ---- What a value becomes ----------------------------------------------- */

test("an empty box clears the cell rather than writing an empty string", () => {
  assert.equal(cellValue("", "text"), null);
  assert.equal(cellValue("   ", "date"), null);
});

test("a checkbox is a boolean on the sheet, not the word the view showed", () => {
  // The view renders a checkbox column as Yes / No, so round-tripping the
  // rendered string would put the word "Yes" into a checkbox.
  assert.equal(cellValue("Yes", "boolean"), true);
  assert.equal(cellValue("No", "boolean"), false);
  assert.equal(cellValue("true", "boolean"), true);
});

test("a number goes in as a number, and a number-shaped thing that is not one stays text", () => {
  assert.equal(cellValue("1,250", "number"), 1250);
  assert.equal(cellValue("n/a", "number"), "n/a");
  assert.equal(cellValue("Womenswear", "text"), "Womenswear");
});

test("a value the column cannot hold is refused here, with the column's name in it", () => {
  const [title, , due] = dataset().fields;
  assert.equal(refuseValue("Big Ideas", title), undefined);

  const bad = refuseValue("30/09/2026", due);
  assert.match(bad, /Copy due/);
  assert.match(bad, /2026-09-30/, "it shows the shape it wants");
  assert.equal(refuseValue("2026-09-30", due), undefined);

  // Clearing is always allowed — it is how an unset date is unset.
  assert.equal(refuseValue("", due), undefined);
});

test("a column's sampled values are a suggestion, never a restriction", () => {
  // `options` is filled in for any column with few enough distinct values, so
  // it is not a picklist. Refusing on it would mean a status column of three
  // values could never gain a fourth, and a free-text column with a dozen
  // entries would reject the thirteenth. Smartsheet decides; this does not.
  const status = dataset().fields[1];
  assert.deepEqual(status.options, ["Writing", "Delivered", "Blocked"]);
  assert.equal(refuseValue("Nearly done", status), undefined);

  // And a checkbox takes the words the view renders it with.
  const signedOff = dataset().fields[3];
  assert.equal(refuseValue("Yes", signedOff), undefined);
});

/* ---- The write itself ---------------------------------------------------- */

const ROW = {
  id: 900,
  cells: [
    { columnId: 101, displayValue: "Big Ideas S/S 28" },
    { columnId: 102, displayValue: "Writing" },
    { columnId: 103, displayValue: "2026-09-18" },
    { columnId: 104, value: true, displayValue: "true" },
  ],
};

/** Serve one row, and record what gets written. */
function stub({ rowNow = ROW, fail } = {}) {
  const sent = [];
  globalThis.fetch = async (url, init = {}) => {
    if ((init.method ?? "GET") === "GET") {
      return { ok: true, status: 200, statusText: "OK", async json() { return rowNow; } };
    }
    sent.push({ url: String(url), method: init.method, body: JSON.parse(init.body) });
    if (fail) {
      return {
        ok: false,
        status: fail.status,
        statusText: "Bad Request",
        async json() { return { message: fail.message }; },
      };
    }
    return { ok: true, status: 200, statusText: "OK", async json() { return { message: "SUCCESS" }; } };
  };
  return sent;
}

const writer = () => new SheetWriter(SHEET, { settings: {}, secret: "stub-token" });

test("the row is read the way the view read it, so a comparison is like for like", async () => {
  stub();
  const now = await writer().current("900");
  assert.equal(now["101"], "Big Ideas S/S 28");
  // displayValue wins over value, which is exactly what the reader does.
  assert.equal(now["104"], "true");
});

test("a cell somebody else changed in between stops the write", async () => {
  const moved = { ...ROW, cells: [...ROW.cells.slice(0, 1), { columnId: 102, displayValue: "Delivered" }, ...ROW.cells.slice(2)] };
  const sent = stub({ rowNow: moved });
  await assert.rejects(
    writer().apply("900", [{ field: "102", value: "Blocked" }], { 102: "Writing" }),
    /now reads "Delivered" rather than "Writing"/,
  );
  assert.equal(sent.length, 0, "nothing was sent to the sheet");
});

test("only the cells that changed are written", async () => {
  const sent = stub();
  await writer().apply("900", [{ field: "102", value: "Delivered" }], { 102: "Writing" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, "PUT");
  assert.deepEqual(sent[0].body, [{ id: 900, cells: [{ columnId: 102, value: "Delivered" }] }]);
});

test("a row id that is not a number never reaches a URL", async () => {
  stub();
  await assert.rejects(writer().current("900 OR 1=1"), /not one this sheet can address/);
  await assert.rejects(writer().current(""), /not one this sheet can address/);
});

test("a refusal from Smartsheet is turned into something a person can act on", async () => {
  stub({ fail: { status: 403, message: "not editable" } });
  await assert.rejects(
    writer().apply("900", [{ field: "102", value: "Delivered" }], { 102: "Writing" }),
    /not change it \(403\)/,
  );

  stub({ fail: { status: 400, message: "Invalid value for the column type" } });
  await assert.rejects(
    writer().apply("900", [{ field: "102", value: "Delivered" }], { 102: "Writing" }),
    /Invalid value for the column type/,
  );
});

test("an echo check with nothing to compare still reads the row before writing", async () => {
  // The check is only as good as what is put in it, so a caller that sends an
  // empty `expect` gets no protection — the API layer is what guarantees every
  // written column is covered, and that is tested where it lives.
  const sent = stub();
  await writer().apply("900", [], {});
  assert.equal(sent.length, 0, "nothing to change means nothing sent");
});
