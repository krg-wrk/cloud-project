/**
 * What this machine is set up to reach, and whether any of it answers.
 *
 *   npm run doctor
 *
 * Pointing the Hub at real sheets means ten environment variables, and the
 * failure that actually happens is not "the token is wrong" — it is that one
 * of the ten ids is a digit out, or names a sheet the token was never shared
 * with. The startup banner cannot tell you which: it says "smartsheet" and
 * then a page somewhere is quietly empty.
 *
 * So this asks each one in turn and says what came back, by name. A sheet that
 * answers prints its own title and how many rows it has, which is also how you
 * notice an id that works and points at the wrong sheet.
 *
 * It only reads. Nothing here writes, and no credential is ever printed —
 * a token appears as its last four characters, the way the studio shows one.
 *
 *   npm run doctor -- --columns
 *
 * The second failure, once every id is right, is a sheet that answers
 * perfectly and whose column titles are not the ones the Hub looks for. That
 * one is silent: `fetchRows` keys a row by the exact title string, so a
 * heading reading "Submission date" or carrying a trailing space is simply
 * absent, the field comes back empty on every row, and the page is confidently
 * blank with nothing logged anywhere. `--columns` asks each sheet what it
 * actually has and says which of the Hub's titles are missing — and, because
 * the near misses are the ones nobody spots by eye, what the sheet has that
 * looks like the missing one.
 *
 * Written in Node rather than as a shell script so it behaves the same on a
 * Mac, on Windows and in CI, and needs nothing installed to run.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// `.pathname` is a URL path, not a filesystem one: a folder called
// "OneDrive - WGSN" arrives percent-encoded and nothing resolves.
const root = fileURLToPath(new URL("..", import.meta.url));
/*
 * Colour, only when somebody is looking at a terminal.
 *
 * This output is meant to be pasted into a ticket or a message when something
 * is wrong, and escape codes in a paste are unreadable. NO_COLOR is the
 * convention; a pipe is the other half of it.
 */
const colour = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (colour ? `\x1b[${code}m${s}\x1b[0m` : s);
const ok = paint(32);
const bad = paint(31);
const dim = paint(2);
const warn = paint(33);

let problems = 0;
const say = (mark, label, note = "") => console.log(`  ${mark} ${label}${note ? dim(` — ${note}`) : ""}`);
const good = (label, note) => say(ok("✓"), label, note);
const fail = (label, note) => {
  problems += 1;
  say(bad("✗"), label, note);
};
const idle = (label, note) => say(dim("·"), label, note);

/** A credential, shown the way the studio shows one: enough to recognise. */
const tail = (secret) => (secret.length <= 4 ? "••••" : `••••${secret.slice(-4)}`);

/*
 * The column titles the Hub looks for, read from the code that looks for them.
 *
 * Imported from the build rather than copied into this file, because a second
 * list of the same titles is a second thing to forget: somebody corrects
 * `COLUMNS` to match a real sheet, the doctor goes on checking the old names,
 * and it reports a problem that was fixed an hour ago. Loaded only when it is
 * asked for, so the ordinary run needs no build at all.
 */
const wantsColumns = process.argv.includes("--columns");
let COLUMNS = null;
let regionFor = null;
let titleOf = (r) => (typeof r === "string" ? r : r.title);
let renamedColumns = () => [];
if (wantsColumns) {
  try {
    ({ COLUMNS, titleOf, renamedColumns, regionFor } = await import(
      new URL("server/dist/data/smartsheetSource.js", new URL("..", import.meta.url))
    ));
  } catch {
    console.log(
      warn("\n--columns needs the server built first — run `npm run build -w server`, then try again."),
    );
  }
}

console.log("\nThe Forecasters Hub, as this machine has it\n");

/* ---- The machine --------------------------------------------------------- */

console.log("This machine");
const major = Number(process.versions.node.split(".")[0]);
if (major >= 22) good(`Node ${process.versions.node}`);
else fail(`Node ${process.versions.node}`, "22 or newer is required — the store uses node:sqlite");

