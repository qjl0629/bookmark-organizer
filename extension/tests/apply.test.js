import assert from "node:assert/strict";
import { test } from "node:test";

import { applyPlan, undoRun } from "../src/apply.js";
import { createMemoryBookmarks } from "../src/memory-bookmarks.js";
import { buildPlan, findDuplicates, flatten } from "../src/planner.js";

const bm = (title, url, extra = {}) => ({ title, url, ...extra });
const folder = (title, children = []) => ({ title, children });

const makeApi = (barChildren) =>
  createMemoryBookmarks([
    { id: "1", title: "Bookmarks bar", children: barChildren },
    { id: "2", title: "Other bookmarks", children: [] },
  ]);

// Structure without ids, since undoing a removal recreates the bookmark with a new id.
async function snapshot(api) {
  const rows = [];
  const walk = (node, path) =>
    (node.children ?? []).forEach((child, index) => {
      rows.push(`${path.join("/")}#${index}:${child.title}:${child.url ?? "<folder>"}`);
      if (child.children) walk(child, [...path, child.title]);
    });
  walk((await api.getTree())[0], []);
  return rows;
}

const sample = () =>
  makeApi([
    folder("Dev", [bm("a", "https://github.com/a"), bm("b", "https://github.com/b")]),
    bm("loose repo", "https://github.com/org/c"),
    bm("Item", "https://www.amazon.ca/dp/1"),
    bm("Item 2", "https://www.amazon.com/dp/2"),
    bm("Mystery", "https://unknown.example.org"),
  ]);

test("apply moves bookmarks, creates folders and keeps every bookmark", async () => {
  const api = sample();
  const before = flatten(await api.getTree()).bookmarks.length;
  const plan = buildPlan(await api.getTree());
  const result = await applyPlan(api, { moves: plan.moves });

  assert.equal(result.moved, 3);
  assert.equal(result.error, null);
  const after = flatten(await api.getTree());
  assert.equal(after.bookmarks.length, before);
  assert.ok(after.folders.some((f) => f.path.join("/") === "Bookmarks bar/Shopping"));
  assert.equal(after.folders.filter((f) => f.title === "Shopping").length, 1);
  assert.deepEqual(after.bookmarks.filter((b) => b.path.length === 1).map((b) => b.title), ["Mystery"]);
});

test("undo restores the exact original structure", async () => {
  const api = sample();
  const original = await snapshot(api);
  const plan = buildPlan(await api.getTree());
  const result = await applyPlan(api, { moves: plan.moves });
  assert.notDeepEqual(await snapshot(api), original);

  const { errors } = await undoRun(api, result.undo);
  assert.deepEqual(errors, []);
  assert.deepEqual(await snapshot(api), original);
});

test("a bookmark moved after the plan was built is skipped, not clobbered", async () => {
  const api = sample();
  const plan = buildPlan(await api.getTree());
  const target = plan.moves.find((m) => m.title === "loose repo");
  await api.move(target.id, { parentId: "2" });

  const result = await applyPlan(api, { moves: plan.moves });
  assert.equal(result.skipped, 1);
  const placed = flatten(await api.getTree()).bookmarks.find((b) => b.id === target.id);
  assert.deepEqual(placed.path, ["Other bookmarks"]);
});

test("removing duplicates keeps the earliest and can be undone", async () => {
  const api = makeApi([
    bm("keep", "https://example.com/a", { dateAdded: 1000 }),
    bm("drop", "https://example.com/a/?utm_source=x", { dateAdded: 2000 }),
  ]);
  const original = await snapshot(api);
  const [group] = findDuplicates(flatten(await api.getTree()).bookmarks);
  const result = await applyPlan(api, { moves: [], removeIds: group.slice(1).map((b) => b.id) });

  assert.equal(result.removed, 1);
  assert.deepEqual(flatten(await api.getTree()).bookmarks.map((b) => b.title), ["keep"]);
  await undoRun(api, result.undo);
  assert.deepEqual(await snapshot(api), original);
});

test("a bookmark both moved and removed as a duplicate is only removed, and undo still restores everything", async () => {
  const api = sample();
  const original = await snapshot(api);
  const plan = buildPlan(await api.getTree());
  const victim = plan.moves[0];
  const result = await applyPlan(api, { moves: plan.moves, removeIds: [victim.id] });

  assert.equal(result.error, null);
  assert.equal(result.removed, 1);
  assert.equal(result.moved, plan.moves.length - 1);
  const { errors } = await undoRun(api, result.undo);
  assert.deepEqual(errors, []);
  assert.deepEqual(await snapshot(api), original);
});

test("a failure mid-run returns a partial undo log that still restores everything", async () => {
  const api = sample();
  const original = await snapshot(api);
  const plan = buildPlan(await api.getTree());
  const realMove = api.move.bind(api);
  let calls = 0;
  api.move = async (...args) => {
    if (++calls === 2) throw new Error("boom");
    return realMove(...args);
  };

  const result = await applyPlan(api, { moves: plan.moves });
  assert.equal(result.error, "boom");
  assert.equal(result.moved, 1);
  api.move = realMove;
  const { errors } = await undoRun(api, result.undo);
  assert.deepEqual(errors, []);
  assert.deepEqual(await snapshot(api), original);
});
