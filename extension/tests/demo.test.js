import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { installDemo } from "../src/demo.js";
import { createEmbedder } from "../src/embed.js";
import { buildPlan } from "../src/planner.js";

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

// The live demo and the screenshots are built from this data, so what they show has to stay true.
test("the demo library shows every feature: shortcuts, misfiles, folder clean-up, usage order, Archive, duplicates", async () => {
  installDemo();
  const plan = buildPlan(await globalThis.chrome.bookmarks.getTree(), { embedder });
  const last = (path) => path[path.length - 1];

  assert.deepEqual(plan.quickAccess.map((q) => q.bookmark.title).sort(), ["ChatGPT", "Gmail", "Google Calendar"]);
  assert.ok(plan.moves.length >= 6, `${plan.moves.length} loose bookmarks placed`);
  const places = Object.fromEntries(plan.moves.map((m) => [m.title, last(m.to.path)]));
  assert.equal(places["Best budgeting apps 2026"], "Money");
  assert.equal(places["Lisbon travel guide for first timers"], "Travel");

  const flagged = Object.fromEntries(plan.review.map((r) => [r.title, last(r.to.path)]));
  assert.equal(flagged["Quick chicken stir fry for two"], "Recipes");
  assert.equal(flagged["Wireless earbuds review"], "Shopping");
  assert.ok(plan.review.length >= 5, `${plan.review.length} possible mix-ups`);

  const ops = plan.folderOps.map((op) => `${op.kind}:${op.title ?? op.fromTitle}${op.toTitle ? `>${op.toTitle}` : ""}`);
  assert.ok(ops.includes("delete:Old") && ops.includes("rename:New folder>Photography") && ops.includes("merge:Cooking"), ops.join(", "));

  assert.ok(plan.orderOps.some((op) => op.kind === "promoteFolder" && op.title === "Dev"));
  assert.ok(plan.orderOps.filter((op) => op.kind === "promote").length >= 3);
  assert.equal(plan.archive.length, 10);
  assert.equal(plan.duplicates.length, 1);
  assert.equal(plan.usage.archiveReady, true);
});
