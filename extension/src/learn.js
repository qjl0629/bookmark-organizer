// Learns what each folder is about from the bookmarks already in it, so unfamiliar and
// internal sites can be judged too. Each bookmark becomes a weighted bag of tokens (host,
// first path segments, title words). Similarity is TF-IDF cosine, computed locally.
import { hostOf } from "./url.js";

const STOP = new Set([
  "the", "and", "for", "with", "from", "this", "that", "your", "you", "are", "how", "what", "new", "all",
  "page", "home", "index", "html", "htm", "untitled", "www", "com", "org", "net", "login", "sign",
]);

const MIN_MEMBERS = 3; // other bookmarks a folder needs before it counts as evidence
export const MIN_JUDGED = 4; // folder size before its own members get judged
const MIN_COHERENCE = 0.5; // share of a folder's members the model can place back in it
const MIN_SCORE = 0.1;
// Flag a bookmark when another folder resembles it clearly more than its own folder does.
const MISFILED = { minScore: 0.25, minGap: 0.2 };
const PLACE = { minScore: 0.25, margin: 0.05 };
// Added to every vector's norm, as if each bookmark also had one unmatched token. Without it
// two bookmarks sharing a single common word would look identical.
const SMOOTHING = 4;
// Words or path parts a suggestion must share with the target folder. A shared website says
// nothing about the topic, and a single shared word ("copilot") is too easily a coincidence.
const MIN_EVIDENCE = 2;
// A website seen in this many folders is a platform (SharePoint, ServiceNow...), not a topic.
// Other tokens are only treated as generic when they show up in more folders than that.
const PLATFORM_HOST_FOLDERS = 2;
const GENERIC_TOKEN_FOLDERS = 3;

// URL path parts that name a kind of page rather than a subject.
const GENERIC_SEGMENTS = new Set([
  "sites", "site", "teams", "team", "personal", "pages", "page", "sitepages", "shared documents", "documents",
  "lists", "forms", "wiki", "browse", "view", "docs", "doc", "d", "c", "p", "s", "r", "g", "u", "en", "en-us",
  "app", "apps", "home", "index", "dashboard", "portal", "search", "login", "signin", "kb", "sp", "files",
]);

