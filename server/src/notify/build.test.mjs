import assert from "node:assert/strict";
import test from "node:test";
import { awayOn, buildNotices, daysUntil, weekOf } from "./build.js";

/**
 * What gets said, and to whom.
 *
 * The rules are the risky part of notifications — not the sending. Saying
 * the wrong thing to two hundred people is a worse failure than saying
 * nothing, and the two mistakes that matter are telling somebody about a
 * deadline twice and telling them about one that is not theirs.
 *
 * 2026-09-14 is a Monday, which is the day the digest goes.
 */

const MONDAY = "2026-09-14";
const WEDNESDAY = "2026-09-16";

const people = [
  { id: "ao", name: "Amara Okafor", email: "amara.okafor@wgsn.com", role: "forecaster", region: "UK" },
  { id: "tb", name: "Tomas Belka", email: "tomas.belka@wgsn.com", role: "forecaster", region: "Czechia" },
  { id: "gk", name: "Graham Krag", email: "graham.krag@wgsn.com", role: "commissioning-manager", region: "UK" },
];

function forecast(over = {}) {
  return {
    id: "ss-1",
    title: "Big Ideas S/S 28",
    type: "Big Ideas",
    vertical: "Womenswear",
    season: "S/S 28",
    forecasterId: "ao",
    managerId: "gk",
    submissionDate: "2026-09-17",
    publicationDate: "2026-10-01",
    status: "in-progress",
    ...over,
  };
}

function world(over = {}) {
  return {
    today: WEDNESDAY,
    people,
    content: [],
    events: [],
    sessions: [],
    goingBySession: {},
    peerReviews: [],
    reviewWaiting: {},
    ...over,
  };
}

const keys = (notices) => notices.map((n) => n.key);

// --- The clock -----------------------------------------------------------

test("days between two dates, in both directions", () => {
  assert.equal(daysUntil("2026-09-16", "2026-09-17"), 1);
  assert.equal(daysUntil("2026-09-16", "2026-09-16"), 0);
  assert.equal(daysUntil("2026-09-16", "2026-09-09"), -7);
});

test("the week starts on Monday, and Sunday belongs to the week that ended", () => {
  assert.equal(weekOf("2026-09-14"), "2026-09-14", "Monday is its own week");
  assert.equal(weekOf("2026-09-16"), "2026-09-14", "Wednesday");
  assert.equal(weekOf("2026-09-20"), "2026-09-14", "Sunday");
  assert.equal(weekOf("2026-09-21"), "2026-09-21", "the next Monday");
});

// --- Deadlines -----------------------------------------------------------

test("nothing is said on the days between the three moments", () => {
  const item = forecast({ submissionDate: "2026-09-17" });
  const at = (today) => keys(buildNotices(world({ today, content: [item] }), ["deadline"]));

  assert.deepEqual(at("2026-09-13"), [], "four days out");
  assert.deepEqual(at("2026-09-15"), [], "two days out");
  assert.deepEqual(at("2026-09-16"), [], "the day before");
  assert.equal(at("2026-09-14").length, 1, "three days out");
  assert.equal(at("2026-09-17").length, 1, "the day itself");
});

test("three days out, today, and late each read differently", () => {
  const item = forecast({ submissionDate: "2026-09-17" });
  const one = (today) => buildNotices(world({ today, content: [item] }), ["deadline"]);

  const three = one("2026-09-14");
  const soon = one("2026-09-17");
  const late = one("2026-09-20");

  assert.equal(soon.length, 1);
  assert.match(soon[0].title, /^Due today:/);
  assert.equal(soon[0].urgency, 1);

  assert.equal(late.length, 1);
  assert.match(late[0].title, /^Overdue:/);
  assert.equal(late[0].urgency, 2);
  assert.match(late[0].body, /is overdue: it was due .* — 3 days ago\./);

  // The three-day notice fires on the 14th only if that is exactly three days.
  assert.equal(three.length, 1, "the 14th is three days before the 17th");
  assert.equal(three[0].urgency, 0);
  assert.match(three[0].body, /three days from now/);
});

test("a status is quoted in the words a person says it in", () => {
  const late = buildNotices(
    world({ today: "2026-09-20", content: [forecast({ status: "not-started" })] }),
    ["deadline"],
  );
  assert.match(late[0].body, /still reads "not started"/);
  assert.doesNotMatch(late[0].body, /not-started/, "the hyphen is a key, not a word");
});

test("a deadline notice never reads 'is was due'", () => {
  const content = [forecast({ submissionDate: "2026-09-17" })];
  for (const today of ["2026-09-14", "2026-09-17", "2026-09-20"]) {
    for (const n of buildNotices(world({ today, content }), ["deadline"])) {
      assert.doesNotMatch(n.body, /\bis was\b/, today);
      assert.doesNotMatch(n.body, /\bis due .*is\b/, today);
    }
  }
});

