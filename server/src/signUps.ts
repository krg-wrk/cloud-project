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
 * Who is going to which session.
 *
 * The POC keeps this in memory, so sign-ups reset when the server restarts.
 * In production this is the one part of the Hub that writes rather than reads:
 * point it at a sign-ups sheet (or a small table of its own) and keep the same
 * interface — the routes and the UI do not care where the rows live.
 */
export class SignUpStore {
  private byId = new Map<string, SessionSignUps>();

  constructor(seed: Record<string, SessionSignUps> = {}) {
    for (const [id, value] of Object.entries(seed)) {
      this.byId.set(id, { going: [...value.going], waiting: [...value.waiting] });
    }
  }

  get(sessionId: string): SessionSignUps {
    const current = this.byId.get(sessionId);
    return current
      ? { going: [...current.going], waiting: [...current.waiting] }
      : { going: [], waiting: [] };
  }

  all(): Record<string, SessionSignUps> {
    const out: Record<string, SessionSignUps> = {};
    for (const id of this.byId.keys()) out[id] = this.get(id);
    return out;
  }

  private set(sessionId: string, value: SessionSignUps): void {
    this.byId.set(sessionId, value);
  }

  /** Takes a place if there is one, joins the queue if there isn't. */
  add(session: KnowledgeSession, personId: string): SignUpOutcome {
    if (!session.signUpsOpen) return { result: "closed" };
    const current = this.get(session.id);
    if (current.going.includes(personId) || current.waiting.includes(personId)) {
      return { result: "already" };
    }
    const full = session.capacity !== null && current.going.length >= session.capacity;
    if (full) {
      current.waiting.push(personId);
      this.set(session.id, current);
      return { result: "waiting", position: current.waiting.length };
    }
    current.going.push(personId);
    this.set(session.id, current);
    return { result: "going" };
  }

  /** Giving up a place moves the first person on the waitlist into it. */
  remove(session: KnowledgeSession, personId: string): CancelOutcome {
    const current = this.get(session.id);
    const wasGoing = current.going.includes(personId);
    const wasWaiting = current.waiting.includes(personId);
    if (!wasGoing && !wasWaiting) return { result: "not-signed-up" };

    current.going = current.going.filter((id) => id !== personId);
    current.waiting = current.waiting.filter((id) => id !== personId);

    let promoted: string | undefined;
    const hasRoom = session.capacity === null || current.going.length < session.capacity;
    if (wasGoing && hasRoom && current.waiting.length > 0) {
      promoted = current.waiting.shift();
      if (promoted) current.going.push(promoted);
    }

    this.set(session.id, current);
    return promoted ? { result: "cancelled", promoted } : { result: "cancelled" };
  }
}
