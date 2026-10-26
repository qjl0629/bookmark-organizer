import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createEmbedder } from "../src/embed.js";
import { createMemoryBookmarks } from "../src/memory-bookmarks.js";
import { buildPlan } from "../src/planner.js";
import { semanticText } from "../src/semantic.js";
import { buildLibrary } from "./fixtures/library.js";
import { buildHeldOutLibrary } from "./fixtures/library-heldout.js";

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

async function run(lib, options) {
  const api = createMemoryBookmarks([
    { id: "1", title: "Bookmarks bar", children: lib.children },
    { id: "2", title: "Other bookmarks", children: [] },
  ]);
  const plan = buildPlan(await api.getTree(), options);
  const last = (path) => path[path.length - 1];
  const flagged = new Map(plan.review.map((r) => [r.title, r]));
  const placed = new Map(plan.moves.map((m) => [m.title, m]));
  return {
    plan,
    caught: [...lib.planted].filter(([t]) => flagged.has(t)).length,
    caughtRight: [...lib.planted].filter(([t, truth]) => flagged.has(t) && last(flagged.get(t).to.path) === truth).length,
    falseAlarms: plan.review.filter((r) => !lib.planted.has(r.title)).map((r) => r.title),
    looseRight: [...lib.loose].filter(([t, truth]) => placed.has(t) && last(placed.get(t).to.path) === truth).length,
    looseWrong: [...lib.loose].filter(([t, truth]) => placed.has(t) && last(placed.get(t).to.path) !== truth).length,
  };
}

// The model is the point of this feature, so these numbers are the regression guard.
// The held-out library was written after the thresholds were tuned on the first one.
test("with the meaning model, misfiled bookmarks are found and nothing is invented (tuned library)", async () => {
  const lib = buildLibrary();
  const withModel = await run(lib, { embedder });
  const without = await run(lib, {});
  assert.ok(withModel.caught >= 10, `caught ${withModel.caught} of ${lib.planted.size}`);
  assert.equal(withModel.caughtRight, withModel.caught, "every flagged bookmark points at the right folder");
  assert.ok(withModel.looseRight >= 11, `placed ${withModel.looseRight} loose bookmarks correctly`);
  assert.equal(withModel.looseWrong, 0);
  assert.ok(withModel.caught > without.caught + 8, "the model must clearly beat word matching alone");
  // Known limit: a model that has never heard of "Copilot Studio" reads it as GitHub Copilot.
  // Anything else flagged here would be a regression.
  assert.deepEqual(
    withModel.falseAlarms.filter((t) => !t.startsWith("Copilot Studio")),
    [],
  );
});

test("the same settings work on a library they were never tuned on", async () => {
  const lib = buildHeldOutLibrary();
  const result = await run(lib, { embedder });
  assert.ok(result.caught >= 6, `caught ${result.caught} of ${lib.planted.size}`);
  assert.equal(result.caughtRight, result.caught);
  assert.deepEqual(result.falseAlarms, []);
  assert.equal(result.looseRight, lib.loose.size);
});

test("without the model the organizer still works and never claims meaning-based reasons", async () => {
  const result = await run(buildLibrary(), {});
  const types = new Set([...result.plan.review, ...result.plan.moves].map((m) => m.why.type));
  assert.ok(!types.has("topic") && !types.has("topicName"));
  assert.deepEqual(result.falseAlarms, []);
});

test("quick-access shortcuts on the bar are never touched, even with the model", async () => {
  const api = createMemoryBookmarks([
    {
      id: "1",
      title: "Bookmarks bar",
      children: [
        { title: "Gmail", url: "https://mail.google.com/mail/u/0/#inbox" },
        { title: "ChatGPT", url: "https://chatgpt.com/" },
        ...buildLibrary().children,
      ],
    },
    { id: "2", title: "Other bookmarks", children: [] },
  ]);
  const plan = buildPlan(await api.getTree(), { embedder });
  const moved = new Set(plan.moves.map((m) => m.title));
  assert.ok(!moved.has("Gmail") && !moved.has("ChatGPT"));
  assert.ok(plan.quickAccess.some((q) => q.bookmark.title === "Gmail"));
});

test("the text compared by meaning leaves out shared platform sites and bare addresses", () => {
  const platform = new Set(["contoso.sharepoint.com"]);
  const onPlatform = semanticText({ title: "Vendor NDA request form", url: "https://contoso.sharepoint.com/sites/Legal/NDA-template" }, platform);
  assert.equal(onPlatform, "Vendor NDA request form Legal NDA template");
  assert.ok(!/sharepoint|contoso/i.test(onPlatform));
  assert.equal(semanticText({ title: "https://www.allrecipes.com/recipe/1...", url: "https://www.allrecipes.com/recipe/10813/best-cookies/" }), "recipe best cookies allrecipes");
});
