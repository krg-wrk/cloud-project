import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { MirrorSource } from "./mirrorSource.js";

/**
 * What the mirror must never do.
 *
 * It sits between the Hub and the system of record while other teams are
 * still working in that system of record, so the failures worth writing down
 * are all the same shape: the mirror answering for Smartsheet when it has no
 * business doing so. Never invent an empty schedule; never let a write land
 * anywhere but the sheet; never let the concurrency check consult the copy;
 * never show half a sync.
 *
 * Run against a real SQLite database in memory rather than a stubbed Db,
 * because the parts most worth proving — the run pointer moving last, the
 * primary key, `ON CONFLICT` — are the database's behaviour and a stub would
 * simply agree with whatever the code did.
 */

/** The `Db` interface over node:sqlite, which is what db.ts does for real. */
function memoryDb() {
  const db = new DatabaseSync(":memory:");
  return {
    kind: "sqlite",
    where: ":memory:",
    async all(sql, params = []) {
      return db.prepare(sql).all(...params);
    },
    async get(sql, params = []) {
      return db.prepare(sql).get(...params);
    },
    async run(sql, params = []) {
      const r = db.prepare(sql).run(...params);
      return { changes: Number(r.changes) };
    },
    async exec(sql) {
      db.exec(sql);
    },
    async close() {
      db.close();
    },
  };
}

/** A source that counts its reads, so a test can tell where an answer came from. */
function upstream(overrides = {}) {
  const reads = { content: 0, people: 0 };
  const base = {
    name: "stub",
    reads,
    async listContent() {
      reads.content += 1;
      return [
        { id: "a", title: "First", sourceRowId: "1" },
        { id: "b", title: "Second", sourceRowId: "2" },
      ];
    },
    async listPeople() {
      reads.people += 1;
      return [{ id: "gk", name: "Somebody" }];
    },
    async listEvents() {
      return [];
    },
    async listSessions() {
      return [];
    },
    async listSignUps() {
      return { "s-1": { going: ["gk"] } };
    },
    async listAccess() {
      return [];
    },
    async listMetrics() {
      return [];
    },
    async listMetricObservations() {
      return [];
    },
    async listTrends() {
      return [];
    },
    async listDirectory() {
      return [];
    },
  };
  return { ...base, ...overrides, reads };
}

test("a kind that has never synced refuses, rather than reporting an empty schedule", async () => {
  const mirror = new MirrorSource(upstream(), memoryDb());
  await mirror.init();
  await assert.rejects(() => mirror.listContent(), /has not synced/);
});

test("the order the sheets were kept in survives a round trip, so a schedule does not reshuffle itself", async () => {
  const mirror = new MirrorSource(upstream(), memoryDb());
  await mirror.init();
  await mirror.pull("content");
  assert.deepEqual((await mirror.listContent()).map((c) => c.id), ["a", "b"]);
});

test("a pull that fails leaves the copy that was there, so a Smartsheet outage is not a Hub outage", async () => {
  const up = upstream();
  const mirror = new MirrorSource(up, memoryDb());
  await mirror.init();
  await mirror.pull("content");

  up.listContent = async () => {
    throw new Error("api.smartsheet.eu is unreachable");
  };
  const result = await mirror.pull("content");

  assert.equal(result.ok, false);
  assert.match(result.why, /unreachable/);
  assert.deepEqual((await mirror.listContent()).map((c) => c.id), ["a", "b"]);
});

test("a failed pull reports itself rather than throwing, so one bad sheet does not stop the others", async () => {
  const up = upstream({
    async listPeople() {
      throw new Error("the token cannot see that sheet");
    },
  });
  const mirror = new MirrorSource(up, memoryDb());
  await mirror.init();
  const results = await mirror.sync();

  assert.equal(results.filter((r) => !r.ok).length, 1);
  assert.equal(results.find((r) => r.kind === "people").ok, false);
  assert.equal(results.find((r) => r.kind === "content").ok, true);
  assert.deepEqual((await mirror.listContent()).map((c) => c.id), ["a", "b"]);
});

test("a second pull replaces the first rather than adding to it, so nothing appears twice", async () => {
  const up = upstream();
  const db = memoryDb();
  const mirror = new MirrorSource(up, db);
  await mirror.init();
  await mirror.pull("content");

  up.listContent = async () => [{ id: "c", title: "Only this one", sourceRowId: "3" }];
  await mirror.pull("content");

  assert.deepEqual((await mirror.listContent()).map((c) => c.id), ["c"]);
  // And the superseded rows are gone, not merely unreferenced.
  const left = await db.all("SELECT COUNT(*) AS n FROM mirror_rows WHERE kind = 'content'");
  assert.equal(Number(left[0].n), 1);
});

test("a row deleted from the sheet disappears from the mirror, because a pull is a replacement and not a merge", async () => {
  const up = upstream();
  const mirror = new MirrorSource(up, memoryDb());
  await mirror.init();
  await mirror.pull("content");

  up.listContent = async () => [{ id: "a", title: "First", sourceRowId: "1" }];
  await mirror.pull("content");

  assert.deepEqual((await mirror.listContent()).map((c) => c.id), ["a"]);
});

