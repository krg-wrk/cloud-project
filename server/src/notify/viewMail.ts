import type { ViewPage } from "../studio/types.js";

/**
 * A view, in somebody's inbox, on a morning they chose.
 *
 * The Hub's argument all along has been that a view is an address: you open
 * it and it is true today. This is the one case that argument does not cover
 * — the list you want to see before you have opened anything, the one that
 * should be waiting when the laptop does. Every tool this replaces has it,
 * and it is the feature people actually ask for by name.
 *
 * Three things keep it honest.
 *
 * It is run per recipient, at the moment of sending, as that person. A view
 * can narrow itself to "mine" and its audience decides who may open it at
 * all, so a single render posted to a list would show somebody another
 * person's work. There is no sending it to anybody but yourself.
 *
 * It carries a link, and says so. The mail is a prompt, not a system of
 * record: a table in an inbox is out of date the moment it is sent, and
 * pretending otherwise is how a spreadsheet culture starts again. So the
 * mail says when it was made and links to the view, which is live.
 *
 * And it is capped. A view of four hundred rows becomes a mail of twenty-five
 * and a line saying so. Nobody scrolls an email to row ninety, and a
 * megabyte of table is how a sending domain gets a reputation.
 */

/** How often a view goes out. */
export type Cadence = "daily" | "weekdays" | "weekly";

export const CADENCES: Cadence[] = ["daily", "weekdays", "weekly"];

export const CADENCE_LABELS: Record<Cadence, string> = {
  daily: "Every day",
  weekdays: "Weekday mornings",
  weekly: "Once a week",
};

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export interface ViewMail {
  id: string;
  personId: string;
  email: string;
  viewId: string;
  cadence: Cadence;
  /** For `weekly`. 0 is Sunday, as JavaScript counts them. */
  weekday: number;
  hour: number;
  enabled: boolean;
  lastSentOn?: string;
  lastProblem?: string;
  createdAt: string;
  updatedAt: string;
}

/** As many rows as anybody will read in an email. */
export const MAIL_ROWS = 25;

/**
 * Whether this subscription is owed a send at this moment.
 *
 * The hour has to match rather than be past it, because the scheduler wakes
 * every fifteen minutes: "past eight" would fire at eight, and again at
 * quarter past, and again all day. The date it last went is the other half —
 * that is what makes four ticks in an hour into one mail.
 */
export function mailDue(mail: ViewMail, at: Date): boolean {
  if (!mail.enabled) return false;
  if (at.getHours() !== mail.hour) return false;
  const day = at.getDay();
  if (mail.cadence === "weekdays" && (day === 0 || day === 6)) return false;
  if (mail.cadence === "weekly" && day !== mail.weekday) return false;
  return mail.lastSentOn !== localDay(at);
}

/**
 * The date where the Hub is running, not in UTC.
 *
 * `toISOString().slice(0, 10)` is the usual shortcut and it is wrong here: at
 * eight in the morning in London in summer it gives the right day, but a
 * schedule set for an hour that falls after midnight UTC would record
 * tomorrow's date and then refuse to send tomorrow. The hour check already
 * works in local time, so the date it is compared against has to as well.
 */
export function localDay(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** When the next one is due, in words, for the settings page. */
export function cadenceWords(mail: ViewMail): string {
  const time = `${String(mail.hour).padStart(2, "0")}:00`;
  if (mail.cadence === "daily") return `Every day at ${time}`;
  if (mail.cadence === "weekdays") return `Weekday mornings at ${time}`;
  return `${WEEKDAYS[mail.weekday] ?? "Monday"}s at ${time}`;
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escaping, because this is HTML built from a sheet somebody else edits.
 *
 * Every cell here came from Smartsheet or Snowflake by way of a column title
 * an admin typed. None of it is the Hub's own text, and a title containing a
 * `<` would otherwise stop being a title and start being markup. Mail clients
 * are not browsers, but they are close enough to one for that to matter.
 */
export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** The columns a table view shows, or the title field for the other layouts. */
function columnsOf(page: ViewPage): { key: string; label: string }[] {
  const byKey = new Map(page.fields.map((f) => [f.key, f.name]));
  const wanted =
    page.view.spec.layout === "table" && page.view.spec.fields.columns?.length
      ? page.view.spec.fields.columns
      : page.fields.map((f) => f.key);
  return wanted
    .filter((key) => byKey.has(key))
    .slice(0, 8)
    .map((key) => ({ key, label: byKey.get(key) ?? key }));
}

export interface MailBody {
  subject: string;
  text: string;
  html: string;
}

/**
 * The mail itself.
 *
 * Both a plain-text and an HTML body, because the relay is a ten-line Apps
 * Script and the cheapest way to be right in every client is to hand it both
 * and let it choose. The text version is not an afterthought: it is what a
 * watch shows and what a screen reader reads when a client has images and
 * styles off.
 */
export function mailFor(page: ViewPage, base: string, madeAt: Date): MailBody {
  const link = `${base.replace(/\/$/, "")}/v/${page.view.slug}`;
  const label = page.view.label;
  const when = madeAt.toISOString().slice(0, 16).replace("T", " ");

  if (page.error) {
    // Worth sending rather than swallowing: somebody who asked for this every
    // morning should hear that the sheet behind it stopped answering, on the
    // morning it stopped, not a fortnight later when they notice.
    const say = `“${label}” could not be read this morning — ${page.error}`;
    return {
      subject: `${label} — could not be read`,
      text: `${say}\n\nThe view itself: ${link}`,
      html:
        `<p>${esc(say)}</p>` +
        `<p><a href="${esc(link)}">Open “${esc(label)}” in the Forecasters Hub</a></p>`,
    };
  }

  const columns = columnsOf(page);
  const shown = page.rows.slice(0, MAIL_ROWS);
  const more = page.total - shown.length;
  const count = `${page.total} ${page.total === 1 ? "row" : "rows"}`;

  const head =
    page.total === 0
      ? `Nothing in “${label}” this morning.`
      : `“${label}” — ${count}${more > 0 ? `, the first ${shown.length} below` : ""}.`;

  const text = [
    head,
    "",
    ...shown.map((row) => columns.map((c) => `${c.label}: ${row[c.key] ?? ""}`).join(" · ")),
    "",
    more > 0 ? `${more} more in the view.` : "",
    `The view, which is live: ${link}`,
    `Made at ${when}.`,
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");

  const cell = (v: unknown) =>
    `<td style="padding:6px 10px;border-bottom:1px solid #e6e6e6;vertical-align:top">${esc(v)}</td>`;

  const html =
    `<div style="font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">` +
    `<p style="margin:0 0 14px">${esc(head)}</p>` +
    (page.total === 0
      ? ""
      : `<table style="border-collapse:collapse;font-size:13px">` +
        `<thead><tr>${columns
          .map(
            (c) =>
              `<th align="left" style="padding:6px 10px;border-bottom:2px solid #1a1a1a;` +
              `font-weight:600">${esc(c.label)}</th>`,
          )
          .join("")}</tr></thead>` +
        `<tbody>${shown
          .map((row) => `<tr>${columns.map((c) => cell(row[c.key])).join("")}</tr>`)
          .join("")}</tbody></table>`) +
    (more > 0 ? `<p style="margin:14px 0 0;color:#666">${more} more in the view.</p>` : "") +
    `<p style="margin:18px 0 0"><a href="${esc(link)}">Open “${esc(label)}” in the Forecasters Hub</a>` +
    ` — the view is live; this table was made at ${esc(when)}.</p>` +
    `</div>`;

  return { subject: `${label} — ${page.total === 0 ? "nothing today" : count}`, text, html };
}
