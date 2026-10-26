import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { applyPlan, undoRun } from "../src/apply.js";
import { createEmbedder } from "../src/embed.js";
import { isPlaceholderName, isVagueName, nameKey } from "../src/folders.js";
import { createMemoryBookmarks } from "../src/memory-bookmarks.js";
import { buildPlan } from "../src/planner.js";
import { describeWhy } from "../src/present.js";
import { buildLibrary } from "./fixtures/library.js";
import { buildHeldOutLibrary } from "./fixtures/library-heldout.js";
import { buildMessyLibrary } from "./fixtures/library-messy.js";

const modelDir = new URL("../model/", import.meta.url);
const read = (name) => readFileSync(new URL(name, modelDir));
const bytes = (name) => {
  const buf = read(name);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};
const embedder = createEmbedder({
  vocabText: read("vocab.txt").toString("utf8").replace(/\n$/, ""),
  meta: JSON.parse(read("meta.json").toString("utf8")),
  embeddings: new Int8Array(bytes("embeddings.i8")),
  scales: new Float32Array(bytes("scales.f32")),
});

const make = (children) =>
  createMemoryBookmarks([
    { id: "1", title: "Bookmarks bar", children },
    { id: "2", title: "Other bookmarks", children: [] },
  ]);

// A readable picture of the whole tree: folder -> sorted bookmark titles and subfolders.
const snapshot = (node) =>
  Object.fromEntries(
    (node.children ?? [])
      .filter((child) => child.url === undefined)
      .map((folder) => [folder.title, { items: folder.children.filter((c) => c.url !== undefined).map((c) => c.title).sort(), folders: snapshot(folder) }]),
  );
const treeOf = async (api) => snapshot((await api.getTree())[0].children[0]);

const summarize = (plan) => ({
  deleted: plan.folderOps.filter((op) => op.kind === "delete").map((op) => op.title),
  merged: plan.folderOps.filter((op) => op.kind === "merge").map((op) => [op.fromTitle, op.why.to]),
  renamed: plan.folderOps.filter((op) => op.kind === "rename").map((op) => [op.fromTitle, op.toTitle]),
});
const sortPairs = (pairs) => [...pairs].sort((a, b) => a[0].localeCompare(b[0]));

test("folder names compare without case, punctuation or plurals", () => {
  assert.equal(nameKey("Recipes"), nameKey("recipe"));
  assert.equal(nameKey("To-Do!"), nameKey("to do"));
  assert.notEqual(nameKey("Travel"), nameKey("Trip"));
  assert.ok(isPlaceholderName("New folder") && isPlaceholderName("Untitled folder") && isPlaceholderName("New Folder (2)") && isPlaceholderName("新建文件夹"));
  assert.ok(!isPlaceholderName("Recipes") && !isPlaceholderName("Misc"));
  assert.ok(isVagueName("Stuff") && !isVagueName("Design"));
});

test("with the model: empty, duplicate, nameless and similar folders are all proposed", async () => {
  const lib = buildMessyLibrary();
  const plan = buildPlan(await make(lib.children).getTree(), { embedder });
  const got = summarize(plan);
  assert.deepEqual(got.deleted, lib.expect.deleted);
  assert.deepEqual(sortPairs(got.merged), sortPairs(lib.expect.merged));
  assert.deepEqual(sortPairs(got.renamed), sortPairs(lib.expect.renamed));
});

test("without the model only the certain things are proposed (empty folder, same name)", async () => {
  const plan = buildPlan(await make(buildMessyLibrary().children).getTree(), {});
  const got = summarize(plan);
  assert.deepEqual(got.deleted, ["Old"]);
  assert.deepEqual(got.merged, [["Travels", "Travel"]]);
  assert.deepEqual(got.renamed, []);
});

test("distinct folders are never merged or renamed (two libraries the rules were not fitted on)", async () => {
  for (const lib of [buildLibrary(), buildHeldOutLibrary()]) {
    const plan = buildPlan(await make(lib.children).getTree(), { embedder });
    assert.deepEqual(plan.folderOps, []);
  }
});

test("only a plain same-name merge inside one parent is rated high; the rest need a look", async () => {
  const plan = buildPlan(await make(buildMessyLibrary().children).getTree(), { embedder });
  const byKind = (kind) => plan.folderOps.filter((op) => op.kind === kind);
  assert.ok(byKind("delete").every((op) => op.confidence === "high"));
  assert.equal(byKind("merge").find((op) => op.fromTitle === "Travels").confidence, "high");
  assert.notEqual(byKind("merge").find((op) => op.fromTitle === "Recipes").confidence, "high");
  const apart = [{ title: "Dev", children: [{ title: "a", url: "https://a.example/1" }] }, { title: "Work", children: [{ title: "Dev", children: [{ title: "b", url: "https://b.example/1" }] }] }];
  const p2 = buildPlan(await make(apart).getTree(), {});
  assert.equal(p2.folderOps.find((op) => op.kind === "merge").confidence, "low");
});

