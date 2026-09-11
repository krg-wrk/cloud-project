# Forecasters Hub

A web app for the forecast team: publication and submission dates, forecast
details, notes, KPIs, leave, public holidays, workshops and shows. Smartsheet
stays the backend for the commissioning managers — the team reads it through
this.

The team publishes many formats now, so the words used throughout are
**forecast** and **content**, not "report".

Built as an npm workspaces monorepo: React (Vite + TypeScript) client, Node
(Express + TypeScript) server.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173. It runs on built-in sample data, so there are no
credentials to set up first.

## What's in it

| Page | URL | What it's for |
| --- | --- | --- |
| Today | `/` | The viewer's own deadlines, what publishes next, clashes |
| Deadlines | `/deadlines` | Filterable table of every commissioned forecast |
| Calendar | `/calendar/2026-09` | Month grid of submissions, publications, sessions and the diary |
| Forecast | `/content/ss-4013` | One forecast: dates, status, details, notes, peer review |
| Team | `/team`, `/team/ao` | Per-forecaster pages |
| Performance | `/performance` | KPIs per forecaster and across the team, over any time range |
| Trends | `/trends`, `/trends/:id` | All 446 TFDB trend profiles: which are yours, the call on each, which industries still need a score |
| Data | `/data` | The analysis that sits beside the schedule rather than in it |
| Proof Point Library | `/data/proof-points` | 10,235 data callouts matched against every trend profile, with the reasoning and the owner's decision |
| Review proof points | `/data/review` | The deciding half of the same thing: one card at a time, arrow keys, rejection reasons |
| What the Hub tells you | `/notifications` | Your inbox, and which notices reach you by which channel |
| Learning | `/workshops`, `/workshops/ws-201` | The workshop and knowledge-sharing programme, with sign-ups |
| What's on | `/whats-on` | Leave, public holidays, shows |
| Studio | `/studio` | Admin: connect a data source, build views of it, choose who sees them, and change the wording of the built-in pages |
| A built view | `/v/beauty-deadlines` | Anything the studio was pointed at, in any of five layouts |

Every view is addressable, and every filter lives in the query string — so
`/deadlines?forecaster=rc&status=not-started` and
`/calendar/2026-10?forecaster=ao&publications=0` are links you can paste into
Slack and someone else opens the same thing. That's the main thing AppSheet
could not do.

### Getting back

Every page you reach by clicking something has the way back on the page, and
it behaves differently depending on how you got there:

- **Clicked through from inside the Hub.** It goes back one step, which
  returns the list exactly as you left it — filters and scroll position
  included. Rebuilding the address by hand could not do that: the list's
  filters are in its query string and the page you are on does not know them.
- **Arrived on a link somebody sent you.** There is nothing behind you inside
  the Hub, so it becomes an ordinary link to the list the thing belongs to,
  and says so: "Trends" rather than "Back".

`location.key === "default"` is the discriminator — React Router gives the
first entry in a session that key.

The pages that have it: a forecast, a forecaster, a workshop session, a trend
profile, **a single day of the calendar** (back to the month you were
looking at), and **the diary when a calendar event opened it** — leave, a
holiday and a show have no page of their own, so clicking one on the calendar
opens the diary filtered to its kind. That last one only appears when the
calendar sent you: the diary is a sidebar page too, and one opened from the
sidebar should not carry a back button. The calendar's links say where they
came from (`from=calendar`) and the diary reads it; only a known origin is
honoured, never a path out of the query string.

The browser's own back button works everywhere as well, because the address
is real. In the proof point library that includes closing an enlarged proof
point, which is a pushed history entry — whereas changing a filter replaces
one, so typing six letters in a search box does not put six entries behind
you.

## Workshops and knowledge sharing

`/workshops` is the one part of the Hub people write to rather than read.
Sessions carry a kind (workshop, masterclass, lunch & learn, critique,
training), a host, a capacity and a `signUpsOpen` flag:

- **Open sessions** take sign-ups until they fill, then move people onto a
  waitlist. Give up a place and the first person waiting takes it — handled in
  `server/src/signUps.ts`, not in the UI.
- **Required sessions** (`required: true`) have nothing to opt into, so they
  show "everyone is expected" instead of a button.
- **Past sessions** move to "been and gone" with a link to notes or a
  recording where there is one.

Sign-ups persist in the store (see **Data** below), so they survive restarts.

## Branding

WGSN house style: white surfaces, hairline rules, uppercase micro-labels,
squared corners, DM Sans throughout with DM Mono for dates and references.
Colour is the accent rather than the furniture. The accent is Future Dusk —
WGSN and Coloro's Colour of the Year 2025, Coloro 129-35-18 — kept separate
from the semantic reds, ambers and greens that carry status.

Everything visual is tokenised at the top of `client/src/index.css`, so
swapping the palette or the typefaces is a change in one place.

## Data: what lives where, and why

At 200 forecasters this split matters, so it is deliberate:

**Smartsheet stays the schedule.** Commissioning is where the managers work,
and the Hub only reads it. Read-only, cached, no writes.

**Everything the team writes goes in the Hub's own database** — notes,
personal entries, peer reviews, session sign-ups, calendar tokens. Two hundred
people adding notes and moving reminders is thousands of small writes; a
spreadsheet is the wrong shape for that, and Smartsheet's API rate limits
would make it the bottleneck rather than the source of truth.

The POC uses SQLite through Node's built-in `node:sqlite` — no service to run,
a real database with real indexes, and it persists across restarts (`HUB_DB`,
default `./data/hub.db`). Every query in `server/src/store.ts` is ordinary SQL
that moves to Postgres unchanged when the Hub is deployed for the whole team.
That is the one change I would make before rollout: Postgres, so more than one
app instance can serve the team.

## Pointing it at Smartsheet

The server reads through a `DataSource` interface, so the app does not know or
care where the rows come from:

- `server/src/data/seedSource.ts` — the built-in sample schedule (default)
- `server/src/data/smartsheetSource.ts` — the Smartsheet API v2

Switch over with environment variables:

```bash
DATA_SOURCE=smartsheet
SMARTSHEET_TOKEN=...              # a service token, not a personal one
SMARTSHEET_CONTENT_SHEET_ID=...   # the commissioning sheet
SMARTSHEET_EVENTS_SHEET_ID=...    # leave / public holidays / shows
SMARTSHEET_PEOPLE_SHEET_ID=...    # the team
SMARTSHEET_SESSIONS_SHEET_ID=...  # the workshop programme
SMARTSHEET_SIGNUPS_SHEET_ID=...   # one row per person per session
SMARTSHEET_ACCESS_SHEET_ID=...    # who may sign in, and their rights
SMARTSHEET_TRENDS_SHEET_ID=...    # TFDB published trend profiles
SMARTSHEET_METRICS_SHEET_ID=...   # the KPIs being tracked
SMARTSHEET_KPI_SHEET_ID=...       # readings: Metric ID, Person, Date, Value
```

