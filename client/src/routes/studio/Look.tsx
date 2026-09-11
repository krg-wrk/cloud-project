import { useEffect, useState } from "react";
import { send, useApi } from "../../lib/api";
import { NAV_ICONS } from "../../components/Layout";
import { ICON_PATHS, Icon } from "../../lib/icons";
import { SLOT_GROUPS } from "../../lib/slots";
import { APPEARANCE_CHANGED, applyColours, type Appearance, type Token } from "../../lib/appearance";
import { ErrorNote, Loading } from "../../components/bits";

/**
 * The look: what colour means what, and which glyph a sidebar item carries.
 *
 * Not the whole palette. The paper, the ink and the hairline rules are the
 * house style, and changing those is a redesign rather than a setting. What
 * is here is the colours that carry meaning — the statuses, the diary kinds,
 * the accent — because those are the ones a team argues about, usually while
 * looking at them.
 *
 * Every swatch says its contrast against white. A status colour is a small
 * mark and a word, so 3:1 is the floor for the mark to be visible at all; the
 * page says so rather than letting somebody pick a pale yellow and find out
 * from a colleague who cannot see it.
 */

/** WCAG relative luminance, for the contrast figure beside each swatch. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const parts = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
}

function contrast(hex: string): number {
  const a = luminance(hex);
  return (1 + 0.05) / (a + 0.05);
}

const ICONS = Object.keys(ICON_PATHS).sort();

export default function Look() {
  const stored = useApi<Appearance & { tokens: Token[] }>("/appearance");
  const [colours, setColours] = useState<Record<string, string> | null>(null);
  const [icons, setIcons] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (stored.data && colours === null) {
      setColours(stored.data.colours ?? {});
      setIcons(stored.data.icons ?? {});
    }
  }, [stored.data, colours]);

  /*
   * The draft, on the real page, as it is typed.
   *
   * A colour can only be judged on the thing it colours — a swatch in a form
   * tells you nothing about whether "in review" now reads as "late". So the
   * editor paints the whole app while you are in it, and puts back whatever
   * was last saved when you leave without saving.
   */
  const drafted = JSON.stringify(colours);
  const tokenList = stored.data?.tokens;
  useEffect(() => {
    if (!tokenList || !colours) return;
    applyColours(tokenList, colours);
    return () => applyColours(tokenList, stored.data?.colours ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafted, tokenList]);

  if (stored.error) return <ErrorNote message={stored.error} />;
  if (!stored.data || !colours || !icons) return <Loading what="the colours" />;

  const tokens = stored.data.tokens ?? [];
  const groups = [...new Set(tokens.map((t) => t.group))];
  const navItems = SLOT_GROUPS["nav.item"]?.slots ?? [];
  const changed =
    Object.keys(colours).length > 0 || Object.keys(icons).length > 0;

  const set = (id: string, value: string) => {
    const next = { ...colours };
    if (!value) delete next[id];
    else next[id] = value.toLowerCase();
    setColours(next);
  };

  const setIcon = (slot: string, value: string) => {
    const next = { ...icons };
    if (!value) delete next[slot];
    else next[slot] = value;
    setIcons(next);
  };

  async function save() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await send<Appearance & { dropped?: number }>(
        "/studio/appearance",
        "PUT",
        { colours, icons },
      );
      setColours(res.colours);
      setIcons(res.icons);
      setNote(
        res.dropped
          ? `Saved. ${res.dropped} value${res.dropped === 1 ? " was" : "s were"} left out — a colour has to be a hex code like #4c5578.`
          : "Saved. Everybody sees it on their next page load.",
      );
      // The sidebar holds its own copy, so it is told rather than left to
      // find out on the next page load.
      window.dispatchEvent(new Event(APPEARANCE_CHANGED));
      stored.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "It could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <ErrorNote heading="That did not save." message={error} />}

      <div className="studio-bar">
        <p className="muted small" style={{ margin: 0 }}>
          The colours that carry meaning, and the icon on any sidebar item. The paper, the
          ink and the rules are the house style and are not here — changing those is a
          redesign rather than a setting.
        </p>
        <button
          className="btn"
          onClick={() => {
            setColours({});
            setIcons({});
          }}
          disabled={!changed}
        >
          Put everything back
        </button>
      </div>

      {groups.map((group) => (
        <div className="studio-item" key={group}>
          <div className="studio-item-head">
            <h2>{group}</h2>
          </div>
          <div className="swatch-rows">
            {tokens
              .filter((t) => t.group === group)
              .map((token) => {
                const value = colours[token.id] ?? token.fallback;
                const ratio = contrast(value);
                const mine = Boolean(colours[token.id]);
                return (
                  <div className="swatch-row" key={token.id}>
                    <label className="swatch">
                      <input
                        type="color"
                        value={value}
                        onChange={(e) => set(token.id, e.target.value)}
                        aria-label={`Colour for ${token.label}`}
                      />
                    </label>
                    <div className="swatch-name">
                      <b>{token.label}</b>
                      <span className="muted small">{token.css}</span>
                    </div>
                    <input
                      className="swatch-hex"
                      value={value}
                      onChange={(e) => set(token.id, e.target.value)}
                      aria-label={`Hex code for ${token.label}`}
                    />
                    <span className={ratio < 3 ? "swatch-faint" : "muted small"}>
                      {ratio.toFixed(2)}:1{ratio < 3 ? " — too faint on white" : ""}
                    </span>
                    <button
                      className="btn small"
                      onClick={() => set(token.id, "")}
                      disabled={!mine}
                    >
                      Reset
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      ))}

      <div className="studio-item">
        <div className="studio-item-head">
          <div>
            <h2>Sidebar icons</h2>
            <p className="muted small">
              One glyph per item. The names are the Hub's own icon set, so anything here is
              drawn in the same weight as the rest.
            </p>
          </div>
        </div>
        <div className="icon-rows">
          {navItems.map((slot) => {
            const chosen = icons[slot.id] ?? "";
            return (
              <div className="icon-row" key={slot.id}>
                <span className="icon-preview">
                  <Icon name={chosen || NAV_ICONS[slot.id] || "list"} size={18} />
                </span>
                <div className="swatch-name">
                  <b>{slot.label}</b>
                  <span className="muted small">{slot.id}</span>
                </div>
                <select
                  value={chosen}
                  onChange={(e) => setIcon(slot.id, e.target.value)}
                  aria-label={`Icon for ${slot.label}`}
                >
                  <option value="">Whatever it ships with</option>
                  {ICONS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      <div className="studio-bar" style={{ marginTop: 16 }}>
        <span className="muted small">{note}</span>
        <button className="btn solid" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save the look"}
        </button>
      </div>
    </>
  );
}