test("the check that guards a write asks Smartsheet, never the copy", async () => {
  let askedUpstream = 0;
  const up = upstream();
  up.writes = {
    target: "the commissioning sheet",
    async current() {
      askedUpstream += 1;
      return { Status: "Writing" };
    },
    async apply() {},
  };
  const mirror = new MirrorSource(up, memoryDb());
  await mirror.init();
  await mirror.pull("content");

  await mirror.writes.current("1");
  assert.equal(askedUpstream, 1, "the preview must re-read the sheet, or it compares a copy against itself");
});

test("a write goes to the sheet and never to the mirror's own tables", async () => {
  const applied = [];
  const up = upstream();
  up.writes = {
    target: "the commissioning sheet",
    async current() {
      return {};
    },
    async apply(rowId, changes, expect) {
      applied.push({ rowId, changes, expect });
    },
  };
  const db = memoryDb();
  const mirror = new MirrorSource(up, db);
  await mirror.init();
  await mirror.pull("content");

  // The sheet now says something different, as it would after a real write.
  up.listContent = async () => [
    { id: "a", title: "First", sourceRowId: "1", status: "published" },
    { id: "b", title: "Second", sourceRowId: "2" },
  ];
  await mirror.writes.apply("1", { status: "published" }, { Status: "Writing" });

  assert.equal(applied.length, 1);
  assert.equal(applied[0].rowId, "1");
  // `expect` reaches the sheet untouched — the mirror is not allowed a view on it.
  assert.deepEqual(applied[0].expect, { Status: "Writing" });
  // And the copy has caught up by the time apply returns, rather than a tick later.
  assert.equal((await mirror.listContent())[0].status, "published");
});

test("a mirror over a source that cannot write offers no writer at all", async () => {
  const mirror = new MirrorSource(upstream(), memoryDb());
  await mirror.init();
  assert.equal(mirror.writes, undefined);
});

test("writing survives being wrapped, because the capability is asked for rather than the class", async () => {
  const up = upstream();
  up.enableWrites = async () => "the commissioning schedule 2026";
  const mirror = new MirrorSource(up, memoryDb());
  assert.equal(await mirror.enableWrites(), "the commissioning schedule 2026");
});

test("sign-ups come back as the map they are, not as a list of one", async () => {
  const mirror = new MirrorSource(upstream(), memoryDb());
  await mirror.init();
  await mirror.pull("signups");
  assert.deepEqual(await mirror.listSignUps(), { "s-1": { going: ["gk"] } });
});

test("forgetting reaches the source underneath, so the next pull is not handed the same stale answer", async () => {
  const forgotten = [];
  const up = upstream({ forget: (key) => forgotten.push(key) });
  const mirror = new MirrorSource(up, memoryDb());
  mirror.forget("content");
  assert.deepEqual(forgotten, ["content"]);
});

test("two refreshes at once make one pass over the sheets, not two", async () => {
  let reads = 0;
  const up = upstream({
    async listContent() {
      reads += 1;
      // Long enough that the second caller genuinely arrives mid-flight.
      await new Promise((r) => setTimeout(r, 20));
      return [{ id: "a", title: "First", sourceRowId: "1" }];
    },
  });
  const mirror = new MirrorSource(up, memoryDb());
  await mirror.init();

  const [a, b] = await Promise.all([mirror.refresh(), mirror.refresh()]);

  assert.equal(reads, 1, "a second press must wait for the first, not start another fourteen requests");
  assert.deepEqual(a, b, "and both callers are told what the one sync found");
});

test("a refresh that has finished does not block the next one", async () => {
  const up = upstream();
  const mirror = new MirrorSource(up, memoryDb());
  await mirror.init();
  await mirror.refresh();
  await mirror.refresh();
  assert.equal(up.reads.content, 2, "the guard is for overlap, not a once-per-process latch");
});

test("a refresh that throws lets the next one run, rather than wedging the button forever", async () => {
  const up = upstream();
  const mirror = new MirrorSource(up, memoryDb());
  await mirror.init();
  // `sync` swallows a read failure per kind, so break the sync itself.
  const broken = new Error("the database went away");
  const realPull = mirror.pull.bind(mirror);
  mirror.pull = async () => {
    throw broken;
  };
  await assert.rejects(() => mirror.refresh(), /went away/);

  mirror.pull = realPull;
  const after = await mirror.refresh();
  assert.ok(after.every((r) => r.ok), "the guard must clear on failure as well as on success");
});

test("every kind reports its age once it has been pulled, and none before", async () => {
  const mirror = new MirrorSource(upstream(), memoryDb());
  await mirror.init();
  assert.deepEqual(await mirror.freshness(), []);

  await mirror.sync();
  const ages = await mirror.freshness();
  assert.equal(ages.length, 10);
  // Named in the Hub's words rather than left as a bare key on the page.
  assert.ok(ages.every((a) => a.label && a.key.startsWith("mirror:")));
  assert.ok(ages.every((a) => a.ageMs >= 0));
});