Everything that reaches the outside world is off unless a variable turns it
on, and each one is described where it belongs:

```bash
SMARTSHEET_WRITE=1                # let a manager change the sheet (below)
SMARTSHEET_API=...                # Smartsheet's EU region, or a stub, if needed
GEMINI_API_KEY=...                # AI note drafting; without it the button says so
NOTIFY_SCHEDULE=1                 # let notifications send themselves
NOTIFY_HOUR=8                     # the hour they go, local time
NOTIFY_EMAIL_URL=...              # a Workspace relay taking {to, subject, text}
NOTIFY_CHAT_WEBHOOK=...           # the team's Google Chat space
HUB_URL=https://forecasters...    # so a notice can carry a link people can click
```

Column titles are mapped in one place — the `COLUMNS` object at the top of
`smartsheetSource.ts`. Change those strings to match the real sheets rather
than editing the mapping code. Statuses and event types are normalised with
loose matching (`normaliseStatus`, `normaliseEventType`), so "In Progress",
"Writing" and "Draft" all land on the same status.

Sheet reads are cached for 60s (`CachedDataSource`) to keep page loads quick
without going stale while someone is looking at a corrected date.

## Changing the sheet from the Hub

Everything else the Hub does with the schedule is read-only: Smartsheet is
where the commissioning managers work and the Hub reads it. This is the one
exception, and it is the only thing in the Hub that edits somebody else's
system — so it is built as narrowly as it can be.

**Five columns.** Status, submission date, publication date, **Actual
Submission** and the commissioning note. These are the things the team learns
*after* a row is created and currently retypes into Smartsheet by hand; the
last one is what the timeliness KPIs measure, and why they could not be
computed. Who writes it, which vertical, which season — those are
commissioning's to set, and there is no code path here that can reach another
column.

**Off unless you turn it on.** `SMARTSHEET_WRITE=1`. Without it the source
reports no write capability at all, so there is no object to call and the API
refuses before it builds a request. The seed source never has one. Switching
it on reads the sheet at startup, so a write flag set against a sheet the
token cannot see fails at boot with a message rather than the first time a
manager presses Apply.

**Managers and admins only**, and a manager only in a vertical they oversee.
A forecaster cannot change even their own row — they can still say whatever
they need to in a note.

**Two steps, always.** Pressing *Review the change* asks the server what
would happen and writes nothing; it comes back as the cells that would
change, named by their real column titles:

```
This will change 2 cells on Commissioning schedule (sheet 614183…), row 901:
  Status              In progress  →  Submitted
  Actual Submission   empty        →  24 Sept
```

Only *Apply to the sheet* changes anything, and it sends that description back
with the change so the two cannot disagree.

### Two vocabularies, kept apart

The Hub reads "Writing", "Delivered" and "Live" as `in-progress`, `submitted`
and `published`, because different sheets word them differently. That means
there are two languages in play, and mixing them up breaks things quietly:

- **What a person sees** is the Hub's own wording, because that is what the
  rest of the Hub says.
- **What is compared against the sheet** is read off the sheet. The
  concurrency check re-reads the row and refuses if it no longer matches what
  the confirmation was worked out against — and a check that compared
  `in-progress` to "Writing" would refuse *every* write, which is a bug whose
  obvious fix is exactly the wrong one.
- **What gets written** is one of the *sheet's own picklist options*, found by
  normalising each option and matching it to the status wanted. The Hub never
  invents a value the column would reject.

Building this turned up a real bug in the reading code, which had been there
from the start: `normaliseStatus` tested for "live" before "delivered", and
"de**live**red" contains it — so a delivered forecast was read as a published
one, and every timeliness figure computed from it was wrong. Fixed, with a
test over every status word the sheets use.

### It keeps its own history

Smartsheet has cell history and the Hub is taking a slice of that work off it,
so `schedule_writes` records every attempt: who, when, which row, which cells,
from what to what — and the refusals, because a failed write with no trace is
worse than no write. The forecast page shows it under the panel.

**Not verified against the live API.** Nothing here has touched a real
Smartsheet: `api.smartsheet.com` is blocked from the environment this was
built in. In its place, `npm test -w server` runs the writer against a stubbed
API and asserts the things that must never happen — a write with the flag off,
a write outside the five columns, a write over somebody else's edit, a status
the picklist would reject — and the whole path was driven end to end against a
local stand-in for the API: preview, refusal, apply, the cells that landed,
the Hub re-reading them, and the log. Before pointing it at the real sheet,
try it on a copy.

`SMARTSHEET_API` sets the API base, because Smartsheet is regional — a
European account is served from `api.smartsheet.eu`, and pointing a UK team's
Hub at the US endpoint either fails or moves their data across a border
nobody chose.

## Sign-in and access

The Hub reads the signed-in account and filters itself accordingly — a
forecaster opens it and sees their own work, a commissioning manager sees the
team.

**In production** (`AUTH_MODE=proxy`): put SSO in front — Google via IAP, or
Okta — and it passes the verified address on a header. The app never handles a
password or a token. Set `AUTH_EMAIL_HEADER` to whatever the proxy uses
(`x-goog-authenticated-user-email`, `x-forwarded-email`,
`x-auth-request-email`). `AUTH_MODE=dev` refuses to start in production.

**In dev** (`AUTH_MODE=dev`, the default): an account switcher in the sidebar
picks who you are, so the Hub runs with no identity provider.

Rights come from the **access sheet** (`SMARTSHEET_ACCESS_SHEET_ID`):

| Email | Name | Role | Verticals | Active |
| --- | --- | --- | --- | --- |
| graham.krag@wgsn.com | Graham Krag | admin | All | yes |
| elena.roux@wgsn.com | Elena Roux | commissioning-manager | Beauty, Kidswear | yes |

Only exceptions need a row. Anyone on the team sheet who is absent from it gets
an ordinary forecaster's view; anyone signed in who is on neither sheet sees
nothing, which is the safe default for a leaver. `Active: no` removes access
without deleting the row.

Permissions are in `server/src/auth.ts`, one function per decision, and the
server checks them on every write — the UI only decides what to draw.

- **Notes**: the forecaster on the forecast, a manager for that vertical, an admin
- **Peer reviews**: either side of the arrangement, a manager in scope, an admin
- **Personal entries**: only their owner, including admins

## Forecast details

The schedule comes from Smartsheet. The details the team fills in on a
forecast are the Hub's (`forecast_details`), and either the forecaster or a
commissioning manager for that vertical can set them:

