import { createContext, useContext, useMemo, type ReactNode } from "react";
import { assetUrl } from "./api";
import type { Me, Person } from "../types";

/**
 * Who is signed in, straight from the server.
 *
 * Every page reads this to decide what to show by default — a forecaster's
 * views open filtered to their own work without them touching a control, and
 * a commissioning manager's open across the team. The server checks
 * permissions again on every write; this only decides what to draw.
 */
interface ViewerContextValue {
  me: Me;
  people: Person[];
  /** The person record for the signed-in account, when they are on the team. */
  person?: Person;
  isManager: boolean;
  isAdmin: boolean;
  /**
   * Where to find a person's photograph, for the few who have set one.
   *
   * Built here because the team list is already loaded here and an avatar can
   * appear anywhere — a table cell, a card, the sidebar — without the thing
   * drawing it knowing anything but an id.
   */
  photos: Map<string, string>;
}

const ViewerContext = createContext<ViewerContextValue | null>(null);

export function ViewerProvider({
  me,
  people,
  children,
}: {
  me: Me;
  people: Person[];
  children: ReactNode;
}) {
  const photos = useMemo(() => {
    const map = new Map<string, string>();
    // The signed-in account first, so a photo just uploaded shows on this
    // render rather than after the team list is fetched again.
    for (const p of [...people, ...(me.person ? [me.person] : [])]) {
      if (p.photoAt) map.set(p.id, assetUrl(`/photos/${p.id}`, { v: p.photoAt }));
      else map.delete(p.id);
    }
    return map;
  }, [people, me.person]);

  const value: ViewerContextValue = {
    me,
    people,
    person: me.person,
    isManager: me.seesWholeTeam,
    isAdmin: me.role === "admin",
    photos,
  };
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

/**
 * Said when something about the signed-in account changes.
 *
 * The layout loads the account and the team once and hands them down, which
 * is right — every page wanting its own copy would be a fetch per page. The
 * cost is that a change made deep in the tree, like a new photograph, has no
 * way back up. This is that way: one event, one reload, at the top.
 */
export const ACCOUNT_CHANGED = "hub:account";

export function announceAccountChange(): void {
  window.dispatchEvent(new Event(ACCOUNT_CHANGED));
}

export function useViewer(): ViewerContextValue {
  const value = useContext(ViewerContext);
  if (!value) throw new Error("useViewer used outside the provider");
  return value;
}

/**
 * A person's photograph, or nothing.
 *
 * Unlike `useViewer` this does not insist on the provider: an avatar is drawn
 * in tests and in the sign-in screen, where there is no viewer yet, and a
 * component that only wants to know whether there is a picture should not be
 * the thing that throws.
 */
export function usePhoto(personId: string): string | undefined {
  return useContext(ViewerContext)?.photos.get(personId);
}
