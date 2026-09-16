import { resolveViewer } from "../auth.js";
import type { HubStore } from "../store.js";
import { canSeeView } from "../studio/query.js";
import type { ViewRunner } from "../studio/run.js";
import type { StudioStore } from "../studio/store.js";
import type { DataSource } from "../types.js";
import { emailReady, sendEmail } from "./channels.js";
import { localDay, mailDue, mailFor, type ViewMail } from "./viewMail.js";

/**
 * Sending the views people asked for.
 *
 * The awkward part of this is not the sending, it is *who the view is run
 * as*. A studio view has an audience and its filters can narrow it to the
 * signed-in person's own work, so there is no such thing as "the rows of this
 * view" without somebody to be. Every mail is therefore a fresh run against
 * the recipient's real permissions, rebuilt from the access sheet at the
 * moment of sending — which also means somebody who left the team, or lost a
 * vertical, stops receiving rows they can no longer open, without anybody
 * having to remember to unsubscribe them.
 *
 * Nothing here retries. The date is recorded whether the mail went or not, so
 * a relay that is refusing is not hammered every fifteen minutes for a day;
 * the reason is kept and shown to the person on their settings page, and
 * tomorrow it tries again.
 */

export interface ViewMailResult {
  id: string;
  to: string;
  view: string;
  rows: number;
  problem?: string;
}

/** Where the Hub lives, so the mail can carry a link somebody can click. */
const BASE = (process.env.HUB_URL ?? "http://localhost:5173").replace(/\/$/, "");

/**
 * Send one subscription now, whatever the clock says.
 *
 * Shared by the scheduler and by the "send me one now" button, because the
 * only honest way to let somebody check what they have signed up for is to
 * build the same mail the same way. `record` is false for that button: a test
 * send must not make the morning's real one disappear.
 */
export async function sendViewMail(
  mail: ViewMail,
  deps: { data: DataSource; studio: StudioStore; runner: ViewRunner; store: HubStore },
  at: Date,
  record = true,
): Promise<ViewMailResult> {
  const { data, studio, runner, store } = deps;
  const done = async (result: ViewMailResult) => {
    if (record) await store.markViewMailSent(mail.id, localDay(at), result.problem);
    return result;
  };

  const view = await studio.view(mail.viewId);
  if (!view) {
    return done({
      id: mail.id,
      to: mail.email,
      view: mail.viewId,
      rows: 0,
      problem: "That view has been deleted.",
    });
  }

  const [access, people] = await Promise.all([data.listAccess(), data.listPeople()]);
  const viewer = resolveViewer(mail.email.toLowerCase(), access, people);
  if (!viewer?.active) {
    return done({
      id: mail.id,
      to: mail.email,
      view: view.label,
      rows: 0,
      problem: "That account is no longer active.",
    });
  }

  // The audience check again, at send time rather than at subscribe time, and
  // before the rows are read rather than after. A view can be narrowed after
  // somebody subscribed to it, and a mail is a way out of the Hub — so the
  // rows are not even fetched for somebody who may no longer open them.
  if (!canSeeView(view.audience, view.state, viewer)) {
    return done({
      id: mail.id,
      to: mail.email,
      view: view.label,
      rows: 0,
      problem: "That view is no longer one this account may open.",
    });
  }

  const page = await runner.for(view, viewer, viewer.name);
  const body = mailFor(page, BASE, at);
  const problem = await sendEmail(mail.email, body.subject, body.text, body.html);
  return done({ id: mail.id, to: mail.email, view: view.label, rows: page.total, problem });
}

/**
 * Everything owed a send at this moment.
 *
 * One at a time rather than in parallel: this is a relay somebody else runs,
 * and twenty simultaneous posts to a Workspace script is how a sending quota
 * is spent. Two jobs a day at this size does not need the concurrency.
 */
export async function runViewMails(
  deps: { data: DataSource; studio: StudioStore; runner: ViewRunner; store: HubStore },
  at: Date,
): Promise<ViewMailResult[]> {
  if (!emailReady()) return [];
  const due = (await deps.store.viewMails()).filter((m) => mailDue(m, at));
  const out: ViewMailResult[] = [];
  for (const mail of due) out.push(await sendViewMail(mail, deps, at));
  return out;
}