- **Content type** — the format. The sheet's value is the default; this
  overrides it, and the field accepts a format that isn't on the list yet.
- **Years being forecast** — one year, or a span like 2028–2029. Separate
  from season, which is the publishing cycle.
- **Content Editor** — the ID and/or a link into our authoring tool.
- **Research links** — as many as needed, each with a label.

Only `http(s)` links are stored, checked server-side: these render as anchors,
so `javascript:` and `data:` are a way in and are refused with a plain message.

## Trends

`/trends` is the trend database as a forecaster needs it: the profiles they own
or are credited on, what the strategic call is on each, and which industries
are still waiting for a score. `/trends/:id` is one profile.

The data is the real thing. All **446 profiles** from the TFDB workbook's
`Trend Profiles` tab are in the repository (`server/src/data/tfdb.json`) — 343
published, 103 not, 49 archived in Content Editor. The workbook's `Governance`
tab (the trend request and approval pipeline) and its eight `Import <date>`
snapshots are not read.

Because the sheet is Snowflake-linked, the Hub reads it and never writes to
it. The columns it reads:

- **Identity** — `TREND_ID` (the short number the team quotes), `ID` (the
  Content Editor document id), `TITLE`, `TREND_URL_SLUG`.
- **Two links, both direct.** `LINK` opens the profile in Content Editor;
  `PUBLISHED LINK` opens it on the live site. Both are on the page as buttons,
  which is the "straight through to the editor" the team asked for.
- **`MAIN_COVER_IMAGE_URL`** — the lead image, on the platform's media host.
  It is embedded on the card and at the top of the profile.
- **`TREND_TYPES`** — Design & Aesthetic, Lifestyle, Product / Item, Systemic.
  A profile can carry several, so these are read against the known vocabulary
  rather than split on whitespace: "Design & Aesthetic Systemic" is two types,
  not four words.
- **`MORE_LABELS`** — the strategic call: Protect, Test, Expand, Invest. Often
  not set yet, and the page says "No call yet" rather than guessing one.
- **`START_DATE` / `END_DATE`** — the window the trend is called for. Three
  profiles have no window and simply do not show one.
- **`Trend Profile Owner`, `Authors`** — credited by display name, not by an
  id, so the Hub derives an id from the name (`nameId`) and matches a signed-in
  person by their name as well as their person id. 48 people own a profile.
- **`Published`, `RE Status`** — whether the profile is live on the platform,
  and where it is in Content Editor (draft, review, archived). The page shows
  this as one pill and offers it as a filter, because "my drafts" is a real
  question.
- **`Latest Score Month`** — one line per industry where the profile is scored
  per industry, a single `ALL - YYYY-MM` where it is not. Rendered as it comes.
- **`Trend Opportunity`** — the long write-up. It is the most useful thing on a
  profile, so the profile page renders it in full; the list does not carry it.
- **`NUMBER_OF_STRATEGIES`, `NUMBER_OF_PROOF_POINTS`** — the counts the KPI
  sheet also tracks.
- **`TAGGED_PRODUCTS`, `Industries Scored`, `Industries Missing Score`** — what
  the profile is tagged to and where its scores stand. An unscored industry is
  the most actionable thing on the page, so it is flagged on the card, counted
  in the header, filterable on its own, and called out on the profile.
- **The label groups** — generations, markets, regions, age ranges, personas,
  emotions, CMF, design aesthetics, packaging, sustainability, ingredients.

### What the Hub adds

The profile is authored in Content Editor and scored elsewhere. What the Hub
owns is small and clearly separated (`trend_extras`): the owner's working
note, supporting material they gather, and a cover image for when the sheet
has none. The Hub's cover image wins over the sheet's, because the owner set
it more recently than the sync.

Writing is limited to the profile's owner, anyone credited as an author, a
commissioning manager whose verticals overlap the profile's industries, and an
admin — checked server-side on the write, not just hidden in the UI.

### Cover images

A cover lives on the platform's media host, so it needs the network. The
stand-in is therefore the floor rather than a replacement: every cover sits on
a gradient keyed to the trend's own id, and a linked image simply covers it.
A missing image and one that failed to load say which they are. In the
published demo none of them load, which is exactly the case the stand-in is
for.

An image address is rendered in an `<img>` and a link in an anchor, so both go
through the same http(s)-only check as a research link — a `javascript:` or
`data:` address is refused with a message rather than dropped silently.

## Data: the Proof Point Library

A trend profile asserts something about the world. A **proof point** is a data
callout that backs it up — a survey figure, a search-volume rise, a catwalk
count — and finding them by hand is the slowest part of writing a forecast.

The matching runs outside the Hub, and it is a separate piece of work: every
data callout is embedded, the closest are reranked against the trend's own
description, and then two models score each candidate independently without
seeing the other's answer. Where they agree, and how strongly, is the **tier**:

| Tier | What it means | How many |
| --- | --- | --- |
| A | Both models agree, and both scored it high (85–98) | 4,666 |
| B | Both models agree (70–85) | 4,589 |
| C | Both agree, but neither was confident (60–70) | 400 |
| D | One model only, scoring it very high (90–98) | 580 |

That output — 10,235 suggestions across 357 trends — is what `/data/proof-points`
reads. It started as an Apps Script proof of concept, so the controls are the
ones the team has already learnt: the three-way **match quality** (top is A and
D, mid adds B, all adds C), the industry and forecast chips, and toggles for
approved-only, WGSN's own data, and hiding what a profile already cites. A
search box over the callout text and the reasoning is new, because ten
thousand cards without one is not browsable.

Each card is the proof point **as it would appear in the forecast** — the
pipeline pre-renders it, donuts and all — scaled down and faded at the cut.
Clicking one enlarges it, with both models' reasoning side by side, the other
trends it matched, the forecast it came from, and its source. **Copy as text**
puts the plain-text version on the clipboard, which is what pastes into
Content Editor with the figure, the context and the attribution intact.

`/data` is a section rather than a page because more analysis is coming, and
because a forecaster looking for evidence should not have to know which
project produced it.

### The controls hold still

The first cut put all of it in one wrapping bar: seven groups, fifteen chips,
two hundred and sixty pixels of controls before a single proof point. And the
chip rows were faceted down to whatever had results, so clicking one changed
how many chips there were and the row reflowed under the cursor — the next
chip you were about to click had moved.

Three things fix it, and the third is the one that matters:

- **Two tiers.** The four controls people reach for — whose trends, which
  trend, search, match quality — are one row. The industry and forecast chips
  and the three show-toggles are behind a disclosure that carries a badge
  saying how many are on. Whatever is set also shows as a **removable pill**
  above the results, because the failure mode of hiding filters behind a
  button is not knowing one is narrowing the page. Eighty-three pixels
  instead of two hundred and sixty, and two rows of proof points on screen.
