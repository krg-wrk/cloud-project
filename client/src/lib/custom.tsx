import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { send, useApi } from "./api";
import { useViewer } from "./viewer";
import { SLOT_DEFS, SLOT_GROUPS, type SlotDef } from "./slots";

/**
 * The wording and layout of the built-in pages, as an admin has set it.
 *
 * Three questions a page asks: what does this say, is it on the page at all,
 * and in what order does this group of things come. Everything the store
 * holds is an override — a slot nobody has touched is not in it, and the
 * registry's own default answers.
 */

export interface SlotOverride {
  label?: string;
  hidden?: boolean;
  order?: number;
}

type Slots = Record<string, SlotOverride>;

interface CustomValue {
  slots: Slots;
  /** What a slot says: the override, else the registry's default. */
  text: (id: string, fallback?: string) => string;
  /** Whether a slot is on the page. Only hideable slots can be off it. */
  shown: (id: string) => boolean;
  /** A group's slots, in the admin's order, with hidden ones dropped. */
  group: (groupId: string) => SlotDef[];
  /** True while an admin is editing labels on the page itself. */
  editing: boolean;
  setEditing: (on: boolean) => void;
  /** Change one slot and keep the page in step. */
  save: (id: string, patch: { label?: string | null; hidden?: boolean; order?: number | null }) => Promise<void>;
  reset: (id: string) => Promise<void>;
  resetPage: (prefix: string) => Promise<number>;
  reload: () => void;
}

const CustomContext = createContext<CustomValue | null>(null);

const EDIT_KEY = "forecasters-hub.editing";

function readEditing(): boolean {
  try {
    return sessionStorage.getItem(EDIT_KEY) === "1";
  } catch {
    return false;
  }
}

export function CustomisationProvider({ children }: { children: ReactNode }) {
  const { data, reload } = useApi<{ slots: Slots }>("/customisation");
  // Held in state as well as fetched, so a save shows immediately rather than
  // after a round trip — an editor that lags by a request feels broken.
  const [slots, setSlots] = useState<Slots>({});
  // Edit mode survives a reload, because the natural way to use it is to turn
  // it on and then go to the page that reads wrong — including by pasting its
  // address. Per tab, and only for this session.
  // Only an admin can edit, so only an admin gets the affordance. The server
  // refuses the write either way; this keeps the page from offering something
  // that would be refused.
  const { isAdmin } = useViewer();
  const [wantsEditing, setEditingState] = useState(readEditing);
  const editing = isAdmin && wantsEditing;
  const setEditing = useCallback((on: boolean) => {
    setEditingState(on);
    try {
      if (on) sessionStorage.setItem(EDIT_KEY, "1");
      else sessionStorage.removeItem(EDIT_KEY);
    } catch {
      // Blocked storage — it lasts for this page load only.
    }
  }, []);

  useEffect(() => {
    if (data?.slots) setSlots(data.slots);
  }, [data]);

  const text = useCallback(
    (id: string, fallback?: string) =>
      slots[id]?.label ?? SLOT_DEFS[id]?.label ?? fallback ?? id,
    [slots],
  );

  const shown = useCallback((id: string) => slots[id]?.hidden !== true, [slots]);

  const group = useCallback(
    (groupId: string) => {
      const declared = SLOT_GROUPS[groupId]?.slots ?? [];
      return declared
        .filter((s) => slots[s.id]?.hidden !== true)
        .map((s, i) => ({ slot: s, at: slots[s.id]?.order ?? i, i }))
        // A slot with no order keeps its declared position; a stable tie-break
        // on the declared index stops two equal orders swapping on re-render.
        .sort((a, b) => a.at - b.at || a.i - b.i)
        .map((x) => x.slot);
    },
    [slots],
  );

  const save = useCallback(
    async (id: string, patch: { label?: string | null; hidden?: boolean; order?: number | null }) => {
      const result = await send<{ slots: Slots }>(
        `/studio/slots/${encodeURIComponent(id)}`,
        "PUT",
        patch,
      );
      setSlots(result.slots);
    },
    [],
  );

  const reset = useCallback(async (id: string) => {
    const result = await send<{ slots: Slots }>(
      `/studio/slots/${encodeURIComponent(id)}`,
      "DELETE",
    );
    setSlots(result.slots);
  }, []);

  const resetPage = useCallback(async (prefix: string) => {
    const result = await send<{ cleared: number; slots: Slots }>(
      `/studio/slots?prefix=${encodeURIComponent(prefix)}`,
      "DELETE",
    );
    setSlots(result.slots);
    return result.cleared;
  }, []);

  const value = useMemo(
    () => ({ slots, text, shown, group, editing, setEditing, save, reset, resetPage, reload }),
    [slots, text, shown, group, editing, save, reset, resetPage, reload],
  );

  return <CustomContext.Provider value={value}>{children}</CustomContext.Provider>;
}

export function useCustom(): CustomValue {
  const value = useContext(CustomContext);
  if (!value) {
    throw new Error("useCustom needs a CustomisationProvider above it");
  }
  return value;
}

/**
 * A label an admin can rename in place.
 *
 * Renders as whatever element the page wants, saying whatever the slot says.
 * With edit mode on it gains a dashed outline and a click turns it into an
 * input — which is the difference between "there is an admin screen
 * somewhere" and "I can fix this wording where I noticed it".
 */
export function Slot({
  id,
  as: Tag = "span",
  className,
  fallback,
  prefix,
  suffix,
}: {
  id: string;
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  /** Used when the slot is not in the registry — a label built at runtime. */
  fallback?: string;
  /** Rendered inside the element but not part of what is edited. */
  prefix?: ReactNode;
  suffix?: ReactNode;
}) {
  const { text, editing, save } = useCustom();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const current = text(id, fallback);

  useEffect(() => {
    if (open) input.current?.select();
  }, [open]);

  async function commit() {
    if (draft.trim() === current.trim()) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      await save(id, { label: draft });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <Tag className={className}>
        {prefix}
        {current}
        {suffix}
      </Tag>
    );
  }

  if (open) {
    return (
      <Tag className={className}>
        <input
          ref={input}
          className="slot-input"
          value={draft}
          disabled={saving}
          aria-label={`Wording for ${id}`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
            // Escape abandons the edit rather than saving a half-typed label.
            if (e.key === "Escape") setOpen(false);
          }}
        />
      </Tag>
    );
  }

  return (
    <Tag className={className}>
      {prefix}
      <button
        type="button"
        className="slot-edit"
        title={`Rename — ${id}`}
        onClick={() => {
          setDraft(current);
          setOpen(true);
        }}
      >
        {current}
      </button>
      {suffix}
    </Tag>
  );
}

/**
 * The bar an admin gets while editing.
 *
 * Fixed to the bottom because the thing being edited is the page behind it,
 * and it says how to get out — an edit mode you cannot see you are in is a
 * trap.
 */
export function EditBar() {
  const { editing, setEditing, slots } = useCustom();
  if (!editing) return null;
  const changed = Object.keys(slots).length;
  return (
    <div className="edit-bar" role="status">
      <span>
        <strong>Editing the wording.</strong> Click any dashed label to rename it. Enter saves,
        Escape leaves it.
      </span>
      <span className="edit-bar-count">
        {changed === 0
          ? "nothing changed yet"
          : `${changed} ${changed === 1 ? "change" : "changes"} in place`}
      </span>
      <button className="btn" onClick={() => setEditing(false)}>
        Done
      </button>
    </div>
  );
}
