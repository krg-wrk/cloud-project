import type { NextFunction, Request, Response } from "express";
import type { ContentItem, Person, Vertical } from "./types.js";

export type Role = "forecaster" | "commissioning-manager" | "admin";

/**
 * Who is making this request, and what they are allowed to see and change.
 * Built once per request from the signed-in identity.
 */
export interface Viewer {
  email: string;
  name: string;
  /** The person record this account maps to, if they are on the team. */
  personId: string | null;
  role: Role;
  /** Verticals a manager or admin oversees; "all" for everything. */
  verticals: Vertical[] | "all";
  active: boolean;
}

/** An access-sheet row, as maintained by the commissioning managers. */
export interface AccessRow {
  email: string;
  name?: string;
  role: Role;
  /** Empty or "All" means every vertical. */
  verticals?: string;
  active: boolean;
}

const isAdmin = (v: Viewer) => v.role === "admin";
const isManager = (v: Viewer) => v.role === "commissioning-manager" || v.role === "admin";

/** Managers and admins see the whole team; forecasters see themselves first. */
export function seesWholeTeam(viewer: Viewer): boolean {
  return isManager(viewer);
}

function inScope(viewer: Viewer, vertical: string): boolean {
  if (viewer.verticals === "all") return true;
  return viewer.verticals.includes(vertical as Vertical);
}

/** Anyone on the team can read the schedule; scope only limits writing. */
export function canRead(viewer: Viewer): boolean {
  return viewer.active;
}

/** Notes belong to the person writing them, but managers can annotate their own verticals. */
export function canWriteNote(viewer: Viewer, item: ContentItem): boolean {
  if (!viewer.active) return false;
  if (isAdmin(viewer)) return true;
  if (viewer.personId === item.forecasterId) return true;
  return isManager(viewer) && inScope(viewer, item.vertical);
}

/** Editing or deleting a note: the author, a manager in scope, or an admin. */
export function canEditNote(
  viewer: Viewer,
  item: ContentItem,
  authorId: string,
): boolean {
  if (!viewer.active) return false;
  if (isAdmin(viewer)) return true;
  if (viewer.personId === authorId) return true;
  return isManager(viewer) && inScope(viewer, item.vertical);
}

/**
 * A peer review is a two-person arrangement, so either side can change or
 * remove it — as can a manager for that vertical.
 */
export function canWritePeerReview(
  viewer: Viewer,
  item: ContentItem,
  currentReviewerId?: string,
): boolean {
  if (!viewer.active) return false;
  if (isAdmin(viewer)) return true;
  if (viewer.personId === item.forecasterId) return true;
  if (currentReviewerId && viewer.personId === currentReviewerId) return true;
  return isManager(viewer) && inScope(viewer, item.vertical);
}

/**
 * The details on a forecast — content type, years, research links, the
 * Content Editor reference. Same people as the notes: whoever is working on it
 * and whoever commissioned it.
 */
export function canWriteDetails(viewer: Viewer, item: ContentItem): boolean {
  return canWriteNote(viewer, item);
}

/**
 * A trend profile belongs to one forecaster, and may credit others. They own
 * what the Hub holds against it — the note, the links, the cover image — as
 * does an admin, and a manager whose verticals overlap the industries the
 * profile is tagged to.
 */
export function canWriteTrend(
  viewer: Viewer,
  trend: { ownerId: string; authorIds?: string[]; industries?: string[] },
): boolean {
  if (!viewer.active) return false;
  if (isAdmin(viewer)) return true;
  if (viewer.personId === trend.ownerId) return true;
  if (trend.authorIds?.includes(viewer.personId ?? "")) return true;
  if (!isManager(viewer)) return false;
  if (viewer.verticals === "all") return true;
  // An industry on a profile is broader than a vertical, so match on either
  // containing the other: "Fashion" covers "Womenswear", and vice versa.
  return (trend.industries ?? []).some((industry) =>
    (viewer.verticals as string[]).some(
      (v) =>
        v.toLowerCase().includes(industry.toLowerCase()) ||
        industry.toLowerCase().includes(v.split(" ")[0].toLowerCase()),
    ),
  );
}

/** KPIs: your own always; a manager for their verticals; an admin for anyone. */
export function canViewKpis(viewer: Viewer, subject: Person): boolean {
  if (!viewer.active) return false;
  if (isAdmin(viewer)) return true;
  if (viewer.personId === subject.id) return true;
  if (!isManager(viewer)) return false;
  return subject.vertical ? inScope(viewer, subject.vertical) : true;
}

