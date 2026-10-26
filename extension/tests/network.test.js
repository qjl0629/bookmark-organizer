import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import { loadEmbedder } from "../src/model-loader.js";

const root = new URL("../", import.meta.url);
const sources = ["", "src/"].flatMap((dir) =>
  readdirSync(new URL(dir, root))
    .filter((name) => name.endsWith(".js") || name.endsWith(".html"))
    .map((name) => [`${dir}${name}`, readFileSync(new URL(`${dir}${name}`, root), "utf8")]),
);

// "No network requests" is a promise to users, so it is enforced, not just written down.
test("only the model loader reads anything over fetch, and nothing else can reach the network", () => {
  const network = /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts|import\s*\(\s*["'`]https?:/;
  const offenders = sources.filter(([name, text]) => name !== "src/model-loader.js" && network.test(text)).map(([name]) => name);
  assert.deepEqual(offenders, []);
  assert.ok(!/https?:\/\//.test(sources.find(([name]) => name === "src/model-loader.js")[1].replace(/\/\/.*$/gm, "")), "the loader names no website");
});

test("the extension ships its icons, a Web Store-sized description, and a release version", () => {
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
  assert.ok(manifest.description.length <= 132, "the Chrome Web Store allows 132 characters");
  assert.ok(manifest.name.length <= 75);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  for (const size of ["16", "32", "48", "128"]) {
    const file = readFileSync(new URL(manifest.icons[size], root));
    assert.equal(file.readUInt32BE(16), Number(size), `icon ${size} has the wrong width`);
    assert.equal(file.readUInt32BE(20), Number(size), `icon ${size} has the wrong height`);
  }
});

test("the model is loaded once at startup, not again after every change", () => {
  const page = sources.find(([name]) => name === "organizer.js")[1];
  assert.equal((page.match(/(?<!function )\bstartModel\(\)/g) ?? []).length, 1);
});

test("the extension asks for no permissions beyond bookmarks and storage; history is optional and loads only its own scripts", () => {
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
  assert.deepEqual([...manifest.permissions].sort(), ["bookmarks", "storage"]);
  assert.deepEqual(manifest.optional_permissions, ["history"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.match(manifest.content_security_policy.extension_pages, /script-src 'self'/);
});

test("the model loader refuses to read from another website", async () => {
  const original = globalThis.location;
  globalThis.location = { href: "chrome-extension://abc/organizer.html", origin: "chrome-extension://abc" };
  try {
    await assert.rejects(() => loadEmbedder("https://example.com/model/"), /own files/);
  } finally {
    if (original === undefined) delete globalThis.location;
    else globalThis.location = original;
  }
});