- **Atomic groups.** The row is flex with every group fixed-width and
  non-wrapping, so a group either fits on a line or moves to the next one
  whole — the three match-quality buttons can never break across two lines
  with their label stranded above them. Both selects have a width of their
  own, because a `<select>` sizes itself to its widest option and the options
  change with the filters.
- **Every chip, always, with its count.** A chip that would return nothing
  stays on the row and reads zero, greyed and unclickable. Removing it is
  what moved its neighbours. The counts are computed against the *other*
  filters, not the chip's own — with Beauty chosen the industry chips still
  say what Interiors instead would give you — and they are abbreviated to
  three characters (`4k`) in a fixed box, because "4,493" is four characters
  wider than "0" and that alone was enough to slide a row along. The exact
  figure is in the tooltip.

The disclosure's open state is kept per person in `localStorage` rather than
in the address: it is a preference about someone's own screen, not part of
the view, so a link you send opens the library you meant and not your idea of
a tidy panel.

### The trend is the Hub's, not the pipeline's

All 357 trends in the library are in the Hub's own trend database under the
same id, so the Hub is the authority on every one of them. Title, industries
and ownership are read from there, and the pipeline's copy is used only for a
trend the Hub has never heard of.

That matters twice. One of the 357 has already been renamed since the matching
last ran — the sheet still says "Anatomy of Cute", the Hub says "All Things
Cute" — and the Hub's name is the one people will recognise. And ownership in
the sheet is an address typed into a column, which cannot answer "does *this*
viewer own it", cannot see co-authors, and goes stale; read through the Hub,
**my trends** in the library means exactly what **Mine** means on the Trends
page.

A forecaster lands on their own trends and a manager on the whole library, but
the server has the last word: asking for your own trends when you own none of
them would be an empty page every time, so it gives you everyone's and the
response says which filter it actually applied.

### The markup is rebuilt, not filtered

Each proof point arrives as HTML, and the library injects it into the page —
the thing you must not do with markup you did not write. Two of its
ingredients are model output and one is the callout's own text, so none of it
is trustworthy enough to inject as-is.

So `sanitiseProofPointHtml` rebuilds it. Every tag, attribute and class is
checked against a list of what a proof point actually contains — sixteen tags,
the SVG presentation attributes, twenty-one classes — and anything else is
**dropped**, not escaped, not partially cleaned. A `<script>` cannot survive
that, and neither can an `onclick`, a `style`, a `javascript:` href, or a tag
nobody has thought about yet. Unclosed tags are closed and misnested ones
ignored, so a broken proof point cannot leave the page's own markup open.

Two deliberate rewrites: a link is re-emitted with `target="_blank"` and
`rel="noopener noreferrer"` whatever the source said, and a root-relative href
— a fifth of them, because the pipeline ran inside WGSN's own site — is
resolved against `https://www.wgsn.com` rather than pointing at the Hub.

It runs once at boot, over all 10,235, so no path to the client skips it.
Running it over the whole corpus drops **nothing**: no tag, no attribute, no
class is lost, and no output contains a script, an event handler or a
`javascript:` URL.

The library is held in memory rather than in a database: the file is written
by a pipeline that runs weekly, nothing edits it through the Hub, and every
filter is a scan over ten thousand small objects. Repopulate it with
`python3 tools/extract-proof-points.py <the workbook>`.

### What the demo carries

All 10,235 rendered proof points are 22 MB of markup, and the shareable demo
has to be a single file under 16 MB — so it takes 627 of them: every decided
one, plus a fixed stride through the rest, which keeps the spread across
tiers, trends, industries and forecast years. The markup is sanitised at build
time by the same function, because there is no server to do it on the way out.

The proof points do not follow the demo's dark theme. The pipeline draws its
donuts and gauges with colours baked into the SVG, so on a dark ground the
figures would disappear; a proof point is an artefact made for a white slide
and is shown as one in both themes, like an image.

### Deciding: the review queue

The library is the read side. Without the other half every suggestion reads
"in review" for ever, and the 10,235 never go down. `/data/review` is that
other half, and it is deliberately not a table:

**One card at a time, best match first.** The figure as it will appear, both
models' reasoning beside it, the tags, the other trends it matched, and links
to the forecast it came from and to the trend in the Hub. Everything needed to
decide, and nothing needed to decide about anything else.

**Two keys.** Right approves, left rejects, `U` takes back the last one. A
reviewer doing forty of these is looking at one place on the screen and
pressing one of two keys, so the actions sit at the same spot whatever the
card holds. The keys are ignored while a box has focus — the trend picker's
own arrows still change the trend — ignored with a modifier, ignored on a
card that is not yours to decide, and not named at all on a touch screen.

**Left asks why.** Rejecting offers six reasons, the ones the proof of concept
used, plus *skip the reason*. It is optional because asking twice for
something optional is how a queue stops being used, but it is worth having:
"too weak or vague" and "better for another trend" are different problems and
only one of them is the matching's fault.

**Undo, singular.** The last decision only. Undo is for the card you have this
second got wrong; a stack of them would need a history the reviewer cannot
see. It survives being asked why about the *next* card, because being asked a
question should not cost you the answer to the last one.

Already-cited suggestions never enter the queue. A queue that opens with two
hundred things a profile already says teaches a reviewer to ignore it.

#### Who may decide, and where it is kept

The same rule as writing anything else against a trend profile: its owner,
anyone credited on it, an admin, or a manager whose verticals overlap its
industries — `canWriteTrend`, reused rather than reinvented. The page hides
the buttons and says whose trend it is; the server refuses in words and writes
nothing, because a hidden button is not a permission check.

Decisions are held in the Hub's own store, **laid over** the extract rather
than written into it. The extract carries the state as of the last pipeline
run and is replaced wholesale every week; where both have an opinion the Hub's
wins. That is the point — nobody wants to review ten thousand suggestions
again because a pipeline ran. An undo can only take back a decision the Hub
holds, which is also why the row says which it is.

## How fresh is any of this

Three clocks feed the Hub and none of them was visible anywhere. The schedule
is cached for a minute, so a date somebody corrected in Smartsheet can be that
stale. The trend profiles are an extract TFDB stamps itself — currently a
fortnight old. The proof points are an extract from a workbook a pipeline
writes weekly. Silent staleness is the failure mode nobody spots, and "it says
the wrong date" is the bug report you get instead of it.

`/studio/freshness` reports all of it: what the Hub has read this session and
how long each read has left, the extracts and when they were generated, and
where a write would go. Two kinds of age, kept apart — a cached read is
seconds old and about to be taken again; an extract is as old as the last time
somebody generated it, and no amount of refreshing changes that.

