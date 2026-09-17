# The Forecasters Hub

A reading surface over WGSN's trend-forecasting work. Smartsheet stays the
system of record; this replaces *people opening Smartsheet*. React client,
Express/TypeScript server, SQLite or Postgres for what the Hub owns itself,
and a single-file demo built from the same seed data.

`README.md` is the long argument for every decision. This file is what you need
before changing anything.

---

## Commands

```bash
npm run setup     # first run: node check, install, .env, build, test
npm run dev       # client :5173, server :3001
npm run doctor    # what this machine is pointed at, and whether it answers
npm run refresh   # pull, rebuild, re-test
npm test          # server (283) then client (11)
npm run lint      # client only — nothing lints the server
npx tsc -p client/tsconfig.json --noEmit    # client typecheck
npm run build -w server && node demo/build.mjs   # rebuild the demo
```

`npm run build -w server` *is* the server typecheck; `npm test -w server` runs
it first, so a type error fails the tests.

Node 22 is a floor, not a preference — `node:sqlite` needs it, and the client
tests rely on Node reading TypeScript directly.

---

## Where a change belongs

One path, five stops, and no second path:

```
component → client/src/lib/api.ts → vite proxy → viewerMiddleware
          → a createXRouter in server/src/index.ts
          → DataSource (sheets, read) or HubStore/StudioStore (own tables)
```

- **Every server module exports `createXRouter(...deps)`**, never a singleton.
  A new area is a new file exporting one, added to the single `app.use("/api",
  …)` list in `server/src/index.ts`.
- **Every route body is `try { … } catch (err) { next(err) }`.** One error
  handler at the foot of `index.ts`. No per-route formatting.
- **The client never calls `fetch`.** `useApi` to read, `send` to write,
  `getJson` outside a component's lifetime, `assetUrl` for `<img>`, `query()`
  for query strings. All add the `/api` prefix, so paths must not.
- **Filters live in the query string**, never component state. Every view is a
  linkable address — that is the thing AppSheet could not give us.
- **Dates are `YYYY-MM-DD` strings, compared as strings.** Deadlines are
  calendar days, not instants. Never put a `Date` in the domain model.

### Studio, or a hand-written page?

The fixed pages — Today, Deadlines, Calendar, Trends — are written by hand
because their behaviour is specific and worth getting exactly right. The studio
covers everything else: an admin points at a sheet and builds a view for a
group of people without a deploy. A new *kind* of page is code; a new view over
a sheet is not, and should not become code.

---

## How to write here

The house voice is consistent and load-bearing. Getting it wrong is the most
visible way a change looks foreign.

**Comments are prose, and they argue.** A `/** */` block above every exported
thing, saying why it exists and naming the alternative that was rejected along
with the failure it avoids. There are ~1,199 of them and **zero** `@param`,
`@returns` or `@throws` — types are already in the TypeScript. A block goes
*after* the imports, not above them.

> The confirmation is the point. A form that saves on click would be quicker
> and would also, once, quietly overwrite a manager's Friday afternoon.

Never restate the code. `// loop over rows` appears nowhere.

**British English, including in identifiers** — `colour`, `behaviour`,
`sanitise`, `recognise`, `grey`. Zero American variants outside what the web
platform forces (`color:`, `text-align: center`).

**`rather than` is the signature construction** (850 uses): "held as data rather
than code", "reports the shape rather than the value". Also "deliberately", "on
purpose", "the point", and the corrective "X is not a Y, it is a Z".

**Third person, present tense, never first person.** The actor is *the Hub* or
*somebody*. Em dashes throughout; `…` not `...`; in JSX, `&mdash;` `&rsquo;`
`&hellip;`.

**UI copy is sentence case and full sentences.** Errors name what happened, in
domain words, ending in a full stop — no codes, no "Error:", no exclamation
marks. `"Nothing to change — the sheet already says that."` Empty states say
what is there and what to do next. Every `aria-label` is a human sentence.

**Commits**: subject is a capability in the user's voice, no prefix, no ticket
(`Let a studio view accept edits`). Body is hard-wrapped prose arguing the
design, one paragraph per decision, naming what was rejected.

