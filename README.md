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
| Calendar | `/calendar/2026-09` | Month grid of submissions, publications and the diary |
| Content | `/content/ss-4013` | One piece: dates, status, where it is, who owns it |
| Team | `/team`, `/team/ao` | Per-forecaster pages |
| What's on | `/whats-on` | Leave, holidays, workshops, shows |

Every view is addressable, and every filter lives in the query string — so
`/deadlines?forecaster=rc&status=not-started` and
`/calendar/2026-10?forecaster=ao&publications=0` are links you can paste into
Slack and someone else opens the same thing. That's the main thing AppSheet
could not do.

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
SMARTSHEET_EVENTS_SHEET_ID=...    # leave / holidays / workshops
SMARTSHEET_PEOPLE_SHEET_ID=...    # the team
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

## Scripts

- `npm run dev` — API on :3001 and the client on :5173 together
- `npm run build` — builds both
- `npm start` — runs the built server; with `NODE_ENV=production` it also
  serves the built client, with a catch-all so deep links survive a refresh