const envPath = join(root, ".env");
if (existsSync(envPath)) {
  // Only the names, never the values.
  const names = readFileSync(envPath, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => l.slice(0, l.indexOf("=")).trim());
  if (names.length === 0) {
    idle(".env", "there, but every line is still commented out — nothing is set yet");
  } else {
    good(".env", `${names.length} setting${names.length === 1 ? "" : "s"}`);
  }
} else {
  idle(".env", "not there — running on the defaults. `cp env.example .env` to change that");
}

if (!existsSync(join(root, "node_modules"))) {
  fail("Dependencies", "not installed — run `npm run setup`");
}

/* ---- Where the schedule comes from --------------------------------------- */

const source = process.env.DATA_SOURCE ?? "seed";
console.log("\nThe schedule");
/*
 * The mirror is a Smartsheet source with a copy in front of it, so every
 * check below applies to it unchanged — a wrong sheet id is a wrong sheet id
 * whether or not the answer is kept. Said here rather than silently treated
 * as "smartsheet", because somebody reading this output needs to know that a
 * page can be up to MIRROR_SYNC_MINUTES behind the sheet it names.
 */
if (source === "mirror") {
  const upstream = process.env.MIRROR_UPSTREAM ?? "smartsheet";
  const every = Number(process.env.MIRROR_SYNC_MINUTES ?? 10);
  if (!process.env.HUB_DB_URL) {
    say(
      warn("!"),
      "DATA_SOURCE=mirror",
      "no HUB_DB_URL — the copy would be kept in the SQLite file, which works but is not the point of mirroring",
    );
  } else {
    good("DATA_SOURCE=mirror", `${upstream} underneath, pulled every ${every} minutes`);
  }
  if (upstream === "smartsheet") {
    say(dim("·"), "Writes", "still go to Smartsheet — the mirror is read-only by construction");
  }
}
/*
 * What is actually behind this, once the mirror is unwrapped. A mirror over
 * the seed reaches no sheet at all, and asking for a token it will never use
 * would report a problem that is not one.
 */
