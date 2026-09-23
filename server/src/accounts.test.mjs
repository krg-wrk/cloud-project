import assert from "node:assert/strict";
import test from "node:test";
import { accountsFor } from "./accounts.js";

/**
 * The one unauthenticated read in the API.
 *
 * Everything here is about the two ways it could go wrong: naming the team to
 * somebody who has not signed in when the deployment never asked for a
 * switcher, and letting a column added to the team sheet later ride out
 * alongside the address.
 */

const dev = { mode: "dev", emailHeader: "x-forwarded-email" };
const proxy = { mode: "proxy", emailHeader: "x-forwarded-email" };

const team = [
  {
    id: "p-1",
    name: "Elena Roux",
    email: "elena.roux@wgsn.com",
    role: "forecaster",
    region: "EMEA",
    forecasterRole: "Director",
    department: "Consumer Tech",
  },
  {
    id: "p-2",
    name: "Amara Okafor",
    email: "amara.okafor@wgsn.com",
    role: "commissioning-manager",
    region: "EMEA",
  },
];

test("proxy mode is told nothing, because SSO already knows who somebody is", () => {
  assert.equal(accountsFor(proxy, team), null);
});

test("an empty team is an empty list rather than a refusal, so the page can say so", () => {
  assert.deepEqual(accountsFor(dev, []), []);
});

test("a name and an address, and nothing else the team sheet happens to carry", () => {
  assert.deepEqual(accountsFor(dev, team), [
    { name: "Elena Roux", email: "elena.roux@wgsn.com" },
    { name: "Amara Okafor", email: "amara.okafor@wgsn.com" },
  ]);
});

test("a column grown onto a person later does not follow the address out", () => {
  const withMore = [{ ...team[0], phone: "+44 7700 900000", manager: "somebody@wgsn.com" }];
  const [account] = accountsFor(dev, withMore);
  assert.deepEqual(Object.keys(account), ["name", "email"]);
});
