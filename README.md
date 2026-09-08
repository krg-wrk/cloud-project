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
| Trends | `/trends`, `/trends/:id` | Published trend profiles from TFDB: which are yours, the call on each, which industries still need a score |
| Learning | `/workshops`, `/workshops/ws-201` | The workshop and knowledge-sharing programme, with sign-ups |
| What's on | `/whats-on` | Leave, public holidays, shows |

Every view is addressable, and every filter lives in the query string — so
`/deadlines?forecaster=rc&status=not-started` and
`/calendar/2026-10?forecaster=ao&publications=0` are links you can paste into
Slack and someone else opens the same thing. That's the main thing AppSheet
could not do.

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

Column titles are mapped in one place — the `COLUMNS` object at the top of
`smartsheetSource.ts`. Change those strings to match the real sheets rather
than editing the mapping code. Statuses and event types are normalised with
loose matching (`normaliseStatus`, `normaliseEventType`), so "In Progress",
"Writing" and "Draft" all land on the same status.

Sheet reads are cached for 60s (`CachedDataSource`) to keep page loads quick
without going stale while someone is looking at a corrected date.

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

The columns are the **TFDB - Published Trend Profiles** sheet's own, which is
Snowflake-linked, so the Hub reads it and never writes to it:

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
- **`START_DATE` / `END_DATE`** — the window the trend is called for.
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
client names. The TFDB sheet holds real profile authors, owners and comments.
**None of that is copied into this repository or the demo.** The seed data uses
invented forecasters and invented trend profiles, and the Hub reads the real
team, grades, departments and profiles from the sheets at run time. What has
been taken from the sheets is structure only: the column names, the metric
definitions, the tier taxonomy, the role benchmark figures, the trend types,
the Invest/Test/Expand/Protect calls, the industry list and the label
vocabularies.

## The calendar

Anything running over more than a day — leave, a holiday closure, a show, a
multi-day reminder — is drawn **once**, as a bar across the days it covers,
rather than repeated as an identical chip in each of them. Bars are packed
into as few lanes as will hold them, and one that runs past the edge of the
week is clipped with a chevron rather than simply stopping as though the event
had. The lane maths is in `client/src/lib/spans.ts`.

A day cell has room for three single-day marks. The day number and the
"+n more" both open a panel listing everything on that day in full, so nothing
on the calendar is unreachable — and every content item there goes to the same
`/content/:id` page a deadline row does, so the piece looks the same whichever
way you arrive at it.

### On a phone

A seven-column month grid at 390px gives each day about fifty pixels, which is
one letter of a title. So below 860px the month becomes an **agenda**: days in
order, each item with its icon and what it is, and multi-day things shown once
on the day they start with the date they run to.

Navigation switches too. The sidebar is replaced by a fixed bar at the bottom
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
