import type { NextFunction, Request, Response } from "express";
import type { ContentItem, Person, Vertical } from "./types.js";

/**
 * What somebody may do in the Hub, as the directory's Hub Access column says.
 *
 * Five levels rather than three, because two distinctions the team makes were
 * not expressible. `leadership` sees the whole team and changes nothing —
 * previously the only way to see everyone was to be a manager, which also
 * granted the right to edit the commissioning sheet. `view-only` can open the
 * Hub and write nowhere, which is what a leaver's notice period or an
 * observer from another team actually needs.
 *
 * Deliberately not a list of jobs. Data and Subbing are teams and the
 * directory already records them in `Team`; an access level that moves when
 * somebody changes desk is an access level nobody can reason about.
 */
export type Role =
  | "forecaster"
  | "commissioning-manager"
  | "leadership"
  | "view-only"
  | "admin";

/**
 * The Hub Access column's words, as the dropdown writes them.
 *
 * Matched loosely and case-insensitively for the same reason statuses are:
 * the column is maintained by people, and "Commissioning Manager" arriving as
 * "commissioning manager" should not silently demote somebody.
 */
export function hubAccessFor(
  value: string | undefined,
): { role?: Role; active?: boolean } {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return {};
  // "No Access" is not a quiet level, it is the absence of one: somebody who
  // may not sign in at all, which is a different answer from somebody who may
  // look and not touch.
  if (v.includes("no access")) return { active: false };
  if (v.includes("admin")) return { role: "admin" };
  if (v.includes("view")) return { role: "view-only" };
  if (v.includes("leader")) return { role: "leadership" };
  if (v.includes("commission") || v === "cm") return { role: "commissioning-manager" };
  if (v.includes("forecaster")) return { role: "forecaster" };
  return {};
}

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

/**
 * Somebody who may look and not touch.
 *
 * Checked first in every write, before the question of whose work it is.
 * Owning a forecast is what usually grants the right to annotate it, so
 * without this a view-only account would get that right the moment their
 * name appeared in an owner cell — which is precisely the account it must
 * not happen to.
 */
const isViewOnly = (v: Viewer) => v.role === "view-only";

/**
 * Who sees the whole team rather than themselves first.
 *
 * Leadership is here and not in `isManager`: the two were the same question
 * while the only way to see everyone was to be able to edit the sheet, and
 * they are not the same question. A director wants the shape of the team's
 * work; they are not commissioning it.
 */
export function seesWholeTeam(viewer: Viewer): boolean {
  return isManager(viewer) || viewer.role === "leadership";
}

function inScope(viewer: Viewer, vertical: string): boolean {
  if (viewer.verticals === "all") return true;
  return viewer.verticals.includes(vertical as Vertical);
}

/** Anyone on the team can read the schedule; scope only limits writing. */
export function canRead(viewer: Viewer): boolean {
  return viewer.active;
}

/**
 * Whether a workshop is one of somebody's.
 *
 * Relevance rather than permission — nothing here is secret, and a manager
 * can still ask for the whole programme. It exists because the sheet holds
 * every session every team runs, and a forecaster in London opening the
 * calendar was reading a Seoul research week and four Beauty scoring days
 * that had nothing to do with them.
 *
 * Three ways in, in the order the team described them: named in the session,
 * or a session for the whole team, or one happening where they are. A session
 * that answers none of them belongs to somebody else.
 *
 * A session with nothing filled in reaches everybody, deliberately. Most of
 * the programme is untagged today, and the alternative is a workshops page
 * that is empty for all two hundred people — silence that reads as breakage
 * rather than as a sheet waiting to be filled in.
 */
export function sessionReaches(
  session: {
    attendeeIds?: string[];
    department?: string;
    location?: string;
    hostId?: string;
  },
  person: { id: string; country?: string } | null | undefined,
): boolean {
  const named = session.attendeeIds ?? [];
  const department = (session.department ?? "").trim();
  const where = (session.location ?? "").trim();
  if (!named.length && !department && !where) return true;

  if (!person) return false;
  if (named.includes(person.id)) return true;
  if (session.hostId === person.id) return true;
  if (/^all$/i.test(department)) return true;
  if (where && person.country && where.toLowerCase() === person.country.trim().toLowerCase()) {
    return true;
  }
  return false;
}

/**
 * Whether this forecast is theirs, however they are credited on it.
 *
 * `forecasterId` is whoever was named first in a contact cell that has no
 * notion of a lead, so treating it as the only owner refuses the second
 * person named access to work that is equally theirs. The KPI page already
 * counts a forecast for everybody credited and the notices already go to all
 * of them; the permission checks were the last place still asking who came
 * first alphabetically in a Smartsheet cell.
 */
export function isTheirs(viewer: Viewer, item: ContentItem): boolean {
  if (!viewer.personId) return false;
  if (viewer.personId === item.forecasterId) return true;
  return (item.contributorIds ?? []).includes(viewer.personId);
}

/** Notes belong to the person writing them, but managers can annotate their own verticals. */
export function canWriteNote(viewer: Viewer, item: ContentItem): boolean {
  if (!viewer.active) return false;
  if (isViewOnly(viewer)) return false;
  if (isAdmin(viewer)) return true;
  if (isTheirs(viewer, item)) return true;
  return isManager(viewer) && inScope(viewer, item.vertical);
}