**Admins only to begin with.** It is a diagnostic, and the wording will want
tuning once somebody has read it in anger. An admin can turn it on for
everybody, and then one quiet line appears at the foot of every page saying
how old the schedule is — useful when the team is working against a date that
has just moved, noise the rest of the time. The endpoint refuses rather than
returning a blank, so a forecaster's Hub has nothing there rather than a
control they cannot use.

The switch lives in `hub_settings`, a key/value table for the handful of
things that belong to the Hub rather than to a person. An untouched setting
has no row, so the code's own default ships and adding one needs no migration
— the same arrangement the page wording uses.

## One box over everything

The Hub grew six places to look something up and no place to look everything
up. A forecaster who half-remembers a title had to guess which page it lived
on first, which is the sort of thing software is supposed to do for you.

**⌘K, Ctrl-K, or a plain `/`** — and there is a box in the sidebar for people
who would rather click. It searches forecasts (titles, formats, verticals,
forecasters, notes), trend profiles (titles, descriptions, need-to-knows,
industries, hashtags, owners), people, sessions and their topics, the proof
point library's ten thousand callouts, and any view built in the studio.

No page of its own. A search is a way to get somewhere, not a destination,
and a results page you then have to leave is one step more than anybody
wants. Arrow keys walk the list, Enter opens, Escape closes and puts focus
back where it was.

### How it ranks

- **Word-wise, not substring.** "vision womens" finds *The Vision S/S 28:
  Womenswear Key Items*, which is how people actually half-remember a title.
  Every word has to appear somewhere, so more words narrow rather than widen.
- **The title is worth six times the body.** Somebody typing "quiet kitchens"
  wants the thing *called* that, not the four others that mention it — and a
  match at the start of a title beats one in the middle.
- **Capped per kind, then grouped into blocks.** The best hit decides which
  kind leads, and once a kind starts it finishes. A flat sort interleaves
  kinds wherever scores tie, and the page then draws the heading "Forecasts"
  twice, which reads as a bug however honest it is about the ranking.
- **Ties go to the nearer date, not the alphabet.** Searching a forecaster's
  name matches everything they write equally; the one closest to its deadline
  is the likely reason you typed it.
- **Proof points are ranked down.** They have no titles — the "title" is the
  callout's own sentence — so every match is a body match, and there are ten
  thousand of them. Somebody searching a trend name wants the trend first and
  the evidence under it second. A hit links into the library with itself
  already open.
- **A body match explains itself**, with the phrase it was found in. A title
  match needs no explanation.

An archived earlier version of a live trend profile is left out: it is the
same title twice, and only one of them is the one people want.

It runs on the server, because the corpus is 40,000 rows once the proof
points are counted and none of it belongs on a phone — the answer is a few
kilobytes whatever the query, and comes back in 15–45ms. The one thing
filtered per viewer is a studio view, by the same audience rule the sidebar
uses: nobody should be able to discover a view they cannot open.

In the demo the same ranking runs in the page, because there is no server and
the whole corpus is already there.

## Telling people things

The Hub is a website, and a website only tells you something while you are
looking at it. The two things this team actually misses are a deadline
creeping up and the week starting without a plan, and both of those are known
on the server days in advance.

So there are three kinds of notice, and no more — every extra one is another
reason for somebody to turn the whole thing off:

| Kind | When | What it says |
| --- | --- | --- |
| The week ahead | Monday morning | What is due from you this week, what publishes, who you are peer reviewing, what you signed up for, what is already overdue |
| Deadlines coming up | Three days out, on the day, then daily | One forecast, its status, and its publication date |
| Proof points waiting on you | Weekly, above five | How many suggestions your trends have waiting |

### The forecaster chooses

Not an admin, and not a global switch. Some of this team lives in Google
Chat, some in email, and some want the bell in the corner and nothing else.
`/notifications` is a grid — the three kinds down the side, three channels
across — because "email me about deadlines but leave the digest in the Hub"
is the preference most people actually have, and one switch per channel
cannot express it.

**The default is the bell and nothing that leaves the building.** Somebody who
has never opened the settings gets the in-app notices, which cost them
nothing and cannot arrive at 3am. Email and chat are opt-in, both because
they interrupt and because they are the two that send WGSN's schedule to a
third party.

Each channel says, in words, what it can do:

- **In the Hub** always works. It is a row in the Hub's own database, shown on
  the bell beside the wordmark and in full on the page.
- **Email** goes through an HTTP endpoint — `NOTIFY_EMAIL_URL` — that takes
  `{to, subject, text}`. Not SMTP: WGSN runs on Google Workspace, so the short
  path to an address that will not be marked as spam is a ten-line Apps Script
  web app calling `MailApp.sendEmail`. That also keeps the mail credentials
  out of the Hub entirely — the Hub holds a URL, the script holds the right to
  send as WGSN.
- **Google Chat** posts to an incoming webhook, which is how Chat works.
  `NOTIFY_CHAT_WEBHOOK` is the team's space; a forecaster can paste their own
  space's webhook instead, and it is **checked against
  `https://chat.googleapis.com/`** before it is stored. Without that check the
  field would be a way to have the server POST the team's schedule anywhere.

Unconfigured is said rather than hidden. A forecaster who ticks email before
an admin has wired the relay up gets nothing, and the reason is on their own
settings page — which is the difference between a setting and a promise.

### Nothing is said twice

Every notice carries a stable **key**: `ao:deadline:ss-4013:today` is the same
notice whether the run happens at 8am or at noon, and a digest keys on the
week rather than the day. `notification_sends` is unique on key plus channel,
so a schedule that fires twice on a Monday sends one digest. A *failure* is
recorded too and replaces an earlier failure, so a webhook that comes back to
life next week gets another go while one that succeeded is never asked again.

Overdue is the exception: the key carries the date, because being a week late
is a different fact from being a day late — one notice a day, each said once.

Nobody is nudged while they are on leave, or on a public holiday for their
own region. A nudge you cannot act on teaches you the Hub knows nothing about
you.

### It sends nothing unless told to

`NOTIFY_SCHEDULE=1` turns on a check every fifteen minutes against the wall
clock — deadline notices daily at `NOTIFY_HOUR` (8 by default), the digest on
Mondays. No cron, no queue, no dependency, and the send log makes it safe to
re-run. A wall-clock check rather than a timer counting from boot, because a
service that restarts at 08:55 every morning would otherwise never send the
9am digest.

Off by default, for the same reason writing to Smartsheet is: it acts on the
world with nobody pressing anything, and a proof of concept that mailed two
hundred people because somebody ran it on a laptop would be the last time the
team trusted it.

