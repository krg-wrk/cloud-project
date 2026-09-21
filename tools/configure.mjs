/**
 * Fill in .env by being asked, rather than by editing it.
 *
 *   npm run configure
 *
 * Every line of env.example ships commented out, which is right — a template
 * that arrives switched on is a template that does something nobody asked
 * for. It is also the thing that catches people: a key typed onto the line
 * below its `#` is a key in a comment, the Hub reads nothing, and the failure
 * looks exactly like a wrong credential. This asks for each value in turn and
 * writes it uncommented, so that particular half hour happens to nobody else.
 *
 * It edits in place rather than rewriting: every comment, blank line and
 * setting it was not asked about survives untouched, because the file is also
 * the documentation and a tool that flattens it has taken something away.
 *
 * Nothing is ever printed back. A secret is typed without appearing on the
 * screen and is reported afterwards as "set", the way the doctor reports one.
 * Pressing return leaves a setting exactly as it was, so running this again to
 * change one line is safe.
 */

import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// `.pathname` is a URL path, not a filesystem one: a folder called
// "OneDrive - WGSN" arrives percent-encoded and nothing resolves.
const root = fileURLToPath(new URL("..", import.meta.url));
const envPath = join(root, ".env");

const colour = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (colour ? `\x1b[${code}m${s}\x1b[0m` : s);
const ok = paint(32);
const dim = paint(2);
const bold = paint(1);
const warn = paint(33);

/* ---- The file ------------------------------------------------------------ */

if (!existsSync(envPath)) {
  copyFileSync(join(root, "env.example"), envPath);
  console.log(`${ok("✓")} .env ${dim("created from env.example")}`);
}
let text = readFileSync(envPath, "utf8");

/**
 * What a setting is currently, without saying what it says.
 *
 * A commented line and an absent one are the same thing to the Hub, and the
 * distinction nobody can see from the outside — a value sitting behind a `#` —
 * is exactly the one worth naming here.
 */