const reads = source === "mirror" ? (process.env.MIRROR_UPSTREAM ?? "smartsheet") : source;
if (reads !== "smartsheet") {
  // Named for what is underneath, so a mirror over the seed does not print
  // the same label twice and leave somebody wondering which one is in charge.
  idle(`DATA_SOURCE=${reads}`, "the built-in sample schedule; no credentials needed");
  /*
   * Asked for a comparison there is nothing to compare. Said out loud
   * because the alternative is what happened the first time somebody tried
   * it: --columns printed nothing at all, which reads as the flag being
   * broken rather than as the machine not being pointed at a sheet yet.
   */
  if (wantsColumns) {
    idle("--columns", "nothing to compare until DATA_SOURCE=smartsheet and the sheet ids are set");
  }
} else {
  const token = process.env.SMARTSHEET_TOKEN ?? "";
  const api = (process.env.SMARTSHEET_API ?? "https://api.smartsheet.com/2.0").replace(/\/$/, "");

  if (!token) {
    fail("SMARTSHEET_TOKEN", "not set, and DATA_SOURCE=smartsheet needs it");
  } else {
    const who = await ask(`${api}/users/me`, token);
    if (who.ok) good(`Token ${tail(token)}`, `${api} — signed in as ${who.body.email ?? "somebody"}`);
    else fail(`Token ${tail(token)}`, `${api} — ${who.why}`);

    // Every sheet the Hub reads, whether or not it is set. An unset one is
    // not an error — the Hub does without it — but it is worth seeing.
    /*
     * The last element names the groups of `COLUMNS` this sheet is read
     * through, for --columns. The directory has none on purpose: its reader
     * takes the sheet's own headings as they come, so there is no fixed list
     * to hold it to.
     */
    const SHEETS = [
      ["SMARTSHEET_CONTENT_SHEET_ID", "the commissioning schedule", true, ["content"]],
      ["SMARTSHEET_PEOPLE_SHEET_ID", "the team", false, ["people"]],
      ["SMARTSHEET_ACCESS_SHEET_ID", "who may sign in", false, ["access"]],
      ["SMARTSHEET_EVENTS_SHEET_ID", "leave and holidays", false, ["events"]],
      ["SMARTSHEET_SESSIONS_SHEET_ID", "the workshop programme", false, ["sessions"]],
      ["SMARTSHEET_SIGNUPS_SHEET_ID", "workshop sign-ups", false, ["signUps"]],
      ["SMARTSHEET_DIRECTORY_SHEET_ID", "the content directory", false, null],
      ["SMARTSHEET_TRENDS_SHEET_ID", "TFDB trend profiles", false, ["trends", "trendLabels"]],
      ["SMARTSHEET_METRICS_SHEET_ID", "the KPIs tracked", false, ["metrics"]],
      ["SMARTSHEET_KPI_SHEET_ID", "KPI readings", false, ["observations"]],
    ];

    console.log("");
    for (const [name, what, required, groups] of SHEETS) {
      const raw = process.env[name];
      const short = name.replace(/^SMARTSHEET_|_SHEET_ID$/g, "").toLowerCase();
      if (!raw || !raw.trim()) {
        const label = `${short.padEnd(9)} ${dim(what)}`;
        if (required) fail(label, "not set, and the Hub cannot start without it");
        else idle(label, "not set");
        continue;
      }
      /*
       * A list, because the events variable takes several — holidays, leave
       * and shows in the sheets a team already keeps. Every id is asked
       * about separately: reporting "the events sheet answers" when one of
       * three is a digit out would hide exactly the failure this exists to
       * catch, and the sheet's own name beside each one is what tells
       * somebody which of the three it was.
       */
      const ids = [...new Set(raw.split(",").map((v) => v.trim()).filter(Boolean))];
      const label = `${short.padEnd(9)} ${dim(what)}`;

      for (const id of ids) {
        if (!/^\d{6,25}$/.test(id)) {
          /*
            Never echoed back.

            A sheet id is digits, and a Smartsheet token is not — so the one
            thing that reliably lands here is somebody pasting their token
            into a sheet-id line by mistake. Printing "that is not a sheet
            id" with the value attached would put a live credential in the
            output whose whole purpose is to be pasted into a ticket. Its
            shape is enough to recognise the mistake.
          */
          fail(label, `not a sheet id — ${shapeOf(id)}. It should be a long number, 6 to 25 digits`);
          continue;
        }
        if (!token) continue;
        // pageSize=1 so a 3,000-row sheet is not pulled to answer "is it there".
        const sheet = await ask(`${api}/sheets/${id}?pageSize=1`, token);
        if (sheet.ok) {
          const rows = sheet.body.totalRowCount ?? 0;
          good(label, `“${sheet.body.name}” — ${rows} row${rows === 1 ? "" : "s"}`);
          if (COLUMNS && groups) reportColumns(sheet.body.columns ?? [], groups);
          reportCountries(sheet.body.columns ?? []);
        } else {
          fail(label, sheet.why);
        }
      }
    }
  }

  console.log("");
  if (process.env.SMARTSHEET_WRITE === "1") {
    say(warn("!"), "SMARTSHEET_WRITE=1", "a manager can change the real sheet from the Hub");
  } else {
    idle("SMARTSHEET_WRITE", "off — the Hub only reads the schedule");
  }
}

/* ---- Everything else that leaves the building ---------------------------- */

console.log("\nEverything else");

