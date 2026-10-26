import assert from "node:assert/strict";
import { test } from "node:test";

import { applyPlan, undoRun } from "../src/apply.js";
import { createMemoryBookmarks } from "../src/memory-bookmarks.js";
import { planOrdering } from "../src/order.js";
import { buildPlan, flatten } from "../src/planner.js";
import { describeWhy } from "../src/present.js";
import { DAY, loadVisits } from "../src/usage.js";

const NOW = Date.UTC(2026, 9, 26);
const ago = (days) => NOW - days * DAY;

// Oldest first, as Chrome keeps them: the newest bookmark is at the bottom.
const folderOf = (title, count, used = {}, extra = {}) => ({
  title,
  children: Array.from({ length: count }, (_, i) => ({
    title: `${title} page ${i + 1}`,
    url: `https://${title.toLowerCase().replace(/\W/g, "")}.example/page-${i + 1}`,
    dateAdded: ago(900 - i * 10),
    ...(used[i + 1] !== undefined ? { dateLastUsed: ago(used[i + 1]) } : {}),
    ...extra,
  })),
});

const make = (children, other = []) =>
  createMemoryBookmarks([
    { id: "1", title: "Bookmarks bar", children },
    { id: "2", title: "Other bookmarks", children: other },
  ]);

const titles = async (api, folderTitle) => {
  const bar = (await api.getTree())[0].children[0];
  return bar.children.find((c) => c.title === folderTitle).children.map((c) => c.title.replace(`${folderTitle} page `, "#"));
};
const barOrder = async (api) => (await api.getTree())[0].children[0].children.map((c) => c.title);

const plan = async (api, options = {}) => buildPlan(await api.getTree(), { now: NOW, ...options });

test("the most recently opened bookmarks move to the top of their folder, the rest keep their order", async () => {
  const api = make([folderOf("Work", 10, { 8: 2, 3: 30, 6: 400 })]);
  const p = await plan(api);
  const ops = p.orderOps.filter((op) => op.kind === "promote");
  assert.deepEqual(ops.map((op) => [op.title, op.rank]).sort(), [["Work page 3", 1], ["Work page 8", 0]]);

  const result = await applyPlan(api, { orderOps: p.orderOps });
  assert.equal(result.error, null);
  assert.equal(result.reordered, 2);
  assert.deepEqual(await titles(api, "Work"), ["#8", "#3", "#1", "#2", "#4", "#5", "#6", "#7", "#9", "#10"]);
});

test("undo puts the original order back exactly, including when items move down the list", async () => {
  const api = make([folderOf("Work", 12, { 12: 1, 9: 3, 5: 10, 2: 20 }), folderOf("Home", 6)]);
  const before = await titles(api, "Work");
  const p = await plan(api);
  const result = await applyPlan(api, { orderOps: p.orderOps });
  assert.notDeepEqual(await titles(api, "Work"), before);
  const { errors } = await undoRun(api, result.undo);
  assert.deepEqual(errors, []);
  assert.deepEqual(await titles(api, "Work"), before);
});

test("nothing is proposed when the used bookmark is already near the top, or the folder is small", async () => {
  const atTop = make([folderOf("Work", 10, { 1: 2 })]);
  assert.deepEqual((await plan(atTop)).orderOps, []);
  const small = make([folderOf("Tiny", 5, { 5: 1 })]);
  assert.deepEqual((await plan(small)).orderOps, []);
});

test("with no sign of use, order is left alone (nothing is guessed)", async () => {
  const p = await plan(make([folderOf("Work", 12), folderOf("Home", 12)]));
  assert.deepEqual(p.orderOps, []);
});

test("with browsing history, how often a page was visited decides, and one-off visits don't count", async () => {
  const api = make([folderOf("Work", 12, { 11: 1 })]);
  const tree = await api.getTree();
  const { bookmarks } = flatten(tree);
  const url = (n) => bookmarks.find((b) => b.title === `Work page ${n}`).url;
  const visits = new Map([[url(9), 14], [url(4), 5], [url(11), 2], [url(7), 1]]);
  const p = buildPlan(tree, { now: NOW, visits });
  const ops = p.orderOps.filter((op) => op.kind === "promote").sort((a, b) => a.rank - b.rank);
  assert.deepEqual(ops.map((op) => op.title), ["Work page 9", "Work page 4"]);
  assert.equal(ops[0].confidence, "high");
  assert.equal(describeWhy(ops[0].why), "You opened this 14 times in the last 3 months.");
});

test("the busiest folders go first among folders, and shortcuts on the bar stay where they are", async () => {
  const api = make([
    { title: "Gmail", url: "https://mail.google.com/mail/u/0/#inbox" },
    folderOf("Alpha", 6),
    folderOf("Beta", 6),
    folderOf("Gamma", 6),
    folderOf("Delta", 6, { 1: 3, 2: 5, 3: 9 }),
  ]);
  const p = await plan(api);
  const move = p.orderOps.find((op) => op.kind === "promoteFolder");
  assert.equal(move.title, "Delta");
  assert.equal(describeWhy(move.why), "You've opened 3 bookmarks in here recently.");
  await applyPlan(api, { orderOps: p.orderOps });
  assert.deepEqual(await barOrder(api), ["Gmail", "Delta", "Alpha", "Beta", "Gamma"]);
});

