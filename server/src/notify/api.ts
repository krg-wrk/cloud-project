import { Router } from "express";
import { requirePerson, type ViewerRequest } from "../auth.js";
import type { ProofPointLibrary } from "../proofPoints/library.js";
import type { SignUps } from "../signUps.js";
import type { HubStore } from "../store.js";
import type { DataSource, Person } from "../types.js";
import { canSeeView } from "../studio/query.js";
import type { ViewRunner } from "../studio/run.js";
import type { StudioStore } from "../studio/store.js";
import { Channels, chatWebhookLooksRight, emailReady } from "./channels.js";
import { runNotifications, summarise } from "./run.js";
import { gather } from "./schedule.js";
import {
  RULE_AUDIENCES,
  RULE_AUDIENCE_LABELS,
  RULE_FIELDS,
  RULE_OPS,
  RULE_OP_LABELS,
  ruleNotices,
  type AutomationRule,
  type RuleAudience,
  type RuleCondition,
  type RuleOp,
} from "./rules.js";
import { CADENCES, cadenceWords, type Cadence } from "./viewMail.js";
import { sendViewMail } from "./viewRun.js";
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
  studio: StudioStore,
  runner: ViewRunner,
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
  router.get("/notifications", async (req: ViewerRequest, res) => {
    const person = requirePerson(req, res);
    if (!person) return;
    res.json({
      unread: (await store.unreadCount(person)),
      rows: (await store.notifications(person, 40)),
    });
  });

  router.post("/notifications/read", async (req: ViewerRequest, res) => {
    const person = requirePerson(req, res);
    if (!person) return;
    const id = typeof req.body?.id === "string" ? req.body.id : undefined;
    if (id) (await store.markRead(person, id));
    else (await store.markAllRead(person));
    res.json({ unread: (await store.unreadCount(person)) });
  });

  router.delete("/notifications/:id", async (req: ViewerRequest, res) => {
    const person = requirePerson(req, res);
    if (!person) return;
    await store.deleteNotification(person, req.params.id);
    res.json({ unread: (await store.unreadCount(person)) });
  });

  /**
   * The settings: the grid of kinds against channels, and what each channel
   * can actually do right now.
   *
   * The states come back with the preferences on purpose. A page that offers
   * "email me" without saying whether anything is sending email is a page
   * that produces a support request a fortnight later.
   */
  router.get("/notifications/settings", async (req: ViewerRequest, res) => {
    const person = requirePerson(req, res);
    if (!person) return;
    const prefs = (await store.notifyPrefs(person)) ?? defaultPrefs(person);
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

  router.put("/notifications/settings", async (req: ViewerRequest, res) => {
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

    const saved = await store.setNotifyPrefs({ personId: person, on, chatWebhook });
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

  /* ---- The rules an admin writes -----------------------------------------
   *
   * Admin only, both ways: a rule tells other people things, so writing one
   * is not something a manager does for their own team.
   * ---------------------------------------------------------------------- */

  router.get("/notifications/rules", async (req: ViewerRequest, res, next) => {
    if (req.viewer!.role !== "admin") {
      res.status(403).json({ error: "Only an admin can see the rules." });
      return;
    }
    try {
      res.json({
        rules: await store.automationRules(),
        // The vocabulary, so the builder is drawn from the server's own list
        // rather than a copy that can drift out of step with it.
        fields: RULE_FIELDS,
        ops: RULE_OPS.map((op) => ({ op, label: RULE_OP_LABELS[op] })),
        audiences: RULE_AUDIENCES.map((a) => ({ value: a, label: RULE_AUDIENCE_LABELS[a] })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.put("/notifications/rules/:id", async (req: ViewerRequest, res, next) => {
    const viewer = req.viewer!;
    if (viewer.role !== "admin") {
      res.status(403).json({ error: "Only an admin can write a rule." });
      return;
    }
    try {
      const rule = readRule(req.params.id, req.body);
      if (typeof rule === "string") {
        res.status(400).json({ error: rule });
        return;
      }
      res.json(await store.saveAutomationRule(rule, viewer.email));
    } catch (err) {
      next(err);
    }
  });

  router.delete("/notifications/rules/:id", async (req: ViewerRequest, res, next) => {
    if (req.viewer!.role !== "admin") {
      res.status(403).json({ error: "Only an admin can remove a rule." });
      return;
    }
    try {
      const ok = await store.dropAutomationRule(req.params.id);
      if (!ok) {
        res.status(404).json({ error: "No rule with that id." });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  /**
   * What a rule would say today, without saying it.
   *
   * The whole point. A rule that turns out to match four hundred pieces is a
   * rule nobody wants to have switched on first and counted afterwards, and
   * this is the difference between an admin trying one and an admin not
   * daring to.
   */
  router.post("/notifications/rules/preview", async (req: ViewerRequest, res, next) => {
    if (req.viewer!.role !== "admin") {
      res.status(403).json({ error: "Only an admin can preview a rule." });
      return;
    }
    try {
      const rule = readRule("preview", { ...req.body, enabled: true });
      if (typeof rule === "string") {
        res.status(400).json({ error: rule });
        return;
      }
      const on = today();
      const [content, people] = await Promise.all([data.listContent(), data.listPeople()]);
      const notices = ruleNotices(content, people, [{ ...rule, createdAt: on, updatedAt: on, updatedBy: "" }], on);
      const names = new Map(people.map((p: Person) => [p.id, p.name]));
      res.json({
        matched: notices.length,
        // A handful, named, rather than a count on its own: "12 pieces" is
        // not enough to tell whether the rule means what you think.
        examples: notices.slice(0, 8).map((n) => ({
          who: names.get(n.personId) ?? n.personId,
          body: n.body,
          link: n.link,
        })),
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
        sends: (await store.recentSends(100)),
        chose: (await store.allNotifyPrefs()).length,
        team: people.length,
        names: Object.fromEntries(people.map((p: Person) => [p.id, p.name])),
      });
    } catch (err) {
      next(err);
    }
  });

  /* ---- Views somebody has asked to be sent -------------------------------
   *
   * A person's own, always. There is no route here that subscribes anybody
   * else, and that is the design rather than an omission: a view is run *as*
   * somebody, and posting one person's rows to another is the one thing this
   * must never do.
   * ---------------------------------------------------------------------- */

  /** What this person has asked for, and whether email can go at all. */
  router.get("/notifications/views", async (req: ViewerRequest, res, next) => {
    const person = requirePerson(req, res);
    if (!person) return;
    try {
      const mails = await store.viewMailsFor(person);
      const views = await studio.listViews();
      res.json({
        ready: emailReady(),
        // Only the views this account may actually open, so the picker cannot
        // offer something that would refuse itself at send time.
        views: views
          .filter((v) => canSeeView(v.audience, v.state, req.viewer!))
          .map((v) => ({ id: v.id, slug: v.slug, label: v.label, section: v.section })),
        mails: mails.map((m) => ({
          ...m,
          view: views.find((v) => v.id === m.viewId)?.label ?? "a view that has been deleted",
          words: cadenceWords(m),
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  /** Ask for a view, or change when it comes. */
  router.put("/notifications/views/:viewId", async (req: ViewerRequest, res, next) => {
    const person = requirePerson(req, res);
    if (!person) return;
    try {
      const view = await studio.view(req.params.viewId);
      if (!view || !canSeeView(view.audience, view.state, req.viewer!)) {
        res.status(404).json({ error: "No view with that id, or it is not yours to see." });
        return;
      }
      const asked = readViewMail(req.body);
      if (typeof asked === "string") {
        res.status(400).json({ error: asked });
        return;
      }
      res.json(
        await store.saveViewMail({
          ...asked,
          personId: person,
          email: req.viewer!.email,
          viewId: view.id,
        }),
      );
    } catch (err) {
      next(err);
    }
  });

  router.delete("/notifications/views/:id", async (req: ViewerRequest, res, next) => {
    const person = requirePerson(req, res);
    if (!person) return;
    try {
      const gone = await store.dropViewMail(req.params.id, person);
      res.status(gone ? 204 : 404).end();
    } catch (err) {
      next(err);
    }
  });

  /**
   * Send one now, to check it.
   *
   * Nothing else in the Hub lets somebody see what an email will look like
   * before they have waited a day for it, and "I think I set it up right" is
   * not a state to leave anybody in. It sends only to the person asking, and
   * deliberately does not record the send: a test at four in the afternoon
   * must not eat tomorrow morning's real one.
   */
  router.post("/notifications/views/:id/now", async (req: ViewerRequest, res, next) => {
    const person = requirePerson(req, res);
    if (!person) return;
    try {
      const mail = (await store.viewMailsFor(person)).find((m) => m.id === req.params.id);
      if (!mail) {
        res.status(404).json({ error: "You have not asked for that one." });
        return;
      }
      const result = await sendViewMail(mail, { data, studio, runner, store }, new Date(), false);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/**
 * What a client asked for, rebuilt rather than trusted.
 *
 * An hour outside the day, or a cadence the Hub does not have, is refused
 * rather than clamped: this decides when something leaves the building, and
 * quietly turning 25 into 23 would be a schedule nobody asked for.
 */
export function readViewMail(
  body: unknown,
): { cadence: Cadence; weekday: number; hour: number; enabled: boolean } | string {
  const raw = (body ?? {}) as Record<string, unknown>;
  const cadence = raw.cadence as Cadence;
  if (!CADENCES.includes(cadence)) return "Choose how often it should come.";

  const hour = Number(raw.hour);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return "Choose an hour of the day between 0 and 23.";
  }

  const weekday = raw.weekday === undefined ? 1 : Number(raw.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return "Choose a day of the week.";
  }

  return { cadence, weekday, hour, enabled: raw.enabled !== false };
}

/**
 * A rule, rebuilt field by field from whatever a client sent.
 *
 * Returns the rule, or one sentence saying why not — the messages are for an
 * admin looking at a form, so they say what to do rather than what failed.
 *
 * The refusal worth noting is the empty condition list. A rule with no
 * conditions matches every piece of work on the sheet, so switching one on
 * would tell the whole team about all four hundred at once. That is not a
 * validation nicety; it is the difference between a useful feature and an
 * incident.
 */
export function readRule(
  id: string,
  body: unknown,
): (Omit<AutomationRule, "createdAt" | "updatedAt" | "updatedBy">) | string {
  const raw = (body ?? {}) as Record<string, unknown>;
  const label = String(raw.label ?? "").trim().slice(0, 80);
  if (!label) return "Give the rule a name — it is what people see as the subject.";

  const message = String(raw.message ?? "").trim().slice(0, 400);
  if (!message) return "Say what the rule should tell them.";

  const fields = new Set(RULE_FIELDS.map((f) => f.key));
  const when: RuleCondition[] = (Array.isArray(raw.when) ? raw.when : [])
    .map((x) => x as Record<string, unknown>)
    .filter(
      (x) =>
        typeof x.field === "string" &&
        fields.has(x.field) &&
        RULE_OPS.includes(x.op as RuleOp),
    )
    .slice(0, 8)
    .map((x) => ({
      field: String(x.field),
      op: x.op as RuleOp,
      value: typeof x.value === "string" ? x.value.slice(0, 120) : undefined,
    }));

  if (when.length === 0) {
    return "A rule needs at least one condition — without one it would match every piece on the sheet.";
  }
  // An operator that compares needs something to compare against.
  const blank = when.find(
    (c) => !["empty", "not-empty"].includes(c.op) && !(c.value ?? "").trim(),
  );
  if (blank) {
    const name = RULE_FIELDS.find((f) => f.key === blank.field)?.label ?? blank.field;
    return `Give "${name} ${RULE_OP_LABELS[blank.op]}" something to compare against.`;
  }

  const tell = RULE_AUDIENCES.includes(raw.tell as RuleAudience)
    ? (raw.tell as RuleAudience)
    : "owner";
  const namedEmail =
    typeof raw.namedEmail === "string" ? raw.namedEmail.trim().toLowerCase() : "";
  if (tell === "named" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(namedEmail)) {
    return "Telling one named person needs their email address.";
  }

  return {
    id,
    label,
    enabled: raw.enabled !== false,
    when,
    tell,
    namedEmail: tell === "named" ? namedEmail : undefined,
    message,
  };
}

function kindsFrom(value: unknown): NoticeKind[] | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const asked = value.split(",").map((s) => s.trim());
  const kinds = NOTICE_KINDS.filter((k) => asked.includes(k));
  return kinds.length ? kinds : undefined;
}

export type { Channel };