**Test names are lowercase sentences stating the guarantee**, usually with a
because-clause: `"the longest name wins, so naming one person does not notify
another"`. Never `should`, never a function name.

---

## Invariants

Things the code deliberately protects. Breaking one is a bug however good the
refactor looks.

1. **Read-only unless a deployment says otherwise**, and the check is for a
   capability, not a name: `if (!data.writes)`. Never branch on `source.name`
   or `instanceof` in a route. `SMARTSHEET_WRITE=1` for real sheets,
   `SEED_WRITES=1` for the sample data.
2. **Exactly five columns of the commissioning sheet are writable**
   (`WRITABLE_FIELDS`), and there is no code path to a sixth. The bulk route is
   built on the single-row route for that reason.
3. **A write addresses a row by `sourceRowId`, never by `id`.** `id` is the
   team's Content ID — a label, not a location.
4. **Every outward write is preview-then-apply, with `expect` echoed back
   untouched.** The preview re-reads the source; the apply refuses if any
   changed column is missing from `expect`. Rebuilding `expect` from current
   form state would compare a value against itself and always pass.
5. **Two vocabularies, kept apart.** What a person is shown is the Hub's words
   (`in-progress`); what is compared against the sheet is the sheet's
   (`Writing`). Comparing the two would make the concurrency check decorative.
6. **Credentials never appear in a response.** `studio_connections.secret` is
   in no select list that feeds one; `secretFor(id)` is the only way out. A
   client is told `hasSecret` and the last four characters.
7. **Seeing a view and writing through it are separate permissions.**
   `canSeeView` waves an admin through; `canEditView` deliberately does not — a
   builder's convenience is not the same promise as writing to a live sheet. An
   empty role list means *everybody* on an `Audience` and *nobody* on an
   `EditRule`.
8. **The server decides what is editable**; the client draws `ViewPage.editable`
   and nothing else.
9. **The schema only ever grows.** `CREATE TABLE IF NOT EXISTS` on boot is the
   whole migration story. Nothing alters a table — so new configuration goes in
   an existing JSON column, a `hub_settings` row, or a new table.
   `view_writes` is a sibling of `schedule_writes` for exactly this reason.
10. **Every write attempt is recorded, refusals included.** A failed write with
    no trace is worse than no write.
11. **Nothing is notified twice** — `UNIQUE (notice_key)`, and
    `notification_sends` keyed by key+channel. The whole schedule is off unless
    `NOTIFY_SCHEDULE=1`. The one exception is an @ mention, which goes as the
    note is saved.
12. **One `ViewRunner`, and therefore one dataset cache, in the process.** Two
    would mean two answers to "what does this sheet say" — the table in
    somebody's inbox disagreeing with the one on their screen.
13. **A view that is emailed is run once per recipient, as that recipient**, and
    a person can only subscribe themselves. Posting one person's rows to another
    is the thing this must never do.
14. **`AUTH_MODE=dev` refuses to start with `NODE_ENV=production`.**
15. **Anything a client sends is rebuilt field by field**, never spread. A
    `tone` the client invented is dropped: the palette carries meaning.

---

## Traps

These are silent. Each has bitten somebody.

- **Server tests run out of `dist/`, and each directory is copied by an
  explicit `cp` line** in `server/package.json`. A test in a *new* subdirectory
  is never run, and CI stays green with zero tests executed for it. Put new
  tests in `studio/`, `data/`, `notify/`, `lab/`, `proofPoints/` or the `src`
  root — or edit both the `build` and `test` strings.
- **Every store method is `async`, a missing `await` typechecks, and a Promise
  is always truthy.** Real bugs of this family: a permission flag that let
  everybody into an admin page; `CHANNELS.filter(async …)` passing every
  channel, twice, in different files. None of them threw. Exercise the surface.
- **`server/src/api.ts` contains literal control characters** (the saved-view
  path sanitiser). Plain `grep` calls it a binary file and prints nothing — use
  `grep -a`. A careless rewrite silently destroys that regex.
- **Three files are hand-maintained mirrors**: `client/src/types.ts` mirrors
  `server/src/types.ts`; `client/src/lib/icons.tsx` and `client/src/lib/spans.ts`
  are kept in step with `demo/hub.template.html` by hand. Nothing checks them.
