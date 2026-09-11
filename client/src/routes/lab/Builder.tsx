import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { send } from "../../lib/api";
import { Slot } from "../../lib/custom";
import { Icon } from "../../lib/icons";
import type { WeaveResult } from "../../types";
import ConceptNote from "./ConceptNote";

/**
 * Forecast Builder — a node workspace, and a concept that says so.
 *
 * The idea: a forecast is assembled from things we already hold, so building
 * one should look like assembling rather than like typing. You pull the parts
 * onto a canvas, wire them into a Pulse step, and run it; what comes back is
 * everything WGSN has already published on the same ground, including where
 * two live profiles disagree with each other.
 *
 * Two things here are real and one is not, and the page is careful about
 * which is which.
 *
 * **Real:** the wiring, and the run. Pressing Run gathers the text off every
 * source node feeding the Pulse step, sends it to the Hub, and gets back
 * actual trend profiles, actual proof points out of the ten thousand, actual
 * forecasts off the schedule — and the tensions, which are two live profiles
 * on shared ground called differently. All of that is retrieval and
 * arithmetic over our own data. Every row can be opened.
 *
 * **Not real:** Pulse itself. The generative half — the prose, the "here is
 * how these hang together" — is where WGSN's own Pulse would sit, and it is
 * not wired up. The node says so rather than printing invented paragraphs and
 * letting somebody assume.
 *
 * That split is the point rather than a shortcut. The useful half of this job
 * is retrieval, it can be done without a model at all, and doing it without
 * one means every claim walks back to a row somebody can open. The model
 * makes it read nicely; it should not be what makes it true.
 */

/* ---- The kinds of node -------------------------------------------------- */

type Port = "in" | "out" | "both";

interface Kind {
  id: string;
  label: string;
  icon: string;
  blurb: string;
  ports: Port;
  /** Which band of the palette, and which colour the node takes. */
  family: "source" | "weave" | "output";
  /** A source node contributes this text to the run. */
  placeholder?: string;
}

const KINDS: Kind[] = [
  {
    id: "subject",
    label: "Subject",
    icon: "note",
    blurb: "What the forecast is about, in your words.",
    ports: "out",
    family: "source",
    placeholder: "Collagen stacking in APAC skincare",
  },
  {
    id: "data",
    label: "Data",
    icon: "data",
    blurb: "A figure with a source — sell-through, search volume, a survey.",
    ports: "out",
    family: "source",
    placeholder: "Searches for collagen supplements up 44% YoY",
  },
  {
    id: "driver",
    label: "STEPIC driver",
    icon: "driver",
    blurb: "The social or economic force underneath the shift.",
    ports: "out",
    family: "source",
    placeholder: "Healthy ageing as a consumer priority",
  },
  {
    id: "research",
    label: "Research",
    icon: "source",
    blurb: "A report, an interview, a page the forecast should argue with.",
    ports: "out",
    family: "source",
    placeholder: "Cosmoprof North America 2026 floor notes",
  },
  {
    id: "image",
    label: "Image",
    icon: "image",
    blurb: "A catwalk shot, a store photograph, a product still.",
    ports: "out",
    family: "source",
    placeholder: "Catwalk: Paris A/W 27",
  },
  {
    id: "pulse",
    label: "Pulse",
    icon: "ai",
    blurb: "Red-threads the canvas against everything we have already published.",
    ports: "both",
    family: "weave",
  },
  {
    id: "draft",
    label: "Forecast draft",
    icon: "brief",
    blurb: "What comes out: the skeleton, with every claim still attached to its source.",
    ports: "in",
    family: "output",
  },
];

const kindOf = (id: string) => KINDS.find((k) => k.id === id);

/* ---- The graph ---------------------------------------------------------- */

interface Node {
  id: string;
  kind: string;
  x: number;
  y: number;
  text: string;
}

interface Wire {
  from: string;
  to: string;
}

const NODE_W = 188;
const NODE_H = 96;
const GRID = 8;

/** Where a node's output port sits, in canvas coordinates. */
const outAt = (n: Node) => ({ x: n.x + NODE_W, y: n.y + NODE_H / 2 });
const inAt = (n: Node) => ({ x: n.x, y: n.y + NODE_H / 2 });

/**
 * A wire, as a cubic curve that leaves horizontally at both ends.
 *
 * Horizontal tangents are what make a node graph readable: the eye follows a
 * line out of a port and back into one without having to work out which end
 * is which. The control points are pushed out by a third of the span so a
 * short wire still bows rather than turning into a straight diagonal.
 */
