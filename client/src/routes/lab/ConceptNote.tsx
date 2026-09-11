import type { ReactNode } from "react";

/**
 * The banner that keeps a concept honest.
 *
 * A page that looks finished and does nothing is worse than no page: somebody
 * uploads their research into it, nothing happens, and the Hub has spent
 * trust it cannot get back. So every unbuilt page says what it is, in the
 * same words, at the top — before the first control that looks like it works.
 */
export default function ConceptNote({ children }: { children: ReactNode }) {
  return (
    <div className="callout concept-note">
      <strong>A concept, not a feature.</strong>
      <div style={{ marginTop: 4 }}>{children}</div>
    </div>
  );
}
