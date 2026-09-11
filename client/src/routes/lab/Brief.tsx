import { useMemo, useRef, useState } from "react";
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
 * forecast this is for, what season, when it is due, what has already been
 * gathered. All of that is in the Hub — so the only things worth asking for
 * are the ones only the forecaster knows.
 *
 * The shape of the rest comes from the freelance framework: as of September
 * 2026 freelancers reach Report Editor and Workspace II and nothing else, so
 * **a brief cannot carry links to reports**. What used to be "here are the
 * links" is now "PDF up to five pages, from separate pieces where you can" —
 * and red-threading, which depended on a freelancer being able to browse the
 * site, is in-house work now. The page is built around that rather than
 * mentioning it in a footnote, because a rule nobody sees is a rule somebody
 * breaks with a pasted URL.
 *
 * The rest is the standing housekeeping — submission date, PO number, areas
 * of focus, sustainability, DEI, data requirements. Most of it is the same
 * every time for a given forecaster, which is exactly why having it written
 * down beats remembering it.
 *
 * The output is plain text, deliberately. It goes in an email to somebody
 * outside the company, so a page they cannot open would be the wrong
 * deliverable. Copy it, attach the files, send it.
 */

/** Days before the forecast is due that the freelance work should land. */
const LEAD_DAYS = 7;

/** The framework's cap: five report pages per brief, from separate pieces. */
const MAX_PAGES = 5;

const KINDS = [
  "Image research",
  "Trend research",
  "Written copy",
  "Data gathering",
  "Photography",
  "Illustration",
  "A full report build",
];

/**
 * The DEI elements, as the framework lists them. At least two are expected in
 * every forecast, which the page checks rather than hopes for.
 */
const DEI = [
  "Age",
  "Body shape and size",
  "Belief and faith sensitivity",
  "Cultural sensitivity",
  "Accessibility, including neurodiversity",
  "Ethnicity, including race",
  "Gender expression",
  "Socio-economic situation",
];

const DEI_MINIMUM = 2;

interface Page {
  id: number;
  /** Which piece it comes from — the framework asks for a spread of them. */
  from: string;
  pages: string;
  why: string;
}

interface Attachment {
  id: number;
  name: string;
  size: number;
}

const before = (date: string, days: number): string => {
  const at = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return date;
  at.setUTCDate(at.getUTCDate() - days);
  return at.toISOString().slice(0, 10);
};

