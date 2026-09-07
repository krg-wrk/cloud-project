import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Person } from "../types";

/**
 * Who is looking at the Hub. For the POC this is a switcher in the header so
 * you can see the app as any forecaster; the real version reads it from Google
 * SSO and drops the switcher for everyone but commissioning managers.
 */
interface Viewer {
  person?: Person;
  people: Person[];
  setViewerId(id: string): void;
  isManager: boolean;
}

const ViewerContext = createContext<Viewer>({
  people: [],
  setViewerId: () => {},
  isManager: false,
});

const STORAGE_KEY = "forecasters-hub.viewer";

function storedViewerId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function ViewerProvider({
  people,
  children,
}: {
  people: Person[];
  children: ReactNode;
}) {
  const initial =
    new URLSearchParams(window.location.search).get("as") ??
    storedViewerId() ??
    people.find((p) => p.role === "forecaster")?.id ??
    people[0]?.id ??
    "";
  const [viewerId, setViewerId] = useState(initial);

  const value = useMemo<Viewer>(() => {
    const person = people.find((p) => p.id === viewerId) ?? people[0];
    return {
      person,
      people,
      isManager: person?.role === "commissioning-manager",
      setViewerId: (id: string) => {
        setViewerId(id);
        try {
          localStorage.setItem(STORAGE_KEY, id);
        } catch {
          // Private browsing or blocked storage — the choice just won't persist.
        }
      },
    };
  }, [people, viewerId]);

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer {
  return useContext(ViewerContext);
}
