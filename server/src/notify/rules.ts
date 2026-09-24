import type { ContentItem, Person } from "../types.js";
import { daysUntil } from "./build.js";
import type { Notice } from "./types.js";

/**
 * Rules an admin writes, over the commissioning schedule.
 *
 * The narrowest useful version of what AppSheet and Monday both call
 * automation, and narrow on purpose. Two things are deliberately missing.
 *
 * A rule cannot change anything. Every action here is *tell somebody* — no
 * setting a field, no moving a date, no touching the sheet. A rule that
 * quietly edits somebody's data is the thing that makes people distrust a
 * tool they cannot see the inside of, and the Hub's one writing path already
 * asks for confirmation and keeps an audit row. Adding a second path that
 * writes without either would undo that.
 *
 * And a rule runs on a schedule rather than on a change. The Hub reads the
 * schedule from Smartsheet on a timer; it does not receive events from it. A
 * rule that claimed to fire "when the status changes" would really be firing
 * "within a few hours of the status changing, if the read picked it up",
 * which is a promise worth not making.
 *
 * What is left is genuinely useful: notice a shape in the schedule, and tell
 * the person who can do something about it.
 */

/** The columns a rule can test, and how each behaves. */
export interface RuleField {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "choice";
  options?: string[];
  /** What it means, for the admin writing the rule. */
  hint?: string;
}

const STATUSES = [
  "not-started",
  "in-progress",
  "submitted",
  "in-review",
  "published",
  "at-risk",
];

/**
 * A closed list rather than every column on the sheet.
 *
 * A rule builder that offers sixty columns is one nobody finishes. These are
 * the things the team actually talks about when they talk about chasing work,
 * plus the two derived numbers a date column cannot express on its own — "due
 * in three days" is a question about today, not about a date.
 */
export const RULE_FIELDS: RuleField[] = [
  { key: "status", label: "Status", type: "choice", options: STATUSES },
  { key: "type", label: "Format", type: "text" },
  { key: "vertical", label: "Vertical", type: "text" },
  { key: "season", label: "Forecast horizon", type: "text" },
  { key: "title", label: "Title", type: "text" },
  {
    key: "daysToSubmission",
    label: "Days until the copy is due",
    type: "number",
    hint: "Negative once the deadline has passed",
  },
  {
    key: "daysToPublication",
    label: "Days until it publishes",
    type: "number",
    hint: "Negative once it has published",
  },
  {
    key: "late",
    label: "Past its deadline and not in",
    type: "boolean",
    hint: "Yes when the submission date has gone and the status is not submitted or later",
  },
];

export type RuleOp = "is" | "is-not" | "contains" | "gt" | "lt" | "empty" | "not-empty";

export const RULE_OPS: RuleOp[] = [
  "is",
  "is-not",
  "contains",
  "gt",
  "lt",
  "empty",
  "not-empty",
];

export const RULE_OP_LABELS: Record<RuleOp, string> = {
  is: "is",
  "is-not": "is not",
  contains: "contains",
  gt: "is more than",
  lt: "is less than",
  empty: "is blank",
  "not-empty": "is filled in",
};

export interface RuleCondition {
  field: string;
  op: RuleOp;
  value?: string;
}

/** Who a rule tells. */
export type RuleAudience = "owner" | "manager" | "named";

export const RULE_AUDIENCES: RuleAudience[] = ["owner", "manager", "named"];

export const RULE_AUDIENCE_LABELS: Record<RuleAudience, string> = {
  owner: "The forecaster who owns it",
  manager: "Their commissioning manager",
  named: "One named person",
};

