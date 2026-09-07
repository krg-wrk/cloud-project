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

Sign-ups live in `SignUpStore`, which is **in memory for the POC** — restart
the server and they reset. Pointing it at a sign-ups sheet (one row per person
per session: Session ID, Person, State) is the only change needed to make them
stick; the routes and the UI don't care where the rows live.

## Branding

WGSN house style: white surfaces, hairline rules, uppercase micro-labels,
squared corners, DM Sans throughout with DM Mono for dates and references.
Colour is the accent rather than the furniture. The accent is Future Dusk —
WGSN and Coloro's Colour of the Year 2025, Coloro 129-35-18 — kept separate
from the semantic reds, ambers and greens that carry status.

Everything visual is tokenised at the top of `client/src/index.css`, so
swapping the palette or the typefaces is a change in one place.

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
```

Column titles are mapped in one place — the `COLUMNS` object at the top of
`smartsheetSource.ts`. Change those strings to match the real sheets rather
than editing the mapping code. Statuses and event types are normalised with
loose matching (`normaliseStatus`, `normaliseEventType`), so "In Progress",
"Writing" and "Draft" all land on the same status.

Sheet reads are cached for 60s (`CachedDataSource`) to keep page loads quick
without going stale while someone is looking at a corrected date.

## Sign-in

Not wired up yet. For the POC there is a **Viewing as** switcher in the sidebar
so you can see the Hub as any forecaster, and `?as=ao` works as a URL. The real
version should read the signed-in user from Google SSO and show the switcher
only to commissioning managers.

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