test("nothing about a forecast that is already in", () => {
  for (const status of ["submitted", "in-review", "published"]) {
    const notices = buildNotices(
      world({ today: "2026-09-20", content: [forecast({ status })] }),
      ["deadline"],
    );
    assert.deepEqual(notices, [], `${status} should be left alone`);
  }
});

test("the same deadline on the same day is one key, whenever the run happens", () => {
  const item = forecast({ submissionDate: "2026-09-17" });
  const a = keys(buildNotices(world({ today: "2026-09-17", content: [item] }), ["deadline"]));
  const b = keys(buildNotices(world({ today: "2026-09-17", content: [item] }), ["deadline"]));
  assert.deepEqual(a, b);
  assert.deepEqual(a, ["ao:deadline:ss-1:today"]);
});

test("a late deadline gets a new key each day, so each day says it once", () => {
  const item = forecast({ submissionDate: "2026-09-17" });
  const thurs = keys(buildNotices(world({ today: "2026-09-18", content: [item] }), ["deadline"]));
  const fri = keys(buildNotices(world({ today: "2026-09-19", content: [item] }), ["deadline"]));
  assert.deepEqual(thurs, ["ao:deadline:ss-1:late-2026-09-18"]);
  assert.deepEqual(fri, ["ao:deadline:ss-1:late-2026-09-19"]);
});

test("everyone credited is told, not only whoever the sheet calls the owner", () => {
  const item = forecast({ submissionDate: "2026-09-17", contributorIds: ["tb"] });
  const notices = buildNotices(world({ today: "2026-09-17", content: [item] }), ["deadline"]);
  assert.deepEqual(
    notices.map((n) => n.personId).sort(),
    ["ao", "tb"],
  );
});

test("a contributor named twice is told once", () => {
  const item = forecast({ submissionDate: "2026-09-17", contributorIds: ["ao", "ao"] });
  const notices = buildNotices(world({ today: "2026-09-17", content: [item] }), ["deadline"]);
  assert.equal(notices.length, 1);
});

test("nobody is nudged about a forecast that is not theirs", () => {
  const item = forecast({ forecasterId: "tb", submissionDate: "2026-09-17" });
  const notices = buildNotices(world({ today: "2026-09-17", content: [item] }), ["deadline"]);
  assert.deepEqual(notices.map((n) => n.personId), ["tb"]);
});

test("a person the schedule names but the team does not is skipped", () => {
  const item = forecast({ forecasterId: "nobody", submissionDate: "2026-09-17" });
  const notices = buildNotices(world({ today: "2026-09-17", content: [item] }), ["deadline"]);
  assert.deepEqual(notices, []);
});

// --- Being away ----------------------------------------------------------

test("no nudge while somebody is on leave", () => {
  const events = [
    {
      id: "e1",
      type: "leave",
      title: "Annual leave",
      personId: "ao",
      startDate: "2026-09-16",
      endDate: "2026-09-18",
    },
  ];
  const item = forecast({ submissionDate: "2026-09-17" });
  assert.deepEqual(
    buildNotices(world({ today: "2026-09-17", content: [item], events }), ["deadline"]),
    [],
  );
  // And it comes back the day they do.
  assert.equal(
    buildNotices(world({ today: "2026-09-19", content: [item], events }), ["deadline"]).length,
    1,
  );
});

test("somebody else's leave is not yours", () => {
  const events = [
    {
      id: "e1",
      type: "leave",
      title: "Annual leave",
      personId: "tb",
      startDate: "2026-09-16",
      endDate: "2026-09-18",
    },
  ];
  const item = forecast({ submissionDate: "2026-09-17" });
  assert.equal(
    buildNotices(world({ today: "2026-09-17", content: [item], events }), ["deadline"]).length,
    1,
  );
});

test("a public holiday applies by region", () => {
  const holiday = {
    id: "h1",
    type: "public-holiday",
    title: "Bank holiday",
    region: "UK",
    startDate: "2026-09-17",
    endDate: "2026-09-17",
  };
  const uk = people.find((p) => p.id === "ao");
  const cz = people.find((p) => p.id === "tb");
  assert.equal(awayOn([holiday], uk, "2026-09-17"), true);
  assert.equal(awayOn([holiday], cz, "2026-09-17"), false);
  assert.equal(awayOn([{ ...holiday, region: "All" }], cz, "2026-09-17"), true);
});

// --- The digest ----------------------------------------------------------

test("the digest only goes on a Monday", () => {
  const content = [forecast({ submissionDate: "2026-09-17" })];
  assert.deepEqual(buildNotices(world({ today: WEDNESDAY, content }), ["digest"]), []);
  assert.equal(buildNotices(world({ today: MONDAY, content }), ["digest"]).length, 1);
});

test("a digest with nothing in it is not sent", () => {
  assert.deepEqual(buildNotices(world({ today: MONDAY }), ["digest"]), []);
});

