import { useLocation } from "react-router-dom";

/**
 * The wash: a soft iridescent field behind the content column.
 *
 * The Hub was white cards on flat grey, which is honest and a little joyless.
 * WGSN's own material does something specific instead — a very pale
 * iridescent field at a saturation low enough that it reads as *light* rather
 * than as colour. This is that, at the scale of a page.
 *
 * Four things keep it from becoming decoration:
 *
 * **The colour has somewhere to be.** A field behind the content shows only
 * in the gutters on a page like the proof point library, where the cards
 * cover the column edge to edge. The gradient's real moment is the page head,
 * around the title, which is the one place every page has room; this field
 * carries the corners and the foot.
 *
 * **It is fixed, not scrolled.** The field stays put while the page moves
 * over it, so it behaves like the light in the room rather than like a
 * pattern printed on the page.
 *
 * **Its hue is the section's own.** Each nav group's wash is derived from a
 * colour that group already uses — the Lab gets the magenta of its Pulse
 * node, Data the green of an approved proof point, Your work Future Dusk
 * itself. That is what makes it look considered rather than arbitrary: the
 * page and the light on it agree. An admin can reassign any of them.
 *
 * **It is one field, not a stripe per section.** Banding every section its
 * own colour makes a page look like a chart of itself. The rhythm comes from
 * the hairline under each section title carrying the hue instead.
 */

/** Which nav group a path belongs to. Mirrors the sidebar's own grouping. */
export function groupFor(pathname: string): string {
  const first = pathname.split("/")[1] ?? "";
  if (first === "lab") return "lab";
  if (first === "data") return "data";
  if (["team", "workshops", "whats-on", "subscribe"].includes(first)) return "team";
  if (first === "studio" || first === "notifications") return "settings";
  return "work";
}

/**
 * The shell's class for the current route.
 *
 * The class goes on the shell rather than on the field itself, because the
 * page head and the section rules read the same custom property and they are
 * not inside the field — they are its siblings' children.
 */
export function washClassFor(pathname: string, washes: Record<string, string>): string {
  return `wash-${washes[groupFor(pathname)] ?? "dusk"}`;
}

/** The field itself. The hue comes from the shell it sits in. */
export default function Wash() {
  return <div className="wash" aria-hidden="true" />;
}

/** The shell's class for the current route, so the hue follows navigation. */
export function useWashClass(washes: Record<string, string>): string {
  const { pathname } = useLocation();
  return washClassFor(pathname, washes);
}
