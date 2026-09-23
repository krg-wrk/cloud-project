import { Router } from "express";
import type { AuthConfig } from "./auth.js";
import type { DataSource, DevAccount, Person } from "./types.js";

/**
 * The list behind the dev sign-in switcher.
 *
 * The switcher asks somebody to pick an account, which means it has to know
 * the accounts before anybody is signed in — and every other route is behind
 * `viewerMiddleware`, which answers 401 until there is a viewer. Feeding the
 * switcher from `/people` was the obvious thing and it deadlocks: the page
 * needs an identity to fetch the list it needs in order to choose one. On a
 * browser that had chosen before, the stored address hid it; on a clean one
 * the menu is empty and there is no way into the Hub at all.
 *
 * So this is mounted ahead of the identity middleware, next to the feed, and
 * is the only unauthenticated read in the API.
 *
 * ## Why that gives nothing away
 *
 * It is refused outright unless `AUTH_MODE=dev`, and dev mode already means
 * anybody who can reach the port may claim to be anybody — `x-dev-viewer`
 * takes whatever address it is handed. A list of who could be claimed adds
 * nothing to a door that is already open, which is why dev mode refuses to
 * start in production rather than being made safe. In `proxy` mode the route
 * is not there at all: SSO has already said who somebody is, and a Hub that
 * publishes the team's addresses to anyone who asks would be a leak dressed
 * up as a convenience.
 *
 * Names and addresses are copied field by field rather than handing back the
 * `Person`, so a column added to the team sheet later — a phone number, a
 * grade, a manager — cannot arrive here by growing into it.
 */
export function accountsFor(config: AuthConfig, people: Person[]): DevAccount[] | null {
  if (config.mode !== "dev") return null;
  return people.map((person) => ({ name: person.name, email: person.email }));
}

export function createAccountsRouter(config: AuthConfig, data: DataSource): Router {
  const router = Router();

  router.get("/accounts", async (_req, res, next) => {
    try {
      const accounts = accountsFor(config, await data.listPeople());
      if (!accounts) {
        res.status(404).json({ error: "There is no account switcher outside dev mode." });
        return;
      }
      res.json(accounts);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