const gemini = process.env.GEMINI_API_KEY ?? "";
if (!gemini) {
  idle("AI note drafting", "no GEMINI_API_KEY — the button says so rather than hiding");
} else {
  const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
  /*
    The key goes in a header, not the query string.

    Google accepts either, and `?key=` is the one that ends up in a proxy's
    access log — a managed laptop inspecting TLS records the method and URL as
    a matter of course, and does not record headers. server/src/ai.ts already
    sends it as x-goog-api-key; this had been the one place that did not.

    The question asked is about the model the Hub will actually call, not
    about the key. Listing the models proves only that the credential works,
    and this reported a cheerful green while gemini-2.5-flash answered every
    real request with "no longer available to new users" — a retirement is
    how a working Gemini setup stops working, and the doctor exists to say
    so before somebody presses Draft and is told nothing useful.
  */
  const res = await ask(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    undefined,
    { "x-goog-api-key": gemini },
    { contents: [{ parts: [{ text: "ok" }] }], generationConfig: { maxOutputTokens: 1 } },
  );
  if (res.ok) {
    good(`Gemini ${tail(gemini)}`, `${model} — answering`);
  } else {
    /*
     * A 404 here is a retired model, not a mistyped sheet id, and `reason`
     * speaks Smartsheet because that is what it mostly answers for. Saying
     * "no sheet with that id" about a language model would send somebody to
     * check a number that does not exist.
     */
    const why = /\(404\)/.test(res.why)
      ? "this model is not available to this key — it may have been retired. `GEMINI_MODEL` picks another"
      : res.why;
    fail(`Gemini ${tail(gemini)}`, `${model} — ${why}`);
  }
}

const relay = process.env.NOTIFY_EMAIL_URL ?? "";
if (!relay) idle("Email", "no NOTIFY_EMAIL_URL — nothing sends email");
else good("Email", `relay at ${hostOf(relay)}`);

const chat = process.env.NOTIFY_CHAT_WEBHOOK ?? "";
if (!chat) idle("Google Chat", "no NOTIFY_CHAT_WEBHOOK");
else if (!/^https:\/\/chat\.googleapis\.com\//.test(chat)) {
  fail("Google Chat", "that webhook is not a chat.googleapis.com address and will be refused");
} else good("Google Chat", "webhook set");

if (process.env.NOTIFY_SCHEDULE === "1") {
  say(warn("!"), "NOTIFY_SCHEDULE=1", `notices send themselves, daily at ${process.env.NOTIFY_HOUR ?? 8}:00`);
} else {
  idle("Notifications", "off — nothing sends itself; an @ mention still goes as a note is saved");
}

/*
 * The database, asked rather than reported.
 *
 * This used to print the address out of HUB_DB_URL and call it a tick, which
 * proved only that a variable had been set — and the failure that actually
 * happens with Postgres is not a missing variable. It is a container that is
 * not running, or a port that another Postgres already holds, and both of
 * those arrive later as a server that will not boot. The same argument as
 * every sheet above: ask it, and say what came back.
 *
 * Counted tables rather than a bare "connected", because an empty database is
 * the normal state before the first boot and an alarming one afterwards.
 * `CREATE TABLE IF NOT EXISTS` on boot means zero tables is not a fault, so
 * the two are worth telling apart on sight.
 */
const dbUrl = process.env.HUB_DB_URL;
if (!dbUrl) {
  good("Database", `SQLite at ${process.env.HUB_DB ?? "./data/hub.db"}`);
} else {
  const found = await askPostgres(dbUrl);
  if (found.ok) {
    good("Database", `Postgres at ${hostOf(dbUrl)} — ${found.note}`);
  } else {
    fail("Database", `Postgres at ${hostOf(dbUrl)} — ${found.note}`);
  }
}

/*
 * Counted, not listed. The output of this is meant to be pasted into a
 * ticket, and a list of colleagues' addresses is the one thing here that
 * should not travel with it — the same reason directory.json is gitignored.
 */
const admins = (process.env.HUB_ADMINS ?? "").split(",").map((a) => a.trim()).filter(Boolean);
if (admins.length) {
  good("Admins", `${admins.length} named in HUB_ADMINS, whatever the access sheet says`);
} else {
  idle("Admins", "none named — rights come from the access sheet, and without one nobody is an admin");
}

