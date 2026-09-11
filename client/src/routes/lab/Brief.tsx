import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApi } from "../../lib/api";
import { Slot } from "../../lib/custom";
import { formatLong } from "../../lib/date";
import { Icon } from "../../lib/icons";
import { useViewer } from "../../lib/viewer";
import type { ContentItem, Person } from "../../types";
import { Loading } from "../../components/bits";

/**
 * Briefing a freelancer, from what the Hub already knows.
 *
 * A brief is mostly context a forecaster types out again every time: which
 * forecast this is for, who it is for, what season, when it is due, what has
 * already been gathered. All of that is in the Hub — so the only things worth
 * asking for are the ones only the forecaster knows: what the freelancer is
 * actually being asked to make, and anything particular about how.
 *
 * The output is text, deliberately. It goes in an email or a message to
 * somebody outside the company who will never have a Hub account, so a page
 * they cannot open would be the wrong deliverable. Copy it, send it.
 *
 * The dates are the real dates: a freelance deadline is set back from the
 * submission date, so the brief works it out rather than leaving a gap
 * somebody fills in with "asap".
 */

/** Days before the forecast is due that the freelance work should land. */
const LEAD_DAYS = 7;

const KINDS = [
  "Image research",
  "Trend research",
  "Written copy",
  "Data gathering",
  "Photography",
  "Illustration",
];

const before = (date: string, days: number): string => {
  const at = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return date;
  at.setUTCDate(at.getUTCDate() - days);
  return at.toISOString().slice(0, 10);
};

export default function Brief() {
  const { me, person } = useViewer();
  const [params, setParams] = useSearchParams();
  const content = useApi<ContentItem[]>("/content");
  const people = useApi<Person[]>("/people");

  const chosen = params.get("for") ?? "";
  const [who, setWho] = useState("");
  const [kind, setKind] = useState(KINDS[0]);
  const [deliverable, setDeliverable] = useState("");
  const [extra, setExtra] = useState("");
  const [copied, setCopied] = useState(false);

  // The forecast in full, for its research links and its peer review — the
  // list endpoint carries neither.
  const full = useApi<ContentItem>(chosen ? `/content/${chosen}` : "");
  const item = full.data;

  const mine = useMemo(() => {
    const rows = content.data ?? [];
    const owned = person ? rows.filter((c) => c.forecasterId === person.id) : rows;
    // Yours first, because briefing somebody else's forecast is the exception.
    return [...owned, ...rows.filter((c) => !owned.includes(c))].filter(
      (c) => c.status !== "published",
    );
  }, [content.data, person]);

  const byId = useMemo(
    () => new Map((people.data ?? []).map((p) => [p.id, p])),
    [people.data],
  );

  const brief = useMemo(() => {
    if (!item) return "";
    const due = before(item.submissionDate, LEAD_DAYS);
    const links = item.details?.researchLinks ?? [];
    const lines = [
      `Brief: ${kind} for “${item.title}”`,
      "",
      `For: ${who.trim() || "[freelancer]"}`,
      `From: ${me.name}${me.email ? ` (${me.email})` : ""}`,
      "",
      "THE FORECAST",
      `Title: ${item.title}`,
      `Type: ${item.details?.contentType ?? item.type}`,
      `Vertical: ${item.vertical}`,
      `Season: ${item.season}`,
      `Publishes: ${formatLong(item.publicationDate)}`,
      "",
      "WHAT I NEED",
      `${kind}${deliverable.trim() ? `: ${deliverable.trim()}` : ""}`,
      `Back to me by: ${formatLong(due)} — the forecast itself is due ${formatLong(
        item.submissionDate,
      )}, so this needs to land a week before.`,
      "",
    ];

    if (links.length) {
      lines.push("CONTEXT ALREADY GATHERED");
      for (const link of links) lines.push(`- ${link.label}: ${link.url}`);
      lines.push("");
    }

    if (extra.trim()) {
      lines.push("ANYTHING ELSE", extra.trim(), "");
    }

    lines.push(
      "HOUSE RULES",
      "- Everything sourced: a figure without a source cannot be used.",
      "- Images need rights cleared for WGSN publication, with the credit as it should appear.",
      "- Flag anything you think contradicts the brief rather than quietly resolving it.",
    );
    return lines.join("\n");
  }, [item, kind, who, deliverable, extra, me]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy the brief", brief);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <Slot id="brief.eyebrow" as="div" className="eyebrow" />
          <Slot id="brief.title" as="h1" className="page-title" />
          <Slot id="brief.sub" as="p" className="page-sub" />
        </div>
      </div>

      <div className="lab-layout brief-layout">
        <div className="lab-form">
          <section>
            <Slot id="brief.about" as="h2" className="section-title" />
            <label className="field">
              <span className="field-label">Which forecast is this for?</span>
              <select
                value={chosen}
                onChange={(e) => {
                  const next = new URLSearchParams(params);
                  if (e.target.value) next.set("for", e.target.value);
                  else next.delete("for");
                  // Replace: choosing a forecast is a filter, not a step.
                  setParams(next, { replace: true });
                }}
              >
                <option value="">Choose a forecast…</option>
                {content.loading && <option disabled>Loading…</option>}
                {mine.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} — {c.season}
                    {person && c.forecasterId !== person.id
                      ? ` (${byId.get(c.forecasterId)?.name ?? "somebody else"})`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            {item && (
              <div className="brief-context">
                <span>
                  <Icon name="calendar" size={14} /> Due {formatLong(item.submissionDate)}
                </span>
                <span>
                  <Icon name="published" size={14} /> Publishes{" "}
                  {formatLong(item.publicationDate)}
                </span>
                <span>
                  <Icon name="link" size={14} />{" "}
                  {item.details?.researchLinks?.length ?? 0} research link
                  {(item.details?.researchLinks?.length ?? 0) === 1 ? "" : "s"} attached
                </span>
              </div>
            )}
          </section>

          <section>
            <Slot id="brief.work" as="h2" className="section-title" />
            <label className="field">
              <span className="field-label">Who is it for?</span>
              <input
                value={who}
                onChange={(e) => setWho(e.target.value)}
                placeholder="The freelancer’s name"
              />
            </label>
            <label className="field">
              <span className="field-label">What kind of work?</span>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                {KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">What exactly do you need?</span>
              <textarea
                rows={3}
                value={deliverable}
                onChange={(e) => setDeliverable(e.target.value)}
                placeholder="30 images of workwear detailing from independent retail, Berlin and Copenhagen"
              />
            </label>
            <label className="field">
              <span className="field-label">Anything else they should know</span>
              <textarea
                rows={3}
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                placeholder="Avoid anything we ran in the S/S 27 update. Budget agreed separately."
              />
            </label>
          </section>
        </div>

        <div>
          <Slot id="brief.preview" as="h2" className="section-title" />
          {!chosen ? (
            <p className="muted" style={{ marginTop: 8 }}>
              Choose a forecast and the brief writes itself from here.
            </p>
          ) : full.loading ? (
            <Loading />
          ) : (
            <>
              <pre className="brief-preview">{brief}</pre>
              <div className="lab-actions">
                <button className="btn solid" onClick={copy}>
                  <Icon name="copy" size={15} />
                  {copied ? "Copied" : "Copy the brief"}
                </button>
                <span className="muted">
                  Paste it into an email. Nothing is sent from here.
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
