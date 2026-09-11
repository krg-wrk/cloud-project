import { Router } from "express";
import { requirePerson, type ViewerRequest } from "../auth.js";
import type { ProofPointLibrary } from "../proofPoints/library.js";
import type { SignUps } from "../signUps.js";
import type { HubStore } from "../store.js";
import type { DataSource, Person } from "../types.js";
import { Channels, chatWebhookLooksRight } from "./channels.js";
import { runNotifications, summarise } from "./run.js";
import { gather } from "./schedule.js";
import {
  CHANNELS,
  CHANNEL_LABELS,
  KIND_HINTS,
  KIND_LABELS,
  NOTICE_KINDS,
  defaultPrefs,
  type Channel,
  type NoticeKind,
} from "./types.js";

/**
 * Notifications over HTTP: your inbox, your settings, and the run.
 *
 * Everything except the run is a person acting on their own notices, so it
 * needs a person rather than a role — a signed-in account with no team
 * record has no inbox to read. The run is an admin's, because it sends
 * things to other people.
 */

export function createNotifyRouter(
  data: DataSource,
  store: HubStore,
  signUps: SignUps,
  library: ProofPointLibrary,
): Router {
  const router = Router();
  const channels = new Channels(store);

  // The same gathering the schedule does, so a hand-run and an automatic one
  // read exactly the same world.
  const world = (on: string) => gather(data, store, signUps, library, on);
  const today = () => new Date().toISOString().slice(0, 10);

  /**
   * The bell: what this person has been told, and how much of it is new.
   *
   * Polled by the client, so it is deliberately cheap — two indexed queries
   * against the Hub's own database and nothing from the sheets.
   */
  router.get("/notifications", (req: ViewerRequest, res) => {
    const person = requirePerson(req, res);
    if (!person) return;
    res.json({
      unread: store.unreadCount(person),
      rows: store.notifications(person, 40),
    });
  });

  router.post("/notifications/read", (req: ViewerRequest, res) => {
    const person = requirePerson(req, res);
    if (!person) return;
    const id = typeof req.body?.id === "string" ? req.body.id : undefined;
    if (id) store.markRead(person, id);
    else store.markAllRead(person);
    res.json({ unread: store.unreadCount(person) });
  });

  router.delete("/notifications/:id", (req: ViewerRequest, res) => {
    const person = requirePerson(req, res);
    if (!person) return;
    store.deleteNotification(person, req.params.id);
    res.json({ unread: store.unreadCount(person) });
  });

  /**
   * The settings: the grid of kinds against channels, and what each channel
   * can actually do right now.
   *
   * The states come back with the preferences on purpose. A page that offers
   * "email me" without saying whether anything is sending email is a page
   * that produces a support request a fortnight later.
   */
  router.get("/notifications/settings", (req: ViewerRequest, res) => {
    const person = requirePerson(req, res);
    if (!person) return;
    const prefs = store.notifyPrefs(person) ?? defaultPrefs(person);
    res.json({
      prefs,
      /** Whether anything has been saved, so the page can say "the default". */
      saved: Boolean(prefs.updatedAt),
      channels: channels.states(),
      kinds: NOTICE_KINDS.map((kind) => ({
        kind,
        label: KIND_LABELS[kind],
        hint: KIND_HINTS[kind],
      })),
      channelLabels: CHANNEL_LABELS,
    });
  });

  router.put("/notifications/settings", (req: ViewerRequest, res) => {
    const person = requirePerson(req, res);
    if (!person) return;
    const body = (req.body ?? {}) as { on?: Record<string, unknown>; chatWebhook?: unknown };

    const on = { ...defaultPrefs(person).on };
    for (const kind of NOTICE_KINDS) {
      const asked = body.on?.[kind];
      if (!Array.isArray(asked)) continue;
      on[kind] = CHANNELS.filter((c) => asked.includes(c));
    }

    /*
     * The webhook is a URL this person typed, and the Hub will POST the
     * team's schedule to it. So it is checked against Google's own webhook
     * host rather than trusted: without that, the field is a way to have
     * the server send internal data anywhere.
     */
    let chatWebhook: string | undefined;
    if (typeof body.chatWebhook === "string" && body.chatWebhook.trim()) {
      const url = body.chatWebhook.trim();
      if (!chatWebhookLooksRight(url)) {
        res.status(400).json({
          error:
            "That is not a Google Chat webhook. It should start https://chat.googleapis.com/ — copy it from the space's Apps & integrations menu.",
        });
        return;
      }
      chatWebhook = url;
    }

    const saved = store.setNotifyPrefs({ personId: person, on, chatWebhook });
    res.json({ prefs: saved, saved: true, channels: channels.states() });
  });

  /**
   * Send this person their own notices now, whatever has already gone.
   *
   * The one case where saying the same thing twice is the point: somebody who
   * has just ticked "Google Chat" wants to know it works, and a preference
   * page with no way to check is a preference page people do not trust.
   */
  router.post("/notifications/test", async (req: ViewerRequest, res, next) => {
    const person = requirePerson(req, res);
    if (!person) return;
    try {
      const result = await runNotifications(await world(today()), store, channels, {
        personId: person,
        again: true,
      });
      res.json({ ...result, summary: summarise(result) });
    } catch (err) {
      next(err);
    }
  });

  /**
   * The run, and its dry version.
   *
   * An admin's, because it sends things to other people. The dry run is the
   * default: `POST /notifications/run` tells you what would happen, and only
   * `?send=1` actually sends — the wrong way round would mean one mistyped
   * URL mailing two hundred people.
   */
  router.post("/notifications/run", async (req: ViewerRequest, res, next) => {
    const viewer = req.viewer!;
    if (viewer.role !== "admin") {
      res.status(403).json({ error: "Only an admin can run the notifications." });
      return;
    }
    try {
      const send = req.query.send === "1";
      const only = kindsFrom(req.query.only);
      const on = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : today();
      const result = await runNotifications(await world(on), store, channels, {
        dry: !send,
        only,
      });
      const people = await data.listPeople();
      res.json({
        ...result,
        summary: summarise(result),
        // The admin's table reads names, not ids.
        names: Object.fromEntries(people.map((p: Person) => [p.id, p.name])),
      });
    } catch (err) {
      next(err);
    }
  });

  /** What the last runs did, and what each channel can do. An admin's view. */
  router.get("/notifications/log", async (req: ViewerRequest, res, next) => {
    const viewer = req.viewer!;
    if (viewer.role !== "admin") {
      res.status(403).json({ error: "Only an admin can read the notification log." });
      return;
    }
    try {
      const people = await data.listPeople();
      res.json({
        channels: channels.states(),
        scheduled: process.env.NOTIFY_SCHEDULE === "1",
        sends: store.recentSends(100),
        chose: store.allNotifyPrefs().length,
        team: people.length,
        names: Object.fromEntries(people.map((p: Person) => [p.id, p.name])),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function kindsFrom(value: unknown): NoticeKind[] | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const asked = value.split(",").map((s) => s.trim());
  const kinds = NOTICE_KINDS.filter((k) => asked.includes(k));
  return kinds.length ? kinds : undefined;
}

export type { Channel };