const auth = process.env.AUTH_MODE ?? "dev";
if (auth === "dev") {
  idle("Sign-in", "dev — the account switcher is on, which is right on a laptop and nowhere else");
} else {
  good("Sign-in", `proxy — the address comes from ${process.env.AUTH_EMAIL_HEADER ?? "x-forwarded-email"}`);
}

/* ---- What to do about it -------------------------------------------------- */

console.log("");
if (problems === 0) {
  console.log(ok("Nothing to fix. `npm run dev` and open http://localhost:5173\n"));
} else {
  console.log(bad(`${problems} thing${problems === 1 ? "" : "s"} to fix — see the ✗ above.\n`));
  process.exitCode = 1;
}

/**
 * What the Hub wants from this sheet against what the sheet has.
 *
 * Only the mismatches are printed. A sheet whose fourteen titles all match
 * says so in one line and moves on — the output is meant to be read when it
 * is wrong, and a wall of ticks is how somebody stops reading it.
 *
 * The spare headings are worth printing beside the missing ones because the
 * answer is almost always among them: the sheet says "Actual Submission Date"
 * and the Hub asks for "Actual Submission". Naming the likely one is the whole
 * value of this over reading two lists side by side.
 */
/**
 * Countries in a dropdown the Hub cannot work a region out from.
 *
 * Region is background, not a calendar concept: it is how the team reads
 * somebody's expertise in the directory, and how the spread of workshops and
 * trade shows gets counted. Nothing on a calendar consults it. So an unmapped
 * country breaks nothing at all, which is exactly why it is worth printing —
 * the gap shows up months later as a person missing from a count, and named
 * here it is a one-line addition to `regionFor`.
 *
 * The Country column only. A Region column already holds regions, so running
 * those through a country-to-region map would report NAM and EMEA as
 * unmappable countries, which is the check misunderstanding its own question.
 *
 * Read from the column's own options rather than from the rows, which is
 * free: a picklist hands its allowed values back with the column definition,
 * so this costs nothing beyond the one row already being fetched.
 */
function reportCountries(sheetColumns) {
  if (!regionFor) return;
  const col = sheetColumns.find((c) => c.title === "Country");
  const options = col?.options ?? [];
  if (options.length === 0) return;
  const unknown = options.filter(
    (value) => !/^(all|n\/a|tbc|)$/i.test(String(value).trim()) && !regionFor(value),
  );
  if (unknown.length === 0) return;
  problems += unknown.length;
  say(" ", `    ${warn("!")} ${dim(`no region known for ${unknown.length}: ${unknown.join(", ")} — directory and counts only, nothing on a calendar`)}`);
}

function reportColumns(sheetColumns, groups) {
  const has = sheetColumns.map((c) => c.title).filter(Boolean);
  const wanted = [...new Set(groups.flatMap((g) => Object.values(COLUMNS[g] ?? {}).map(titleOf)))];

  /*
   * A rename the column id is quietly covering for.
   *
   * Worth saying out loud precisely because nothing is broken: the field
   * still reads, so there is no symptom to notice, and the mapping drifts
   * further from the sheet every time somebody does it. Said here it is a
   * one-line correction; left alone it is a puzzle for whoever removes the
   * id later.
   */
  const rescued = groups.flatMap((g) => renamedColumns(COLUMNS[g] ?? {}, sheetColumns));
  for (const r of rescued) {
    say(" ", `    ${warn("!")} ${dim(`“${r.mapped}” is now called “${r.actual}” — found by its column id, so it still reads`)}`);
  }

  const missing = wanted.filter((title) => !has.includes(title) && !rescued.some((r) => r.mapped === title));
  if (missing.length === 0) {
    say(" ", dim(`    all ${wanted.length} columns the Hub reads are there`));
    return;
  }

  const spare = has.filter((title) => !wanted.includes(title));
  problems += missing.length;
  say(" ", `    ${bad(`${missing.length} of ${wanted.length} missing`)}`);
  for (const title of missing) {
    const near = closest(title, spare);
    say(" ", `      ${bad("✗")} “${title}”${near ? dim(` — the sheet has “${near}”`) : ""}`);
  }
  /*
   * All of them, wrapped, once something is missing.
   *
   * This was capped at eight so a wide sheet could not bury the lines above
   * that somebody has to act on, which was the wrong instinct: the moment a
   * title is missing, the sheet's own heading for it is somewhere in this
   * list, and a list that stops at eight of seventy is a list that cannot
   * answer the only question being asked of it. The cap saved nothing —
   * nothing is printed at all when a sheet matches cleanly.
   */
  if (spare.length) {
    say(" ", dim(`      not read by the Hub (${spare.length}):`));
    for (const line of wrap(spare.map((t) => `“${t}”`), 76)) say(" ", dim(`        ${line}`));
  }
}

