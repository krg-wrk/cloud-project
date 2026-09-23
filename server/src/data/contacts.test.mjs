import assert from "node:assert/strict";
import test from "node:test";
import { peopleIn } from "./smartsheetSource.js";

/**
 * Reading a cell that holds people.
 *
 * The thing that must never happen is two people becoming one person who
 * does not exist. A co-owned forecast flattened to "Allyson Rees, Hannah
 * Allan" turned into the id "allyson-rees-hannah-allan", which belonged to
 * neither of them — so the work appeared in nobody's list and the access
 * check refused both.
 */

test("two owners are two people, not one long name", () => {
  const cell = {
    columnId: 1,
    displayValue: "Allyson Rees, Hannah Allan",
    objectValue: {
      objectType: "MULTI_CONTACT",
      values: [
        { name: "Allyson Rees", email: "allyson.rees@wgsn.com" },
        { name: "Hannah Allan", email: "hannah.allan@wgsn.com" },
      ],
    },
  };
  assert.deepEqual(peopleIn(cell), ["allyson.rees@wgsn.com", "hannah.allan@wgsn.com"]);
});

test("the address is taken over the name, because that is what the directory is keyed on", () => {
  const cell = {
    columnId: 1,
    displayValue: "Ellie Bull",
    objectValue: { objectType: "CONTACT", name: "Ellie Bull", email: "ellie.bull@wgsn.com" },
  };
  assert.deepEqual(peopleIn(cell), ["ellie.bull@wgsn.com"]);
});

test("a name Smartsheet never resolved to an account is still a person", () => {
  const cell = {
    columnId: 1,
    displayValue: "Freelance: Laura Saunter",
    objectValue: { objectType: "MULTI_CONTACT", values: [{ name: "Freelance: Laura Saunter" }] },
  };
  assert.deepEqual(peopleIn(cell), ["Freelance: Laura Saunter"]);
});

test("a cell with nobody in it names nobody", () => {
  assert.deepEqual(peopleIn({ columnId: 1, displayValue: "" }), []);
  assert.deepEqual(peopleIn({ columnId: 1, displayValue: "Womenswear" }), []);
  assert.deepEqual(peopleIn({ columnId: 1, objectValue: { objectType: "MULTI_CONTACT", values: [] } }), []);
});

test("a name with a comma in it survives, which splitting the display string could never do", () => {
  const cell = {
    columnId: 1,
    displayValue: "Rees, Allyson, Hannah Allan",
    objectValue: {
      objectType: "MULTI_CONTACT",
      values: [{ name: "Rees, Allyson" }, { name: "Hannah Allan", email: "hannah.allan@wgsn.com" }],
    },
  };
  assert.deepEqual(peopleIn(cell), ["Rees, Allyson", "hannah.allan@wgsn.com"]);
});
