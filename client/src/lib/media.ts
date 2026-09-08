import { useEffect, useState } from "react";

/**
 * Watches a media query, so a component can render a different thing rather
 * than only a differently-styled version of the same thing. Used for the
 * calendar, where a seven-column month grid genuinely does not fit on a
 * phone and an agenda is the right answer instead of a smaller grid.
 *
 * The breakpoint here has to match the one in index.css.
 */
export const NARROW = "(max-width: 860px)";

export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return matches;
}
