// Loads the bundled semantic model from the extension's own files.
//
// This is the only place that reads files over fetch(), and it refuses anything that is not
// on the same origin as the page, so it can never reach another website. Inside the
// extension that origin is the extension itself.
import { createEmbedder } from "./embed.js";

export async function loadEmbedder(baseUrl = new URL("../model/", import.meta.url).href) {
  const base = new URL(baseUrl, globalThis.location?.href ?? import.meta.url);
  if (globalThis.location && base.origin !== globalThis.location.origin) {
    throw new Error("The model can only be loaded from the extension's own files.");
  }
  const read = async (name, kind) => {
    const response = await fetch(new URL(name, base));
    if (!response.ok) throw new Error(`Could not read ${name} (${response.status}).`);
    return kind === "text" ? response.text() : response.arrayBuffer();
  };
  const [vocabText, metaText, embeddingBytes, scaleBytes] = await Promise.all([
    read("vocab.txt", "text"),
    read("meta.json", "text"),
    read("embeddings.i8", "buffer"),
    read("scales.f32", "buffer"),
  ]);
  return createEmbedder({
    vocabText: vocabText.replace(/\n$/, ""),
    meta: JSON.parse(metaText),
    embeddings: new Int8Array(embeddingBytes),
    scales: new Float32Array(scaleBytes),
  });
}
