// Scores how well a bookmark fits each folder by MEANING, using the bundled embedder.
//
// A folder is described three ways: the average meaning of what is in it (centroid), the
// closest few bookmarks in it, and its name. A bookmark about pasta fits a folder called
// "Recipes" even when no word overlaps. Names matter because people choose them to say what
// the folder is for.
import { dot } from "./embed.js";
import { GENERIC_SEGMENTS, hostOf, looksLikeAddress, looksLikeId, safeDecode } from "./url.js";

const MIN_MEMBERS = 3; // other bookmarks a folder needs before it counts as evidence
const SHORTLIST = 5; // folders compared in detail per bookmark
const WEIGHTS = { centroid: 0.4, nearest: 0.4, name: 0.2 };
const HOST_NOISE = new Set(["www", "com", "org", "net", "io", "co", "ca", "uk", "de", "app", "edu", "gov", "info", "me", "tv"]);

// The text that stands for a bookmark's meaning. A website seen in several folders is a
// platform (SharePoint, a ticket portal) and says nothing about the subject, so it is left out.
export function semanticText(bookmark, platformHosts = new Set()) {
  const parts = [];
  const title = (bookmark.title ?? "").trim();
  if (title && !looksLikeAddress(title)) parts.push(title);

  let segments = [];
  try {
    segments = new URL(bookmark.url).pathname.split("/").filter(Boolean).map((s) => safeDecode(s).replace(/\.[a-z0-9]{2,5}$/i, ""));
  } catch {
    /* not a URL */
  }
  for (const segment of segments.filter((s) => !looksLikeId(s) && s.length <= 40 && !GENERIC_SEGMENTS.has(s.toLowerCase())).slice(0, 3)) {
    parts.push(segment.replace(/[-_+]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2"));
  }

  const host = hostOf(bookmark.url);
  if (host && !platformHosts.has(host)) {
    parts.push(host.split(/[.-]/).filter((label) => label && !HOST_NOISE.has(label)).join(" "));
  }
  return parts.join(" ").trim();
}

const add = (target, vector, sign = 1) => {
  for (let d = 0; d < target.length; d++) target[d] += sign * vector[d];
};
const norm = (v) => Math.sqrt(dot(v, v));

export function buildSemantic(folders, bookmarks, embedder) {
  const folderIds = new Set(folders.map((f) => f.id));

  const hostFolders = new Map();
  for (const b of bookmarks) {
    const host = hostOf(b.url);
    if (!host) continue;
    if (!hostFolders.has(host)) hostFolders.set(host, new Set());
    hostFolders.get(host).add(b.parentId);
  }
  const platformHosts = new Set([...hostFolders].filter(([, set]) => set.size >= 2).map(([host]) => host));

  const vectors = bookmarks.map((b) => embedder.embed(semanticText(b, platformHosts)));
  const members = new Map();
  bookmarks.forEach((b, i) => {
    if (!folderIds.has(b.parentId) || !vectors[i]) return;
    if (!members.has(b.parentId)) members.set(b.parentId, []);
    members.get(b.parentId).push(i);
  });

  const sums = new Map();
  for (const [folderId, indexes] of members) {
    const sum = new Float32Array(embedder.dim);
    for (const j of indexes) add(sum, vectors[j]);
    sums.set(folderId, sum);
  }
  const nameVectors = new Map(folders.map((f) => [f.id, embedder.embed(f.title)]));

  // How well bookmark i fits each folder, best first. The bookmark itself is left out of its
  // own folder, so the answer is "what would the rest of this folder say about it?".
  function score(i) {
    const v = vectors[i];
    if (!v) return [];
    const own = bookmarks[i].parentId;
    const rough = [];
    for (const [folderId, indexes] of members) {
      const isOwn = folderId === own;
      if (indexes.length - (isOwn ? 1 : 0) < MIN_MEMBERS) continue;
      const centroid = Float32Array.from(sums.get(folderId));
      if (isOwn) add(centroid, v, -1);
      const length = norm(centroid);
      const c = length > 1e-9 ? dot(v, centroid) / length : 0;
      const nv = nameVectors.get(folderId);
      const n = nv ? Math.max(0, dot(v, nv)) : 0;
      rough.push({ folderId, c, n, isOwn, quick: WEIGHTS.centroid * c + WEIGHTS.name * n });
    }
    rough.sort((a, b) => b.quick - a.quick);
    const detailed = rough.filter((r, k) => k < SHORTLIST || r.isOwn);

    const out = detailed.map((r) => {
      const sims = members
        .get(r.folderId)
        .filter((j) => j !== i)
        .map((j) => [dot(v, vectors[j]), j])
        .sort((a, b) => b[0] - a[0]);
      const nearest = (sims[0][0] + sims[1][0]) / 2;
      return {
        folderId: r.folderId,
        sem: WEIGHTS.centroid * r.c + WEIGHTS.nearest * nearest + WEIGHTS.name * r.n,
        centroid: r.c,
        nearest,
        name: r.n,
        neighbors: sims.slice(0, 2).map(([, j]) => j),
      };
    });
    return out.sort((a, b) => b.sem - a.sem);
  }

  return { score, hasVector: (i) => !!vectors[i], platformHosts };
}