export interface AutomationRule {
  id: string;
  label: string;
  enabled: boolean;
  /** Every condition has to hold. An empty list would match everything, so
      the API refuses to save one. */
  when: RuleCondition[];
  tell: RuleAudience;
  /** For `named`: whose address. */
  namedEmail?: string;
  /** What to say. `{title}` and `{days}` are filled in from the piece. */
  message: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

/** Whether somebody's work is past its deadline and still not in. */
export function isLate(item: ContentItem, today: string): boolean {
  const done = ["submitted", "in-review", "published"].includes(item.status);
  return !done && item.submissionDate < today;
}

/** One piece of work, as the fields a rule can test. */
export function factsFor(item: ContentItem, today: string): Record<string, string> {
  return {
    status: item.status,
    type: item.type ?? "",
    vertical: item.vertical ?? "",
    season: item.forecastHorizon ?? "",
    title: item.title ?? "",
    daysToSubmission: String(daysUntil(today, item.submissionDate)),
    daysToPublication: String(daysUntil(today, item.publicationDate)),
    late: isLate(item, today) ? "yes" : "no",
  };
}

function testOne(facts: Record<string, string>, condition: RuleCondition): boolean {
  const cell = (facts[condition.field] ?? "").trim();
  const want = (condition.value ?? "").trim();

  switch (condition.op) {
    case "empty":
      return cell === "" || cell === "no";
    case "not-empty":
      return cell !== "" && cell !== "no";
    case "is":
      return cell.toLowerCase() === want.toLowerCase();
    case "is-not":
      return cell.toLowerCase() !== want.toLowerCase();
    case "contains":
      return want !== "" && cell.toLowerCase().includes(want.toLowerCase());
    case "gt":
    case "lt": {
      const a = Number(cell);
      const b = Number(want);
      // A comparison against something that is not a number is false rather
      // than true: a rule nobody can read the result of should not fire.
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      return condition.op === "gt" ? a > b : a < b;
    }
    default:
      return false;
  }
}

/** Every condition has to hold — there is no "any of these" and nobody has asked. */
export function ruleMatches(
  item: ContentItem,
  rule: AutomationRule,
  today: string,
): boolean {
  if (!rule.enabled || rule.when.length === 0) return false;
  const facts = factsFor(item, today);
  return rule.when.every((c) => testOne(facts, c));
}

/**
 * The message, with the piece's own details in it.
 *
 * Three placeholders and no more: a template language is a programming
 * language, and this is a box on a form.
 *
 * `{days}` carries its own unit — "1 day", "7 days" — rather than being a
 * bare number. Otherwise every rule anybody writes says "1 days" one day in
 * seven, and the alternative is asking an admin to think about plurals in a
 * text box.
 */
export function fillMessage(message: string, item: ContentItem, today: string): string {
  const days = Math.abs(daysUntil(today, item.submissionDate));
  return message
    .replaceAll("{title}", item.title ?? "")
    .replaceAll("{days}", `${days} ${days === 1 ? "day" : "days"}`)
    .replaceAll("{status}", item.status ?? "");
}

/**
 * Who this rule tells about this piece.
 *
 * A named person who is not on the team is not an error — they may have left
 * — but there is nobody to tell, so the rule quietly matches nothing for that
 * piece rather than throwing.
 */
function audienceFor(
  item: ContentItem,
  rule: AutomationRule,
  people: Person[],
): Person | undefined {
  if (rule.tell === "owner") return people.find((p) => p.id === item.forecasterId);
  if (rule.tell === "manager") return people.find((p) => p.id === item.managerId);
  const want = (rule.namedEmail ?? "").toLowerCase();
  return people.find((p) => p.email.toLowerCase() === want);
}

/**
 * What every enabled rule has to say today.
 *
 * The key carries the rule, the piece and the day. The rule and the piece
 * because that is the thing being said; the day because a rule is a standing
 * condition rather than an event — "this is still late" is worth saying again
 * tomorrow, where "you were told about this deadline" is not. Without the
 * day, a rule would fire once ever and then go quiet on a problem that had
 * not gone away.
 */
export function ruleNotices(
  content: ContentItem[],
  people: Person[],
  rules: AutomationRule[],
  today: string,
): Notice[] {
  const out: Notice[] = [];
  for (const rule of rules) {
    if (!rule.enabled || rule.when.length === 0) continue;
    for (const item of content) {
      if (!ruleMatches(item, rule, today)) continue;
      const person = audienceFor(item, rule, people);
      if (!person) continue;
      out.push({
        key: `${person.id}:rule:${rule.id}:${item.id}:${today}`,
        personId: person.id,
        kind: "rule",
        title: rule.label,
        body: fillMessage(rule.message, item, today),
        link: `/content/${item.id}`,
        // Rules are a standing condition rather than an emergency: one step
        // above ordinary, below a deadline that has actually gone.
        urgency: 1,
      });
    }
  }
  return out;
}
