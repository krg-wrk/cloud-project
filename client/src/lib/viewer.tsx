import { createContext, useContext, type ReactNode } from "react";
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
  const value: ViewerContextValue = {
    me,
    people,
    person: me.person,
    isManager: me.seesWholeTeam,
    isAdmin: me.role === "admin",
  };
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

export function useViewer(): ViewerContextValue {
  const value = useContext(ViewerContext);
  if (!value) throw new Error("useViewer used outside the provider");
  return value;
}
