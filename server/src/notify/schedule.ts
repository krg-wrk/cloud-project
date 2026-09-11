import type { ProofPointLibrary } from "../proofPoints/library.js";
import type { SignUps } from "../signUps.js";
import type { HubStore } from "../store.js";
import type { DataSource } from "../types.js";
import { Channels } from "./channels.js";
import type { World } from "./build.js";
import { runNotifications, summarise } from "./run.js";
import type { NoticeKind } from "./types.js";

/**
 * When the runs happen, if they happen at all.
 *
 * Off unless `NOTIFY_SCHEDULE=1`, because this is the one part of the Hub
 * that acts on the outside world with nobody pressing anything. A proof of
 * concept that mailed two hundred people because somebody ran it on a laptop
 * would be the last time the team trusted it.
 *
 * No cron, no queue, no dependency: a check every fifteen minutes against
 * the wall clock, and the send log stops anything going twice. That is
 * enough for two jobs a day and it survives a restart, which a timer
 * counting hours from boot does not — a service that restarts at 8:55 every
 * morning would otherwise never send the 9am digest.
 */

const EVERY_MS = 15 * 60 * 1000;

/** Deadline nudges daily, the digest on Monday. Both at the same hour. */
const HOUR = Number(process.env.NOTIFY_HOUR ?? 8);

export interface Schedule {
  on: boolean;
  /** Plain words for the boot banner and the admin page. */
  note: string;
  stop(): void;
}

export function startSchedule(
  data: DataSource,
  store: HubStore,
  signUps: SignUps,
  library: ProofPointLibrary,
): Schedule {
  if (process.env.NOTIFY_SCHEDULE !== "1") {
    return {
      on: false,
      note: "off — nothing sends itself; an admin can run it from the studio",
      stop() {},
    };
  }

  const channels = new Channels(store);

  const tick = async () => {
    const at = new Date();
    if (at.getHours() !== HOUR) return;
    const today = at.toISOString().slice(0, 10);
    // Monday is 1. The digest carries the review notice, so Monday sends all three.
    const kinds: NoticeKind[] =
      at.getDay() === 1 ? ["digest", "deadline", "review"] : ["deadline"];

    try {
      const world = await gather(data, store, signUps, library, today);
      const result = await runNotifications(world, store, channels, { only: kinds });
      // Quiet when there was nothing to do: a log line every fifteen minutes
      // saying "0 sent" is how a log stops being read.
      const did = result.deliveries.filter((d) => d.ok && !d.problem).length;
      const failed = result.deliveries.filter((d) => !d.ok && d.problem !== "already sent").length;
      if (did || failed) console.log(`notify: ${summarise(result)}`);
    } catch (err) {
      console.error("notify: the run failed —", (err as Error).message);
    }
  };

  const timer = setInterval(() => void tick(), EVERY_MS);
  // The schedule must not be the reason the process refuses to exit.
  timer.unref?.();
  void tick();

  return {
    on: true,
    note: `on — deadlines daily at ${String(HOUR).padStart(2, "0")}:00, the digest on Mondays`,
    stop() {
      clearInterval(timer);
    },
  };
}

/**
 * Everything the rules read.
 *
 * The same gathering the API does, kept here so the schedule does not have
 * to go through HTTP to reach it.
 */
export async function gather(
  data: DataSource,
  store: HubStore,
  signUps: SignUps,
  library: ProofPointLibrary,
  today: string,
): Promise<World> {
  const [people, content, events, sessions, trends] = await Promise.all([
    data.listPeople(),
    data.listContent(),
    data.listEvents(),
    data.listSessions(),
    data.listTrends(),
  ]);

  const waitingByTrend = library.waitingByTrend(new Set((await store.proofPointDecisions()).keys()));
  const reviewWaiting: Record<string, number> = {};
  for (const trend of trends) {
    const waiting = waitingByTrend[trend.id] ?? 0;
    if (!waiting) continue;
    for (const personId of new Set([trend.ownerId, ...trend.authorIds].filter(Boolean))) {
      reviewWaiting[personId] = (reviewWaiting[personId] ?? 0) + waiting;
    }
  }

  const goingBySession: Record<string, string[]> = {};
  for (const [id, rows] of Object.entries((await signUps.all()))) goingBySession[id] = rows.going;

  return {
    today,
    people,
    content,
    events,
    sessions,
    goingBySession,
    peerReviews: (await store.allPeerReviews()),
    reviewWaiting,
  };
}