test("bookmarks that are about to move elsewhere are not also reordered", () => {
  const folders = [{ id: "f", title: "Work", path: ["Bar", "Work"], parentId: "1", position: 0 }];
  const bookmarks = Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, title: `t${i}`, url: `https://e.example/${i}`, parentId: "f", position: i, dateAdded: ago(500), lastUsed: i === 7 ? ago(1) : 0, path: ["Bar", "Work"] }));
  const args = { folders, bookmarks, roots: [], barRootId: "1", otherRootId: "2", now: NOW };
  assert.equal(planOrdering(args).order.length, 1);
  assert.equal(planOrdering({ ...args, skip: new Set(["b7"]) }).order.length, 0);
});

// ------------------------------------------------------------------ archive

const stale = (title, daysSaved, daysUsed) => ({ title, url: `https://${title.toLowerCase().replace(/\W/g, "")}.example/`, dateAdded: ago(daysSaved), ...(daysUsed === undefined ? {} : { dateLastUsed: ago(daysUsed) }) });

test("Archive is offered only when Chrome's opened-dates look trustworthy, and only for old, unopened bookmarks", async () => {
  const tracked = Array.from({ length: 12 }, (_, i) => stale(`Daily ${i}`, 700, 3));
  const oldUnopened = stale("Forgotten recipe", 800);
  const oldOpenedLongAgo = stale("Opened once", 900, 500);
  const newUnopened = stale("Fresh find", 20);
  const savedLastYearOpened = stale("Still handy", 400, 100);
  const api = make([{ title: "Misc stuff", children: [...tracked, oldUnopened, oldOpenedLongAgo, newUnopened, savedLastYearOpened] }]);
  const p = await plan(api);
  assert.ok(p.usage.archiveReady);
  assert.deepEqual(p.archive.map((a) => a.title).sort(), ["Forgotten recipe", "Opened once"]);
  assert.equal(p.archive[0].to.newFolder.title, "Archive");
  assert.deepEqual(p.archive[0].to.path, ["Other bookmarks", "Archive"]);
  assert.match(describeWhy(p.archive[0].why), /over a year|years/);
});

test("without opened-dates nothing is called unused (it could just be untracked)", async () => {
  const api = make([{ title: "Misc stuff", children: Array.from({ length: 15 }, (_, i) => stale(`Old ${i}`, 900)) }]);
  const p = await plan(api);
  assert.equal(p.usage.archiveReady, false);
  assert.deepEqual(p.archive, []);
});

test("shortcuts on the bar and bookmarks you chose to keep are never archived; visited ones neither", async () => {
  const tracked = Array.from({ length: 12 }, (_, i) => stale(`Daily ${i}`, 700, 3));
  const api = make([stale("Old bar item", 900), { title: "Reading", children: [...tracked, stale("Kept here", 800), stale("Seen lately", 800)] }]);
  const tree = await api.getTree();
  const { bookmarks } = flatten(tree);
  const kept = bookmarks.find((b) => b.title === "Kept here");
  const seen = bookmarks.find((b) => b.title === "Seen lately");
  const p = buildPlan(tree, { now: NOW, dismissed: new Set([`${kept.url.replace(/\/$/, "")}|${kept.parentId}`]), visits: new Map([[seen.url, 4]]) });
  assert.ok(!p.archive.some((a) => ["Old bar item", "Kept here", "Seen lately"].includes(a.title)), JSON.stringify(p.archive.map((a) => a.title)));
});

test("archiving creates the folder under Other bookmarks, and undo takes everything back", async () => {
  const tracked = Array.from({ length: 12 }, (_, i) => stale(`Daily ${i}`, 700, 3));
  const api = make([{ title: "Misc stuff", children: [...tracked, stale("Forgotten", 800)] }]);
  const p = await plan(api);
  const result = await applyPlan(api, { moves: p.archive });
  assert.equal(result.moved, 1);
  const other = (await api.getTree())[0].children[1];
  assert.deepEqual(other.children.map((c) => [c.title, c.children.map((k) => k.title)]), [["Archive", ["Forgotten"]]]);
  await undoRun(api, result.undo);
  const after = await api.getTree();
  assert.equal(after[0].children[1].children.length, 0);
  assert.ok(after[0].children[0].children[0].children.some((c) => c.title === "Forgotten"));
});

test("an existing Archive folder is reused", async () => {
  const tracked = Array.from({ length: 12 }, (_, i) => stale(`Daily ${i}`, 700, 3));
  const api = make([{ title: "Misc stuff", children: [...tracked, stale("Forgotten", 800)] }], [{ title: "Archive", children: [{ title: "Earlier", url: "https://earlier.example/" }] }]);
  const p = await plan(api);
  assert.ok(p.archive[0].to.folderId);
  assert.equal(p.archive[0].to.newFolder, null);
});

// ------------------------------------------------------------------ history

test("visit counts cover the last 90 days only and survive unreadable pages", async () => {
  const history = {
    async getVisits({ url }) {
      if (url.endsWith("/boom")) throw new Error("nope");
      return [{ visitTime: ago(1) }, { visitTime: ago(30) }, { visitTime: ago(89) }, { visitTime: ago(120) }];
    },
  };
  const visits = await loadVisits(history, ["https://a.example/x", "https://a.example/x", "https://a.example/boom", "javascript:void(0)", "chrome://settings"], NOW);
  assert.deepEqual([...visits], [["https://a.example/x", 3]]);
});
