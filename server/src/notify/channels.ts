import type { Person } from "../types.js";
import type { HubStore } from "../store.js";
import type { Channel, ChannelState, Notice, NotifyPrefs } from "./types.js";

/**
 * Getting a notice out of the building.
 *
 * Three channels, and only one of them works out of the box. That is on
 * purpose: in-app is a row in the Hub's own database and costs nobody
 * anything, while email and Google Chat both mean WGSN's schedule leaving
 * for a third party. Neither sends a byte until somebody deliberately
 * configures it, the same arrangement the Smartsheet write-back uses.
 *
 * When a channel is not configured it says so, in words, on the settings
 * page and in the admin's preview. It never queues, never retries for ever,
 * and never pretends. A forecaster who ticked "email me" and gets nothing
 * should be able to find out why in one click rather than wonder.
 */

/** Where the Hub lives, so a notice can carry a link somebody can click. */
const BASE = (process.env.HUB_URL ?? "http://localhost:5173").replace(/\/$/, "");

/**
 * An HTTP endpoint that turns a JSON body into an email.
 *
 * Not SMTP. WGSN runs on Google Workspace, so the short path to a sending
 * address that will not be marked as spam is a ten-line Apps Script web app
 * calling MailApp.sendEmail — which is an HTTPS endpoint taking JSON. That
 * also keeps the mail credentials out of the Hub entirely: the Hub holds a
 * URL, and the script holds the right to send as WGSN.
 */
const EMAIL_URL = process.env.NOTIFY_EMAIL_URL ?? "";

/**
 * A Google Chat space webhook, for the whole team.
 *
 * A person can give their own instead — Chat's incoming webhooks are per
 * space, so somebody who wants these in a private space of their own pastes
 * that URL into their settings and it is used in place of this one.
 */
const CHAT_URL = process.env.NOTIFY_CHAT_WEBHOOK ?? "";

/** Only Google's own webhook host, so a pasted URL cannot become an exfiltration route. */
const CHAT_HOST = /^https:\/\/chat\.googleapis\.com\//;

export function chatWebhookLooksRight(url: string): boolean {
  return CHAT_HOST.test(url.trim());
}

/** How long to wait on a channel before giving up on this notice. */
const TIMEOUT_MS = 8_000;

export class Channels {
  constructor(private store: HubStore) {}

  /** What each channel can do right now, in words for the settings page. */
  states(): ChannelState[] {
    return [
      {
        channel: "inApp",
        ready: true,
        note: "Always on. Notices appear on the bell beside the WGSN mark, and in full on this page.",
      },
      {
        channel: "email",
        ready: Boolean(EMAIL_URL),
        note: EMAIL_URL
          ? "Sent through the Workspace relay this deployment is pointed at."
          : "Nothing is sending email yet. An admin sets NOTIFY_EMAIL_URL to a Workspace relay; until then, choosing email here changes nothing.",
      },
      {
        channel: "chat",
        ready: Boolean(CHAT_URL),
        note: CHAT_URL
          ? "Sent to the team space, or to your own space if you give a webhook below."
          : "No Google Chat space is configured. Paste a webhook for your own space below, or an admin sets NOTIFY_CHAT_WEBHOOK for the team's.",
      },
    ];
  }

  ready(channel: Channel, prefs?: NotifyPrefs): boolean {
    if (channel === "inApp") return true;
    if (channel === "email") return Boolean(EMAIL_URL);
    return Boolean(CHAT_URL || prefs?.chatWebhook);
  }

  /**
   * Send one notice down one channel.
   *
   * Returns the reason it did not go rather than throwing: one unreachable
   * webhook must not stop the other ninety-nine notices in the run, and the
   * reason is worth recording — an admin reading the log wants "403 from the
   * relay", not a gap.
   */
  async send(
    channel: Channel,
    notice: Notice,
    person: Person,
    prefs?: NotifyPrefs,
  ): Promise<string | undefined> {
    try {
      if (channel === "inApp") {
        await this.store.addNotification(notice);
        return undefined;
      }
      if (channel === "email") {
        if (!EMAIL_URL) return "no email relay is configured";
        return await this.post(EMAIL_URL, {
          to: person.email,
          subject: notice.title,
          text: `${notice.body}\n\n${link(notice)}`,
        });
      }
      const url = prefs?.chatWebhook || CHAT_URL;
      if (!url) return "no Google Chat space is configured";
      if (!chatWebhookLooksRight(url)) return "that webhook is not a Google Chat address";
      // Chat's own shape: `text` renders, and *bold* is its markup.
      return await this.post(url, { text: `*${notice.title}*\n${notice.body}\n${link(notice)}` });
    } catch (err) {
      return (err as Error).message;
    }
  }

  /** POST JSON, and turn anything other than a 2xx into words. */
  private async post(url: string, body: unknown): Promise<string | undefined> {
    const stop = AbortSignal.timeout(TIMEOUT_MS);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: stop,
    });
    if (res.ok) return undefined;
    return `${res.status} — ${reason(await res.text().catch(() => ""))}`;
  }
}

/**
 * What the far end said, as one line.
 *
 * Google's APIs answer with a page of nested JSON, and pasting that into a
 * table cell makes the whole log unreadable — while the useful part is one
 * sentence inside it ("API key not valid"). So the message is dug out where
 * the shape is recognisable, and otherwise the body is trimmed hard.
 */
function reason(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    const said =
      typeof parsed.error === "string"
        ? parsed.error
        : (parsed.error?.message ?? parsed.message);
    if (said) return String(said).replace(/\s+/g, " ").trim().slice(0, 160);
  } catch {
    // Not JSON, which is normal for a plain-text error page.
  }
  const flat = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return flat ? flat.slice(0, 160) : "the endpoint gave no reason";
}

function link(notice: Notice): string {
  return notice.link ? `${BASE}${notice.link}` : BASE;
}