/** Personal entries are private: only their owner touches them. */
export function canWriteEntry(viewer: Viewer, ownerId: string): boolean {
  return viewer.active && viewer.personId === ownerId;
}

/** Signing up is for yourself; admins can add someone who asked by email. */
export function canSignUpAs(viewer: Viewer, personId: string): boolean {
  if (!viewer.active) return false;
  return isAdmin(viewer) || viewer.personId === personId;
}

/**
 * Resolves the signed-in identity.
 *
 * AUTH_MODE=proxy (production): an SSO proxy in front of the app — Google via
 * IAP, or Okta — authenticates the user and passes the verified address on a
 * header. The app never sees a password or a token. Set AUTH_EMAIL_HEADER to
 * whatever the proxy uses (x-goog-authenticated-user-email, x-forwarded-email,
 * x-auth-request-email …).
 *
 * AUTH_MODE=dev (default, local only): the address comes from the ?as= query
 * or the x-dev-viewer header, so the Hub runs without an identity provider.
 * Refuses to start in production.
 */
export interface AuthConfig {
  mode: "proxy" | "dev";
  emailHeader: string;
}

export function readAuthConfig(): AuthConfig {
  const mode = (process.env.AUTH_MODE ?? "dev") as AuthConfig["mode"];
  if (mode !== "proxy" && mode !== "dev") {
    throw new Error(`Unknown AUTH_MODE "${mode}" (expected "proxy" or "dev")`);
  }
  if (mode === "dev" && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_MODE=dev cannot be used in production — put SSO in front and use proxy");
  }
  return {
    mode,
    emailHeader: (process.env.AUTH_EMAIL_HEADER ?? "x-forwarded-email").toLowerCase(),
  };
}

/** Google's IAP header prefixes the address; strip it if present. */
function cleanEmail(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().replace(/^accounts\.google\.com:/, "").toLowerCase();
  return value.includes("@") ? value : null;
}

export function emailFromRequest(req: Request, config: AuthConfig): string | null {
  const header = req.headers[config.emailHeader];
  const fromHeader = cleanEmail(Array.isArray(header) ? header[0] : header);
  if (config.mode === "proxy") return fromHeader;
  // Dev mode: the switcher in the UI, or an explicit header for scripts.
  return (
    fromHeader ??
    cleanEmail(req.query.as as string | undefined) ??
    cleanEmail(req.headers["x-dev-viewer"] as string | undefined)
  );
}

/**
 * Turns an email address into a Viewer using the access rows and the team
 * list. Someone signed in but absent from both is inactive: they can reach
 * the Hub but see nothing, which is the safe default for a leaver.
 */
export function resolveViewer(
  email: string | null,
  access: AccessRow[],
  people: Person[],
): Viewer | null {
  if (!email) return null;
  const row = access.find((a) => a.email.toLowerCase() === email);
  const person = people.find((p) => p.email.toLowerCase() === email);

  if (!row && !person) {
    return { email, name: email, personId: null, role: "forecaster", verticals: [], active: false };
  }

  const verticals = parseVerticals(row?.verticals);
  return {
    email,
    name: row?.name ?? person?.name ?? email,
    personId: person?.id ?? null,
    // Absent from the access sheet: a known team member with no extra rights.
    role: row?.role ?? (person?.role === "commissioning-manager" ? "commissioning-manager" : "forecaster"),
    verticals,
    active: row ? row.active : true,
  };
}

function parseVerticals(raw: string | undefined): Vertical[] | "all" {
  const value = (raw ?? "").trim();
  if (!value || /^all$/i.test(value)) return "all";
  return value.split(/\s*,\s*/).filter(Boolean) as Vertical[];
}

/** Express plumbing: hangs the resolved viewer off the request. */
export interface ViewerRequest extends Request {
  viewer?: Viewer;
}

export function viewerMiddleware(
  config: AuthConfig,
  load: () => Promise<{ access: AccessRow[]; people: Person[] }>,
) {
  return async (req: ViewerRequest, res: Response, next: NextFunction) => {
    try {
      const { access, people } = await load();
      const viewer = resolveViewer(emailFromRequest(req, config), access, people);
      if (!viewer) {
        res.status(401).json({ error: "Not signed in" });
        return;
      }
      req.viewer = viewer;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Guard for routes that need an identity mapped to a person. */
export function requirePerson(req: ViewerRequest, res: Response): string | null {
  const id = req.viewer?.personId;
  if (!req.viewer?.active) {
    res.status(403).json({ error: "This account does not have access to the Hub." });
    return null;
  }
  if (!id) {
    res.status(403).json({
      error: "This account is not linked to a forecaster record, so it cannot save anything.",
    });
    return null;
  }
  return id;
}
