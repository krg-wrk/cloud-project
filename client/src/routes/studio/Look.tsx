import { useEffect, useState } from "react";
import { send, useApi } from "../../lib/api";
import { NAV_ICONS } from "../../components/Layout";
import { ICON_PATHS, Icon } from "../../lib/icons";
import { SLOT_GROUPS } from "../../lib/slots";
import {
  APPEARANCE_CHANGED,
  WASHES,
  WASH_GROUPS,
  applyColours,
  applyGradients,
  type Appearance,
  type Token,
} from "../../lib/appearance";
import { usePreferences } from "../../lib/preferences";
import { PALETTE, paletteName } from "../../lib/palette";
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
  const mine = usePreferences();
  const [colours, setColours] = useState<Record<string, string> | null>(null);
  const [icons, setIcons] = useState<Record<string, string> | null>(null);
  const [gradients, setGradients] = useState<boolean | null>(null);
  const [washes, setWashes] = useState<Record<string, string> | null>(null);
  const [opens, setOpens] = useState<"page" | "panel" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (stored.data && colours === null) {
      setColours(stored.data.colours ?? {});
      setIcons(stored.data.icons ?? {});
      setGradients(stored.data.gradients !== false);
      setWashes(stored.data.washes ?? {});
      setOpens(stored.data.opens === "panel" ? "panel" : "page");
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

  /*
   * The switch previews on the real page too, and puts back what was saved if
   * you leave without saving — the same bargain the colours make. A wash can
   * only be judged against a page, not against the word "gradients".
   */
  const savedGradients = stored.data?.gradients !== false;
  const washOffForMe = mine.wash === "off";
  useEffect(() => {
    if (gradients === null) return;
    // An admin who turned the wash off for themselves in Settings still sees
    // their own page unwashed while they set it for everybody — otherwise the
    // studio would look like it had ignored their own setting.
    applyGradients(gradients && !washOffForMe);
    return () => applyGradients(savedGradients && !washOffForMe);
  }, [gradients, savedGradients, washOffForMe]);

  if (stored.error) return <ErrorNote message={stored.error} />;
  if (!stored.data || !colours || !icons || gradients === null || !washes || !opens) {
    return <Loading what="the colours" />;
  }

  const tokens = stored.data.tokens ?? [];
  const groups = [...new Set(tokens.map((t) => t.group))];
  const navItems = SLOT_GROUPS["nav.item"]?.slots ?? [];
  const changed =
    Object.keys(colours).length > 0 ||
    Object.keys(icons).length > 0 ||
    Object.keys(washes).length > 0 ||
    opens !== "page" ||
    !gradients;

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
        { colours, icons, gradients, washes, opens },
      );
      setColours(res.colours);
      setIcons(res.icons);
      setGradients(res.gradients !== false);
      setWashes(res.washes ?? {});
      setOpens(res.opens === "panel" ? "panel" : "page");
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
            setGradients(true);
            setWashes({});
            setOpens("page");
          }}
          disabled={!changed}
        >
          Put everything back
        </button>
      </div>

      {/*
        First, because it is the one setting on this page that changes how
        every page feels rather than what one chip means — and because
        somebody who wants it off wants it off before they read anything else.
      */}
      <div className="studio-item">
        <div className="studio-item-head">
          <h2>Background</h2>
        </div>
        <label className="check gradient-switch">
          <input
            type="checkbox"
            checked={gradients}
            onChange={(e) => setGradients(e.target.checked)}
          />
          <span>
            <b>Iridescent wash behind the pages</b>
            <small>
              A very pale field of colour that stays put while the page scrolls, and a
              gradient behind each page title. Off gives you flat paper.
            </small>
          </span>
        </label>

        {/*
          Which hue each part of the Hub takes.
          Keyed on the sidebar's own groups rather than on pages, because that
          is the grain the nav already has and the only one anybody thinks in.
          Every option is a colour the Hub already uses somewhere, which is
          what stops the field looking arbitrary.
        */}
        {gradients && (
          <div className="wash-rows">
            {WASH_GROUPS.map((group) => {
              const chosen = washes[group.id] ?? stored.data!.washes?.[group.id] ?? "dusk";
              return (
                <div className="wash-row" key={group.id}>
                  <span className={`wash-dot wash-${chosen}`} aria-hidden="true" />
                  <label className="swatch-name" htmlFor={`wash-${group.id}`}>
                    <b>{group.label}</b>
                  </label>
                  <select
                    id={`wash-${group.id}`}
                    value={chosen}
                    onChange={(e) => setWashes({ ...washes, [group.id]: e.target.value })}
                  >
                    {WASHES.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.label} — from {w.from}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/*
        What a click on the calendar does. Next to the background switch
        because both are decisions about how the Hub behaves rather than about
        what one chip means, and both are the kind of thing a team argues
        about once and then leaves alone.
      */}
      <div className="studio-item">
        <div className="studio-item-head">
          <div>
            <h2>Opening an entry</h2>
            <p className="muted small">
              What clicking a forecast, a workshop or a diary entry on the calendar does.
              One setting for everybody, because it changes what a click means.
            </p>
          </div>
        </div>
        <div className="opens-rows">
          <label className="check">
            <input
              type="radio"
              name="opens"
              checked={opens === "page"}
              onChange={() => setOpens("page")}
            />
            <span>
              <b>Open its own page</b>
              <small>
                The way it works now. The address is the entry, so it can be pasted to
                somebody, and going back returns to the month you were looking at.
              </small>
            </span>
          </label>
          <label className="check">
            <input
              type="radio"
              name="opens"
              checked={opens === "panel"}
              onChange={() => setOpens("panel")}
            />
            <span>
              <b>Open a panel over the calendar</b>
              <small>
                The month stays where it is and the detail opens over it — quicker when
                you are reading down a week rather than going somewhere. The panel still
                offers the full page.
              </small>
            </span>
          </label>
        </div>
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
                    {/*
                      The palette, beside the two ways of saying a colour that
                      were already here. A named list is the one most people
                      want — it is the design team's own sheet and the colours
                      the Hub already uses, so picking from it keeps a team
                      inside a palette somebody approved. The hex field stays
                      for anybody who has a code in their hand, and picks up
                      whatever the dropdown chooses, so neither is the
                      authority and both read the same value.
                    */}
                    <select
                      className="swatch-pick"
                      value={paletteName(value) ?? ""}
                      onChange={(e) => {
                        const picked = PALETTE.find((c) => c.name === e.target.value);
                        if (picked) set(token.id, picked.hex);
                      }}
                      aria-label={`Palette colour for ${token.label}`}
                    >
                      {/*
                        Only shown while the value is one nobody named, and it
                        cannot be chosen: "Custom" is a description of where
                        the hex field has got to, not a thing to select.
                      */}
                      {!paletteName(value) && (
                        <option value="" disabled>
                          Custom — {value}
                        </option>
                      )}
                      {PALETTE.map((colour) => (
                        <option key={colour.hex} value={colour.name}>
                          {colour.name} — {colour.hex}
                        </option>
                      ))}
                    </select>
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