/** Editing or deleting a note: the author, a manager in scope, or an admin. */
export function canEditNote(
  viewer: Viewer,
  item: ContentItem,
  authorId: string,
): boolean {
  if (!viewer.active) return false;
  if (isViewOnly(viewer)) return false;
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
  if (isViewOnly(viewer)) return false;
  if (isAdmin(viewer)) return true;
  if (isTheirs(viewer, item)) return true;
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
 * Changing the commissioning sheet itself.
 *
 * Narrower than everything else the Hub allows, because this is the only
 * thing that reaches out of the Hub and edits somebody else's system.
 * Commissioning is where the managers work: a manager may change a row in a
 * vertical they oversee, an admin any row, and a forecaster none — not even
 * their own, where they can still say what they need to in a note.
 */
export function canWriteSchedule(viewer: Viewer, item: ContentItem): boolean {
  if (!viewer.active) return false;
  if (isViewOnly(viewer)) return false;
  if (isAdmin(viewer)) return true;
  return isManager(viewer) && inScope(viewer, item.vertical);
}

/**
 * Whether changing the sheet is worth offering this person at all.
 *
 * Deliberately weaker than `canWriteSchedule`: it knows nothing about a
 * particular row, so it can only say "a manager, so some rows". It decides
 * whether the client draws the controls. Every row still goes through
 * `canWriteSchedule` on the server, so a yes here buys nothing.
 */
export function mayWriteSomeSchedule(viewer: Viewer): boolean {
  return viewer.active && !isViewOnly(viewer) && isManager(viewer);
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
  /** The signed-in person's name, since the sheet credits people by name. */
  viewerName?: string,
): boolean {
  if (!viewer.active) return false;
  if (isViewOnly(viewer)) return false;
  if (isAdmin(viewer)) return true;
  const mine = new Set([viewer.personId, nameId(viewerName)].filter(Boolean));
  if (mine.has(trend.ownerId)) return true;
  if ((trend.authorIds ?? []).some((a) => mine.has(a))) return true;
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

/**
 * The id form of a person's name, matching how the trends sheet's Owner and
 * AUTHORS columns are turned into ids. It is how a signed-in forecaster is
 * recognised as the owner of a profile the sheet credits by name.
 */
export function nameId(name: string | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
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
  return viewer.active && !isViewOnly(viewer) && viewer.personId === ownerId;
}

/** Signing up is for yourself; admins can add someone who asked by email. */
export function canSignUpAs(viewer: Viewer, personId: string): boolean {
  if (!viewer.active) return false;
  if (isViewOnly(viewer)) return false;
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
/**
 * The addresses this deployment names as admins, whatever the sheets say.
 *
 * `HUB_ADMINS=someone@wgsn.com,someone.else@wgsn.com`. Rights normally come
 * from the access sheet, which is right: they are operational, the
 * commissioning managers maintain them, and changing who may do what should
 * not need a deploy.
 *
 * This is the one exception, and it is the way back in. Before an access
 * sheet exists there is no way to be an admin at all, so the person setting
 * the Hub up cannot reach the studio that configures it. And once one does
 * exist, a row marking the wrong person inactive locks them out with no
 * remedy inside the Hub — a door that can only be opened from a room you are
 * locked out of. Naming an address in the environment is a statement by
 * whoever runs the deployment, so it wins over the sheet rather than being
 * overridden by it.
 */
export function adminList(raw = process.env.HUB_ADMINS): string[] {
  return (raw ?? "")
    .split(",")
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);
}

export function resolveViewer(
  email: string | null,
  access: AccessRow[],
  people: Person[],
  admins: string[] = adminList(),
): Viewer | null {
  if (!email) return null;
  const row = access.find((a) => a.email.toLowerCase() === email);
  const person = people.find((p) => p.email.toLowerCase() === email);
  const named = admins.includes(email.toLowerCase());

  if (!row && !person && !named) {
    return { email, name: email, personId: null, role: "forecaster", verticals: [], active: false };
  }

  const verticals = named ? "all" : parseVerticals(row?.verticals);
  /*
   * Three sources, and the order is the argument.
   *
   * HUB_ADMINS is the deployment's own statement and the way back into a
   * locked room, so nothing overrides it. The access sheet is next, because
   * it is the exception list the commissioning managers keep by hand and a
   * hand-written exception should beat a column filled in for everybody. The
   * directory's Hub Access column answers for the other two hundred people,
   * which is the case that actually comes up.
   */
  return {
    email,
    name: row?.name ?? person?.name ?? email,
    personId: person?.id ?? null,
    role: named
      ? "admin"
      : (row?.role ??
        person?.hubAccess ??
        (person?.role === "commissioning-manager" ? "commissioning-manager" : "forecaster")),
    verticals,
    // A named admin is never locked out, which is the whole point of naming one.
    active: named ? true : row ? row.active : (person?.active ?? true),
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
/**
 * The gate on every studio route.
 *
 * Building a view means naming a data source and choosing who sees it, so it
 * is an admin's job and only an admin's — a commissioning manager gets no
 * more here than a forecaster does.
 */
export function requireAdmin(req: ViewerRequest, res: Response): Viewer | null {
  const viewer = req.viewer;
  if (!viewer?.active) {
    res.status(403).json({ error: "This account does not have access to the Hub." });
    return null;
  }
  if (!isAdmin(viewer)) {
    res.status(403).json({ error: "The studio is open to Hub admins only." });
    return null;
  }
  return viewer;
}

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
