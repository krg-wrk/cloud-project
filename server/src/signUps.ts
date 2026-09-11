import type { HubStore } from "./store.js";
import type { KnowledgeSession, SessionSignUps } from "./types.js";

export type SignUpOutcome =
  | { result: "going" }
  | { result: "waiting"; position: number }
  | { result: "already" }
  | { result: "closed" };

export type CancelOutcome =
  | { result: "cancelled"; promoted?: string }
  | { result: "not-signed-up" };

/**
 * Who is going to which session, over the store.
 *
 * The rules live here rather than in the UI so the app, the calendar feed and
 * anything added later all agree on what "full" means.
 */
export class SignUps {
  constructor(private readonly store: HubStore) {}

  async get(sessionId: string): Promise<SessionSignUps> {
    const rows = await this.store.signUpsFor(sessionId);
    return {
      going: rows.filter((r) => r.state === "going").map((r) => r.personId),
      waiting: rows.filter((r) => r.state === "waiting").map((r) => r.personId),
    };
  }

  /** One pass over the table, for pages that need every session at once. */
  async all(): Promise<Record<string, SessionSignUps>> {
    const out: Record<string, SessionSignUps> = {};
    for (const row of (await this.store.allSignUps())) {
      out[row.sessionId] ??= { going: [], waiting: [] };
      out[row.sessionId][row.state].push(row.personId);
    }
    return out;
  }

  /** Takes a place if there is one, joins the queue if there isn't. */
  async add(session: KnowledgeSession, personId: string): Promise<SignUpOutcome> {
    if (!session.signUpsOpen) return { result: "closed" };
    const current = await this.get(session.id);
    if (current.going.includes(personId) || current.waiting.includes(personId)) {
      return { result: "already" };
    }
    const full = session.capacity !== null && current.going.length >= session.capacity;
    await this.store.addSignUp(session.id, personId, full ? "waiting" : "going");
    return full
      ? { result: "waiting", position: current.waiting.length + 1 }
      : { result: "going" };
  }

  /** Giving up a place moves the first person on the waitlist into it. */
  async remove(session: KnowledgeSession, personId: string): Promise<CancelOutcome> {
    const before = await this.get(session.id);
    const wasGoing = before.going.includes(personId);
    const wasWaiting = before.waiting.includes(personId);
    if (!wasGoing && !wasWaiting) return { result: "not-signed-up" };

    await this.store.removeSignUp(session.id, personId);

    if (!wasGoing) return { result: "cancelled" };

    const after = await this.get(session.id);
    const hasRoom = session.capacity === null || after.going.length < session.capacity;
    const next = after.waiting[0];
    if (hasRoom && next) {
      await this.store.promoteSignUp(session.id, next);
      return { result: "cancelled", promoted: next };
    }
    return { result: "cancelled" };
  }

  /** Session ids this person is going to or waiting for. */
  async forPerson(personId: string): Promise<Set<string>> {
    const out = new Set<string>();
    for (const row of (await this.store.allSignUps())) {
      if (row.personId === personId) out.add(row.sessionId);
    }
    return out;
  }
}