`/studio/notifications` is the other half. **The preview is the default** —
`POST /notifications/run` builds every notice, works out where each would go,
and sends nothing; only `?send=1` sends. The wrong way round would mean one
mistyped URL mailing the team. An admin can also run it as if it were another
date, which is how you look at a Monday digest on a Wednesday. Under it is the
log, which answers the question an admin actually gets: "I ticked Google Chat
and nothing arrived."

The rules live in `server/src/notify/build.ts` and are pure — `World` in,
notices out — so what gets said is tested without a database, a clock or a
webhook. Twenty-eight tests cover it, including the two mistakes that matter:
telling somebody about a deadline twice, and telling them about one that is
not theirs.

## Scoring a trend

The Trends page has always badged "3 to score" and then offered no way to do
it — surfacing work it could not accept. Scoring happens in the team's own
tool, so the Hub now links there: from the callout on a profile, and from each
industry that wants one.

That turned up something in the data. TFDB keeps "Industries Scored" and
"Industries Missing Score" as separate columns, and the second is **not** the
inverse of the first — `missingScore` is exactly `needingScore − scored` on
all 446 profiles, and **177 of them are tagged to an industry TFDB is not
asking for a score on**. The grid was calling those "No score", which reads as
a gap, and offering to score them would send people to do work nobody wants.
So there are three states now: scored, wanted (with the link), and *not asked
for*.

The two columns also use different vocabularies — "Overall" and "Fashion"
appear in the score columns and never in the industry tags — so the grid lists
the union of what is tagged and what is asked for. A score the sheet wants is
no longer invisible because it happens not to be a tag.

## KPIs

`/performance` reports on a forecaster over any range, and — for commissioning
managers — compares one metric across the team.

The metric set follows the Content KPIs sheet. Two kinds, and the split
matters:

**Derived** — worked out from the schedule and store the Hub already holds, so
they are live now:

- *Output*: forecasts owned (sole + co-owned), solely owned, co-owned, byline
  contributions, freelance commissioned, published
- *Tier mix*: Tier 1 / 2 / 3 counts, read from the format via the taxonomy
- *Timeliness*: submitted on time, average days late, late submissions
- *Team*: peer reviews given, sessions attended

**Supplied** — from a sheet or feed maintained elsewhere. The shape is fixed
and the page says "Awaiting data" until the numbers arrive: editor late, qual
of quant, DEI commitments, AI projections, AI usage, VAS (Salesforce),
additional client calls, marketing/internal talks, awards, and the H2 TFDB
metrics (proof points, trends, trend profiles owned).

Adding a supplied metric is a row in the metrics sheet. Adding a *derived* one
is a row plus a function in `server/src/kpis.ts`, because it has to know how to
compute itself.

### Read against the role, not against zero

Output metrics carry the average for the person's grade — Director, Head Of,
Senior, Strategist — from `ROLE_BENCHMARKS` in `server/src/taxonomy.ts`. The
figures are half-year averages, so they are pro-rated to the window on screen:
a Head Of benchmark of 12 over half a year shows as 10.6 over 161 days. A count
on its own says very little, which is why the sheet keeps a role average column
at all.

### Tiers come from the format

`server/src/taxonomy.ts` holds the full content taxonomy — 72 formats across
Tier 1 (Decide), Tier 2 (Understand) and Tier 3 (Track). A forecast's tier
follows from its format, so **nobody tags a tier by hand**; the Hub looks it
up. A format not yet in the taxonomy returns no tier rather than a wrong one.

The taxonomy is also what the format filter and the details panel offer, via
`GET /api/taxonomy` — one list, one place to update.

### Which way is good, and where the scale stops

Every metric carries its own direction, and some carry a ceiling as well as a
target:

- **Delays: zero is the target.** Average days late, late submissions and
  editor late all target `0`. They are counted as delays, not as lateness
  against a grace period, so there is no number of days that counts as fine.
- **100% is a ceiling, not a stretch.** Qual of quant targets 100% and is
  capped at 100%, so the tile reads "Target 100%" with no "or better" after it
  and the chart leaves no room above the line. DEI, AI projections and AI usage
  are capped the same way.
- **AI projections are a share of the total content made** in the period, not
  of a subset.

`ceiling` on a metric definition is what carries this: it caps the chart scale
and drops the "or better" wording. Chart scales otherwise step in whole units
and round up to meet one, so a maximum of 7 gives gridlines at 0, 2, 4, 6, 8
rather than 1.8, 3.5, 5.3 — a tick is only worth drawing where it lands on a
figure someone counts in.

### One metric is explicitly not a KPI

The sheet marks "% of AI used in reports" as *not a KPI*. That is carried
through: `notKpi: true` on the definition, and the tile says "Tracked, not a
KPI" so nobody reads it as a target.

Ranges: this quarter, last quarter, year to date, last 6 and 12 months, or a
custom window (which switches to quarterly buckets past ~18 months so the bars
stay readable). Every figure is shown against the preceding window of equal
length, and whether a change is good news depends on the metric's own
direction, not its sign — "average days late" going up is bad.

Charts are single-measure by design, so there is no categorical palette to get
wrong: one hue throughout, with a lighter step of the same hue for
de-emphasised bars. Both steps were checked for contrast (≥3:1 on the surface)
and separation (15+ ΔE, including simulated colour-vision deficiency), every
team bar carries its value as text, and a table view sits behind the charts.

Timeliness needs the sheet's **Actual Submission** column — without it the Hub
knows when copy was *due* but not when it *arrived*. The derived timeliness
metrics read the seed's `submittedOn` today; `editor-late` is supplied,
because it is counted against the editor's dates rather than the Hub's.

### What is not in this repo

The KPI sheet holds real staff names, addresses, grades, individual ratings and
client names. **None of that is copied into this repository or the demo.** The
seed data uses invented forecasters, and the Hub reads the real team, grades
and departments from the sheet at run time. What has been taken from that
sheet is structure only: the column names, the metric definitions, the tier
taxonomy and the role benchmark figures.

The TFDB profiles are the exception, and deliberately so: the trend data was
supplied for exactly this, and the profiles are published editorial work
rather than anything about a person's employment. So the profiles, their
owners' and authors' names, their scores and their cover image addresses are
in the repository. Two of the sheet's columns are not, because they are
neither editorial nor needed:

- **`Modified By`** — staff email addresses.
- **`Latest Comment`** — internal working notes on a profile.

The `Governance` tab is not read at all. It is a request-and-approval pipeline
carrying pitch notes, approval decisions and per-person workflow, none of
which the Hub needs to show a profile.

## The studio

The reason the team has not left AppSheet is that a manager can point it at a
sheet and build a view for a group of people without waiting for anyone. This
is that, at `/studio`, admin-only, in three steps in the order you do them.

**1. Connections** — where data comes from. Two of them read today:

