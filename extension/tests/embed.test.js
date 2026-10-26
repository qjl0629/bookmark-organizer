import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createEmbedder, dot } from "../src/embed.js";

const modelDir = new URL("../model/", import.meta.url);
const read = (name) => readFileSync(new URL(name, modelDir));
const meta = JSON.parse(read("meta.json").toString("utf8"));
const bytes = (name) => {
  const buf = read(name);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};
const embedder = createEmbedder({
  vocabText: read("vocab.txt").toString("utf8").replace(/\n$/, ""),
  meta,
  embeddings: new Int8Array(bytes("embeddings.i8")),
  scales: new Float32Array(bytes("scales.f32")),
});
const reference = JSON.parse(readFileSync(new URL("./fixtures/semantic-reference.json", import.meta.url), "utf8"));

test("the bundled model has the expected shape and is small enough to ship", () => {
  assert.equal(meta.dim, 256);
  assert.equal(meta.rows, 29528);
  assert.equal(meta.license, "MIT");
  const total = ["embeddings.i8", "scales.f32", "vocab.txt", "meta.json"].reduce((sum, name) => sum + read(name).length, 0);
  assert.ok(total < 9_000_000, `model is ${total} bytes`);
});

// The most important check: the JavaScript tokenizer must cut text into exactly the same word
// pieces as the original Python model, on accents, Chinese, punctuation, URLs and edge cases.
test("tokenization matches the original model exactly", () => {
  reference.samples.forEach((text, i) => {
    assert.deepEqual(embedder.tokenize(text), reference.ids[i], `tokens differ for ${JSON.stringify(text)}`);
  });
});

test("embeddings match the original model despite 8-bit compression", () => {
  reference.samples.forEach((text, i) => {
    const want = reference.vectors[i];
    const got = embedder.embed(text);
    if (!want.some((x) => x !== 0)) {
      assert.equal(got, null, `empty text should have no vector: ${JSON.stringify(text)}`);
      return;
    }
    assert.ok(got, `no vector for ${JSON.stringify(text)}`);
    const cosine = dot(Float32Array.from(want), got);
    assert.ok(cosine > 0.998, `cosine ${cosine.toFixed(5)} for ${JSON.stringify(text)}`);
  });
});

test("vectors are unit length, repeatable and cached", () => {
  const a = embedder.embed("Power Automate flows");
  assert.ok(Math.abs(dot(a, a) - 1) < 1e-4);
  assert.equal(embedder.embed("Power Automate flows"), a);
  assert.equal(embedder.embed(""), null);
  assert.equal(embedder.embed(undefined), null);
  assert.equal(embedder.embed("     "), null);
});

// Everyday topics are what a small model knows well. Newer, narrow product names (such as
// "Copilot Studio" belonging to the Power Platform) are NOT reliably known, so none of these
// checks depend on them.
test("related texts are closer than unrelated ones", () => {
  const sim = (a, b) => dot(embedder.embed(a), embedder.embed(b));
  assert.ok(sim("Power Automate cloud flow tips", "Power Automate") > sim("Power Automate cloud flow tips", "Contract"));
  assert.ok(sim("Best pasta recipes", "Recipes") > sim("Best pasta recipes", "Travel"));
  assert.ok(sim("Flights to Tokyo", "Travel") > sim("Flights to Tokyo", "Recipes"));
  assert.ok(sim("Quarterly budget forecast template", "Finance") > sim("Quarterly budget forecast template", "Design"));
  assert.ok(sim("Standing desk, adjustable height", "Shopping") > sim("Standing desk, adjustable height", "Recipes"));
});

test("a broken model is rejected instead of giving wrong answers", () => {
  assert.throws(() => createEmbedder({ vocabText: "a\nb", meta, embeddings: new Int8Array(10), scales: new Float32Array(2) }), /vocabulary/);
  assert.throws(() => createEmbedder({ vocabText: read("vocab.txt").toString("utf8").replace(/\n$/, ""), meta, embeddings: new Int8Array(10), scales: new Float32Array(2) }), /wrong size/);
});
