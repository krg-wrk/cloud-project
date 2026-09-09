import { useState } from "react";
import { Link } from "react-router-dom";
import { useCustom } from "../../lib/custom";
import { Icon } from "../../lib/icons";
import { SLOT_COUNT, SLOT_PAGES, type SlotDef, type SlotGroup, type SlotPage } from "../../lib/slots";

/**
 * The built-in pages, as things you can change.
 *
 * Two ways in, deliberately. This page is the exhaustive one: every heading,
 * label and column, searchable, with show/hide and ordering. Edit mode is the
 * quick one: you notice a heading is wrong while looking at it, and you fix
 * it there. Both write the same records.
 */
export default function Pages() {
  const custom = useCustom();
  const [openPage, setOpenPage] = useState<string | null>("content");
  const [find, setFind] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const changed = Object.keys(custom.slots).length;
  const needle = find.trim().toLowerCase();

  /** Pages narrowed to what matches the search, so an empty page drops out. */
  const pages = SLOT_PAGES.map((page) => ({
    page,
    groups: page.groups
      .map((group) => ({
        group,
        slots: needle
          ? group.slots.filter(
              (s) =>
                custom.text(s.id).toLowerCase().includes(needle) ||
                s.label.toLowerCase().includes(needle) ||
                s.id.includes(needle),
            )
          : group.slots,
      }))
      .filter((g) => g.slots.length > 0),
  })).filter((p) => p.groups.length > 0);

  async function reset(prefix: string, what: string) {
    if (!window.confirm(`Put ${what} back to the wording it ships with?`)) return;
    setBusy(prefix);
    try {
      await custom.resetPage(prefix);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="studio-bar">
        <p className="muted small" style={{ margin: 0 }}>
          {SLOT_COUNT} things you can rename across {SLOT_PAGES.length} pages.{" "}
          {changed === 0
            ? "None changed yet — every page says what it ships with."
            : `${changed} changed.`}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={custom.editing ? "btn accent" : "btn"}
            onClick={() => custom.setEditing(!custom.editing)}
          >
            <Icon name="edit" />
            {custom.editing ? "Editing on the page" : "Edit on the page"}
          </button>
          {changed > 0 && (
            <button
              className="btn danger"
              onClick={() => void reset("", "every page")}
              disabled={busy === ""}
            >
              <Icon name="refresh" />
              Reset everything
            </button>
          )}
        </div>
      </div>

      <p className="studio-note">
        <Icon name="eye" size={14} />
        <span>
          <strong>Edit on the page</strong> turns every label in the app into something you click
          and retype. Turn it on, walk to the page that reads wrong, and fix it where you noticed
          it. This list is the same set of labels, all in one place, and it is also where you
          hide things and change their order.
        </span>
      </p>

      <div className="field" style={{ maxWidth: 340, marginBottom: 16 }}>
        <label htmlFor="find">Find a label</label>
        <input
          id="find"
          type="search"
          value={find}
          placeholder="Season, Proof points, Where it is…"
          onChange={(e) => setFind(e.target.value)}
        />
      </div>

      {pages.length === 0 ? (
        <div className="empty">
          <Icon name="studio" size={22} />
          <p>Nothing matches “{find}”.</p>
        </div>
      ) : (
        <div className="studio-list">
          {pages.map(({ page, groups }) => (
            <PageCard
              key={page.id}
              page={page}
              groups={groups}
              open={Boolean(needle) || openPage === page.id}
              onToggle={() => setOpenPage(openPage === page.id ? null : page.id)}
              onReset={() => void reset(`${page.id}.`, `the ${page.label} page`)}
              resetting={busy === `${page.id}.`}
            />
          ))}
        </div>
      )}
    </>
  );
}

function PageCard({
  page,
  groups,
  open,
  onToggle,
  onReset,
  resetting,
}: {
  page: SlotPage;
  groups: { group: SlotGroup; slots: SlotDef[] }[];
  open: boolean;
  onToggle: () => void;
  onReset: () => void;
  resetting: boolean;
}) {
  const custom = useCustom();
  const touched = groups
    .flatMap((g) => g.slots)
    .filter((s) => custom.slots[s.id] !== undefined).length;

  return (
    <div className="studio-item">
      <div className="studio-item-head">
        <div>
          <h2>{page.label}</h2>
          <p className="muted small">
            {groups.reduce((n, g) => n + g.slots.length, 0)} labels
            {touched > 0 && ` · ${touched} changed`} ·{" "}
            <Link to={page.path} className="link-out">
              see the page
            </Link>
          </p>
        </div>
        <div className="studio-item-actions">
          {touched > 0 && (
            <button className="btn danger" onClick={onReset} disabled={resetting}>
              <Icon name="refresh" />
              Reset this page
            </button>
          )}
          <button className="btn" onClick={onToggle}>
            {open ? "Hide" : "Open"}
          </button>
        </div>
      </div>

      {open &&
        groups.map(({ group, slots }) => (
          <div className="slot-group" key={group.id}>
            <div className="slot-group-head">
              <span>{group.label}</span>
              {group.orderable && <em>reorder with the arrows</em>}
            </div>
            {slots.map((slot, i) => (
              <SlotRow
                key={slot.id}
                slot={slot}
                group={group}
                first={i === 0}
                last={i === slots.length - 1}
              />
            ))}
          </div>
        ))}
    </div>
  );
}

const KIND_WORDS: Record<string, string> = {
  title: "Title",
  eyebrow: "Eyebrow",
  sub: "Standfirst",
  section: "Section heading",
  field: "Field label",
  column: "Column",
  nav: "Sidebar item",
  action: "Button",
  step: "Stage",
};

function SlotRow({
  slot,
  group,
  first,
  last,
}: {
  slot: SlotDef;
  group: SlotGroup;
  first: boolean;
  last: boolean;
}) {
  const custom = useCustom();
  const override = custom.slots[slot.id];
  const current = custom.text(slot.id);
  const [draft, setDraft] = useState(current);
  const [saving, setSaving] = useState(false);
  const hidden = override?.hidden === true;

  // The box follows the stored value when something else changes it — edit
  // mode on the page, or a reset — but not while it is being typed in.
  const [lastSeen, setLastSeen] = useState(current);
  if (lastSeen !== current && !saving) {
    setLastSeen(current);
    setDraft(current);
  }

  async function commit() {
    if (draft.trim() === current.trim()) return;
    setSaving(true);
    try {
      await custom.save(slot.id, { label: draft });
    } finally {
      setSaving(false);
    }
  }

  /**
   * Move within the group.
   *
   * The whole group is written with explicit positions rather than just the
   * two that swapped, because a group where some items have an order and
   * others do not sorts unpredictably the next time one moves.
   */
  async function move(delta: number) {
    const order = custom.group(group.id).map((s) => s.id);
    const at = order.indexOf(slot.id);
    const to = at + delta;
    if (at < 0 || to < 0 || to >= order.length) return;
    order.splice(to, 0, ...order.splice(at, 1));
    setSaving(true);
    try {
      for (const [i, id] of order.entries()) {
        await custom.save(id, { order: i });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={hidden ? "slot-row hidden" : "slot-row"}>
      <div className="slot-row-what">
        <span className="slot-kind">{KIND_WORDS[slot.kind] ?? slot.kind}</span>
        {slot.hint && <em>{slot.hint}</em>}
      </div>
      <input
        value={draft}
        disabled={saving || hidden}
        aria-label={`Wording for ${slot.label}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") setDraft(current);
        }}
      />
      <div className="slot-row-actions">
        {group.orderable && (
          <>
            <button
              className="btn ghost"
              onClick={() => void move(-1)}
              disabled={first || saving || hidden}
              aria-label="Move up"
              title="Move up"
            >
              ↑
            </button>
            <button
              className="btn ghost"
              onClick={() => void move(1)}
              disabled={last || saving || hidden}
              aria-label="Move down"
              title="Move down"
            >
              ↓
            </button>
          </>
        )}
        {slot.hideable ? (
          <button
            className="btn ghost"
            onClick={() => void custom.save(slot.id, { hidden: !hidden })}
            title={hidden ? "Put it back on the page" : "Take it off the page"}
          >
            <Icon name={hidden ? "eye" : "lock"} />
            {hidden ? "Hidden" : "Shown"}
          </button>
        ) : (
          <span className="muted small" title="A page needs its title">
            always shown
          </span>
        )}
        {override && (
          <button
            className="btn ghost"
            onClick={() => void custom.reset(slot.id)}
            title={`Back to “${slot.label}”`}
          >
            <Icon name="refresh" />
          </button>
        )}
      </div>
    </div>
  );
}