- **This Hub's own tables.** The schedule, the team, the events, the
  workshops, the KPIs and the 446 trend profiles, already loaded, no
  credential. It exists so the studio can be used on the first visit instead
  of waiting for a token, and because a view over the commissioning schedule
  is a thing people will actually want.
- **Smartsheet.** Any sheet **or report**, by id, with an API token. Test says
  what came back in words you can act on: a refused token, a sheet not shared
  with the token's account, and a blocked network read differently, because
  they need different fixes.

Google Sheets, MongoDB and Snowflake are modelled with the settings each will
need, and every one of them reports "not wired up yet" rather than failing
quietly. Snowflake in particular is not urgent: TFDB already reaches the Hub
through the Smartsheet sheet it feeds.

**2. Datasets** name one table out of a connection and read its columns. That
step is what makes the builder quick — once the columns and their types are
known, every field picker downstream is a list rather than a name to
remember, and a filter on a column with 40 or fewer distinct values offers
those values as a picker.

### A column is its id, not its title

A dataset's columns carry two things: a **key**, which is what a view's spec
binds to, and a **name**, which is what people see. For Smartsheet the key is
the column's own id; for a report it is the report's `virtualId`, because a
report's cells are addressed by that and not by the underlying sheet's column
id. The name is refreshed every time the columns are read.

So renaming "Submission Date" to "Copy due" in Smartsheet, or dragging it to
the other end of the sheet, changes the label everywhere in the Hub and breaks
nothing. Re-reading the columns is what picks the new title up. The studio
shows the id under the title whenever the two differ, so a rename is visibly a
change of label rather than of identity. Datasets saved before this existed had
the title as the key; they keep working, and reading their columns again moves
them onto ids.

**A sheet of a few thousand rows is read in full.** The API pages at 500, so
the reader follows `totalPages` and keeps asking until it has everything — six
requests for the team's 3,000-row sheets. There is a 20,000-row cap so one
enormous sheet cannot exhaust the server's memory; a dataset that hits it is
marked `truncated`, and the studio says "read was capped" beside the row count
rather than implying it has the lot.

**3. Views** are what people see. A view is a dataset, a layout, a mapping of
which column carries what, some filters, and an audience:

| Layout | What it is |
| --- | --- |
| Table | Every column, dense. A working list you scan. |
| Cards | A tile each, with a picture if the sheet has one. |
| List | One line each, with a date down the side. |
| Calendar | A month grid from a date column, with a month stepper. |
| Board | Columns grouped by a value — a status, an owner, a stage. |

Ten filter operators, including **`is me`**, which resolves against whoever is
signed in — so "my deadlines" is one view rather than one per forecaster. It
matches a name, an email or an id, and handles a cell holding several of them.

The builder previews the real rows through the same component that renders the
view for everyone else, so there is no second renderer to drift out of step. A
`mine` filter previews against the admin, and the page says so rather than
letting it read as a bug.

A view is addressable at `/v/<slug>` and appears in the sidebar, in whichever
group it was given, beside the hand-written pages — because to the person it
was built for there is no difference between the two. A draft is visible to
admins only, so one can be built in the open.

### Credentials go one way

The `secret` column is never in a select list that feeds a response. The
connectors read it straight from the store, and the client is only ever told
that a credential is set and its last four characters. Two ways to supply one:

- **An environment variable, by name.** The recommended one: it keeps the
  credential out of the database and out of any backup of it.
- **Pasted into the studio.** For trying something out. Editing a
  connection's label does not touch it; an empty string clears it.

A Smartsheet ref is checked against `^(sheet|report):\d{6,25}$` (or a bare id)
before it goes anywhere near a URL, so a stored dataset cannot make the server
fetch an arbitrary address. Settings whose key looks like a credential
(`token`, `secret`, `password`, `key`) are dropped rather than stored in the
open.

### Who sees what is decided on the server

`canSeeView` runs for the sidebar listing and for the view itself, so a slug
someone was forwarded is not a way round the audience rule. An admin sees
everything including drafts; everyone else needs the view live and either the
role rule, the vertical rule, or their address named on it. A forecaster
opening a manager-only view gets a plain refusal, and it is not in their
sidebar.

### What is not verified

The Smartsheet reader has not run against the live API. `api.smartsheet.com`
is blocked by the egress policy of the environment this was built in, so it
cannot be. Standing in for that, `npm test -w server` runs the reader against
a stubbed API that serves the shapes Smartsheet documents, and checks the
seven things that would otherwise only fail in production:

- a ref names a sheet or a report and nothing else — a URL, a path, a short
  number and an empty string are all refused;
- all six pages of a 3,000-row sheet are read, each asking for 500;
- a renamed and moved column keeps its key and updates its name;
- a report reads through `/reports/…` and keys on `virtualId`, with a contact
  column typed as a person;
- a column with no cell on a row reads as empty rather than missing;
- 25,000 rows against the cap is cut, flagged `truncated`, and still reports
  the source's real size;
- a refused token, a blocked network and an unshared sheet produce three
  different messages.

The tests run against `server/dist`, so they exercise what actually ships.
Everything else — the store, the query layer, the whole studio UI, and the Hub
connector reading all seven tables — was exercised end to end.

## Changing the built-in pages

The studio covers views you build. This covers the pages that ship. Every
heading, field label, table column and navigation item across Navigation,
Today, Deadlines, a forecast, Trends and a trend profile — 87 of them — can be
renamed, and most can be hidden or reordered.

Two ways in, because they suit different moments:

- **Edit on the page.** An admin toggles it and every label in the app becomes
  something you click and retype. You notice a heading reads wrong while
  looking at it, and you fix it there. A bar along the bottom says you are in
  the mode and how to leave it, because a mode you cannot tell you are in is a
  trap.
- **The built-in pages** tab in the studio. The same set in one searchable
  list, and the only place things are hidden, reordered, or reset — per page or
  altogether.

### How it holds together

`client/src/lib/slots.ts` declares every slot with its default wording. The
pages read from it and the editor lists it, so the two cannot drift: a heading
not in the registry is not editable, and one that is appears in the editor
with nothing else to wire up.

The defaults stay in code. `studio_slots` holds only what an admin changed, so
an untouched slot has no row, the shipped wording is what ships, and adding a
heading needs no migration.

Pages that were a fixed run of markup are now compositions. The
content-detail sections, its stages and its facts panel; the trend-detail
sections and facts; the deadlines columns; the trends figures — each renders
from its registry group in the admin's order, so hiding a column drops it from
the head and the body together, and a fact the sheet has not set stays off the
panel regardless.

Three things that would otherwise bite, handled:

- **A rename does not un-hide.** A patch leaves out what it does not mention,
  so each field is independent. An empty rename resets that one field to the
  default rather than leaving a blank heading.