test("a folder is not merged into its own parent or child", async () => {
  const nested = [{ title: "Travel", children: [{ title: "x", url: "https://x.example/1" }, { title: "Travel", children: [{ title: "y", url: "https://y.example/1" }] }] }];
  const plan = buildPlan(await make(nested).getTree(), {});
  assert.deepEqual(plan.folderOps, []);
});

test("applying every folder change gives the expected tree, loses no bookmark, and undo restores it exactly", async () => {
  const lib = buildMessyLibrary();
  const api = make(lib.children);
  const before = await treeOf(api);
  const plan = buildPlan(await api.getTree(), { embedder });
  const result = await applyPlan(api, { moves: [], removeIds: [], folderOps: plan.folderOps });
  assert.equal(result.error, null);
  assert.equal(result.skipped, 0);
  assert.deepEqual([result.merged, result.deleted, result.renamed], [3, 1, 1]);

  const after = await treeOf(api);
  assert.deepEqual(Object.keys(after).sort(), ["Cooking", "Money", "Photography", "Travel"]);
  assert.equal(after.Cooking.items.length, 8);
  assert.equal(after.Money.items.length, 9);
  assert.equal(after.Travel.items.length, 7);
  const count = (tree) => Object.values(tree).reduce((n, f) => n + f.items.length + count(f.folders), 0);
  assert.equal(count(after), count(before));

  const { errors } = await undoRun(api, result.undo);
  assert.deepEqual(errors, []);
  const restored = await treeOf(api);
  assert.deepEqual(Object.keys(restored).sort(), Object.keys(before).sort());
  for (const name of Object.keys(before)) assert.deepEqual(restored[name].items, before[name].items, name);
});

test("undo order inside the bar is preserved for restored folders", async () => {
  const api = make(buildMessyLibrary().children);
  const titlesBefore = (await api.getTree())[0].children[0].children.map((c) => c.title);
  const plan = buildPlan(await api.getTree(), { embedder });
  const result = await applyPlan(api, { folderOps: plan.folderOps });
  await undoRun(api, result.undo);
  const titlesAfter = (await api.getTree())[0].children[0].children.map((c) => c.title);
  assert.deepEqual(titlesAfter, titlesBefore);
});

test("a delete is skipped if something was put in the folder since, and a rename if it was already renamed", async () => {
  const api = make([{ title: "Old", children: [] }, { title: "New folder", children: [{ title: "q", url: "https://q.example/1" }] }]);
  const tree = (await api.getTree())[0].children[0].children;
  const [old, nameless] = tree;
  await api.create({ parentId: old.id, title: "late", url: "https://late.example/1" });
  await api.update(nameless.id, { title: "Mine now" });
  const result = await applyPlan(api, {
    folderOps: [
      { kind: "delete", folderId: old.id },
      { kind: "rename", folderId: nameless.id, fromTitle: "New folder", toTitle: "Recipes" },
    ],
  });
  assert.deepEqual([result.deleted, result.renamed, result.skipped], [0, 0, 2]);
  assert.equal((await api.get(nameless.id))[0].title, "Mine now");
});

test("every folder proposal reads as a plain sentence", async () => {
  const plan = buildPlan(await make(buildMessyLibrary().children).getTree(), { embedder });
  assert.ok(plan.folderOps.length >= 5);
  for (const op of plan.folderOps) {
    const sentence = describeWhy(op.why);
    assert.ok(sentence.length > 10, JSON.stringify(op.why));
    assert.doesNotMatch(sentence, /undefined|null|NaN|\[object|score|cosine|centroid/i, sentence);
  }
});

test("a bookmark headed for a folder that is being merged away goes to the folder that stays", async () => {
  const lib = buildMessyLibrary();
  // Same website as a bookmark in "Recipes", which is about to be merged into "Cooking".
  const loose = { title: "Another dinner idea", url: "https://www.allrecipes.com/another-dinner-idea" };
  const api = make([...lib.children, loose]);
  const plan = buildPlan(await api.getTree(), { embedder });
  const merge = plan.folderOps.find((op) => op.kind === "merge" && op.fromTitle === "Recipes");
  const move = plan.moves.find((m) => m.title === loose.title);
  assert.ok(merge && move);
  assert.equal(move.to.folderId, merge.toId);
  assert.equal(move.to.path.at(-1), "Cooking");
});

test("a folder that a bookmark is being moved into is never offered for deletion", async () => {
  const children = [
    { title: "Recipes", children: [] },
    { title: "Best Recipes for a cold night", url: "https://example.com/cold-night" },
  ];
  const plan = buildPlan(await make(children).getTree(), {});
  const folder = (await make(children).getTree())[0].children[0].children[0];
  const move = plan.moves.find((m) => m.title.startsWith("Best Recipes"));
  assert.ok(move?.to.folderId, "the bookmark is filed in the empty Recipes folder");
  assert.ok(!plan.folderOps.some((op) => op.kind === "delete" && op.folderId === move.to.folderId));
  assert.equal(folder.title, "Recipes");
});