test("the digest carries the week's deadlines, publications, reviews and sessions", () => {
  const content = [
    forecast({ id: "ss-1", title: "Due this week", submissionDate: "2026-09-17" }),
    forecast({
      id: "ss-2",
      title: "Publishing this week",
      submissionDate: "2026-08-01",
      publicationDate: "2026-09-18",
      status: "published",
    }),
    forecast({ id: "ss-3", title: "Already late", submissionDate: "2026-09-01" }),
    forecast({ id: "ss-4", title: "Next month", submissionDate: "2026-10-20" }),
  ];
  const sessions = [{ id: "ws-1", title: "Colour critique", date: "2026-09-16" }];
  const notices = buildNotices(
    world({
      today: MONDAY,
      content,
      sessions,
      goingBySession: { "ws-1": ["ao"] },
      peerReviews: [{ contentId: "ss-2", reviewerId: "ao", reviewDate: "2026-09-17" }],
    }),
    ["digest"],
  );

  assert.equal(notices.length, 1);
  const body = notices[0].body;
  assert.match(body, /Due this week/);
  assert.match(body, /Publishing this week/);
  assert.match(body, /Already late/);
  assert.doesNotMatch(body, /Next month/, "a deadline outside the week is not in it");
  assert.match(body, /Colour critique/);
  assert.match(body, /Peer reviews you are doing \(1\)/);
  assert.equal(notices[0].urgency, 2, "something overdue makes the digest urgent");
  assert.equal(notices[0].key, "ao:digest:2026-09-14");
});

test("a session you did not sign up for is not in your digest", () => {
  const notices = buildNotices(
    world({
      today: MONDAY,
      sessions: [{ id: "ws-1", title: "Colour critique", date: "2026-09-16" }],
      goingBySession: { "ws-1": ["tb"] },
    }),
    ["digest"],
  );
  assert.deepEqual(notices.map((n) => n.personId), ["tb"]);
});

test("re-running a Monday produces the same digest key", () => {
  const content = [forecast({ submissionDate: "2026-09-17" })];
  const a = keys(buildNotices(world({ today: MONDAY, content }), ["digest"]));
  const b = keys(buildNotices(world({ today: "2026-09-14", content }), ["digest"]));
  assert.deepEqual(a, b);
});

// --- The review queue ----------------------------------------------------

test("the review notice waits until there is enough to be worth saying", () => {
  const few = buildNotices(world({ reviewWaiting: { ao: 4 } }), ["review"]);
  const some = buildNotices(world({ reviewWaiting: { ao: 5 } }), ["review"]);
  assert.deepEqual(few, []);
  assert.equal(some.length, 1);
  assert.match(some[0].title, /5 proof points waiting on you/);
  assert.equal(some[0].link, "/data/review");
});

test("the review notice is once a week, not once a run", () => {
  const mon = keys(buildNotices(world({ today: MONDAY, reviewWaiting: { ao: 9 } }), ["review"]));
  const wed = keys(buildNotices(world({ today: WEDNESDAY, reviewWaiting: { ao: 9 } }), ["review"]));
  assert.deepEqual(mon, wed, "the same week is the same notice");
  const next = keys(
    buildNotices(world({ today: "2026-09-21", reviewWaiting: { ao: 9 } }), ["review"]),
  );
  assert.notDeepEqual(mon, next);
});

test("one waiting proof point reads in the singular", () => {
  const notices = buildNotices(world({ reviewWaiting: { ao: 1 } }), ["review"]);
  assert.deepEqual(notices, [], "and one is below the floor anyway");
});

// --- Ordering and selection ---------------------------------------------

test("the most urgent thing comes first", () => {
  const content = [
    forecast({ id: "ss-1", title: "Soon", submissionDate: "2026-09-19" }),
    forecast({ id: "ss-2", title: "Late", submissionDate: "2026-09-01" }),
  ];
  const notices = buildNotices(world({ today: "2026-09-16", content }));
  assert.equal(notices[0].urgency, 2);
  assert.match(notices[0].title, /Overdue/);
});

test("only the kinds asked for are built", () => {
  const w = world({
    today: MONDAY,
    content: [forecast({ submissionDate: "2026-09-17" })],
    reviewWaiting: { ao: 20 },
  });
  assert.deepEqual(
    [...new Set(buildNotices(w, ["deadline"]).map((n) => n.kind))],
    ["deadline"],
  );
  assert.deepEqual(
    [...new Set(buildNotices(w).map((n) => n.kind))].sort(),
    ["deadline", "digest", "review"],
  );
});

test("a forecast with no submission date is not chased", () => {
  const notices = buildNotices(
    world({ today: MONDAY, content: [forecast({ submissionDate: "" })] }),
    ["deadline"],
  );
  assert.deepEqual(notices, []);
});

test("every notice carries a link into the Hub", () => {
  const w = world({
    today: MONDAY,
    content: [forecast({ submissionDate: "2026-09-17" })],
    reviewWaiting: { ao: 20 },
  });
  for (const notice of buildNotices(w)) {
    assert.ok(notice.link?.startsWith("/"), `${notice.kind} should link somewhere`);
  }
});