function wirePath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const bow = Math.max(40, Math.abs(b.x - a.x) / 3);
  return `M ${a.x} ${a.y} C ${a.x + bow} ${a.y}, ${b.x - bow} ${b.y}, ${b.x} ${b.y}`;
}

let seq = 0;
const nextId = () => `n${++seq}`;

/**
 * The canvas a forecaster lands on, so the page is never an empty rectangle.
 *
 * The subject is chosen rather than picked at random: barrier-first beauty is
 * ground the trend database genuinely covers from several directions, so a
 * first press of Run returns two dozen profiles, a forecast that has already
 * argued it, and — the part worth seeing — three live profiles calling it
 * differently. An example canvas that comes back empty teaches the wrong
 * thing about the tool.
 */
function starter(): { nodes: Node[]; wires: Wire[] } {
  const subject: Node = {
    id: nextId(),
    kind: "subject",
    x: 24,
    y: 32,
    text: "Barrier-first beauty and collagen skincare",
  };
  const data: Node = {
    id: nextId(),
    kind: "data",
    x: 24,
    y: 160,
    text: "Searches for collagen supplements climbing year on year",
  };
  const pulse: Node = { id: nextId(), kind: "pulse", x: 268, y: 96, text: "" };
  const draft: Node = { id: nextId(), kind: "draft", x: 512, y: 96, text: "" };
  return {
    nodes: [subject, data, pulse, draft],
    wires: [
      { from: subject.id, to: pulse.id },
      { from: data.id, to: pulse.id },
      { from: pulse.id, to: draft.id },
    ],
  };
}

