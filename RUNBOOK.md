# Running the Hub on your laptop

Why the laptop and not a cloud session: `api.smartsheet.com` is blocked from
the sandbox this was built in, so the one system that matters most is the one
thing that cannot be tested remotely. Google Sheets and Gemini both answer from
either place; Smartsheet only answers from yours.

Everything below is a command you could have typed yourself. Nothing here sends
a credential anywhere except to the service it belongs to.

---

## Once, to set it up

**1. Node 22.** Check with `node --version`. If it is missing or older:

| | |
|---|---|
| macOS | `brew install node` |
| Windows | [nodejs.org](https://nodejs.org) — the LTS installer |
| Either, if you juggle versions | `nvm install 22 && nvm use 22` |

**2. Get the code and set it up.**

```bash
git clone https://github.com/krg-wrk/cloud-project.git
cd cloud-project
git checkout claude/react-node-webapp-setup-oliu8m
npm run setup
```

`npm run setup` checks your Node version, installs everything, creates a `.env`
for you to fill in, builds, and runs the tests to prove it works. It is safe to
run again and never overwrites a `.env` you already have.

**3. Try it before any credentials are involved.**

```bash
npm run dev
```

Open <http://localhost:5173>. This is the sample schedule — the same data as the
demo. If this works, the machine is fine and anything that goes wrong later is
about configuration rather than setup.

Stop it with `Ctrl-C`.

---

## Once, to point it at real data

Open `.env` in an editor. Every line is commented out; uncomment and fill in the
ones you need. Add them **a few at a time** and run `npm run doctor` after each
round — that is the whole point of the doctor.

### Smartsheet

```bash
DATA_SOURCE=smartsheet
SMARTSHEET_TOKEN=...
SMARTSHEET_CONTENT_SHEET_ID=...
```

- The token comes from Smartsheet: **Account → Personal Settings → API Access**.
  Use a **service account's** token rather than your own — a personal one stops
  working the day that person leaves.
- A sheet id is the long number in the sheet's URL, or **File → Properties**.
- Every sheet has to be **shared with the token's account**, the same way you
  would share it with a colleague. This is the single most common reason a sheet
  reads as "no access".
- If WGSN's Smartsheet is on the EU region, also set
  `SMARTSHEET_API=https://api.smartsheet.eu/2.0`.

Then:

```bash
npm run doctor
```

It asks each sheet in turn and prints what came back **by name**:

```
  ✓ content   the commissioning schedule — "2026 Content Calendar" — 412 rows
  ✗ people    the team — no sheet with that id (404) — check the number
  · events    leave and holidays — not set
```

That is what it is for. A digit out in one of ten ids otherwise shows up as a
page that is quietly empty, and nothing tells you which. Add the rest of the
sheet ids and re-run until the list is clean.

### Gemini, for AI note drafting

```bash
GEMINI_API_KEY=...
```

From [aistudio.google.com/apikey](https://aistudio.google.com/apikey). The doctor
checks it answers. Without it the Draft button is still there and says it is not
configured, which is the honest version of hiding it.

### Google Sheets

Not a `.env` line — a connection you build in the studio, at **/studio**, using
a service-account JSON key. Share the sheet with the service account's own
address, the way you would with a person.

### Changing the sheet, not only reading it

Leave this off at first.

```bash
SMARTSHEET_WRITE=1
```

Everything else is a read. This is the one line that lets the Hub write back,
and it is worth turning on only once you have watched it read your real sheets
correctly for a few days. Until then you can exercise the same screens against
the sample data with `SEED_WRITES=1`.

---

## Every time there are changes to pick up

```bash
npm run refresh
```

Fetches the branch, fast-forwards, reinstalls anything new, rebuilds and runs
the tests. It refuses if you have uncommitted changes rather than merging over
them, and tells you how to set them aside.

**Your `.env` and your database are never touched.** Both are ignored by git, so
every update leaves them exactly as they were. That is why the token only has to
be typed once, and why the connections, datasets and views you build in the
studio survive every change to the code.

---

## Day to day

| | |
|---|---|
| `npm run dev` | Run it — <http://localhost:5173> |
| `npm run doctor` | What it is pointed at, and whether any of it answers |
| `npm run refresh` | Pick up changes and rebuild |
| `npm test` | The test suite on its own |
| `npm run build -w server && node demo/build.mjs` | Rebuild the single-file demo |

The startup banner prints what the running Hub is actually pointed at — data
source, database, sign-in mode, whether writes are on. Read it rather than
assuming; it is the fastest way to catch a `.env` that did not load.

### Signing in as different people

`AUTH_MODE` defaults to `dev` on a laptop, which turns on the account switcher
at the bottom left of the sidebar. That is how you see the view follow whoever
is signed in — and it is exactly what must not be on anywhere other people can
reach. The server refuses to start in `dev` mode with `NODE_ENV=production`.

---

## When something is wrong

**Run `npm run doctor` first.** It answers most of it.

| What you see | What it usually is |
|---|---|
| A sheet reads `403` | The sheet is not shared with the token's account |
| A sheet reads `404` | The id is wrong — check the number in the sheet's URL |
| The token reads `401` | Wrong or revoked, or the wrong region — try `SMARTSHEET_API` |
| Everything unreachable | Network, VPN or a proxy — not the token |
| `.env` changes do nothing | The server was already running; restart it |
| A page is empty but the doctor is clean | The sheet is right but a **column title** does not match — see below |

### Column titles

The Hub maps sheet columns by title, in one place: the `COLUMNS` object at the
top of `server/src/data/smartsheetSource.ts`. Real sheets rarely match the
defaults on the first try.

This is the one part of pointing it at real data that is a **code change**
rather than a setting. Either edit those strings yourself and push, or send the
column headings and have them changed for you — which keeps one source of truth
and is usually quicker.

Statuses and event types are matched loosely, so "In Progress", "Writing" and
"Draft" all land on the same status without anything being edited.

---

## Where things live

| | |
|---|---|
| `.env` | Your credentials. Gitignored, and must stay that way. |
| `hub.db` | Your studio connections, datasets, views, notes. Gitignored. |
| `env.example` | The template, with every setting documented. No real values. |

Neither of the first two is ever in a commit, in a backup of the repository, or
in anything handed to anybody else.
