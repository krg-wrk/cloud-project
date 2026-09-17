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
if (source !== "smartsheet") {
  idle(`DATA_SOURCE=${source}`, "the built-in sample schedule; no credentials needed");
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
    const SHEETS = [
      ["SMARTSHEET_CONTENT_SHEET_ID", "the commissioning schedule", true],
      ["SMARTSHEET_PEOPLE_SHEET_ID", "the team"],
      ["SMARTSHEET_ACCESS_SHEET_ID", "who may sign in"],
      ["SMARTSHEET_EVENTS_SHEET_ID", "leave and holidays"],
      ["SMARTSHEET_SESSIONS_SHEET_ID", "the workshop programme"],
      ["SMARTSHEET_SIGNUPS_SHEET_ID", "workshop sign-ups"],
      ["SMARTSHEET_DIRECTORY_SHEET_ID", "the content directory"],
      ["SMARTSHEET_TRENDS_SHEET_ID", "TFDB trend profiles"],
      ["SMARTSHEET_METRICS_SHEET_ID", "the KPIs tracked"],
      ["SMARTSHEET_KPI_SHEET_ID", "KPI readings"],
    ];

    console.log("");
    for (const [name, what, required] of SHEETS) {
      const id = process.env[name];
      const label = `${name.replace(/^SMARTSHEET_|_SHEET_ID$/g, "").toLowerCase().padEnd(9)} ${dim(what)}`;
      if (!id) {
        if (required) fail(label, "not set, and the Hub cannot start without it");
        else idle(label, "not set");
        continue;
      }
      if (!/^\d{6,25}$/.test(id.trim())) {
        /*
          Never echoed back.

          A sheet id is digits, and a Smartsheet token is not — so the one
          thing that reliably lands here is somebody pasting their token into
          a sheet-id line by mistake. Printing "that is not a sheet id" with
          the value attached would put a live credential in the output whose
          whole purpose is to be pasted into a ticket. Its shape is enough to
          recognise the mistake.
        */
        fail(label, `not a sheet id — ${shapeOf(id)}. It should be a long number, 6 to 25 digits`);
        continue;
      }
      if (!token) continue;
      // pageSize=1 so a 3,000-row sheet is not pulled to answer "is it there".
      const sheet = await ask(`${api}/sheets/${id.trim()}?pageSize=1`, token);
      if (sheet.ok) {
        const rows = sheet.body.totalRowCount ?? 0;
        good(label, `“${sheet.body.name}” — ${rows} row${rows === 1 ? "" : "s"}`);
      } else {
        fail(label, sheet.why);
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
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  /*
    The key goes in a header, not the query string.

    Google accepts either, and `?key=` is the one that ends up in a proxy's
    access log — a managed laptop inspecting TLS records the method and URL as
    a matter of course, and does not record headers. server/src/ai.ts already
    sends it as x-goog-api-key; this had been the one place that did not.
  */
  const res = await ask("https://generativelanguage.googleapis.com/v1beta/models", undefined, {
    "x-goog-api-key": gemini,
  });
  if (res.ok) good(`Gemini ${tail(gemini)}`, `answering — model ${model}`);
  else fail(`Gemini ${tail(gemini)}`, res.why);
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

const dbUrl = process.env.HUB_DB_URL;
if (dbUrl) good("Database", `Postgres at ${hostOf(dbUrl)}`);
else good("Database", `SQLite at ${process.env.HUB_DB ?? "./data/hub.db"}`);

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
 * Ask an API a question, and turn whatever happens into one line.
 *
 * Never throws: a doctor that dies on the first unreachable host cannot
 * report on the nine things after it.
 */
async function ask(url, token, extra = {}) {
  try {
    const res = await fetch(url, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
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

/** A URL's host, so a connection string can be shown without its password. */
function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "(unreadable)";
  }
}
