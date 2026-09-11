/**
 * A stand-in for the email relay, so notifications can be proved without
 * sending anybody an email.
 *
 *   node tools/stub-relay.mjs                    # listens on :4111
 *   NOTIFY_EMAIL_URL=http://localhost:4111 npm run dev
 *
 * Then run the notifier from the studio (/studio/notifications). The preview
 * is the default and sends nothing; the send button posts here instead of to
 * Workspace, and every message is printed and kept.
 *
 * Why this exists: the one thing that cannot be tested against the real
 * thing is "does it send". Pointing the Hub at a relay that only prints
 * gives the whole path — prefs, the don't-say-it-twice key, the send log,
 * the admin's view of what went — without a single message leaving the
 * building.
 *
 *   GET /sent    every message it has been given, as JSON
 *   GET /refuse  answers 403, to see how the Hub reports a relay that says no
 *
 * Nothing here is part of the product: no dependencies, no storage, and it
 * forgets everything when you stop it.
 */

import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4111);
const seen = [];

const relay = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    if (req.url === "/sent") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(seen, null, 2));
      return;
    }

    // The failure worth rehearsing: a relay that answers, and says no. The
    // Hub should show the reason in the send log rather than "it didn't work".
    if (req.url === "/refuse") {
      res.writeHead(403, { "content-type": "text/plain" });
      res.end("relay says no: that address is not in the domain");
      return;
    }

    try {
      seen.push(JSON.parse(body));
    } catch {
      seen.push({ unparsed: body });
    }
    const { to, subject } = seen[seen.length - 1] ?? {};
    console.log(`relay <- ${to ?? "(no to)"} — ${subject ?? body.slice(0, 80)}`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
  });
});

// Usually the last one, still running in another terminal. A sentence beats
// a stack trace for something this ordinary.
relay.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Something is already on port ${PORT} — probably a relay you left running.`);
    console.error(`Stop it, or start this one somewhere else:  PORT=4112 node tools/stub-relay.mjs`);
    process.exit(1);
  }
  throw err;
});

relay.listen(PORT, () => {
  console.log(`stub relay on http://localhost:${PORT}`);
  console.log(`  point the Hub at it:  NOTIFY_EMAIL_URL=http://localhost:${PORT}`);
  console.log(`  what it has been given:  http://localhost:${PORT}/sent`);
});