function current(name) {
  /*
   * The trailing note is not the value.
   *
   * env.example documents most settings beside them — `# SHEET_ID=    # the
   * workshop programme` — and read naively that description is a value
   * waiting to be uncommented. It is not: an empty setting with a note after
   * it would have been written back as SHEET_ID=# the workshop programme,
   * which the doctor then reports as six sheets with unreadable ids. Node's
   * own reader treats a `#` after a value as a comment too, so this agrees
   * with what the Hub would have made of the line anyway.
   */
  const clean = (raw) => raw.replace(/\s+#.*$/, "").trim();

  const live = new RegExp(`^[ \\t]*${name}=(.*)$`, "m").exec(text);
  if (live && clean(live[1])) return { state: "set", value: clean(live[1]) };
  const hidden = new RegExp(`^[ \\t]*#[ \\t]*${name}=(.*)$`, "m").exec(text);
  if (hidden && clean(hidden[1])) return { state: "commented", value: clean(hidden[1]) };
  return { state: "unset", value: "" };
}

/**
 * One setting written in, wherever it already lives.
 *
 * The line is replaced where it stands so the comment above it still explains
 * it. Only a name the template has never heard of is appended, which is how a
 * setting added to the code but not yet to env.example still lands somewhere
 * sensible rather than being silently dropped.
 */
function put(name, value) {
  const line = `${name}=${value}`;
  const existing = new RegExp(`^[ \\t]*#?[ \\t]*${name}=.*$`, "m");
  text = existing.test(text) ? text.replace(existing, line) : `${text.replace(/\n*$/, "\n")}${line}\n`;
}

/** Commented back out, for a setting somebody clears on purpose. */
function unset(name) {
  const existing = new RegExp(`^[ \\t]*${name}=.*$`, "m");
  if (existing.test(text)) text = text.replace(existing, `# ${name}=`);
}

/* ---- Asking -------------------------------------------------------------- */

const rl = createInterface({ input: process.stdin, output: process.stdout });

/*
 * Answers are pulled one at a time rather than pushed.
 *
 * `rl.question` reads whatever arrives after it is called, which is fine at a
 * keyboard and wrong down a pipe: readline starts flowing the moment it is
 * created, so every line of a scripted run is emitted and discarded before
 * the first question exists. The async iterator applies backpressure instead
 * — nothing is read until something asks — so the same code serves a person
 * typing and a test feeding it answers, and the tool can be proved rather
 * than hoped about.
 */
const answers = rl[Symbol.asyncIterator]();

/*
 * A secret is typed blind.
 *
 * The echo is intercepted rather than the input, because reading the raw
 * stream would mean reimplementing backspace, paste and Ctrl-C — all of which
 * somebody uses when pasting a forty-character token. The prompt is written
 * directly below, so everything reaching readline's own output while `hidden`
 * is on is a keystroke and all of it is dropped.
 */
let hidden = false;
const echo = rl._writeToOutput?.bind(rl);
if (echo) rl._writeToOutput = (s) => (hidden ? undefined : echo(s));

async function ask(q) {
  process.stdout.write(q);
  const { value, done } = await answers.next();
  // End of input: whatever is left keeps whatever it already had.
  if (done) return "";
  // At a keyboard the return key draws its own line break; fed from a file
  // there is nobody pressing it, and every answer lands on the prompt.
  if (!process.stdin.isTTY) process.stdout.write("\n");
  return value;
}

async function askFor({ name, question, note, secret, validate, optional }) {
  const now = current(name);
  const state =
    now.state === "set"
      ? ok("set")
      : now.state === "commented"
        ? warn("typed, but commented out")
        : dim("not set");

  console.log(`\n${bold(name)} ${dim("—")} ${state}`);
  if (note) console.log(dim(`  ${note}`));

  for (;;) {
    hidden = Boolean(secret);
    const keep = now.state === "unset" ? "skip" : "keep";
    const answer = (await ask(`  ${question} ${dim(`(return to ${keep})`)}: `)).trim();
    hidden = false;
    if (secret) console.log("");

    if (!answer) {
      // Return on a value sitting behind a `#` means "yes, that one" — which
      // is the whole reason somebody is running this.
      if (now.state === "commented") {
        put(name, now.value);
        console.log(`  ${ok("✓")} ${dim("uncommented, value left as it was")}`);
      }
      return now.state === "unset" ? null : now.value;
    }
    if (answer === "-") {
      unset(name);
      console.log(`  ${ok("✓")} ${dim("commented out")}`);
      return null;
    }

    const wrong = validate?.(answer);
    if (wrong) {
      // The value is never repeated back, whatever is wrong with it.
      console.log(`  ${warn("!")} ${wrong}`);
      continue;
    }
    put(name, answer);
    console.log(`  ${ok("✓")} ${secret ? dim("set") : dim(`set to ${answer}`)}`);
    return answer;
  }
}

const yes = async (question, fallback = false) => {
  const answer = (await ask(`\n${question} ${dim(fallback ? "(Y/n)" : "(y/N)")}: `)).trim().toLowerCase();
  if (!answer) return fallback;
  return answer.startsWith("y");
};

/* ---- What a sheet id and a token look like ------------------------------- */

/**
 * Checked here because the alternative is finding out from a 404 later.
 *
 * The shape is all that is checked, and the value is never quoted back: a
 * token pasted into a sheet-id line is the mistake that actually happens, and
 * printing "that is not a sheet id, you gave me <token>" would put a live
 * credential on the screen and in the scrollback.
 */
const oneId = (value) =>
  /^\d{6,25}$/.test(value) ? null : "A sheet id is a long number, 6 to 25 digits. Nothing was saved.";

const idList = (value) => {
  const ids = value.split(",").map((v) => v.trim()).filter(Boolean);
  if (ids.length === 0) return "Nothing there to save.";
  return ids.every((id) => /^\d{6,25}$/.test(id))
    ? null
    : "Every id is a long number, 6 to 25 digits, separated by commas. Nothing was saved.";
};

const looksLikeToken = (value) =>
  /^\d+$/.test(value) ? "That is all digits, which is a sheet id rather than a token." : null;

/* ---- The conversation ---------------------------------------------------- */

console.log(`\n${bold("Pointing the Hub at your own data")}`);
console.log(
  dim("Return leaves a setting alone. A single - comments one back out.\nNothing typed here is printed back, and nothing leaves this machine.\n"),
);

if (await yes("Point the Hub at Smartsheet? Otherwise it stays on the sample schedule", true)) {
  put("DATA_SOURCE", "smartsheet");
  console.log(`  ${ok("✓")} ${dim("DATA_SOURCE=smartsheet")}`);

  await askFor({
    name: "SMARTSHEET_TOKEN",
    question: "Token",
    note: "Account → Personal Settings → API Access. A service account's, rather than your own — a personal one stops working the day that person leaves.",
    secret: true,
    validate: looksLikeToken,
  });

  if (await yes("Is this Smartsheet on the EU region?")) {
    put("SMARTSHEET_API", "https://api.smartsheet.eu/2.0");
    console.log(`  ${ok("✓")} ${dim("SMARTSHEET_API=https://api.smartsheet.eu/2.0")}`);
  }

  console.log(
    `\n${dim("Each sheet id is the long number in the sheet's URL, or File → Properties.\nEvery sheet has to be shared with the token's account.")}`,
  );

  /*
   * The order is the order somebody needs them in. Content first because the
   * Hub will not start without it, the team second because without it nobody
   * can sign in at all — which looks like a broken deployment rather than a
   * missing line, and is the one worth asking for before the interesting
   * ones.
   */
  await askFor({
    name: "SMARTSHEET_CONTENT_SHEET_ID",
    question: "Commissioning schedule",
    note: "Required — the Hub will not start without it.",
    validate: oneId,
  });
  await askFor({
    name: "SMARTSHEET_PEOPLE_SHEET_ID",
    question: "The team",
    note: "All but required: without it nobody resolves to a person, and the Hub answers “no access” to everybody, including you.",
    validate: oneId,
  });
  await askFor({
    name: "SMARTSHEET_EVENTS_SHEET_ID",
    question: "Calendar sheets",
    note: "Holidays, leave, shows. Several ids separated by commas if a team keeps several sheets — they are read as one calendar and must share their column headings.",
    validate: idList,
  });
  await askFor({
    name: "SMARTSHEET_ACCESS_SHEET_ID",
    question: "Who may sign in",
    note: "One row per exception — managers, admins, leavers. Everybody absent from it gets an ordinary forecaster's view.",
    validate: oneId,
  });
  await askFor({
    name: "SMARTSHEET_SESSIONS_SHEET_ID",
    question: "The workshop programme",
    validate: oneId,
  });
  await askFor({
    name: "SMARTSHEET_SIGNUPS_SHEET_ID",
    question: "Workshop sign-ups",
    validate: oneId,
  });
  await askFor({
    name: "SMARTSHEET_DIRECTORY_SHEET_ID",
    question: "The content directory",
    validate: oneId,
  });
  await askFor({
    name: "SMARTSHEET_TRENDS_SHEET_ID",
    question: "TFDB trend profiles",
    validate: oneId,
  });
  await askFor({
    name: "SMARTSHEET_METRICS_SHEET_ID",
    question: "The KPIs tracked",
    validate: oneId,
  });
  await askFor({
    name: "SMARTSHEET_KPI_SHEET_ID",
    question: "KPI readings",
    validate: oneId,
  });
}

await askFor({
  name: "GEMINI_API_KEY",
  question: "Gemini key",
  note: "Optional, for AI note drafting — aistudio.google.com/apikey. Note text goes to Google when it is on. Without it the Draft button says it is not configured.",
  secret: true,
  validate: (v) =>
    /^AIza[A-Za-z0-9_-]{35}$/.test(v)
      ? null
      : `That is ${v.length} characters and an AI Studio key is 39, beginning AIza. Saving it anyway — check it with the doctor.`,
  optional: true,
});

rl.close();

/* ---- Writing it back ----------------------------------------------------- */

/*
 * Written beside the file and moved over it, rather than written through.
 * A crash halfway through a direct write leaves a truncated .env, which is a
 * bad half hour for somebody whose token is no longer in it. The mode is set
 * on the way so the file holding the credentials is not world-readable even
 * for the moment it exists under its temporary name.
 */
const temporary = `${envPath}.writing`;
writeFileSync(temporary, text, { mode: 0o600 });
renameSync(temporary, envPath);

const names = text
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#") && l.includes("="))
  .map((l) => l.slice(0, l.indexOf("=")));

console.log(`\n${ok("✓")} .env written — ${names.length} setting${names.length === 1 ? "" : "s"}`);
console.log(dim(`  ${names.join(", ") || "none"}`));
console.log(`\nNow ${bold("npm run doctor")} to ask whether any of it answers.`);
console.log(dim("Then `npm run doctor -- --columns` to compare your column titles.\n"));
