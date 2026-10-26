// Builds a reviewable plan from chrome.bookmarks.getTree() output. Pure functions only.
import { categorize } from "./categories.js";

const TRACKING = ["utm_", "fbclid", "gclid", "mc_cid", "mc_eid"];
const CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 };

export function hostOf(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "";
  }
}

const TWO_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.jp", "co.nz",
  "com.cn", "net.cn", "org.cn", "gov.cn", "com.hk", "com.tw", "co.kr", "com.br", "co.in", "co.za",
]);

// Registrable domain: "news.bbc.co.uk" -> "bbc.co.uk", "mail.google.com" -> "google.com".
export function baseDomain(host) {
  const parts = host.split(".");
  const keep = parts.length >= 3 && TWO_PART_SUFFIXES.has(parts.slice(-2).join(".")) ? 3 : 2;
  return parts.length > keep ? parts.slice(-keep).join(".") : host;
}

export function normalizeUrl(url) {
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return url.trim();
  }
  const params = [...parsed.searchParams.entries()]
    .filter(([key]) => !TRACKING.some((prefix) => key.toLowerCase().startsWith(prefix)))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = new URLSearchParams(params).toString();
  return `${parsed.protocol}//${hostOf(url)}${parsed.pathname.replace(/\/+$/, "")}${query ? "?" + query : ""}`;
}

// Folders exclude Chrome's root containers; a bookmark directly in a root has path.length === 1.
export function flatten(tree) {
  const top = tree[0];
  const folders = [];
  const bookmarks = [];
  const walk = (node, path) => {
    for (const child of node.children ?? []) {
      if (child.url !== undefined) {
        bookmarks.push({
          id: child.id,
          title: child.title,
          url: child.url,
          parentId: node.id,
          dateAdded: child.dateAdded ?? 0,
          path,
        });
      } else {
        const childPath = [...path, child.title];
        folders.push({ id: child.id, title: child.title, path: childPath, empty: !child.children?.length });
        walk(child, childPath);
      }
    }
  };
  for (const root of top.children ?? []) walk(root, [root.title]);
  return { roots: top.children ?? [], folders, bookmarks };
}

export function findDuplicates(bookmarks) {
  const groups = new Map();
  bookmarks.forEach((bookmark, order) => {
    const key = normalizeUrl(bookmark.url);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...bookmark, order });
  });
  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => group.sort((a, b) => (a.dateAdded || Infinity) - (b.dateAdded || Infinity) || a.order - b.order));
}

const stem = (token) => (token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token);
const tokens = (text) =>
  new Set((text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).filter((t) => t.length > 1).map(stem));

function folderMatches(name, title, host) {
  const nameLower = name.trim().toLowerCase();
  if (!nameLower) return false;
  const text = `${title} ${host}`.toLowerCase();
  if (/[^\x00-\x7f]/.test(nameLower)) return nameLower.length >= 2 && text.includes(nameLower);
  const nameTokens = tokens(nameLower);
  if (!nameTokens.size) return false;
  const textTokens = tokens(text);
  return [...nameTokens].every((t) => textTokens.has(t));
}

function bump(map, key, folderId) {
  if (!map.has(key)) map.set(key, new Map());
  const counter = map.get(key);
  counter.set(folderId, (counter.get(folderId) ?? 0) + 1);
}

function fromCounts(counter, label, folderById, { minCount = 1, minShare = 0.6, cap = null } = {}) {
  if (!counter) return null;
  let bestId = null;
  let best = 0;
  let total = 0;
  for (const [id, count] of counter) {
    total += count;
    if (count > best) {
      best = count;
      bestId = id;
    }
  }
  const folder = folderById.get(bestId);
  if (!folder || best < minCount || best / total < minShare) return null;
  return {
    folder,
    confidence: cap ?? (best >= 2 ? "high" : "medium"),
    reason: `${best} of ${total} bookmarks from ${label} are already in "${folder.path.join("/")}"`,
  };
}

