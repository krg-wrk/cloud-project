import { useState } from "react";
import { Slot } from "../../lib/custom";
import { Icon } from "../../lib/icons";
import ConceptNote from "./ConceptNote";

/**
 * Add Atoms — a concept, and it says so.
 *
 * The idea: a forecaster finds something useful, puts it here once, says what
 * it could be useful for, and the Hub files it into the data, driver, image
 * and media libraries with tags that make it findable by somebody who was not
 * in the room. The filing is the hard part and the reason it belongs to the
 * Hub rather than to a shared drive — a folder structure is a filing system
 * only for the person who made it.
 *
 * Nothing is uploaded. The form runs, because the shape of the questions is
 * the thing to get right first: what we ask at the moment of upload decides
 * whether any of it is findable a year later.
 */

const LIBRARIES = [
  { id: "data", icon: "data", label: "Data", blurb: "A figure and its source." },
  { id: "driver", icon: "driver", label: "Driver", blurb: "A STEPIC force." },
  { id: "image", icon: "image", label: "Image", blurb: "Catwalk, store, product." },
  { id: "media", icon: "media", label: "Media", blurb: "Video, audio, a deck." },
  { id: "research", icon: "note", label: "Research", blurb: "A report or an interview." },
];

export default function Atoms() {
  const [kinds, setKinds] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [name, setName] = useState("");

  const toggle = (id: string) =>
    setKinds((was) => (was.includes(id) ? was.filter((k) => k !== id) : [...was, id]));

  const addTag = () => {
    const tag = typed.trim().replace(/,$/, "");
    if (tag && !tags.includes(tag)) setTags([...tags, tag]);
    setTyped("");
  };

  return (
    <>
      <div className="page-head">
        <div>
          <Slot id="atoms.eyebrow" as="div" className="eyebrow" />
          <Slot id="atoms.title" as="h1" className="page-title" />
          <Slot id="atoms.sub" as="p" className="page-sub" />
        </div>
      </div>

      <ConceptNote>
        Nothing is uploaded and nothing is filed. The questions are what is being
        tried out here — they are what decides whether any of this is findable later.
      </ConceptNote>

      <div className="lab-form">
        <section>
          <Slot id="atoms.drop" as="h2" className="section-title" />
          <div className="drop-zone">
            <Icon name="atom" size={26} />
            <p>Drop a file here, or paste a link</p>
            <small className="muted">
              Images, PDFs, decks, a URL — one thing at a time, or a folder of them.
            </small>
          </div>
          <label className="field">
            <span className="field-label">What is it?</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sell-through on cargo trousers, John Lewis, Q2"
            />
          </label>
        </section>

        <section>
          <Slot id="atoms.kinds" as="h2" className="section-title" />
          <p className="muted" style={{ marginTop: 6 }}>
            More than one is normal — a catwalk shot with a figure attached is both.
          </p>
          <div className="library-picker">
            {LIBRARIES.map((lib) => (
              <button
                key={lib.id}
                className={kinds.includes(lib.id) ? "library on" : "library"}
                onClick={() => toggle(lib.id)}
                aria-pressed={kinds.includes(lib.id)}
              >
                <Icon name={lib.icon} size={17} />
                <span>
                  <b>{lib.label}</b>
                  <small>{lib.blurb}</small>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <Slot id="atoms.tags" as="h2" className="section-title" />
          <div className="tag-row">
            {tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
                <button onClick={() => setTags(tags.filter((t) => t !== tag))} aria-label={`Remove ${tag}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <label className="field">
            <span className="field-label">Add a tag</span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
              placeholder="Womenswear, S/S 28, denim"
            />
          </label>
          <p className="muted">
            Eventually these come from the taxonomy we already use for trends, so a tag
            typed here is the same word the Proof Point Library searches.
          </p>
        </section>

        <div className="lab-actions">
          <button className="btn solid" disabled>
            File it
          </button>
          <span className="muted">Not yet — this is where the filing would happen.</span>
        </div>
      </div>

      <Slot id="atoms.plan" as="h2" className="section-title" />
      <ul className="plan-list">
        <li>
          <b>Asked once, at the moment it is fresh.</b> Nobody goes back to tag an upload
          from three weeks ago, so the questions have to be short enough to answer now.
        </li>
        <li>
          <b>Filed for a stranger.</b> The test is whether a forecaster who was not
          involved can find it, which is why the libraries and tags matter more than the
          folder it came from.
        </li>
        <li>
          <b>An atom is reusable.</b> The same figure can hold up three different
          forecasts — that is the whole reason to keep them apart from the documents.
        </li>
        <li>
          <b>It feeds the Builder.</b> These are the atoms that get dragged in there.
        </li>
      </ul>
    </>
  );
}