/**
 * The spare heading most likely to be the missing one.
 *
 * Case, spaces and punctuation are stripped before comparing because those are
 * exactly the differences a person cannot see and `fetchRows` cannot forgive —
 * a trailing space in a Smartsheet heading looks like nothing at all. Anything
 * beyond a containment match is left alone: a wrong guess printed confidently
 * is worse than no guess, and the spare list is right underneath.
 */
function closest(wanted, spare) {
  const flatten = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = flatten(wanted);
  if (!target) return null;
  /*
   * A heading with no letters in it cannot be a near miss.
   *
   * Real sheets use ">>" and "—" as spacer columns, and those flatten to
   * nothing at all — which every target contains, so the first spacer in the
   * sheet was confidently offered as the match for whatever was missing.
   * "Vertical" was reported as probably being ">>". Two characters is enough
   * to keep "ID" as a candidate for "Content ID", which is a real answer.
   */
  const usable = spare.filter((t) => flatten(t).length >= 2);
  return (
    usable.find((t) => flatten(t) === target) ??
    usable.find((t) => flatten(t).includes(target) || target.includes(flatten(t))) ??
    null
  );
}

/** Long lists, folded to a width, so a seventy-column sheet stays readable. */
function wrap(items, width) {
  const lines = [];
  let line = "";
  for (const item of items) {
    const next = line ? `${line}, ${item}` : item;
    if (next.length > width && line) {
      lines.push(`${line},`);
      line = item;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Ask an API a question, and turn whatever happens into one line.
 *
 * Never throws: a doctor that dies on the first unreachable host cannot
 * report on the nine things after it.
 */
async function ask(url, token, extra = {}, body) {
  try {
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
        ...extra,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(12_000),
    });
    if (res.ok) return { ok: true, body: await res.json().catch(() => ({})) };
    return { ok: false, why: reason(res.status, res.statusText) };
  } catch (err) {
    return { ok: false, why: unreachable(err, url) };
  }
}

/**
 * Why a request never got an answer, in words worth reading.
 *
 * "fetch failed" is what Node says for a wrong hostname, a firewall, a proxy
 * and a captive portal alike, and it tells nobody anything. The cause is one
 * level down, and the host is worth naming because the usual answer is that a
 * VPN is off or a proxy is in the way.
 */
function unreachable(err, url) {
  const code = err?.cause?.code ?? err?.code;
  const where = hostOf(url);
  if (err?.name === "TimeoutError") return `${where} did not answer within 12 seconds`;
  if (code === "ENOTFOUND") return `${where} could not be found — check the address, a VPN, or DNS`;
  if (code === "ECONNREFUSED") return `${where} refused the connection`;
  if (code === "CERT_HAS_EXPIRED" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
    return `${where} presented a certificate this machine will not accept — usually a proxy`;
  }
  if (code) return `${where} could not be reached — ${code}`;
  return `${where} could not be reached — ${err instanceof Error ? err.message : "the request failed"}`;
}

/**
 * A value's shape, for saying "that is not a sheet id" without repeating it.
 *
 * The thing most likely to be in the wrong box is a credential, so this says
 * how long it is and roughly what it is made of, and never what it says.
 */
function shapeOf(value) {
  const v = String(value).trim();
  const kind = /^\d+$/.test(v)
    ? "digits"
    : /^[A-Za-z0-9]+$/.test(v)
      ? "letters and digits"
      : "mixed characters";
  return `${v.length} ${kind}`;
}

/** A status code in words somebody can act on. */
function reason(status, statusText) {
  // Google answers a bad API key with a 400 rather than a 401, so the two
  // read the same way here — otherwise a wrong Gemini key reports as "Bad
  // Request", which sounds like the Hub's fault.
  if (status === 400) return "refused (400) — usually a key that is wrong or not enabled";
  if (status === 401) return "the token was refused (401) — it may be wrong or revoked";
  if (status === 403) return "the token is valid but has no access to this (403) — share it with the token's account";
  if (status === 404) return "no sheet with that id (404) — check the number";
  if (status === 429) return "rate-limited (429) — try again shortly";
  return `${status} ${statusText}`;
}

/**
 * Connect, count, disconnect — and say what went wrong in words.
 *
 * A single client rather than the pool the server opens: this asks one
 * question and leaves, and a pool that is not drained keeps the process alive
 * after the report has printed. `pg` is imported here rather than at the top
 * so a machine that has not run `npm install` still gets the rest of the
 * report instead of a stack trace on line one.
 *
 * The codes are mapped because Postgres's own messages name the wrong
 * culprit for the two mistakes people actually make. `ECONNREFUSED` reads as
 * a network fault when it is almost always `docker compose up -d` not yet
 * run, and `3D000` says "database does not exist" about a connection that is
 * otherwise perfect — which sends somebody to check the password.
 */
async function askPostgres(url) {
  let pg;
  try {
    ({ default: pg } = await import("pg"));
  } catch {
    return { ok: false, note: "the pg driver is not installed — run `npm run setup`" };
  }
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 4000 });
  try {
    await client.connect();
    const { rows } = await client.query(
      "select current_database() as db, (select count(*) from information_schema.tables where table_schema = 'public') as tables",
    );
    const tables = Number(rows[0].tables);
    const where = `database "${rows[0].db}"`;
    if (tables === 0) {
      return { ok: true, note: `answering, ${where} is empty — the schema is created on the first boot` };
    }
    return { ok: true, note: `answering, ${tables} tables in ${where}` };
  } catch (err) {
    return { ok: false, note: whyPostgres(err) };
  } finally {
    // A refused connection has nothing to end, and saying so is not useful.
    await client.end().catch(() => {});
  }
}

/** What a driver error means to somebody who has to fix it. */
function whyPostgres(err) {
  const code = err?.code ?? "";
  if (code === "ECONNREFUSED") {
    return "nothing is listening there — `docker compose up -d`, then try again";
  }
  if (code === "ETIMEDOUT" || /timeout/i.test(err?.message ?? "")) {
    return "it did not answer in four seconds — a firewall, or the wrong host";
  }
  if (code === "28P01") return "the password was refused (28P01) — check HUB_DB_URL against docker-compose.yml";
  if (code === "28000") return "that user may not connect (28000)";
  if (code === "3D000") {
    return "the server answered but has no database of that name (3D000) — the name is the last part of the URL";
  }
  if (code === "ENOTFOUND") return "that host does not resolve — check the address";
  // Never the driver's own message unprompted: it can carry the connection
  // string, and this output is meant to be safe to paste into a ticket.
  return code ? `refused (${code})` : "refused";
}

/** A URL's host, so a connection string can be shown without its password. */
function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "(unreadable)";
  }
}