export function buildPlan(tree, { minNewFolderSize = 2 } = {}) {
  const { roots, folders, bookmarks } = flatten(tree);
  const rootTitle = new Map(roots.map((root) => [root.id, root.title]));
  const loose = bookmarks.filter((b) => b.path.length === 1);
  const filed = bookmarks.filter((b) => b.path.length > 1);
  const folderById = new Map(folders.map((f) => [f.id, f]));

  const byHost = new Map();
  const byBase = new Map();
  for (const bookmark of filed) {
    const host = hostOf(bookmark.url);
    if (!host) continue;
    bump(byHost, host, bookmark.parentId);
    bump(byBase, baseDomain(host), bookmark.parentId);
  }

  const existing = new Map(); // lowercase title -> shallowest folder with that name
  for (const folder of folders) {
    const key = folder.title.trim().toLowerCase();
    const current = existing.get(key);
    if (key && (!current || folder.path.length < current.path.length)) existing.set(key, folder);
  }

  const toExisting = (folder) => ({ folderId: folder.id, label: folder.path.join("/"), newFolder: null });
  const decisions = [];
  const candidates = [];
  const unclassified = [];

  for (const bookmark of loose) {
    const host = hostOf(bookmark.url);
    // Exact host first. The whole registrable domain is weaker evidence (google.com hosts
    // everything), so it needs a strong majority and is never rated "high".
    const found =
      fromCounts(byHost.get(host), host, folderById) ??
      fromCounts(byBase.get(baseDomain(host)), baseDomain(host), folderById, { minCount: 3, minShare: 0.8, cap: "medium" });
    if (found) {
      decisions.push({ bookmark, to: toExisting(found.folder), confidence: found.confidence, reason: found.reason });
      continue;
    }
    const matches = [...existing.values()].filter((f) => folderMatches(f.title, bookmark.title, host));
    if (matches.length) {
      matches.sort((a, b) => tokens(b.title).size - tokens(a.title).size || b.title.length - a.title.length);
      decisions.push({
        bookmark,
        to: toExisting(matches[0]),
        confidence: "medium",
        reason: `Title or site mentions your folder "${matches[0].title}"`,
      });
      continue;
    }
    const category = categorize(bookmark.url, bookmark.title);
    if (!category) {
      unclassified.push({ bookmark, reason: "No matching folder or known category" });
    } else if (existing.has(category.toLowerCase())) {
      decisions.push({
        bookmark,
        to: toExisting(existing.get(category.toLowerCase())),
        confidence: "medium",
        reason: `Category "${category}" matches your existing folder`,
      });
    } else {
      candidates.push({ bookmark, category });
    }
  }

  const counts = new Map();
  for (const { bookmark, category } of candidates) {
    const key = `${bookmark.parentId}|${category}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const { bookmark, category } of candidates) {
    if (counts.get(`${bookmark.parentId}|${category}`) >= minNewFolderSize) {
      decisions.push({
        bookmark,
        to: {
          folderId: null,
          label: `${rootTitle.get(bookmark.parentId)}/${category}`,
          newFolder: { parentId: bookmark.parentId, title: category },
        },
        confidence: "low",
        reason: `Looks like "${category}" (new folder suggested)`,
      });
    } else {
      unclassified.push({ bookmark, reason: `Only one "${category}" bookmark, not enough for a new folder` });
    }
  }

  decisions.sort(
    (a, b) => CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence] || a.to.label.localeCompare(b.to.label),
  );
  const moves = decisions.map(({ bookmark, to, confidence, reason }) => ({
    id: bookmark.id,
    title: bookmark.title,
    url: bookmark.url,
    fromParentId: bookmark.parentId,
    fromPath: bookmark.path,
    to,
    confidence,
    reason,
  }));
  const duplicates = findDuplicates(bookmarks);

  return {
    summary: {
      bookmarks: bookmarks.length,
      folders: folders.length,
      loose: loose.length,
      moves: moves.length,
      unclassified: unclassified.length,
      duplicateGroups: duplicates.length,
    },
    moves,
    unclassified,
    duplicates,
    emptyFolders: folders.filter((f) => f.empty).map((f) => f.path.join("/")),
  };
}
