# Moving to your laptop

Follow these in order. Each step either works or tells you what is wrong — if
something does not match what is written here, stop and say so rather than
pushing on.

Roughly twenty minutes, most of it waiting for downloads.

---

## Step 1 — Node

Open **Terminal** (macOS: ⌘-Space, type "terminal") and run:

```bash
node --version
```

**If it prints `v22.` or higher**, skip to step 2.

**If it says "command not found", or a lower number**, install it:

- **macOS:** go to [nodejs.org](https://nodejs.org) and download the **LTS**
  installer. Run it, then close and reopen Terminal.
- **Windows:** the same, from [nodejs.org](https://nodejs.org).

Check again with `node --version`. You want 22 or higher.

---

## Step 2 — Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

If macOS refuses with a permissions error, use `sudo npm install -g @anthropic-ai/claude-code`
and enter your Mac password.

Check it worked:

```bash
claude --version
```

---

## Step 3 — Get the project

Pick where it should live. Documents is fine:

```bash
cd ~/Documents
git clone https://github.com/krg-wrk/cloud-project.git
cd cloud-project
git checkout claude/react-node-webapp-setup-oliu8m
```

If `git` is missing on macOS, running it once will offer to install the
developer tools — accept, wait, then run the commands again.

> **Remember this folder.** Everything below happens inside it. If you close
> Terminal and come back, `cd ~/Documents/cloud-project` first.

---

## Step 4 — Set it up

```bash
npm run setup
```

This checks your Node version, installs everything, creates a `.env` file for
your settings, builds, and runs the tests. It takes a few minutes, mostly
downloading.

It finishes with `Done.` and a short list of commands. If it stops with a red
`✗`, read the line above it — it says which step failed and what to try.

---

## Step 5 — See it running, before any credentials

```bash
npm run dev
```

Open **http://localhost:5173** in your browser.

This is the sample data — the same content as the demo. Click around. The
account switcher is at the bottom left.

**This is the checkpoint that matters.** If this works, your machine is set up
correctly, and anything that goes wrong later is about credentials rather than
setup.

Press **Ctrl-C** in Terminal to stop it.

---

## Step 6 — Start Claude Code

In the same folder:

```bash
claude
```

That opens a conversation with the project loaded. It reads `CLAUDE.md`
automatically, so it starts knowing the architecture, the conventions and the
traps — you do not need to re-explain the project.

A good first message:

> I've just moved this to my laptop from a remote session. Read CLAUDE.md and
> RUNBOOK.md, then help me point it at our real Smartsheet sheets.

From here, work the way you have been. The difference is that it can now reach
Smartsheet, see the real errors, and fix column mappings while you watch.

---

## What changes, now that it is local

**It can reach your real data.** That was the whole reason to move —
`api.smartsheet.com` was blocked from the cloud sandbox.

**Your laptop has to be awake** while work is happening. No more starting
something and closing the lid.

**Your credentials stay here.** `.env` never leaves your machine and is never
committed. When something needs checking, run `npm run doctor` — it reports
what is configured and whether it answers, showing tokens only as `••••1234`.

**Nothing else moves.** Same branch, same repository. The remote session still
works if you ever want it; both push to the same place.

---

## The four commands worth remembering

| | |
|---|---|
| `npm run dev` | Run it — <http://localhost:5173> |
| `npm run doctor` | What it is pointed at, and whether it answers |
| `npm run refresh` | Pick up changes made elsewhere, rebuild, re-test |
| `claude` | Start a working session in this folder |

`RUNBOOK.md` in this folder has the rest: wiring up each credential, what to do
when a sheet will not read, and where everything lives.

---

## If you get stuck

Run these two and paste what they print:

```bash
node --version
npm run doctor
```

Neither prints a credential. `doctor` shows tokens as `••••1234` and a database
URL as its host only, so the whole output is safe to paste into a message.
