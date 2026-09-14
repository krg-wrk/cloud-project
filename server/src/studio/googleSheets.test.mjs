/**
 * The Google Sheets reader.
 *
 * Two halves. Most of this runs against a stub serving the shapes Google
 * documents, the way the Smartsheet tests do. The last few run against
 * sheets.googleapis.com itself — unlike Smartsheet, Google is reachable from
 * the environment this was built in, so the error paths people actually hit
 * are checked against the real API rather than against an imagined one. Those
 * are skipped automatically when the network is not there, so the suite still
 * passes on a locked-down machine.
 *
 *   node --test server/dist/studio/googleSheets.test.mjs
 *
 * Run against the built output so it tests what actually ships.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  GoogleSheetsConnector,
  columnLetter,
  googleMessage,
  normaliseDateColumn,
  quoteTitle,
  readHeaders,
  readSpreadsheetId,
  readTabRef,
} from "./googleSheets.js";

const KEY = { settings: { spreadsheetId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms" }, secret: "AIzaFake" };

const real = globalThis.fetch;

/** A real RSA key that belongs to nobody, so signing is genuine and the
 *  account is not. Generated once, because 2048-bit keygen is not free. */
const { generateKeyPairSync } = await import("node:crypto");
const PRIVATE_KEY = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();

/**
 * Serve a fake spreadsheet: the metadata call, then the values call.
 *
 * `tabs` is [{ sheetId, title, rowCount }]; `values` is the grid of the tab
 * asked for, header row first.
 */
function stub({ tabs, values, title = "A spreadsheet" }) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const asked = String(url);
    calls.push(asked);
    const body = asked.includes("/values/")
      ? { values }
      : {
          properties: { title },
          sheets: tabs.map((t) => ({
            properties: {
              sheetId: t.sheetId,
              title: t.title,
              gridProperties: { rowCount: t.rowCount ?? 100, columnCount: 26 },
            },
          })),
        };
    return { ok: true, status: 200, json: async () => body };
  };
  return calls;
}

function fails(status, message) {
  globalThis.fetch = async () => ({
    ok: false,
    status,
    statusText: "",
    json: async () => ({ error: { message } }),
  });
}

test.afterEach(() => {
  globalThis.fetch = real;
});

/* --- What somebody pastes ------------------------------------------------ */

test("a pasted address, and a bare id, are both the spreadsheet", () => {
  const id = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";
  assert.equal(readSpreadsheetId(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`), id);
  assert.equal(readSpreadsheetId(`https://docs.google.com/spreadsheets/d/${id}`), id);
  assert.equal(readSpreadsheetId(`  ${id}  `), id);
});

test("anything that is not a spreadsheet is refused before it reaches a URL", () => {
  for (const bad of ["", "   ", "short", "https://example.com/evil", "../../etc/passwd", "a b c"]) {
    assert.throws(() => readSpreadsheetId(bad), /not a Google Sheet|No spreadsheet/);
  }
});

test("a tab is remembered by its number, not its name", () => {
  assert.deepEqual(readTabRef("gid:0"), { gid: 0 });
  assert.deepEqual(readTabRef("gid:1846291"), { gid: 1846291 });
  // A title still works, for a dataset somebody wrote by hand.
  assert.deepEqual(readTabRef("Deadlines"), { title: "Deadlines" });
  assert.throws(() => readTabRef(""), /No tab/);
});

/* --- Reading a tab -------------------------------------------------------- */

test("the header row becomes the columns, and the rows follow it", async () => {
  stub({
    tabs: [{ sheetId: 0, title: "Schedule" }],
    values: [
      ["Title", "Owner", "Due"],
      ["Barrier beauty", "Amara", "2026-10-02"],
      ["Collagen skincare", "Rui", "2026-11-14"],
    ],
  });
  const rows = await new GoogleSheetsConnector().read(KEY, "gid:0");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].Title, "Barrier beauty");
  assert.equal(rows[0].Owner, "Amara");
  // The spreadsheet's own row number, so a row can be pointed at.
  assert.equal(rows[0]._row, "2");
  assert.equal(rows[1]._row, "3");
});

test("a short row is padded, because Google drops trailing empty cells", async () => {
  stub({
    tabs: [{ sheetId: 0, title: "Schedule" }],
    values: [
      ["Title", "Owner", "Due"],
      ["Barrier beauty"],
      ["Collagen skincare", "Rui"],
    ],
  });
  const rows = await new GoogleSheetsConnector().read(KEY, "gid:0");
  // Empty rather than undefined: a filter on an absent key never matches, so
  // "Owner is empty" would silently find nothing.
  assert.equal(rows[0].Owner, "");
  assert.equal(rows[0].Due, "");
  assert.equal(rows[1].Due, "");
  assert.ok("Due" in rows[0]);
});

test("a blank heading takes its column letter, and a repeat is numbered", () => {
  const headers = readHeaders(["Title", "", "Owner", "Owner", " "]);
  assert.deepEqual(
    headers.map((h) => h.name),
    ["Title", "B", "Owner", "Owner (2)", "E"],
  );
});

