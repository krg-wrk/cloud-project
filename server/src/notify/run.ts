import type { Person } from "../types.js";
import type { HubStore } from "../store.js";
import { buildNotices, type World } from "./build.js";
import type { Channels } from "./channels.js";
import { defaultPrefs, type Delivery, type Notice, type NoticeKind } from "./types.js";

/**
 * One run: what should be said, to whom, down which channel.
 *
 * The order matters. Build first, because what is worth saying does not
 * depend on anybody's settings. Then, per notice, ask that person which
 * channels they chose for that kind. Then check whether it has already gone
 * — the reason every notice carries a stable key — and only then send.
 *
 * A dry run does all of that and sends nothing. It is how an admin finds out
 * what the Monday morning run will do before it does it, and it is the only
 * honest way to test a feature whose failure mode is a hundred people
 * getting an email at 3am.
 */

export interface RunResult {
  /** The day the run was for, so a dry run says which world it saw. */
  today: string;
  /** Every notice built, before preferences. */
  built: number;
  /** What each channel did with each notice. */
  deliveries: Delivery[];
  /** True when nothing was actually sent. */
  dry: boolean;
}

export interface RunOptions {
  only?: NoticeKind[];
  dry?: boolean;
  /** One person, for the "send me a test" button. */
  personId?: string;
  /**
   * Send again even if the key has already gone.
   *
   * Only the test button sets this: it is the one case where saying the same
   * thing twice is the point.
   */
  again?: boolean;
}

export async function runNotifications(
  world: World,
  store: HubStore,
  channels: Channels,
  options: RunOptions = {},
): Promise<RunResult> {
  const dry = options.dry ?? false;
  const people = new Map(world.people.map((p) => [p.id, p]));
  let notices = buildNotices(world, options.only);
  if (options.personId) notices = notices.filter((n) => n.personId === options.personId);

  const deliveries: Delivery[] = [];

  for (const notice of notices) {
    const person = people.get(notice.personId);
    if (!person) continue;
    const prefs = (await store.notifyPrefs(notice.personId)) ?? defaultPrefs(notice.personId);
    const wanted = prefs.on[notice.kind] ?? [];

    for (const channel of wanted) {
      const record = (ok: boolean, problem?: string) => {
        deliveries.push({
          personId: notice.personId,
          kind: notice.kind,
          channel,
          key: notice.key,
          ok,
          problem,
        });
      };

      if (!options.again && (await store.alreadySent(notice.key, channel))) {
        record(false, "already sent");
        continue;
      }
      if (!channels.ready(channel, prefs)) {
        /*
         * Not an error and not logged as a send: the person asked for a
         * channel the deployment has not set up. Recording it as a failed
         * send would fill the log with the same line for ever, so it is
         * reported in the result and nowhere else — the settings page is
         * where somebody finds out, in words, that email is not wired up.
         */
        record(false, "channel not configured");
        continue;
      }
      if (dry) {
        record(true, "dry run — nothing sent");
        continue;
      }

      const problem = await channels.send(channel, notice, person, prefs);
      record(!problem, problem);
      await store.logNotification({
        key: notice.key,
        personId: notice.personId,
        kind: notice.kind,
        channel,
        ok: !problem,
        problem,
      });
    }
  }

  return { today: world.today, built: notices.length, deliveries, dry };
}

/** A one-line summary for the console and the admin page. */
export function summarise(result: RunResult): string {
  const sent = result.deliveries.filter((d) => d.ok && !d.problem).length;
  const held = result.deliveries.filter((d) => d.problem === "already sent").length;
  const unconfigured = result.deliveries.filter((d) => d.problem === "channel not configured").length;
  const failed = result.deliveries.filter(
    (d) => !d.ok && d.problem && d.problem !== "already sent" && d.problem !== "channel not configured",
  ).length;
  const bits = [`${result.built} notices`, `${sent} sent`];
  if (held) bits.push(`${held} already gone`);
  if (unconfigured) bits.push(`${unconfigured} on channels nobody set up`);
  if (failed) bits.push(`${failed} failed`);
  return `${result.dry ? "Dry run" : "Run"} for ${result.today}: ${bits.join(", ")}`;
}

/** The people a notice could name, for the admin's preview table. */
export function nameFor(people: Person[], id: string): string {
  return people.find((p) => p.id === id)?.name ?? id;
}

export type { Notice };
