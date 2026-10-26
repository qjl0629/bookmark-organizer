// Proposes changes to the folders themselves: delete empty ones, merge duplicates, and give
// placeholder names ("New folder") a real one. Every proposal is a plain item the interface
// can show, select and undo. Nothing here touches Chrome.
import { dot } from "./embed.js";

export const FOLDER_RULES = {
  // Two named folders merge when their names mean the same and their contents are alike, or
  // when their contents are nearly identical in kind and the names are at least related.
  mergeNameSimilar: 0.6,
  mergeNameContents: 0.35,
  mergeContents: 0.8,
  mergeContentsName: 0.3,
  placeholderMerge: 0.6, // a nameless folder is clearly the same kind of thing as another folder
  placeholderMargin: 0.1, // ...and clearly closer to that folder than to any other
  renameScore: 0.45, // a suggested name must describe the contents at least this well
  renameMargin: 0.04, // ...and clearly better than the next-best name
  minToJudge: 2, // bookmarks a folder needs before it is compared
  minToName: 3, // bookmarks a folder needs before it is renamed
};

// Everyday folder names a suggestion can choose from.
export const NAME_CHOICES = [
  "Recipes", "Travel", "Finance", "Shopping", "Health", "Fitness", "Learning", "Programming", "Design", "Music",
  "Movies", "News", "Career", "Cars", "Photography", "Gardening", "Home", "Sports", "Games", "Books", "Science",
  "Art", "Fashion", "Technology", "Productivity", "Social Media", "Videos", "Podcasts", "Real Estate", "Taxes",
  "Legal", "Insurance", "Pets", "Parenting", "Math", "History", "Politics", "Writing", "Marketing", "Business",
  "Investing", "Banking", "Hotels", "Flights", "Restaurants", "Weather", "Maps", "Education", "Security", "Data",
  "Research", "Electronics", "Software", "Food", "Jobs", "Money", "DIY", "Crafts", "Languages", "Wedding",
];

const PLACEHOLDER = /^(new folder|untitled( folder)?|folder|folder ?\d+|new folder ?\(?\d+\)?|未命名( ?文件夹)?|新建文件夹( ?\(?\d+\)?)?)$/i;
const VAGUE = new Set(["stuff", "things", "random", "various", "cool", "interesting", "links", "misc stuff", "随便", "杂七杂八"]);

export const isPlaceholderName = (title) => PLACEHOLDER.test(title.trim());
export const isVagueName = (title) => VAGUE.has(title.trim().toLowerCase());

const stem = (word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word);
export const nameKey = (title) =>
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(stem)
    .join(" ");

const CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 };
const KIND_ORDER = { delete: 0, merge: 1, rename: 2 };