const stem = (token) => (token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token);
const safeDecode = (text) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};
const looksLikeId = (segment) => /^\d+$/.test(segment) || /^[0-9a-f-]{12,}$/i.test(segment);
// A title that is just a web address (or a shortened one ending in "...") has no words of its own.
const looksLikeAddress = (title) => /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}([/?#:]|\.\.\.|…|$)/i.test(title.trim());

function rawTokens(bookmark) {
  const tokens = new Map();
  const add = (token, weight) => tokens.set(token, Math.max(tokens.get(token) ?? 0, weight));

  const host = hostOf(bookmark.url);
  if (host) add(`h:${host}`, 2);
  let segments = [];
  try {
    segments = new URL(bookmark.url).pathname.split("/").filter(Boolean).map((s) => safeDecode(s).toLowerCase().replace(/\.[a-z0-9]{2,5}$/, ""));
  } catch {
    /* not a URL */
  }
  const useful = segments.filter((s) => !looksLikeId(s) && s.length <= 40 && !GENERIC_SEGMENTS.has(s));
  if (useful[0]) add(`p:${useful[0]}`, 1);
  if (useful[1]) add(`p:${useful[0]}/${useful[1]}`, 1.5);

  const title = (bookmark.title ?? "").toLowerCase();
  const hostLabels = new Set(host.split(/[.-]/));
  const words = looksLikeAddress(title) ? [] : title.match(/[a-z0-9]+/g) ?? [];
  for (const word of words) {
    if (word.length >= 3 && !STOP.has(word) && !looksLikeId(word) && !hostLabels.has(word)) add(`w:${stem(word)}`, 1);
  }
  for (const run of title.match(/\p{Script=Han}+/gu) ?? []) {
    if (run.length === 1) add(`w:${run}`, 0.6);
    for (let i = 0; i < run.length - 1; i++) add(`w:${run.slice(i, i + 2)}`, 1);
  }
  return tokens;
}

export function buildModel(items) {
  const n = items.length;
  const raw = items.map(rawTokens);
  const df = new Map();
  const folders = new Map(); // token -> folders it appears in
  raw.forEach((tokens, i) => {
    for (const t of tokens.keys()) {
      df.set(t, (df.get(t) ?? 0) + 1);
      if (!folders.has(t)) folders.set(t, new Set());
      folders.get(t).add(items[i].parentId);
    }
  });
  const isGeneric = (token) => folders.get(token).size >= (token.startsWith("h:") ? PLATFORM_HOST_FOLDERS : GENERIC_TOKEN_FOLDERS);

  const vectors = raw.map((tokens) => {
    const vector = new Map();
    let sumSquares = 0;
    for (const [token, weight] of tokens) {
      // A token only this bookmark has can't say anything about which folder it belongs in,
      // and long unique titles would otherwise drown out the few words it shares. A token
      // spread across many folders can't say it either.
      if (df.get(token) < 2 || isGeneric(token)) continue;
      const value = weight * (Math.log((n + 1) / (df.get(token) + 1)) + 1);
      vector.set(token, value);
      sumSquares += value * value;
    }
    const norm = Math.sqrt(sumSquares + SMOOTHING);
    for (const [token, value] of vector) vector.set(token, value / norm);
    return vector;
  });

  const postings = new Map();
  vectors.forEach((vector, i) => {
    for (const [token, value] of vector) {
      if (!postings.has(token)) postings.set(token, []);
      postings.get(token).push([i, value]);
    }
  });

  return {
    similarities(i) {
      const sims = new Float64Array(n);
      for (const [token, value] of vectors[i]) {
        for (const [j, other] of postings.get(token)) if (j !== i) sims[j] += value * other;
      }
      return sims;
    },
    // How many words or path parts two bookmarks share, not counting the website.
    sharedContent(i, j) {
      let count = 0;
      for (const token of vectors[i].keys()) if (!token.startsWith("h:") && vectors[j].has(token)) count++;
      return count;
    },
  };
}

const shorten = (text, max = 38) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// folders: leaf-capable folder list from flatten(); bookmarks: every bookmark in the tree.
export function learnFromFolders(folders, bookmarks) {
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const model = buildModel(bookmarks);
  const members = new Map();
  bookmarks.forEach((b, i) => {
    if (!folderById.has(b.parentId)) return;
    if (!members.has(b.parentId)) members.set(b.parentId, []);
    members.get(b.parentId).push(i);
  });

  // Rank every folder by how much bookmark i resembles its members (excluding i itself).
  const rank = (i) => {
    const sims = model.similarities(i);
    const out = [];
    for (const [folderId, indexes] of members) {
      const rest = indexes.filter((j) => j !== i);
      if (rest.length < MIN_MEMBERS) continue;
      const ranked = rest.map((j) => [sims[j], j]).sort((a, b) => b[0] - a[0]);
      const top = ranked.slice(0, 2).filter(([s]) => s > 0);
      out.push({
        folder: folderById.get(folderId),
        score: (ranked[0][0] + ranked[1][0]) / 2,
        neighbors: top.map(([, j]) => bookmarks[j]),
        evidence: Math.max(0, ...top.map(([, j]) => model.sharedContent(i, j))),
      });
    }
    return out.sort((a, b) => b.score - a.score);
  };

  // Leave-one-out: can the model put each bookmark back into the folder it is in?
  // A folder it can't tell apart from the rest is organized by something it can't see.
  const cache = new Map();
  const stats = new Map();
  for (const [folderId, indexes] of members) {
    if (indexes.length < MIN_JUDGED) continue;
    let correct = 0;
    for (const i of indexes) {
      const ranking = rank(i);
      cache.set(i, ranking);
      if (ranking[0]?.folder.id === folderId && ranking[0].score >= MIN_SCORE) correct++;
    }
    stats.set(folderId, { folder: folderById.get(folderId), size: indexes.length, coherence: correct / indexes.length });
  }

  const reason = (best, own) => {
    const seen = best.neighbors.map((b) => `"${shorten(b.title || b.url)}"`).join(", ");
    const ownFolder = folderById.get(bookmarks[own].parentId).path.join("/");
    return `Looks more like "${best.folder.path.join("/")}" (similar to ${seen}) than "${ownFolder}"`;
  };

  return {
    stats,

    // Scores behind a decision: how much a bookmark resembles each folder. For debugging and tuning.
    explain(bookmark) {
      const i = bookmarks.indexOf(bookmark);
      return i < 0 ? [] : rank(i).map((r) => ({ folder: r.folder.path.join("/"), score: Number(r.score.toFixed(3)), evidence: r.evidence }));
    },

    // Bookmarks that look out of place in a folder the model understands well.
    misplaced(dismissed = () => false) {
      const results = [];
      for (const [folderId, stat] of stats) {
        if (stat.coherence < MIN_COHERENCE) continue;
        for (const i of members.get(folderId)) {
          const b = bookmarks[i];
          if (dismissed(b)) continue;
          const ranking = cache.get(i);
          const own = ranking.find((r) => r.folder.id === folderId)?.score ?? 0;
          const best = ranking.find((r) => r.folder.id !== folderId);
          if (!best || best.score < MISFILED.minScore || best.evidence < MIN_EVIDENCE) continue;
          const gap = best.score - own;
          if (gap < MISFILED.minGap) continue;
          results.push({
            id: b.id,
            title: b.title,
            url: b.url,
            fromParentId: b.parentId,
            fromPath: b.path,
            to: { folderId: best.folder.id, label: best.folder.path.join("/"), path: best.folder.path, newFolder: null },
            confidence: best.score >= 0.5 && gap >= 0.4 ? "high" : best.score >= 0.35 && gap >= 0.25 ? "medium" : "low",
            reason: reason(best, i),
            why: {
              type: "similarElsewhere",
              titles: best.neighbors.map((n) => n.title || hostOf(n.url)),
              ownFolder: folderById.get(b.parentId).title,
              folder: best.folder.title,
            },
          });
        }
      }
      return results;
    },

    // Best existing folder for a bookmark that isn't in one yet.
    suggestFolder(bookmark) {
      const i = bookmarks.indexOf(bookmark);
      if (i < 0) return null;
      const [top, second] = rank(i);
      if (!top || top.score < PLACE.minScore || top.evidence < MIN_EVIDENCE || (second && top.score - second.score < PLACE.margin)) return null;
      const seen = top.neighbors.map((b) => `"${shorten(b.title || b.url)}"`).join(", ");
      return {
        folder: top.folder,
        confidence: top.score >= 0.45 ? "medium" : "low",
        reason: `Similar to ${seen} in "${top.folder.path.join("/")}"`,
        why: { type: "similar", titles: top.neighbors.map((n) => n.title || hostOf(n.url)), folder: top.folder.title },
      };
    },

    // What the model could and couldn't judge, so a short suggestion list can be explained.
    diagnostics() {
      const all = [...stats.values()];
      const judged = all.filter((s) => s.coherence >= MIN_COHERENCE);
      const mixed = all.filter((s) => s.coherence < MIN_COHERENCE).sort((a, b) => b.size - a.size);
      const bookmarksInJudged = judged.reduce((sum, s) => sum + s.size, 0);
      const correct = all.reduce((sum, s) => sum + s.coherence * s.size, 0);
      const total = all.reduce((sum, s) => sum + s.size, 0);
      return {
        folders: folders.length,
        foldersWithEnoughBookmarks: all.length,
        foldersJudged: judged.length,
        bookmarksInJudged,
        accuracy: total ? correct / total : null,
        mixed: mixed.map((s) => ({ path: s.folder.path.join("/"), size: s.size, coherence: s.coherence })),
      };
    },
  };
}