const size = (bytes: number): string =>
  bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`;

const isLink = (value: string): boolean => /^https?:\/\/\S+$/i.test(value.trim());

export default function Brief() {
  const { me, person } = useViewer();
  const [params, setParams] = useSearchParams();
  const content = useApi<ContentItem[]>("/content");
  const people = useApi<Person[]>("/people");
  const files = useRef<HTMLInputElement | null>(null);

  const chosen = params.get("for") ?? "";

  // The work
  const [who, setWho] = useState("");
  const [kind, setKind] = useState(KINDS[0]);
  const [deliverable, setDeliverable] = useState("");
  const [due, setDue] = useState("");
  const [po, setPo] = useState("");
  const [title, setTitle] = useState("");

  // What they get to work from
  const [miro, setMiro] = useState("");
  const [pages, setPages] = useState<Page[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [over, setOver] = useState(false);

  // The standing sections
  const [audience, setAudience] = useState("");
  const [consumer, setConsumer] = useState("");
  const [categories, setCategories] = useState("");
  const [sustainability, setSustainability] = useState("");
  const [dei, setDei] = useState<string[]>([]);
  const [sources, setSources] = useState("");
  const [avoid, setAvoid] = useState("");
  const [uniquePerProof, setUniquePerProof] = useState(true);
  const [why, setWhy] = useState("");
  const [copied, setCopied] = useState(false);

  // The forecast in full, for its research links — which are no longer pasted
  // into the brief, but are the best list of what is worth PDF-ing.
  const full = useApi<ContentItem>(chosen ? `/content/${chosen}` : "");
  const item = full.data;

  const forecasts = useMemo(() => {
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

  const deadline = due || (item ? before(item.submissionDate, LEAD_DAYS) : "");
  const sameSource =
    new Set(pages.map((p) => p.from.trim().toLowerCase()).filter(Boolean)).size < pages.length;

  const toggleDei = (element: string) =>
    setDei((was) => (was.includes(element) ? was.filter((d) => d !== element) : [...was, element]));

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setAttachments((was) => [
      ...was,
      ...Array.from(list).map((file, i) => ({
        id: Date.now() + i,
        name: file.name,
        size: file.size,
      })),
    ]);
  };

  const brief = useMemo(() => {
    if (!item) return "";
    const lines = [
      `Brief: ${kind} for “${title.trim() || item.title}”`,
      "",
      `For: ${who.trim() || "[freelancer]"}`,
      `From: ${me.name}${me.email ? ` (${me.email})` : ""}`,
      "",
      "THE REPORT",
      `Working title: ${title.trim() || item.title}`,
      `Format: ${item.details?.contentType ?? item.type}`,
      `Vertical: ${item.vertical}`,
      `Season: ${item.season}`,
      `Publishes: ${formatLong(item.publicationDate)}`,
      "",
      "WHAT I NEED",
      `${kind}${deliverable.trim() ? `: ${deliverable.trim()}` : ""}`,
      `Back to me by: ${formatLong(deadline)} — the forecast itself is due ${formatLong(
        item.submissionDate,
      )}. I submit on your behalf, so that is the date that matters.`,
      po.trim() ? `PO number: ${po.trim()}` : "PO number: [to be confirmed before you start]",
      "Invoice on completion, once we have agreed the work is finished.",
      "",
    ];

    lines.push("WHAT YOU HAVE TO WORK FROM");
    if (miro.trim()) lines.push(`Miro board: ${miro.trim()}`);
    if (pages.length) {
      lines.push(
        `Report pages attached as PDFs (${pages.length} of ${MAX_PAGES}):`,
        ...pages.map(
          (p) =>
            `- ${p.from.trim() || "[which report]"}${p.pages.trim() ? `, p${p.pages.trim()}` : ""}${
              p.why.trim() ? ` — ${p.why.trim()}` : ""
            }`,
        ),
      );
    }
    if (attachments.length) {
      lines.push("Also attached:", ...attachments.map((a) => `- ${a.name} (${size(a.size)})`));
    }
    lines.push(
      "You will not be able to open links to WGSN reports — freelance access is",
      "Report Editor and Workspace II only — so everything you need is attached",
      "rather than linked. Ask me for anything else and I will PDF it.",
      "",
    );

    lines.push(
      "THE OPPORTUNITY — WHY THIS REPORT",
      why.trim() || "[what we want this to say, and where you should push further]",
      "",
    );

    lines.push("AREAS OF FOCUS");
    if (audience.trim()) lines.push(`Who it is for: ${audience.trim()}`);
    lines.push(`Season: ${item.season}`);
    if (consumer.trim()) lines.push(`End consumer: ${consumer.trim()}`);
    if (categories.trim()) lines.push(`Categories: ${categories.trim()}`);
    lines.push("");

    if (sustainability.trim()) lines.push("SUSTAINABILITY", sustainability.trim(), "");

    lines.push(
      "DEI",
      `At least ${DEI_MINIMUM} of these elements should be visible in the work:`,
      ...(dei.length ? dei : DEI).map((d) => `- ${d}`),
      "Ask me if you want guidance on any of them.",
      "",
    );

    lines.push("DATA");
    if (sources.trim()) lines.push(`Suggested sources: ${sources.trim()}`);
    if (avoid.trim()) lines.push(`Do not use: ${avoid.trim()}`);
    if (uniquePerProof) lines.push("Every Proof Points page needs its own unique data point.");
    lines.push("Everything sourced: a figure without a source cannot be used.", "");

    lines.push(
      "HOUSE RULES",
      "- Images need rights cleared for WGSN publication, with the credit as it should appear.",
      "- Do not add internal links or cross-references; we red-thread in-house now.",
      "- Flag anything you think contradicts the brief rather than quietly resolving it.",
    );
    return lines.join("\n");
  }, [
    item,
    kind,
    title,
    who,
    me,
    deliverable,
    deadline,
    po,
    miro,
    pages,
    attachments,
    why,
    audience,
    consumer,
    categories,
    sustainability,
    dei,
    sources,
    avoid,
    uniquePerProof,
  ]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy the brief", brief);
    }
  }

  const research = item?.details?.researchLinks ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <Slot id="brief.eyebrow" as="div" className="eyebrow" />
          <Slot id="brief.title" as="h1" className="page-title" />
          <Slot id="brief.sub" as="p" className="page-sub" />
        </div>
      </div>

      {/*
        The one thing on this page that is not a preference. It sits above the
        form rather than in the output, because the moment to know is while
        you are deciding what to send.
      */}
      <div className="callout access-note">
        <strong>Freelancers cannot open our reports.</strong>
        <div style={{ marginTop: 4 }}>
          Since 4 September 2026 freelance access is Report Editor and Workspace II only. A
          brief carries attachments, not links: up to {MAX_PAGES} report pages as PDFs, from
          separate pieces where you can. Red-threading and back-links are in-house work now.
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
                {forecasts.map((c) => (
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
                  <Icon name="calendar" size={14} /> Forecast due{" "}
                  {formatLong(item.submissionDate)}
                </span>
                <span>
                  <Icon name="published" size={14} /> Publishes{" "}
                  {formatLong(item.publicationDate)}
                </span>
                <span>
                  <Icon name="tier" size={14} /> {item.details?.contentType ?? item.type}
                </span>
              </div>
            )}
            <label className="field">
              <span className="field-label">Working title — blank uses the forecast’s</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={item?.title ?? "The title, formatted as it should be"}
              />
            </label>
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
              <span className="field-label">Back to you by</span>
              <input type="date" value={deadline} onChange={(e) => setDue(e.target.value)} />
            </label>
            {item && (
              <p className="muted small">
                A week before your own submission date unless you change it. You submit on
                the freelancer’s behalf, so leave room to read it first.
              </p>
            )}
            <label className="field">
              <span className="field-label">PO number</span>
              <input
                value={po}
                onChange={(e) => setPo(e.target.value)}
                placeholder="From your CM — agreed before the work starts"
              />
            </label>
          </section>

          <section>
            <Slot id="brief.context" as="h2" className="section-title" />
            <label className="field">
              <span className="field-label">Miro board</span>
              <input
                value={miro}
                onChange={(e) => setMiro(e.target.value)}
                placeholder="https://miro.com/app/board/…"
              />
            </label>
            {miro.trim() && !isLink(miro) && (
              <p className="muted small">
                That does not look like a link — it needs the https:// address.
              </p>
            )}

            <div className="pages-head">
              <span className="field-label">Report pages to PDF</span>
              <span className={pages.length > MAX_PAGES ? "count-over" : "muted small"}>
                {pages.length} of {MAX_PAGES}
              </span>
            </div>
            {pages.map((p, i) => (
              <div className="page-row" key={p.id}>
                <input
                  value={p.from}
                  onChange={(e) =>
                    setPages(pages.map((r, j) => (i === j ? { ...r, from: e.target.value } : r)))
                  }
                  placeholder="Which report"
                  aria-label={`Report for page ${i + 1}`}
                />
                <input
                  value={p.pages}
                  onChange={(e) =>
                    setPages(pages.map((r, j) => (i === j ? { ...r, pages: e.target.value } : r)))
                  }
                  placeholder="Page"
                  aria-label={`Page number for page ${i + 1}`}
                />
                <input
                  value={p.why}
                  onChange={(e) =>
                    setPages(pages.map((r, j) => (i === j ? { ...r, why: e.target.value } : r)))
                  }
                  placeholder="Why it is useful"
                  aria-label={`Reason for page ${i + 1}`}
                />
                <button
                  className="btn small danger"
                  onClick={() => setPages(pages.filter((_, j) => j !== i))}
                  aria-label={`Remove page ${i + 1}`}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
            <button
              className="btn"
              onClick={() => setPages([...pages, { id: Date.now(), from: "", pages: "", why: "" }])}
            >
              <Icon name="plus" /> Add a page
            </button>
            {pages.length > MAX_PAGES && (
              <div className="callout warn" role="alert">
                That is more than the {MAX_PAGES} pages a brief is allowed. Take one out, or
                ask your CM before sending.
              </div>
            )}
            {sameSource && pages.length > 1 && (
              <p className="muted small">
                Two of those are from the same piece. A mix gives a freelancer the trend’s
                history rather than one snapshot of it.
              </p>
            )}
            {research.length > 0 && (
              <div className="research-hint">
                <span className="field-label">Already on this forecast</span>
                <ul>
                  {research.map((link) => (
                    <li key={link.url}>{link.label}</li>
                  ))}
                </ul>
                <p className="muted small">
                  Worth PDF-ing rather than linking — a freelancer cannot open these.
                </p>
              </div>
            )}

            {/*
              The files stay on this machine. Nothing is uploaded, because
              there is nowhere to upload to yet and pretending otherwise would
              lose somebody's research — so they are listed in the brief and
              attached to the email by hand.
            */}
            <span className="field-label spaced">Screenshots, research, data</span>
            <div
              className={over ? "drop-zone over" : "drop-zone"}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                addFiles(e.dataTransfer.files);
              }}
            >
              <Icon name="image" size={22} />
              <p>Drop files here to list them in the brief</p>
              <button className="btn" onClick={() => files.current?.click()}>
                Choose files
              </button>
              <input
                ref={files}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <small className="muted">
                They stay on your machine. The Hub lists them so the brief says what is
                coming, and you attach them to the email.
              </small>
            </div>
            {attachments.length > 0 && (
              <ul className="attachments">
                {attachments.map((a) => (
                  <li key={a.id}>
                    <Icon name="note" size={14} />
                    <span>{a.name}</span>
                    <em>{size(a.size)}</em>
                    <button
                      onClick={() => setAttachments(attachments.filter((x) => x.id !== a.id))}
                      aria-label={`Remove ${a.name}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <Slot id="brief.why" as="h2" className="section-title" />
            <label className="field">
              <span className="field-label">The opportunity, and where to push further</span>
              <textarea
                rows={4}
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                placeholder="Why this report, now. What we think is happening, what we are not sure about, and what you want them to go and find out."
              />
            </label>
          </section>

          <section>
            <Slot id="brief.focus" as="h2" className="section-title" />
            <label className="field">
              <span className="field-label">Who is the content for?</span>
              <input
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="Job function — buyers, designers, product developers"
              />
            </label>
            <label className="field">
              <span className="field-label">End consumer</span>
              <input
                value={consumer}
                onChange={(e) => setConsumer(e.target.value)}
                placeholder="The group or demographic the forecast speaks to"
              />
            </label>
            <label className="field">
              <span className="field-label">Categories to include or leave out</span>
              <input
                value={categories}
                onChange={(e) => setCategories(e.target.value)}
                placeholder="Outerwear and knitwear; no footwear"
              />
            </label>
            <label className="field">
              <span className="field-label">Sustainability</span>
              <textarea
                rows={2}
                value={sustainability}
                onChange={(e) => setSustainability(e.target.value)}
                placeholder="Key topics and materials to cover"
              />
            </label>
          </section>

          <section>
            <Slot id="brief.dei" as="h2" className="section-title" />
            <p className="muted small">
              At least {DEI_MINIMUM} elements in every forecast. Choose the ones this piece
              should carry; leaving them all unpicked sends the whole list.
            </p>
            <div className="dei-picker">
              {DEI.map((element) => (
                <button
                  key={element}
                  className={dei.includes(element) ? "pick on" : "pick"}
                  onClick={() => toggleDei(element)}
                  aria-pressed={dei.includes(element)}
                >
                  {element}
                </button>
              ))}
            </div>
            {dei.length > 0 && dei.length < DEI_MINIMUM && (
              <div className="callout warn" role="alert">
                Two is the minimum. Pick one more, or leave them all unpicked to send the
                whole list.
              </div>
            )}
          </section>

          <section>
            <Slot id="brief.data" as="h2" className="section-title" />
            <label className="field">
              <span className="field-label">Suggested sources</span>
              <textarea
                rows={2}
                value={sources}
                onChange={(e) => setSources(e.target.value)}
                placeholder="Where the numbers should come from"
              />
            </label>
            <label className="field">
              <span className="field-label">Do not use</span>
              <textarea
                rows={2}
                value={avoid}
                onChange={(e) => setAvoid(e.target.value)}
                placeholder="Sources we do not cite"
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={uniquePerProof}
                onChange={(e) => setUniquePerProof(e.target.checked)}
              />
              <span>Every Proof Points page needs its own unique data point</span>
            </label>
          </section>
        </div>

        <div className="brief-out">
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
                  Paste it into an email and attach the files. Nothing is sent from here.
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