// folders/bookmarks come from flatten(). semantic is the object from buildSemantic (or null
// when the model isn't loaded). embedder turns a name into a vector. targeted holds ids of
// folders that some bookmark is about to be moved into, which must not be deleted.
export function planFolderChanges({ folders, bookmarks, semantic = null, embedder = null, isHolding = () => false, targeted = new Set(), rules = FOLDER_RULES }) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const direct = new Map();
  for (const b of bookmarks) direct.set(b.parentId, (direct.get(b.parentId) ?? 0) + 1);
  const subs = new Map();
  for (const f of folders) subs.set(f.parentId, (subs.get(f.parentId) ?? 0) + 1);
  const size = (f) => direct.get(f.id) ?? 0;
  const holds = (f) => size(f) + (subs.get(f.id) ?? 0);

  const ancestors = (folder) => {
    const out = new Set();
    for (let node = byId.get(folder.parentId); node; node = byId.get(node.parentId)) out.add(node.id);
    return out;
  };
  const related = (a, b) => ancestors(a).has(b.id) || ancestors(b).has(a.id);

  const items = [];
  const sources = new Set(); // folders that disappear into another one
  const keepers = new Set();
  const touched = new Set(); // folders already part of some proposal

  const merge = (from, to, confidence, why) => {
    sources.add(from.id);
    keepers.add(to.id);
    touched.add(from.id);
    touched.add(to.id);
    items.push({
      id: `merge:${from.id}`,
      kind: "merge",
      fromId: from.id,
      fromTitle: from.title,
      fromPath: from.path,
      toId: to.id,
      toPath: to.path,
      count: holds(from),
      confidence,
      why: { ...why, from: from.title, to: to.title },
    });
  };
  const canMerge = (from, to) => !sources.has(to.id) && !keepers.has(from.id) && !sources.has(from.id) && !related(from, to);

  // 1. Empty folders.
  for (const f of folders) {
    if (holds(f) === 0 && !targeted.has(f.id)) {
      touched.add(f.id);
      items.push({ id: `delete:${f.id}`, kind: "delete", folderId: f.id, title: f.title, path: f.path, count: 0, confidence: "high", why: { type: "emptyFolder" } });
    }
  }

  // 2. Same name (ignoring case, punctuation and plurals).
  const groups = new Map();
  for (const f of folders) {
    const key = nameKey(f.title);
    if (!key || touched.has(f.id)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => holds(b) - holds(a) || a.path.length - b.path.length);
    const [keeper, ...rest] = group;
    for (const other of rest) {
      if (!canMerge(other, keeper)) continue;
      merge(other, keeper, other.parentId === keeper.parentId ? "high" : "low", { type: "mergeSameName", sameParent: other.parentId === keeper.parentId });
    }
  }

  const profiles = new Map();
  const profileOf = (f) => {
    if (!semantic) return null;
    if (!profiles.has(f.id)) profiles.set(f.id, semantic.profile(f.id));
    return profiles.get(f.id);
  };

  // 3. Folders with a placeholder or vague name: fold into a folder holding the same kind of
  //    things, or else give them a name that describes what is inside.
  if (semantic && embedder) {
    const choices = NAME_CHOICES.map((label) => ({ label, vector: embedder.embed(label), key: nameKey(label) }));
    for (const f of folders) {
      const placeholder = isPlaceholderName(f.title);
      if (touched.has(f.id) || !(placeholder || isVagueName(f.title)) || size(f) < rules.minToName) continue;
      const mine = profileOf(f);
      if (!mine) continue;
      const titles = (mine.closest ?? []).map((i) => semantic.titleOf?.(i)).filter(Boolean);

      let best = null;
      let runnerUp = 0;
      for (const other of folders) {
        if (other.id === f.id || !canMerge(f, other) || size(other) < rules.minToJudge || isHolding(other)) continue;
        const theirs = profileOf(other);
        if (!theirs) continue;
        const c = dot(mine.centroid, theirs.centroid);
        if (!best || c > best.c) {
          runnerUp = best?.c ?? 0;
          best = { other, c };
        } else if (c > runnerUp) runnerUp = c;
      }
      if (best && best.c >= rules.placeholderMerge && best.c - runnerUp >= rules.placeholderMargin) {
        merge(f, best.other, placeholder ? "medium" : "low", { type: "mergeNameless", titles });
        continue;
      }

      const ranked = choices.map((c) => ({ ...c, score: dot(mine.centroid, c.vector) })).sort((a, b) => b.score - a.score);
      const [top, second] = ranked;
      if (!top || top.score < rules.renameScore || top.score - second.score < rules.renameMargin) continue;
      if (folders.some((o) => o.id !== f.id && o.parentId === f.parentId && nameKey(o.title) === top.key)) continue;
      touched.add(f.id);
      items.push({
        id: `rename:${f.id}`,
        kind: "rename",
        folderId: f.id,
        fromTitle: f.title,
        toTitle: top.label,
        path: f.path,
        count: size(f),
        confidence: placeholder && top.score >= rules.renameScore + 0.1 ? "high" : "medium",
        why: { type: "renameVague", from: f.title, to: top.label, titles },
      });
    }
  }

  // 4. Different names, same kind of contents.
  if (semantic) {
    const pairs = [];
    const pool = folders.filter((f) => !touched.has(f.id) && size(f) >= rules.minToJudge && !isHolding(f));
    for (let i = 0; i < pool.length; i++) {
      const a = profileOf(pool[i]);
      if (!a) continue;
      for (let j = i + 1; j < pool.length; j++) {
        const b = profileOf(pool[j]);
        if (!b || related(pool[i], pool[j])) continue;
        const c = dot(a.centroid, b.centroid);
        const n = a.name && b.name ? Math.max(0, dot(a.name, b.name)) : 0;
        const alike = (n >= rules.mergeNameSimilar && c >= rules.mergeNameContents) || (c >= rules.mergeContents && n >= rules.mergeContentsName);
        if (alike) pairs.push({ a: pool[i], b: pool[j], c });
      }
    }
    pairs.sort((x, y) => y.c - x.c);
    for (const { a, b, c } of pairs) {
      const [keeper, from] = holds(a) > holds(b) || (holds(a) === holds(b) && a.path.length <= b.path.length) ? [a, b] : [b, a];
      if (!canMerge(from, keeper)) continue;
      merge(from, keeper, "low", { type: "mergeSimilar", titles: (profileOf(from)?.closest ?? []).map((i) => semantic.titleOf?.(i)).filter(Boolean) });
    }
  }

  items.sort((a, b) => CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence] || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  return items;
}
