/**
 * Everything between a fresh clone and a running Hub, in one command.
 *
 *   npm run setup
 *
 * Checks Node is new enough, installs, makes a .env to fill in, builds, and
 * proves it works by running the tests. Then it says what to do next.
 *
 * Safe to run again: it never overwrites a .env that already exists, and
 * every step is one you could have typed yourself. Written in Node rather
 * than as a shell script so it behaves the same on a Mac, on Windows and in
 * CI, and needs nothing installed beyond Node itself.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { copyFileSync, existsSync } from "node:fs";
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
const bold = paint(1);

console.log(`\n${bold("Setting up the Forecasters Hub")}\n`);

/* 1. Node ------------------------------------------------------------------ */

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22) {
  console.error(bad(`Node ${process.versions.node} is too old. This needs 22 or newer.`));
  console.error(dim("  The store uses node:sqlite and the client tests read TypeScript directly."));
  console.error(dim("  nodejs.org, or `brew install node`, or `nvm install 22`.\n"));
  process.exit(1);
}

/*
 * `--env-file-if-exists` arrived in 22.9, and `npm run dev` uses it to read
 * .env. Every Node 22 LTS has it — only the early Current releases do not —
 * but "node: bad option" on the first run, for a flag nobody typed, is a
 * miserable way to find that out.
 */
if (major === 22 && minor < 9) {
  console.error(bad(`Node ${process.versions.node} is too old for the .env file.`));
  console.error(dim("  --env-file-if-exists arrived in 22.9. Any Node 22 LTS or newer is fine."));
  console.error(dim("  nodejs.org, or `brew install node`, or `nvm install --lts`.\n"));
  process.exit(1);
}
console.log(`${ok("✓")} Node ${process.versions.node}`);

/* 2. Dependencies ---------------------------------------------------------- */

// `npm ci` when there is a lockfile and no node_modules — it is faster and
// installs exactly what the lockfile says. `npm install` otherwise.
const fresh = !existsSync(join(root, "node_modules"));
const hasLock = existsSync(join(root, "package-lock.json"));
step(fresh && hasLock ? "Installing dependencies" : "Checking dependencies", "npm", [
  fresh && hasLock ? "ci" : "install",
]);

/* 3. Somewhere to put the settings ----------------------------------------- */

const env = join(root, ".env");
if (existsSync(env)) {
  console.log(`${ok("✓")} .env ${dim("already there — left alone")}`);
} else {
  copyFileSync(join(root, "env.example"), env);
  console.log(`${ok("✓")} .env ${dim("created from env.example — every line is commented out")}`);
}

/* 4. Build, which is also the type check ----------------------------------- */

step("Building", "npm", ["run", "build"]);

/* 5. Prove it ---------------------------------------------------------------*/

step("Running the tests", "npm", ["test"]);

/* ---------------------------------------------------------------------------*/

console.log(`\n${ok("Done.")} The Hub runs on its sample data with no further setup.\n`);
console.log(`  ${bold("npm run dev")}       ${dim("→ http://localhost:5173")}`);
console.log(`  ${bold("npm run doctor")}    ${dim("what it is pointed at, and whether it answers")}`);
console.log(`  ${bold("npm run refresh")}   ${dim("pull the latest changes and rebuild")}\n`);
console.log(dim("  To point it at real sheets, fill in .env and run doctor again.\n"));

/**
 * Run a command, showing its output, and stop on failure.
 *
 * `stdio: inherit` on purpose: npm's own progress and the test output are
 * more useful than a spinner that hides why something failed.
 */
function step(label, command, args) {
  console.log(`\n${dim("—")} ${label}…\n`);
  const res = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    // npm is a shell script on Windows, which spawn will not run without this.
    shell: process.platform === "win32",
  });
  if (res.status !== 0) {
    console.error(`\n${bad("✗")} ${label} failed.`);
    console.error(dim(`  Try running it yourself: ${command} ${args.join(" ")}\n`));
    process.exit(res.status ?? 1);
  }
}
