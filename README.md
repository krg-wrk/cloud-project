# Forecasters Hub

A web app for the forecast team: publication and submission dates, leave,
public holidays, workshops and shows. Smartsheet stays the backend for the
commissioning managers — the team reads it through this.

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
| Deadlines | `/deadlines` | Filterable table of every commissioned piece |
| Calendar | `/calendar/2026-09` | Month grid of submissions, publications, sessions and the diary |
| Content | `/content/ss-4013` | One piece: dates, status, where it is, who owns it |
| Team | `/team`, `/team/ao` | Per-forecaster pages |
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

- **Notes**: the forecaster on the piece, a manager for that vertical, an admin
- **Peer reviews**: either side of the arrangement, a manager in scope, an admin
- **Personal entries**: only their owner, including admins

## Notes, reminders and peer reviews

- **Notes** on a forecast (`content_notes`), with edit and delete.
- **AI notes** — `POST /api/content/:id/notes/draft` builds a prompt from the
  piece's own context (type, vertical, season, dates, existing notes, what else
  is commissioned in that vertical) and returns a draft. It is **not saved**:
  it lands in the box for the forecaster to edit and keep, and anything kept
  stays labelled as an AI note with the model recorded. The key lives on the
  server only (`GEMINI_API_KEY`, `GEMINI_MODEL`); with no key the button
  returns a clear "not switched on" message. The house brief for the drafts is
  one string at the top of `server/src/ai.ts`.
- **Personal entries** (`personal_entries`) — reminders, focus time,
  milestones. Private to the person, and they ride along in the calendar feed.
- **Peer reviews** (`peer_reviews`) — one reviewer and a date per piece. It
  appears in both people's calendars and **either of them can move or remove
  it**, as can a manager for that vertical. A piece cannot review itself and a
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