test("column letters run past Z", () => {
  assert.equal(columnLetter(0), "A");
  assert.equal(columnLetter(25), "Z");
  assert.equal(columnLetter(26), "AA");
  assert.equal(columnLetter(51), "AZ");
  assert.equal(columnLetter(52), "BA");
});

test("a tab title with a quote in it survives being put in a range", () => {
  assert.equal(quoteTitle("Deadlines"), "'Deadlines'");
  assert.equal(quoteTitle("Q1 'draft'"), "'Q1 ''draft'''");
});

test("the tab is found by number even after it is renamed", async () => {
  const calls = stub({
    tabs: [{ sheetId: 77, title: "Renamed since" }],
    values: [["A"], ["1"]],
  });
  await new GoogleSheetsConnector().read(KEY, "gid:77");
  // The range asked for carries the tab's *current* title.
  assert.ok(
    calls.some((c) => decodeURIComponent(c).includes("'Renamed since'!A1:")),
    `no call used the current title:\n${calls.join("\n")}`,
  );
});

test("a tab that has gone says what the spreadsheet does have", async () => {
  stub({ tabs: [{ sheetId: 0, title: "Schedule" }, { sheetId: 5, title: "Notes" }], values: [] });
  await assert.rejects(
    () => new GoogleSheetsConnector().read(KEY, "gid:999"),
    /no longer in the spreadsheet.*Schedule, Notes/s,
  );
});

test("an empty tab reads as no rows rather than as a failure", async () => {
  stub({ tabs: [{ sheetId: 0, title: "Empty" }], values: [] });
  const described = await new GoogleSheetsConnector().describe(KEY, "gid:0");
  assert.equal(described.rowCount, 0);
  assert.deepEqual(described.fields, []);
});

test("the catalogue lists every tab, keyed by number", async () => {
  stub({
    tabs: [
      { sheetId: 0, title: "Schedule" },
      { sheetId: 1846291, title: "Q1 planning" },
    ],
  });
  const tabs = await new GoogleSheetsConnector().catalogue(KEY);
  assert.deepEqual(tabs, [
    { ref: "gid:0", label: "Schedule" },
    { ref: "gid:1846291", label: "Q1 planning" },
  ]);
});

/* --- Dates ---------------------------------------------------------------- */

test("a day-first column becomes ISO, decided by a day over 12", () => {
  const rows = [{ d: "02/10/2026" }, { d: "24/11/2026" }, { d: "07/01/2027" }];
  normaliseDateColumn(rows, "d");
  assert.deepEqual(rows.map((r) => r.d), ["2026-10-02", "2026-11-24", "2027-01-07"]);
});

test("a month-first column becomes ISO too, decided the same way", () => {
  const rows = [{ d: "10/02/2026" }, { d: "11/24/2026" }];
  normaliseDateColumn(rows, "d");
  assert.deepEqual(rows.map((r) => r.d), ["2026-10-02", "2026-11-24"]);
});

test("an ambiguous column is read day-first, and consistently", () => {
  // Nothing here settles it, so the whole column takes one reading rather
  // than each row guessing for itself.
  const rows = [{ d: "01/02/2026" }, { d: "03/04/2026" }];
  normaliseDateColumn(rows, "d");
  assert.deepEqual(rows.map((r) => r.d), ["2026-02-01", "2026-04-03"]);
});

test("a column that is not all dates is left exactly alone", () => {
  const rows = [{ d: "02/10/2026" }, { d: "not a date" }];
  normaliseDateColumn(rows, "d");
  assert.deepEqual(rows.map((r) => r.d), ["02/10/2026", "not a date"]);
});

test("a column that cannot be one format is left alone rather than mangled", () => {
  // 24 can only be a day, 13 can only be a month: the column is inconsistent,
  // so changing any of it would be inventing an answer.
  const rows = [{ d: "24/01/2026" }, { d: "01/13/2026" }];
  normaliseDateColumn(rows, "d");
  assert.deepEqual(rows.map((r) => r.d), ["24/01/2026", "01/13/2026"]);
});

test("blank cells do not stop a column being read as dates", () => {
  const rows = [{ d: "02/10/2026" }, { d: "" }, { d: "24/11/2026" }];
  normaliseDateColumn(rows, "d");
  assert.deepEqual(rows.map((r) => r.d), ["2026-10-02", "", "2026-11-24"]);
});

test("dates are normalised on the way out of a real read", async () => {
  stub({
    tabs: [{ sheetId: 0, title: "Schedule" }],
    values: [
      ["Title", "Due"],
      ["Barrier beauty", "02/10/2026"],
      ["Collagen skincare", "24/11/2026"],
    ],
  });
  const rows = await new GoogleSheetsConnector().read(KEY, "gid:0");
  assert.equal(rows[0].Due, "2026-10-02");
  // And the column is then typed as a date, which is what a calendar view needs.
  const described = await new GoogleSheetsConnector().describe(KEY, "gid:0");
  assert.equal(described.fields.find((f) => f.name === "Due").type, "date");
});

/* --- Failures that people actually hit ------------------------------------ */

