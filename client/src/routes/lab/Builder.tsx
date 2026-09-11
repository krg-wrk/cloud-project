import { useState } from "react";
import { Slot } from "../../lib/custom";
import { Icon } from "../../lib/icons";
import ConceptNote from "./ConceptNote";

/**
 * Forecast Builder — a concept, and it says so.
 *
 * The idea: drop in data, context, research and media, and have the Hub
 * cross-reference it against everything we have already published, so a
 * forecast starts from what we know rather than from an empty document. The
 * point is alignment as much as speed — two forecasters working from the
 * same atoms arrive at compatible answers.
 *
 * None of that is built. What is here is the shape of it, so the team can
 * argue about the shape before anybody writes the hard part: you can drag
 * the atom kinds onto the canvas and see what a workspace would feel like,
 * and the page is honest that nothing is kept.
 *
 * Dragging is real, and deliberately so. A picture of a canvas answers no
 * questions; a canvas you can move things around on answers "is this how I
 * would actually work?" — which is the only question worth asking of a
 * concept.
 */

interface Atom {
  kind: string;
  icon: string;
  label: string;
  blurb: string;
}

const ATOMS: Atom[] = [
  {
    kind: "data",
    icon: "data",
    label: "Data",
    blurb: "A figure with a source — sell-through, search volume, a survey.",
  },
  {
    kind: "driver",
    icon: "driver",
    label: "Driver",
    blurb: "A STEPIC driver: the social or economic force underneath the shift.",
  },
  {
    kind: "image",
    icon: "image",
    label: "Image",
    blurb: "A catwalk shot, a store photograph, a product still.",
  },
  {
    kind: "media",
    icon: "media",
    label: "Media",
    blurb: "Video, audio, a deck — anything Workspace 2 holds.",
  },
  {
    kind: "research",
    icon: "note",
    label: "Research",
    blurb: "A report, an interview, a page you want the forecast to argue with.",
  },
];

interface Dropped extends Atom {
  id: number;
}

export default function Builder() {
  const [dropped, setDropped] = useState<Dropped[]>([]);
  const [over, setOver] = useState(false);

  const add = (kind: string) => {
    const atom = ATOMS.find((a) => a.kind === kind);
    if (!atom) return;
    setDropped((was) => [...was, { ...atom, id: Date.now() + was.length }]);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <Slot id="builder.eyebrow" as="div" className="eyebrow" />
          <Slot id="builder.title" as="h1" className="page-title" />
          <Slot id="builder.sub" as="p" className="page-sub" />
        </div>
      </div>

      <ConceptNote>
        Nothing here is saved and nothing is cross-referenced yet. This is the
        shape of the thing, to be argued with before it is built.
      </ConceptNote>

      <div className="lab-layout">
        <div>
          <Slot id="builder.palette" as="h2" className="section-title" />
          <p className="muted" style={{ marginTop: 6 }}>
            Drag one onto the canvas, or press Enter on it.
          </p>
          <div className="atom-palette">
            {ATOMS.map((atom) => (
              <button
                key={atom.kind}
                className="atom"
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", atom.kind)}
                onClick={() => add(atom.kind)}
              >
                <Icon name={atom.icon} size={18} />
                <span>
                  <b>{atom.label}</b>
                  <small>{atom.blurb}</small>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/*
          A drop target that is also a button, because a canvas you can only
          reach with a mouse is a canvas half the team cannot try.
        */}
        <div
          className={over ? "canvas over" : "canvas"}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            add(e.dataTransfer.getData("text/plain"));
          }}
        >
          {dropped.length === 0 ? (
            <div className="canvas-empty">
              <Icon name="builder" size={26} />
              <Slot id="builder.canvas" as="p" />
            </div>
          ) : (
            <>
              <div className="canvas-head">
                <span className="muted">
                  {dropped.length} atom{dropped.length === 1 ? "" : "s"} — held in this
                  browser tab only
                </span>
                <button className="btn" onClick={() => setDropped([])}>
                  Clear
                </button>
              </div>
              <div className="canvas-atoms">
                {dropped.map((atom) => (
                  <div key={atom.id} className={`canvas-atom kind-${atom.kind}`}>
                    <Icon name={atom.icon} size={15} />
                    {atom.label}
                    <button
                      className="canvas-atom-x"
                      onClick={() => setDropped((was) => was.filter((a) => a.id !== atom.id))}
                      aria-label={`Remove ${atom.label}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <p className="muted canvas-foot">
                Eventually: the Hub reads these, finds every forecast that has argued
                something similar, and tells you where this one agrees, disagrees or has
                nothing to say.
              </p>
            </>
          )}
        </div>
      </div>

      <Slot id="builder.plan" as="h2" className="section-title" />
      <ul className="plan-list">
        <li>
          <b>Cross-reference, not autocomplete.</b> The value is being told "three
          forecasts already say this, and one says the opposite" — not having a machine
          write the forecast.
        </li>
        <li>
          <b>Everything keeps its source.</b> An atom carries where it came from, so a
          claim in a finished forecast can always be walked back to the thing it rests on.
        </li>
        <li>
          <b>Alignment is the point.</b> Two forecasters pulling on the same trend should
          find each other's work here rather than three weeks later in review.
        </li>
        <li>
          <b>It has to be faster than a blank page</b>, or nobody will open it twice.
        </li>
      </ul>
    </>
  );
}