- **Reordering writes the whole group.** Explicit positions for every item,
  because a group where some have an order and others do not sorts
  unpredictably the next time one moves.
- **A label is untrusted text.** React escapes it in the app; the demo builds
  HTML by hand, so it escapes it explicitly — a label of
  `<img src=x onerror=...>` renders as those characters and does not run. That
  matters in the demo especially, where the store is shared with everyone
  looking at the page.

Not everything on a page is a slot. A status word comes off the sheet, a
person's name is their name, and a date's format is a decision rather than a
label — changing those is editing data or writing code, not renaming. A
sidebar item is renamed from the list rather than in place, because it is an
anchor and a button inside one would swallow the click that navigates.

Edit mode is admin-only and survives a reload, since the natural way to use it
is to turn it on and then go to the page that reads wrong — including by
pasting its address.

### In the demo

The standalone demo carries the same studio, with two honest differences.
There is no server, so a Smartsheet connection says it cannot hold a token or
make the call rather than pretending; and "This Hub's own tables" reads the
data inlined in the page, which is the same shape the real reader returns. A
view built in the demo is saved to the artifact's shared store, so it is there
for everyone else looking at the page, and it has an address you can send. The
same is true of the wording: rename a heading in the demo and everyone on that
page sees it. The demo declares 71 slots rather than 87, because a few of the
app's standfirsts are not in its markup.

## The calendar

### Month, week or day

Three views, switched from a row under the filters — the filters decide what a
period contains, so they read first. The view and the date are both in the
URL, so any of them is a link:

| View | URL |
| --- | --- |
| Month | `/calendar/2026-11` |
| Week | `/calendar/2026-11-11?view=week` |
| Day | `/calendar/2026-11-06?view=day` |

Prev/next steps by whatever is on screen — a month, a week, a day. Switching
view keeps you on the same date rather than jumping back to today, and
switching from a month to its week skips the week that is mostly the month
before, which is a jarring thing to land on.

**Clicking a date opens that day on its own**, and an entry on it opens the
piece — the same `/content/:id` page a deadline row opens, with the same
forecast details, notes and peer review. A workshop opens the session; leave
and holidays have no page of their own, so they open the diary filtered to
that kind. A month cell has room for three entries and a "+n more" that opens
the day, so nothing is ever unreachable. A week cell is five times taller, so
it shows everything.

Anything running over more than a day — leave, a holiday closure, a show, a
multi-day reminder — is drawn **once**, as a bar across the days it covers,
rather than repeated as an identical chip in each of them. Bars are packed
into as few lanes as will hold them, and one that runs past the edge of the
week is clipped with a chevron rather than simply stopping as though the event
had. The lane maths is in `client/src/lib/spans.ts`.



### On a phone

The **whole month fits**, all six weeks and seven columns, with nothing to
scroll sideways for. It fits because below 860px the entries stop being labels
and become markers: one coloured bar per entry, in the same colours the legend
uses, and a multi-day thing still drawn as one bar across its days. There is
no room for a title in a 50px column, and a month you have to scroll sideways
is not a month you can read — so the grid shows *when* things are and the day
view says what they are. Tapping anywhere in a cell opens that day, since a
4px marker is not a tap target; the markers themselves are inert so they never
swallow the tap.

The week view keeps its labels at that width — one row instead of six means
there is room for them.

The page header and filters are tightened on a phone too, so the calendar
itself is not pushed below the fold.

Navigation does change. The sidebar is replaced by a fixed bar at the bottom
of the screen — Today, Deadlines, Calendar and Trends as tabs, with the rest
behind **More** — so every section is at most two taps away and within reach of
a thumb. Badges become dots.

## Icons

One set, in `client/src/lib/icons.tsx`, mirrored by hand into the demo. A
24×24 grid, stroked in `currentColor` with no fills, so an icon takes the
colour and weight of the text beside it and needs no per-theme variant. Every
icon stands for one thing — a section, a status, a kind of diary entry — and
is presentational: the label beside it carries the meaning, and `label` is
passed only where an icon stands alone.

## Notes, reminders and peer reviews

- **Notes** on a forecast (`content_notes`), with edit and delete.
- **AI notes** — `POST /api/content/:id/notes/draft` builds a prompt from the
  forecast's own context (type, vertical, season, dates, existing notes, what else
  is commissioned in that vertical) and returns a draft. It is **not saved**:
  it lands in the box for the forecaster to edit and keep, and anything kept
  stays labelled as an AI note with the model recorded. The key lives on the
  server only (`GEMINI_API_KEY`, `GEMINI_MODEL`); with no key the button
  returns a clear "not switched on" message. The house brief for the drafts is
  one string at the top of `server/src/ai.ts`.
- **Personal entries** (`personal_entries`) — reminders, focus time,
  milestones. Private to the person, and they ride along in the calendar feed.
- **Peer reviews** (`peer_reviews`) — one reviewer and a date per forecast. It
  appears in both people's calendars and **either of them can move or remove
  it**, as can a manager for that vertical. A forecast cannot review itself and a
  review after publication is refused.

## Google Calendar

Each forecaster gets a private feed URL (`Add to your calendar` in the Hub) and
subscribes to it once in Google Calendar (`Other calendars → From URL`),
Outlook, or on their phone. It carries their submission and publication dates,
peer reviews either side of, sessions they signed up to, their own reminders,
and the holidays for their region.

It is one-way, and Google decides how often to re-read a subscribed feed —
usually hours. Good for deadlines that move occasionally; wrong for anything
that must appear instantly. Two-way sync would need the Calendar API and
per-user OAuth, which is a much larger piece of work and a bigger ask of IT.

The token in the URL is the credential, so the feed is readable by anyone who
has the link — as subscribable feeds are everywhere. It is rotatable from the
same page.

## The shareable demo

`demo/` holds a standalone single-file version of the same views — data inlined,
hash routing, no server — for showing the idea to people who can't run the app.
It's what gets published as an Artifact.

```bash
npm run build -w server && node demo/build.mjs   # writes demo/forecasters-hub.html
```

Edit `demo/hub.template.html` and rebuild; the schedule comes from the same
seed module as the app, so the two never drift apart.

## Scripts

- `npm run dev` — API on :3001 and the client on :5173 together
- `npm run build` — builds both
- `npm start` — runs the built server; with `NODE_ENV=production` it also
  serves the built client, with a catch-all so deep links survive a refresh
- `npm test -w server` — the Smartsheet reader against a stubbed API, and the
  proof point library and its sanitiser
- `node demo/build.mjs` — rebuilds the shareable single-file demo
- `python3 tools/extract-proof-points.py <workbook.xlsx>` — regenerates the
  proof point seed from the Proof Points Reviewer workbook
