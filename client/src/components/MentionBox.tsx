import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Person } from "../types";

/**
 * A note box that offers the team when you type @.
 *
 * Deliberately not a rich text editor. A note is plain text and stays plain
 * text — what gets stored is what somebody typed, "@Amara Okafor" and all, and
 * the server finds the names in it by matching the team list. There is no
 * markup to leak into an email, nothing for an old note to be missing, and
 * nothing to go wrong when somebody edits the name back out again.
 *
 * The behaviour is lifted from the ⌘K palette, which is the only other
 * typeahead in the Hub: a listbox with `aria-activedescendant`, arrows to
 * walk it, and focus never leaving the box you are typing in. `useDialog` is
 * pointedly not used — it moves focus on mount, which would take the caret out
 * of the sentence being written.
 */
export default function MentionBox({
  value,
  onChange,
  people,
  rows,
  label,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  /** The team. Anyone offered here can be told, which is why it is this list. */
  people: Person[];
  rows: number;
  label: string;
  placeholder?: string;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  /** Where the @ being typed starts, or -1 when no menu is open. */
  const [at, setAt] = useState(-1);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(0);
  /** Where to put the caret after a pick, since React resets it on re-render. */
  const caret = useRef<number>();

  const hits = at === -1 ? [] : matching(people, query);

  // A controlled textarea re-renders with the caret at the end, so it has to
  // be put back explicitly — after the paint that carries the new value.
  useLayoutEffect(() => {
    if (caret.current === undefined) return;
    box.current?.setSelectionRange(caret.current, caret.current);
    caret.current = undefined;
  });

  useEffect(() => {
    setPicked(0);
  }, [query, at]);

  function close() {
    setAt(-1);
    setQuery("");
  }

  /**
   * Whether the caret is inside something that looks like a name being typed.
   *
   * Only an @ that starts a word counts, so an email address in the middle of
   * a sentence does not open a menu. The name may have one space in it —
   * "Amara O" — because the team's names do, and giving up at the space would
   * make the menu close halfway through every surname.
   */
  function look(text: string, pos: number) {
    const upto = text.slice(0, pos);
    const m = /(?:^|[\s(>])@([^\n@]{0,40})$/.exec(upto);
    if (!m) return close();
    const typed = m[1];
    // Two spaces in means this is prose again, not a name.
    if ((typed.match(/ /g) ?? []).length > 1) return close();
    setAt(pos - typed.length - 1);
    setQuery(typed);
  }

  function choose(person: Person) {
    if (at === -1) return;
    const pos = box.current?.selectionStart ?? value.length;
    const name = `@${person.name} `;
    const next = value.slice(0, at) + name + value.slice(pos);
    caret.current = at + name.length;
    onChange(next);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (at === -1 || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setPicked((p) => (p + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setPicked((p) => (p - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      // Enter would otherwise break the line mid-name.
      e.preventDefault();
      choose(hits[picked]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  return (
    <div className="mention-box">
      <textarea
        ref={box}
        className="note-input"
        rows={rows}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        role="combobox"
        aria-expanded={hits.length > 0}
        aria-controls="mention-list"
        aria-autocomplete="list"
        aria-activedescendant={hits.length > 0 ? `mention-${hits[picked]?.id}` : undefined}
        onChange={(e) => {
          onChange(e.target.value);
          look(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={onKeyDown}
        onClick={(e) => look(value, e.currentTarget.selectionStart)}
        onBlur={() => {
          // Late, so a click on a name lands before the menu goes.
          setTimeout(close, 120);
        }}
      />

      {hits.length > 0 && (
        <ul className="mention-list" id="mention-list" role="listbox" aria-label="People you can name">
          {hits.map((p, i) => (
            <li
              key={p.id}
              id={`mention-${p.id}`}
              role="option"
              aria-selected={i === picked}
              className={i === picked ? "mention-hit on" : "mention-hit"}
              onMouseEnter={() => setPicked(i)}
              onMouseDown={(e) => {
                // Before blur, or the box closes and the click hits nothing.
                e.preventDefault();
                choose(p);
              }}
            >
              <b>{p.name}</b>
              <span>{p.role === "commissioning-manager" ? "Commissioning manager" : "Forecaster"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** How many names to offer. More than this and it is a directory, not a hint. */
const MOST = 6;

/**
 * The team, narrowed by what has been typed.
 *
 * Matches on any word of the name, so "@oka" finds Amara Okafor — typing a
 * surname is at least as common as typing a first name. An empty query offers
 * the first few rather than nothing, because the menu appearing on @ is what
 * tells somebody the feature exists.
 */
function matching(people: Person[], query: string): Person[] {
  const q = query.trim().toLowerCase();
  const named = people.filter((p) => p.name?.trim());
  if (!q) return named.slice(0, MOST);
  return named
    .filter((p) => p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)))
    .slice(0, MOST);
}

/**
 * A stored note, with the names in it picked out.
 *
 * Parsed here rather than stored as markup, and rendered as React nodes rather
 * than as HTML — the body is text somebody typed, and putting it through
 * `dangerouslySetInnerHTML` to get one highlight would be a new way into the
 * page for the sake of a colour.
 *
 * Only names the team list still has are marked. Somebody who has left reads
 * as the plain text it always was.
 */
export function NoteBody({ body, people }: { body: string; people: Person[] }) {
  const names = people
    .filter((p) => p.name?.trim())
    .map((p) => p.name.trim())
    .sort((a, b) => b.length - a.length);

  if (names.length === 0) return <>{body}</>;

  // Longest first, so "@Amara Okafor" is one mark rather than "@Amara" and a
  // stray surname — the same rule the server matches by.
  const pattern = new RegExp(`@(${names.map(escape).join("|")})(?![\\w])`, "gi");
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of body.matchAll(pattern)) {
    const start = m.index ?? 0;
    // An @ in the middle of a word is an address, not a name.
    if (start > 0 && /[\w@.]/.test(body[start - 1])) continue;
    if (start > last) out.push(body.slice(last, start));
    out.push(
      <span className="mention" key={`${start}-${m[0]}`}>
        {m[0]}
      </span>,
    );
    last = start + m[0].length;
  }
  if (last === 0) return <>{body}</>;
  if (last < body.length) out.push(body.slice(last));
  return <>{out}</>;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
