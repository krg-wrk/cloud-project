# Cloud Project

A React (Vite + TypeScript) + Node (Express + TypeScript) webapp, set up as an
npm workspaces monorepo.

## Structure

- `client/` — React frontend (Vite, TypeScript). Dev server proxies `/api` to the backend.
- `server/` — Node backend (Express, TypeScript). Serves the API on port 3001 by default.

## Getting started

```bash
npm install
npm run dev
```

This starts the API server (http://localhost:3001) and the Vite dev server
(http://localhost:5173) together. The client proxies `/api/*` requests to the
server, so open http://localhost:5173 in your browser.

## Other scripts

- `npm run build` — builds both the server and the client for production.
- `npm start` — runs the built server (run `npm run build` first).
