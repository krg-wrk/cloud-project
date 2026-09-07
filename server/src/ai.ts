import type { ContentItem, Person } from "./types.js";

/**
 * Drafting notes for a forecast.
 *
 * The key stays on the server: the browser asks the Hub for a draft, the Hub
 * calls the model. A key shipped to the front end is a key published to
 * everyone who opens the page.
 *
 * Nothing is saved automatically — a draft comes back for the forecaster to
 * edit and keep, or discard. AI notes stay labelled as AI notes once saved.
 */
export interface NoteDrafter {
  readonly model: string;
  draft(input: DraftInput): Promise<string>;
}

export interface DraftInput {
  item: ContentItem;
  forecaster?: Person;
  /** Notes already on the piece, so a draft builds on them. */
  existingNotes: string[];
  /** Other commissioned pieces in the same vertical, for context. */
  siblings: ContentItem[];
  /** Free-text steer from the person asking ("focus on the colour story"). */
  steer?: string;
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * House brief for the drafts. This is the part worth iterating on once we see
 * real output — it is deliberately in one place, not spread through prompts.
 */
const SYSTEM_BRIEF = `You are helping a WGSN trend forecaster plan a piece of
commissioned content. Write working notes for the forecaster's own use, not
copy for publication.

Keep it to:
- three or four angles worth researching, each one sentence
- the evidence that would support or kill each angle
- anything the deadline makes tight

British English. No preamble, no headings, no bullet symbols other than "-".
Be concrete about the vertical and season. Never invent statistics, brand
names, or sources — if evidence is needed, say what to go and look for.`;

function buildPrompt(input: DraftInput): string {
  const { item, forecaster, existingNotes, siblings, steer } = input;
  const lines = [
    `Piece: ${item.title}`,
    `Type: ${item.type}`,
    `Vertical: ${item.vertical}`,
    `Season: ${item.season}`,
    `Copy due: ${item.submissionDate}`,
    `Publishes: ${item.publicationDate}`,
    `Status: ${item.status}`,
    forecaster ? `Forecaster: ${forecaster.name} (${forecaster.vertical}, ${forecaster.region})` : "",
    item.notes ? `Commissioning note: ${item.notes}` : "",
  ].filter(Boolean);

  if (existingNotes.length) {
    lines.push("", "Notes already on this piece:", ...existingNotes.map((n) => `- ${n}`));
  }
  if (siblings.length) {
    lines.push(
      "",
      "Other pieces commissioned in this vertical (avoid overlapping with these):",
      ...siblings.map((s) => `- ${s.title} (${s.type}, ${s.season}, publishes ${s.publicationDate})`),
    );
  }
  if (steer) {
    lines.push("", `The forecaster asked you to focus on: ${steer}`);
  }
  return lines.join("\n");
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

/**
 * Google's Gemini API.
 *
 * NOTE: written against the documented v1beta generateContent shape but not
 * yet exercised against a live key — the request and response shapes need
 * confirming on the first real call.
 */
export class GeminiDrafter implements NoteDrafter {
  constructor(
    private readonly apiKey: string,
    readonly model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  ) {}

  async draft(input: DraftInput): Promise<string> {
    const res = await fetch(`${ENDPOINT}/${this.model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_BRIEF }] },
        contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 700 },
      }),
    });

    const body = (await res.json().catch(() => null)) as GeminiResponse | null;
    if (!res.ok) {
      throw new Error(
        `Gemini request failed (${res.status}): ${body?.error?.message ?? res.statusText}`,
      );
    }
    if (body?.promptFeedback?.blockReason) {
      throw new Error(`Gemini declined to answer (${body.promptFeedback.blockReason}).`);
    }

    const text = body?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) throw new Error("Gemini returned an empty draft.");
    return text;
  }
}

/**
 * Stands in when no key is configured, so the button can be shown and
 * exercised without one. Clearly marked, never passed off as a real draft.
 */
export class UnconfiguredDrafter implements NoteDrafter {
  readonly model = "none";

  async draft(input: DraftInput): Promise<string> {
    throw new Error(
      "AI notes are not switched on yet — set GEMINI_API_KEY on the server to enable them." +
        (input.steer ? "" : ""),
    );
  }
}

export function createNoteDrafter(): NoteDrafter {
  const key = process.env.GEMINI_API_KEY;
  return key ? new GeminiDrafter(key) : new UnconfiguredDrafter();
}

export const aiNotesEnabled = (): boolean => Boolean(process.env.GEMINI_API_KEY);
