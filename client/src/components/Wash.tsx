import { useLocation } from "react-router-dom";

/**
 * The wash: a soft iridescent field behind the content column.
 *
 * The Hub was white cards on flat grey, which is honest and a little joyless.
 * WGSN's own material does something specific instead — a very pale
 * iridescent field, mint through cream through lilac, at a saturation so low
 * it reads as *light* rather than as colour. This is that, at the scale of a
 * page.
 *
 * Three things keep it from becoming decoration:
 *
 * **It is fixed, not scrolled.** The field stays put while the page moves
 * over it, so it behaves like the light in the room rather than like a
 * pattern printed on the page. Scrolling a gradient is what makes one look
 * cheap.
 *
 * **Its hue says where you are.** Each nav group gets a hue — the Lab is
 * warm, Data is cool, the team is warmer still — so the colour is doing the
 * same job as the group heading in the sidebar rather than being chosen at
 * random. Moving between sections of the Hub feels like moving rooms.
 *
 * **It is one field, not a stripe per section.** Banding every section its
 * own colour was the obvious reading of "split by the title sections", and
 * it makes a page look like a chart of itself. The rhythm comes from a much
 * fainter band behind each section *title* instead, in the page's own hue,
 * which is the same idea at a tenth of the volume.
 *
 * An admin can turn the whole thing off in the studio, in which case this
 * renders nothing at all rather than rendering something invisible.
 */

/**
 * Which hue a path belongs to.
 *
 * Keyed to the sidebar's own groups rather than to individual pages: the
 * point is that Data feels like Data, not that every page is a different
 * colour. Anything unrecognised gets the accent's own lilac, which is the
 * Hub's default temperature.
 *
 * The class this names goes on the shell rather than on the field itself,
 * because the page head and the section heads read the same custom property
 * and they are not inside the field — they are its siblings' children.
 */
export function washClass(pathname: string): string {
  const first = pathname.split("/")[1] ?? "";
  if (first === "lab") return "wash-rose";
  if (first === "data") return "wash-mint";
  if (["team", "workshops", "whats-on", "subscribe"].includes(first)) return "wash-cream";
  return "wash-lilac";
}

/** The field itself. The hue comes from the shell it sits in. */
export default function Wash() {
  return <div className="wash" aria-hidden="true" />;
}

/** The shell's class for the current route, so the hue follows navigation. */
export function useWashClass(): string {
  const { pathname } = useLocation();
  return washClass(pathname);
}