test("a 403 names the address to share the sheet with", () => {
  // The whole point: at the moment somebody sees this, the one thing they
  // need is the address, and it is buried in a file they downloaded once.
  const shared = googleMessage(403, undefined, "spreadsheet", "hub@forecasters.iam.gserviceaccount.com");
  assert.match(shared, /Share the sheet with hub@forecasters\.iam\.gserviceaccount\.com/);
  assert.match(shared, /Viewer is enough/);

  const keyed = googleMessage(403, undefined, "spreadsheet", false);
  assert.match(keyed, /anyone with the link/);
  assert.match(keyed, /service-account key/);
});

test("the other statuses each say something different", () => {
  const who = "hub@forecasters.iam.gserviceaccount.com";
  assert.match(googleMessage(401, undefined, "spreadsheet", who), /revoked/);
  assert.match(googleMessage(404, undefined, "spreadsheet", who), /pasted whole/);
  assert.match(googleMessage(429, undefined, "spreadsheet", who), /rate-limiting/);
  // A 400 from Google is specific and worth passing on verbatim.
  assert.match(googleMessage(400, "Unable to parse range", "tab", who), /Unable to parse range/);
});

test("the 403 from a real read carries the account address through", async () => {
  fails(403, "The caller does not have permission");
  const key = {
    settings: KEY.settings,
    secret: JSON.stringify({
      client_email: "hub@forecasters.iam.gserviceaccount.com",
      private_key: PRIVATE_KEY,
    }),
  };
  const result = await new GoogleSheetsConnector().probe(key);
  assert.equal(result.ok, false);
  // The token exchange is stubbed out by `fails`, so this asserts the path
  // reaches Google's own refusal rather than stopping at the signing step.
  assert.match(result.note, /refused the service account|hub@forecasters/);
});

test("a probe reports the failure rather than throwing it at the page", async () => {
  fails(403, "The caller does not have permission");
  const result = await new GoogleSheetsConnector().probe(KEY);
  assert.equal(result.ok, false);
  assert.match(result.note, /403/);
});

test("a malformed service-account key is refused before anything is signed", async () => {
  const broken = { settings: KEY.settings, secret: '{"client_email":"a@b.com"}' };
  const result = await new GoogleSheetsConnector().probe(broken);
  assert.equal(result.ok, false);
  assert.match(result.note, /missing client_email or private_key/);

  const notJson = { settings: KEY.settings, secret: "{not json at all" };
  const second = await new GoogleSheetsConnector().probe(notJson);
  assert.equal(second.ok, false);
  assert.match(second.note, /not valid JSON/);
});

test("no failure message ever carries the credential", async () => {
  const secret = "AIzaSyDONT-LEAK-ME-0123456789";
  fails(403, "The caller does not have permission");
  const result = await new GoogleSheetsConnector().probe({ settings: KEY.settings, secret });
  assert.equal(result.note.includes(secret), false, "the API key appeared in the message");

  // And the same for a service-account key, whose private key is the worse
  // thing to leak.
  const key = { settings: KEY.settings, secret: JSON.stringify({ client_email: "hub@p.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nSECRETMATERIAL\n-----END PRIVATE KEY-----" }) };
  const signed = await new GoogleSheetsConnector().probe(key);
  assert.equal(signed.note.includes("SECRETMATERIAL"), false, "the private key appeared in the message");
});

/* --- Against the real API ------------------------------------------------- */

/**
 * These call sheets.googleapis.com for real. They assert on the *shape* of
 * what Google does with a bad credential, which is the half of this connector
 * a stub cannot honestly check — and they are skipped rather than failed when
 * the network is not there, so the suite still passes offline.
 */
async function online() {
  try {
    await real("https://sheets.googleapis.com/v4/spreadsheets/x?key=x", {
      signal: AbortSignal.timeout(8000),
    });
    return true;
  } catch {
    return false;
  }
}

test("Google itself refuses a bad API key, and the words reach the admin", async (t) => {
  if (!(await online())) return t.skip("sheets.googleapis.com is not reachable from here");
  globalThis.fetch = real;
  const result = await new GoogleSheetsConnector().probe({
    settings: { spreadsheetId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms" },
    secret: "AIzaNotARealKeyAtAll",
  });
  assert.equal(result.ok, false);
  // Google says "API key not valid"; the point is that its words survive the
  // trip rather than being flattened into "400".
  assert.match(result.note, /API key not valid/i);
});

test("Google itself refuses a made-up service account, and says why", async (t) => {
  if (!(await online())) return t.skip("oauth2.googleapis.com is not reachable from here");
  globalThis.fetch = real;
  // A structurally valid RSA key that is not anybody's, so the signature is
  // real and the account is not. Google answers this in one round trip.
  const result = await new GoogleSheetsConnector().probe({
    settings: { spreadsheetId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms" },
    secret: JSON.stringify({
      client_email: "nobody@forecasters-hub-test.iam.gserviceaccount.com",
      private_key: PRIVATE_KEY,
    }),
  });
  assert.equal(result.ok, false);
  assert.match(result.note, /Google refused the service account/);
});