- **The demo is a second, hand-written implementation of the whole app**
  (`demo/hub.template.html`, ~20k lines) and nothing keeps it in sync. Its only
  gate is that the script *parses* — a runtime error ships. Decide deliberately
  whether a feature belongs there: write-back features are not mirrored,
  because a static file has nowhere to write to.
- **`demo/build.mjs --live` writes a different file** from the default and is an
  internal document — the real schedule and the real team. Never near git.
- **A studio view binds to `Field.key`, not `Field.name`.** For Smartsheet the
  key is the column id, so renaming a column is safe. For the Hub's own tables
  the key *is* the name, so renaming a field on a `server/src/types.ts`
  interface silently empties every view built on it.
- **Two caches, and a write must clear both**: `CachedDataSource` (60s, keyed by
  table name) and `DatasetReader` (per connection+ref). `forget()` on the first
  accepts only four of its ten keys — widen the type if you add a write.
- **`index.ts` checks `instanceof SmartsheetSource` on the raw source**, before
  it is wrapped in `CachedDataSource`. Downstream code gets the wrapper. Ask for
  a capability rather than a concrete type.
- **The JSON body limit is 100KB except one path, matched by exact string.** A
  new image endpoint silently gets 100KB and fails with a 413 that reads as a
  server fault.
- **Every route under `/studio/` must call `requireAdmin(req, res)`.** One
  router serves both the runtime and admin surfaces.
- **SQL must run unchanged on SQLite and Postgres.** `?` placeholders only. No
  `AUTOINCREMENT`, no `PRAGMA`, no `INSERT OR IGNORE` (use `ON CONFLICT … DO
  NOTHING`). A parameter compared only to NULL has no inferable type in
  Postgres — omit the clause instead. Every `ORDER BY` on a tied column needs a
  tie-break. Normalise booleans in the row reader: SQLite gives 0/1, Postgres a
  real boolean.
- **`.env` is loaded relative to `server/`** (`--env-file-if-exists=../.env`),
  and the root `package.json` has its own for `doctor`. Two places to fix.
- **`useRemembered` and `useAppearance` carry an intentional
  `eslint-disable react-hooks/exhaustive-deps`.** Do not "fix" them — depending
  on the object directly loops.

---

## Proving it works

Node's built-in runner, `node:assert/strict`. No Jest, no Vitest, no jsdom.
Server tests are `.test.mjs` importing from `dist/`; the one client test is
`.test.mts` importing the source directly. Do not mix the conventions.

There is no HTTP-level or component test anywhere. New logic has to be factored
into exported, testable functions — the way `readIds`, `cleanPath`, `copyName`,
`toneFor`, `mailFor` and `findMentions` are — or it cannot be tested the way
this repo tests things.

Tests are written as **the things that must never happen**. `write.test.mjs`
and `editing.test.mjs` are the model: no write unless the deployment asked, no
write outside the allowed columns, no overwrite of somebody else's edit, no
credential in a message.

Smartsheet is unreachable from CI and from the cloud sandbox, so those paths are
proved against a stubbed `globalThis.fetch` serving the shapes the API
documents. Google Sheets *is* reachable, and those tests skip themselves when
the network is absent.

CI runs server tests, the client typecheck, lint, the client build, the demo
build and `npm audit`. **It does not run the client tests** — run `npm test` at
the root yourself.

For a UI change, `node tools/audit-a11y.mjs --demo` and `--demo --dark` check
accessible names, labels and contrast. Needs Playwright, which is deliberately
not a dependency.

---

## Where the sensitive things are

| | |
|---|---|
| `.env` | Credentials. Gitignored (`.env`, `.env.*`, `*.env`). Never read it into a conversation. |
| `hub.db` | Studio connections, datasets, views, notes. Gitignored. |
| `demo/forecasters-hub-live.html` | The real schedule and team. Gitignored, internal. |
| `directory.json` | 150 colleagues and their addresses. Gitignored. |
| `env.example` | The template. No real values — keep it that way. |

Everything that reaches outside the building is off until a variable turns it
on: Smartsheet writes, the notification schedule, email, Google Chat, AI
drafting. That is the stated principle, and a new outward-reaching feature is
expected to follow it.
