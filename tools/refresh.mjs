/**
 * Bring this copy in step with the branch, and rebuild.
 *
 *   npm run refresh
 *
 * The working arrangement this exists for: changes are made somewhere else —
 * a cloud session, another machine, somebody else — and pushed, and this is
 * the one command that picks them up and proves they still work here.
 *
 * What it will not do is lose anything. It stops if this copy has changes of
 * its own rather than merging over them, and it pulls fast-forward only, so
 * it either moves cleanly to what was pushed or says why it cannot.
 *
 * Two things it deliberately never touches, because git never touches them:
 * `.env`, which holds this machine's credentials, and the SQLite database,
 * which holds the connections, datasets and views built in the studio. Both
 * are ignored by git, so every update leaves them exactly as they were. That
 * is the reason a real Smartsheet token only has to be typed once.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

console.log(`\n${bold("Bringing this copy up to date")}\n`);

/* 1. Is there anything here that would be lost? ---------------------------- */

const status = run("git", ["status", "--porcelain"]);
if (status.status !== 0) {
  // "git printed nothing" and "git could not run" look identical otherwise,
  // and the second one would be read as a clean tree.
  console.error(`${bad("✗")} git could not read this folder.\n`);
  console.error(dim(`  ${(status.stderr || "").trim() || "Is this a git repository?"}\n`));
  process.exit(1);
}
const dirty = status.stdout.trim();
if (dirty) {
  console.error(`${bad("✗")} This copy has changes that are not committed:\n`);
  for (const line of dirty.split("\n").slice(0, 20)) console.error(`    ${line}`);
  if (dirty.split("\n").length > 20) console.error(dim(`    …and more`));
  /*
    Committing is offered first, and stashing is not offered at all.

    `git stash -u` takes untracked files off disk, and the `pop` that brings
    them back would sit behind an install, a build and a test run here — any
    of which can stop, leaving somebody's work in a stash they were not
    expecting and did not ask for. A commit is the reversible one.
  */
  console.error(`\n  Nothing has been changed. Commit them first:\n`);
  console.error(`    ${bold('git add -A && git commit -m "work in progress"')}`);
  console.error(`    ${bold("npm run refresh")}\n`);
  console.error(dim("  If they are not worth keeping, `git restore .` discards them — but look\n"));
  console.error(dim("  at the list above first, because that cannot be undone.\n"));
  process.exit(1);
}

const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
if (branch === "HEAD") {
  // Detached: `origin/HEAD` would fast-forward something, report success, and
  // leave the person still detached with their work going nowhere.
  console.error(`${bad("✗")} This copy is not on a branch (detached HEAD).\n`);
  console.error(`  Get back onto one first:\n`);
  console.error(`    ${bold("git checkout claude/react-node-webapp-setup-oliu8m")}\n`);
  process.exit(1);
}
const before = run("git", ["rev-parse", "HEAD"]).stdout.trim();
console.log(`${ok("✓")} Nothing uncommitted ${dim(`— on ${branch}`)}`);

/* 2. Fetch, then fast-forward ---------------------------------------------- */

console.log(`\n${dim("—")} Fetching…\n`);
if (run("git", ["fetch", "origin", branch], true).status !== 0) {
  console.error(`\n${bad("✗")} Could not reach the remote. Check the network and try again.\n`);
  process.exit(1);
}

const pull = run("git", ["merge", "--ff-only", `origin/${branch}`], true);
if (pull.status !== 0) {
  console.error(`\n${bad("✗")} This copy has commits that are not on the remote, so it cannot`);
  console.error(`  fast-forward. Nothing has been changed.\n`);
  console.error(`  Push them, or rebase onto the remote:\n`);
  console.error(`    ${bold(`git push -u origin ${branch}`)}`);
  console.error(`    ${bold(`git rebase origin/${branch}`)}\n`);
  process.exit(1);
}

const after = run("git", ["rev-parse", "HEAD"]).stdout.trim();
if (before === after) {
  console.log(`\n${ok("✓")} Already up to date.\n`);
  process.exit(0);
}

const log = run("git", ["log", "--oneline", `${before}..${after}`]).stdout.trim();
const count = log ? log.split("\n").length : 0;
console.log(`\n${ok("✓")} ${count} new commit${count === 1 ? "" : "s"}:\n`);
for (const line of log.split("\n")) console.log(`    ${line}`);

/* 3. Rebuild, and prove it still works ------------------------------------- */

step("Installing anything new", "npm", ["install"]);
step("Building", "npm", ["run", "build"]);
step("Running the tests", "npm", ["test"]);

console.log(`\n${ok("Up to date.")} ${dim("Your .env and your database were not touched.")}\n`);
console.log(`  ${bold("npm run dev")}       ${dim("→ http://localhost:5173")}`);
console.log(`  ${bold("npm run doctor")}    ${dim("if a new setting needs filling in")}\n`);

/** Run a command and hand back what it said. */
function run(command, args, show = false) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: show ? "inherit" : "pipe",
    shell: process.platform === "win32",
  });
}

/** Run a command, show its output, and stop on failure. */
function step(label, command, args) {
  console.log(`\n${dim("—")} ${label}…\n`);
  const res = run(command, args, true);
  if (res.status !== 0) {
    console.error(`\n${bad("✗")} ${label} failed.`);
    console.error(dim(`  The code is updated; something in it needs looking at.\n`));
    process.exit(res.status ?? 1);
  }
}