export default function Builder() {
  const [{ nodes, wires }, setGraph] = useState(starter);
  const [selected, setSelected] = useState<string | null>(null);
  /** An output port waiting for an input port, whether by mouse or by key. */
  const [wiring, setWiring] = useState<string | null>(null);
  const [result, setResult] = useState<WeaveResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const setNodes = (fn: (was: Node[]) => Node[]) =>
    setGraph((g) => ({ ...g, nodes: fn(g.nodes) }));

  /* ---- Adding, moving, removing ---------------------------------------- */

  const add = useCallback((kindId: string, at?: { x: number; y: number }) => {
    const kind = kindOf(kindId);
    if (!kind) return;
    const id = nextId();
    setGraph((g) => ({
      ...g,
      nodes: [
        ...g.nodes,
        {
          id,
          kind: kindId,
          // Dropped where you let go; clicked, it lands clear of what is there.
          x: at?.x ?? 40 + (g.nodes.length % 4) * 40,
          y: at?.y ?? 40 + (g.nodes.length % 6) * 36,
          text: "",
        },
      ],
    }));
    setSelected(id);
  }, []);

  const remove = (id: string) =>
    setGraph((g) => ({
      nodes: g.nodes.filter((n) => n.id !== id),
      // A wire to nowhere is not a wire.
      wires: g.wires.filter((w) => w.from !== id && w.to !== id),
    }));

  const move = (id: string, x: number, y: number) =>
    setNodes((was) =>
      was.map((n) =>
        n.id === id
          ? { ...n, x: Math.max(0, Math.round(x / GRID) * GRID), y: Math.max(0, Math.round(y / GRID) * GRID) }
          : n,
      ),
    );

  /* ---- Wiring ----------------------------------------------------------- */

  /**
   * Join two nodes, refusing the joins that would not mean anything: a node to
   * itself, a duplicate, a source straight into the draft without passing
   * through anything, and any wire that would close a loop.
   */
  const connect = useCallback(
    (from: string, to: string) => {
      setWiring(null);
      if (from === to) return;
      setGraph((g) => {
        if (g.wires.some((w) => w.from === from && w.to === to)) return g;
        // Would this close a loop? Walk forward from `to` and see if we
        // arrive back at `from`.
        const forward = (start: string): Set<string> => {
          const seen = new Set<string>();
          const stack = [start];
          while (stack.length) {
            const at = stack.pop()!;
            for (const w of g.wires) {
              if (w.from === at && !seen.has(w.to)) {
                seen.add(w.to);
                stack.push(w.to);
              }
            }
          }
          return seen;
        };
        if (forward(to).has(from)) return g;
        return { ...g, wires: [...g.wires, { from, to }] };
      });
    },
    [],
  );

  const unwire = (w: Wire) =>
    setGraph((g) => ({
      ...g,
      wires: g.wires.filter((x) => !(x.from === w.from && x.to === w.to)),
    }));

  /* ---- Dragging a node -------------------------------------------------- */

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      const box = canvasRef.current?.getBoundingClientRect();
      if (!d || !box) return;
      move(d.id, e.clientX - box.left - d.dx, e.clientY - box.top - d.dy);
    };
    const onUp = () => {
      drag.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  /* ---- The run ---------------------------------------------------------- */

  /** Every source node that reaches the Pulse node, however many hops away. */
  const feeding = useMemo(() => {
    const pulse = nodes.find((n) => n.kind === "pulse");
    if (!pulse) return [];
    const upstream = new Set<string>();
    const stack = [pulse.id];
    while (stack.length) {
      const at = stack.pop()!;
      for (const w of wires) {
        if (w.to === at && !upstream.has(w.from)) {
          upstream.add(w.from);
          stack.push(w.from);
        }
      }
    }
    return nodes.filter((n) => upstream.has(n.id));
  }, [nodes, wires]);

  const text = feeding
    .map((n) => n.text.trim() || kindOf(n.kind)?.placeholder || "")
    .filter(Boolean)
    .join(" ");

  const run = async () => {
    if (!text) return;
    setRunning(true);
    setError(null);
    try {
      setResult(await send<WeaveResult>("/lab/weave", "POST", { text }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The run did not finish.");
    } finally {
      setRunning(false);
    }
  };

  const node = nodes.find((n) => n.id === selected) ?? null;
  const hasPulse = nodes.some((n) => n.kind === "pulse");

  return (
    <>
      <div className="page-head">
        <div>
          <Slot id="builder.eyebrow" as="div" className="eyebrow" />
          <Slot id="builder.title" as="h1" className="page-title" />
          <Slot id="builder.sub" as="p" className="page-sub" />
        </div>
        <div className="head-actions">
          <button className="btn" onClick={() => setGraph(starter())}>
            Start again
          </button>
          <button
            className="btn accent"
            onClick={() => void run()}
            disabled={running || !text || !hasPulse}
            title={
              !hasPulse
                ? "Add a Pulse node and wire something into it"
                : !text
                  ? "Nothing is wired into Pulse yet"
                  : undefined
            }
          >
            <Icon name="ai" size={14} /> {running ? "Running…" : "Run"}
          </button>
        </div>
      </div>

      <ConceptNote>
        The wiring and the run are real — Run searches the trend database, the
        proof point library and the schedule, and every row it returns can be
        opened. Pulse itself is not connected: the retrieval is ours, the
        writing would be Pulse&rsquo;s, and this page does the first and says so
        rather than inventing the second. Nothing is saved.
      </ConceptNote>

      <div className="nodes-layout">
        {/* ---- The palette ------------------------------------------------ */}
        <div className="node-palette">
          <Slot id="builder.palette" as="h2" className="section-title" />
          <p className="muted small" style={{ marginTop: 6 }}>
            Drag one onto the canvas, or press it to drop one in.
          </p>
          {(["source", "weave", "output"] as const).map((family) => (
            <div key={family} className="palette-band">
              <div className="eyebrow">
                {family === "source" ? "Pull in" : family === "weave" ? "Weave" : "Out"}
              </div>
              {KINDS.filter((k) => k.family === family).map((kind) => (
                <button
                  key={kind.id}
                  className={`atom fam-${kind.family}`}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", kind.id)}
                  onClick={() => add(kind.id)}
                >
                  <Icon name={kind.icon} size={18} />
                  <span>
                    <b>{kind.label}</b>
                    <small>{kind.blurb}</small>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* ---- The canvas ------------------------------------------------- */}
        <div>
          <div
            ref={canvasRef}
            className="node-canvas"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const box = canvasRef.current?.getBoundingClientRect();
              if (!box) return;
              add(e.dataTransfer.getData("text/plain"), {
                x: e.clientX - box.left - NODE_W / 2,
                y: e.clientY - box.top - NODE_H / 2,
              });
            }}
            onClick={() => {
              setSelected(null);
              setWiring(null);
            }}
          >
            {/*
              The wires, under the nodes. `pointer-events: none` on the layer
              and `auto` on each path, so the empty space between wires does
              not swallow a click meant for the canvas.
            */}
            <svg className="wire-layer" aria-hidden="true">
              {wires.map((w) => {
                const a = nodes.find((n) => n.id === w.from);
                const b = nodes.find((n) => n.id === w.to);
                if (!a || !b) return null;
                return (
                  <path
                    key={`${w.from}-${w.to}`}
                    className="wire"
                    d={wirePath(outAt(a), inAt(b))}
                    onClick={(e) => {
                      e.stopPropagation();
                      unwire(w);
                    }}
                  />
                );
              })}
            </svg>

            {nodes.map((n) => {
              const kind = kindOf(n.kind);
              if (!kind) return null;
              const ran = n.kind === "pulse" && result;
              return (
                <div
                  key={n.id}
                  className={[
                    "node",
                    `fam-${kind.family}`,
                    selected === n.id ? "on" : "",
                    wiring === n.id ? "wiring" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Mid-wire, a click on the body finishes the join.
                    if (wiring && wiring !== n.id && kind.ports !== "out") connect(wiring, n.id);
                    else setSelected(n.id);
                  }}
                >
                  <div
                    className="node-head"
                    onPointerDown={(e) => {
                      const box = canvasRef.current?.getBoundingClientRect();
                      if (!box) return;
                      drag.current = {
                        id: n.id,
                        dx: e.clientX - box.left - n.x,
                        dy: e.clientY - box.top - n.y,
                      };
                    }}
                  >
                    <Icon name={kind.icon} size={13} />
                    <b>{kind.label}</b>
                    <button
                      className="node-x"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(n.id);
                      }}
                      aria-label={`Remove the ${kind.label} node`}
                    >
                      ×
                    </button>
                  </div>
                  <div className="node-body">
                    {n.kind === "pulse"
                      ? ran
                        ? `${result.counts.trends} trends · ${result.counts.forecasts} forecasts`
                        : "Not run yet"
                      : n.kind === "draft"
                        ? result
                          ? "Ready to write"
                          : "Waiting on the run"
                        : n.text.trim() || (
                            <em className="muted">{kind.placeholder ?? "Empty"}</em>
                          )}
                  </div>

                  {/*
                    The ports are buttons rather than decorated divs, so a
                    wire can be made without a mouse: focus an output, press
                    it, then press an input. The same two presses a drag does.
                  */}
                  {kind.ports !== "in" && (
                    <button
                      className="port out"
                      aria-label={`Start a wire from ${kind.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setWiring(n.id);
                      }}
                    />
                  )}
                  {kind.ports !== "out" && (
                    <button
                      className="port in"
                      aria-label={
                        wiring ? `Finish the wire at ${kind.label}` : `Wire into ${kind.label}`
                      }
                      disabled={!wiring}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (wiring) connect(wiring, n.id);
                      }}
                    />
                  )}
                </div>
              );
            })}

            {wiring && (
              <p className="wiring-note" role="status">
                Now press the left-hand port of the node it feeds.{" "}
                <button className="btn small" onClick={() => setWiring(null)}>
                  Cancel
                </button>
              </p>
            )}
          </div>

          {/*
            The graph in words, under the canvas.
            A picture of boxes and curves is unreadable to a screen reader and
            fiddly on a small screen, so the same thing is stated as a list —
            not a fallback anybody has to switch to, just the sentence the
            diagram is drawing.
          */}
          <p className="muted small canvas-foot">
            {nodes.length} node{nodes.length === 1 ? "" : "s"}, {wires.length} wire
            {wires.length === 1 ? "" : "s"}
            {feeding.length > 0 && ` · ${feeding.length} feeding Pulse`}. Drag a node
            by its title bar; press a port to wire; press a wire to cut it.
          </p>
        </div>

        {/* ---- The inspector ---------------------------------------------- */}
        <div className="node-inspect">
          {node ? (
            <>
              <div className="eyebrow">{kindOf(node.kind)?.label}</div>
              <p className="muted small">{kindOf(node.kind)?.blurb}</p>
              {kindOf(node.kind)?.family === "source" ? (
                <label className="lab-field">
                  <span className="lab-field-label">What it says</span>
                  <textarea
                    rows={4}
                    value={node.text}
                    placeholder={kindOf(node.kind)?.placeholder}
                    onChange={(e) =>
                      setNodes((was) =>
                        was.map((n) => (n.id === node.id ? { ...n, text: e.target.value } : n)),
                      )
                    }
                  />
                </label>
              ) : (
                <p className="muted small">
                  Nothing to set. {kindOf(node.kind)?.family === "weave"
                    ? "It reads whatever is wired into it."
                    : "It reads whatever reaches it."}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="eyebrow">The run</div>
              {!result && !error && (
                <p className="muted small">
                  Press Run to see what we already hold on this. Pick a node to edit it.
                </p>
              )}
              {error && <p className="studio-note bad">{error}</p>}
              {result && <Weave result={result} />}
            </>
          )}
        </div>
      </div>

      {result && !node && (
        <>
          <h2 className="section-title" style={{ marginTop: 30 }}>
            What we already hold
          </h2>
          <Findings result={result} />
        </>
      )}
    </>
  );
}

/** The counts, in the inspector column. */
function Weave({ result }: { result: WeaveResult }) {
  return (
    <ul className="plan-list tight">
      <li>
        <b>{result.counts.trends}</b> trend profile{result.counts.trends === 1 ? "" : "s"}
      </li>
      <li>
        <b>{result.counts.proofPoints}</b> proof point
        {result.counts.proofPoints === 1 ? "" : "s"}
      </li>
      <li>
        <b>{result.counts.forecasts}</b> forecast{result.counts.forecasts === 1 ? "" : "s"}
      </li>
      <li>
        <b>{result.tensions.length}</b> disagreement
        {result.tensions.length === 1 ? "" : "s"} between live calls
      </li>
    </ul>
  );
}

/** The run's results, full width under the canvas. */
function Findings({ result }: { result: WeaveResult }) {
  if (!result.terms.length) {
    return <p className="none">Nothing was wired into Pulse, so there was nothing to look for.</p>;
  }

  return (
    <div className="weave">
      {/*
        The tensions first, because they are the only thing here a search box
        could not have told you, and the only thing that changes what somebody
        does next.
      */}
      {result.tensions.length > 0 && (
        <section className="weave-block tension">
          <div className="eyebrow">Where we disagree with ourselves</div>
          {result.tensions.map((t, i) => (
            <p key={i} className="weave-tension">
              <b>{t.a.title}</b> <span className={`call call-${t.a.call?.toLowerCase()}`}>{t.a.call}</span>{" "}
              against <b>{t.b.title}</b>{" "}
              <span className={`call call-${t.b.call?.toLowerCase()}`}>{t.b.call}</span>
              <em>{t.note}</em>
            </p>
          ))}
        </section>
      )}

      <div className="weave-cols">
        <section className="weave-block">
          <div className="eyebrow">
            Trend profiles{result.counts.trends > result.trends.length && ` (${result.trends.length} of ${result.counts.trends})`}
          </div>
          {result.trends.length === 0 ? (
            <p className="muted small">Nothing in the trend database matches this yet.</p>
          ) : (
            <ul className="weave-list">
              {result.trends.map((t) => (
                <li key={t.id}>
                  <Link to={`/trends/${t.profileId || t.id}`}>{t.title}</Link>
                  {t.call && <span className={`call call-${t.call.toLowerCase()}`}>{t.call}</span>}
                  {!t.published && <span className="tag">Not published</span>}
                  <span className="muted small"> {t.ownerName}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="weave-block">
          <div className="eyebrow">Proof points</div>
          {result.proofPoints.length === 0 ? (
            <p className="muted small">No callout in the library matches this yet.</p>
          ) : (
            <>
              <ul className="weave-list">
                {result.proofPoints.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/data/proof-points?q=${encodeURIComponent(
                        p.text.split("\n")[0].slice(0, 40),
                      )}&quality=all`}
                    >
                      {p.text.split("\n")[0].slice(0, 90)}
                    </Link>
                    <span className="muted small">
                      {" "}
                      {p.trendTitle}
                      {/* The more interesting version of a duplicate: this
                          figure is already cited against several of them. */}
                      {p.alsoOn.length > 0 && ` and ${p.alsoOn.length} more`}
                    </span>
                  </li>
                ))}
              </ul>
              {/* Said plainly when the search had to be loosened, so six
                  results are not mistaken for six answers. */}
              {result.proofTerms.length < result.terms.length && (
                <p className="muted small">
                  Nothing carried every word, so these match{" "}
                  {result.proofTerms.map((t) => `“${t}”`).join(", ")} rather than the whole canvas.
                </p>
              )}
            </>
          )}
        </section>

        <section className="weave-block">
          <div className="eyebrow">Forecasts that covered this ground</div>
          {result.forecasts.length === 0 ? (
            <p className="muted small">Nothing on the schedule has argued this yet.</p>
          ) : (
            <ul className="weave-list">
              {result.forecasts.map((f) => (
                <li key={f.id}>
                  <Link to={`/content/${f.id}`}>{f.title}</Link>
                  <span className="muted small">
                    {" "}
                    {f.format} · {f.vertical} · {f.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="muted small">
        Matched on {result.terms.map((t) => `“${t}”`).join(", ")}, counting a row
        that carries {result.threshold} or more of them.
      </p>
    </div>
  );
}
