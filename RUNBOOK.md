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

```bash
npm run configure
```

It asks for each setting in turn and writes it in, which avoids the one thing
that catches everybody: every line of the file ships commented out, and a key
typed onto a line that still starts with `#` is a key in a comment. The Hub
reads nothing and it looks exactly like a wrong credential.

Return leaves a setting alone, so running it again to change one line is safe.
A token is typed without appearing on screen and is never printed back.

Or open `.env` in an editor and do it by hand. Every line is commented out;
uncomment and fill in the ones you need. Add them **a few at a time** and run
`npm run doctor` after each round — that is the whole point of the doctor.

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

It is refused outright while `SMARTSHEET_CONTENT_SHEET_ID` names more than one
sheet. A write addresses a row by its Smartsheet row id, and a row id is unique
within its sheet rather than across sheets — so with 2026 and 2027 both
configured there is nothing in the address saying which is meant. The startup
banner says so in words rather than failing later on somebody&rsquo;s edit.

Everything else is a read. This is the one line that lets the Hub write back,
and it is worth turning on only once you have watched it read your real sheets
correctly for a few days. Until then you can exercise the same screens against
the sample data with `SEED_WRITES=1`.

---

## Once, to move the Hub&rsquo;s own tables to Postgres

This is about the Hub&rsquo;s own tables &mdash; notes, sign-ups, saved views, studio
connections, the log of every write attempted. It is **not** about where the
schedule comes from: that is `DATA_SOURCE`, it stays `smartsheet`, and nothing
in this section changes what the commissioning managers or the subbing teams
see. Smartsheet remains the system of record throughout.

Nothing needs building. `server/src/db.ts` has opened either engine behind one
interface since the store was written, every query is plain SQL with `?`
placeholders, and `HUB_DB_URL` is the switch. What follows is pointing it.

**1. Start the database.**

```bash
docker compose up -d
```

Postgres 17, on port **5433** of this machine rather than 5432 &mdash; a Homebrew
Postgres already holds 5432, and the failure when both run is not a refused
connection. It is a successful one, to the wrong database, reporting that none
of the Hub&rsquo;s tables exist.

**2. Point the Hub at it.** One line in `.env`:

```
HUB_DB_URL=postgres://hub:hub-local-only@localhost:5433/hub
```

The password is in `docker-compose.yml` and is not a secret. The port is bound
to localhost, so nothing outside this machine can reach it.

**3. Check it answers.**

```bash
npm run doctor
```

The Database line now connects rather than repeating the address back at you.
Before the first boot it says the database is empty, which is correct &mdash; the
schema is created by `CREATE TABLE IF NOT EXISTS` on startup and there is no
migration step. After a boot it says how many tables it found.

**4. Run it.**

```bash
npm run dev
```

The startup banner names Postgres. Make a note on a row, sign up for a
workshop, save a view &mdash; then stop the server and look:

```bash
docker compose exec db psql -U hub -d hub -c '\dt'
```

**What you have not brought with you.** A fresh Postgres is empty. The notes,
sign-ups and studio views in `data/hub.db` stay in `data/hub.db`; switching
`HUB_DB_URL` does not copy them and switching it back finds them all still
there. That is the safe way round, and it is also the thing to be deliberate
about before this becomes the real database rather than a trial of one.

**To go back**, comment the line out. The SQLite file was never touched.

**To start over**, `docker compose down -v` &mdash; the `-v` removes the volume and
therefore everything in it.

---

## Once more, to read the schedule from a local copy

Separate from the section above and worth doing after it, not instead of it.
That one moved the Hub&rsquo;s own tables; this one changes where the Hub *reads the
schedule from* &mdash; and it changes nothing at all about where the Hub writes.

```
DATA_SOURCE=mirror
MIRROR_SYNC_MINUTES=10
```

Everything else stays as it was: the same token, the same sheet ids, the same
`SMARTSHEET_WRITE`. The mirror is a Smartsheet source with a copy in front of
it, so it takes all the same settings.

**What changes.** The Hub pulls all ten sheets into `mirror_rows` at boot and
every ten minutes after, and serves pages from that. Reads stop costing a round
trip to Smartsheet, so a page that needs the schedule, the team and the
calendar stops making three rate-limited requests to another company&rsquo;s API. If
Smartsheet is down, the Hub keeps working on the copy it has.

**What does not change.** Smartsheet is still the system of record. Every write
still goes to the sheet through exactly the path it went through before &mdash; the
subbing teams and everyone else in the sheets see a change the moment a manager
applies it, the same as today. The mirror has no write path at all, by
construction rather than by policy.

**The one read that is never mirrored** is the check that guards a write. The
preview asks Smartsheet directly, every time. Answering it from a copy would
compare the sheet against a ten-minute-old picture of itself, which is a
concurrency check that passes while somebody else&rsquo;s edit sits unread &mdash; and a
concurrency check that always passes is not a concurrency check.

**The cost, stated.** A page can be up to `MIRROR_SYNC_MINUTES` behind. Set it
lower if that matters; the sheets are read once per pull whatever the number
is. The freshness page (admin, or turned on for everybody) now shows two ages
per read &mdash; the sixty-second request cache, and the age of the copy beneath it.
Two numbers rather than one, because reporting only the first would answer
&ldquo;how fresh is this&rdquo; with the smaller and more flattering of the two.

**To try the shape of it without a token**, `MIRROR_UPSTREAM=seed` mirrors the
sample schedule instead. Useful for seeing the boot banner, the freshness page
and the write path behave before pointing it at anything real.

**To go back**, put `DATA_SOURCE` to `smartsheet`. The mirror tables are left
where they are and are ignored; nothing needs dropping.

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

A mapping may carry the Smartsheet column id as well as the title:

```ts
submissionDate: { title: "Sub Date", id: "4400551722174340" },
```

The title is still tried first, because it is the form that works on every
sheet &mdash; a schedule kept one sheet per year resolves in 2027 by the name it
shares with 2026. The id is the safety net underneath: rename the column and
the title stops matching, the id still finds it, and the field goes on reading
instead of quietly emptying every row. `npm run doctor -- --columns` says when
that is happening, so the mapping can be corrected while it is a one-line
change. A Google Sheet has no column ids, so there the title is all there is.

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
