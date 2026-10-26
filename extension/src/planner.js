// Builds a reviewable plan from chrome.bookmarks.getTree() output. Pure functions only.
import { categorize, categorizeHost } from "./categories.js";
import { quickAccessReason } from "./quickaccess.js";
import { baseDomain, hostOf, normalizeUrl } from "./url.js";

export { baseDomain, hostOf, normalizeUrl };

const CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 };

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
  const roots = top.children ?? [];
  const bar = roots.find((r) => r.folderType === "bookmarks-bar") ?? roots.find((r) => r.id === "1") ?? roots[0];
  return { roots, folders, bookmarks, barRootId: bar?.id ?? null };
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

const HOLDING_FOLDERS = new Set([
  "misc", "miscellaneous", "other", "others", "later", "read later", "to read", "temp", "tmp",
  "unsorted", "inbox", "todo", "to do", "archive", "杂项", "其他", "稍后看", "待看", "临时",
]);
const isHolding = (folder) => HOLDING_FOLDERS.has(folder.title.trim().toLowerCase());
export const dismissKey = (bookmark) => `${normalizeUrl(bookmark.url)}|${bookmark.parentId}`;

function dominantCategory(members) {
  const counts = new Map();
  for (const m of members) if (m.category) counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
  let key = null;
  let count = 0;
  for (const [k, c] of counts) if (c > count) [key, count] = [k, c];
  return { key, count, share: members.length ? count / members.length : 0 };
}

// Flags bookmarks whose site clearly belongs to a different kind of folder than the one
// they are in, e.g. a shopping site inside a folder of videos. Deliberately conservative:
//  - only judges folders where >= 60% of the *other* bookmarks (at least 4) share one category,
//    so folders organized by project or purpose are left alone;
//  - only judges sites with a known category, and never a site the folder already contains;
//  - never moves things out of holding folders like "Read later".
// Judgement is by site category only. Unknown sites cannot be judged.
// Folders whose bookmarks are mostly one kind of site, e.g. a folder called "Buy" full of
// shopping sites. Used both to place loose bookmarks and to spot misfiled ones.
function folderProfiles(folders, bookmarks) {
  const members = new Map(folders.map((f) => [f.id, []]));
  for (const b of bookmarks) {
    if (members.has(b.parentId)) members.get(b.parentId).push({ ...b, category: categorizeHost(b.url), host: hostOf(b.url) });
  }
  const targets = [];
  for (const folder of folders) {
    const list = members.get(folder.id);
    if (list.length < 3 || isHolding(folder)) continue;
    const top = dominantCategory(list);
    if (top.key && top.share >= 0.6) targets.push({ folder, list, category: top.key });
  }
  return { members, targets };
}

export function findMisplaced(folders, bookmarks, dismissed = new Set()) {
  const { members, targets } = folderProfiles(folders, bookmarks);
  const results = [];
  for (const folder of folders) {
    if (isHolding(folder)) continue;
    const list = members.get(folder.id);
    for (const bookmark of list) {
      if (!bookmark.category || dismissed.has(dismissKey(bookmark))) continue;
      const others = list.filter((m) => m.id !== bookmark.id);
      if (others.length < 4) continue;
      const top = dominantCategory(others);
      if (!top.key || top.share < 0.6 || top.key === bookmark.category) continue;
      if (others.some((m) => m.host === bookmark.host)) continue;

      const candidates = targets
        .filter((t) => t.folder.id !== folder.id && t.category === bookmark.category)
        .map((t) => ({ ...t, sameSite: t.list.some((m) => m.host === bookmark.host) }))
        .sort((a, b) => Number(b.sameSite) - Number(a.sameSite) || b.list.length - a.list.length);
      const target = candidates[0] ?? null;
      const why = `${bookmark.host} looks like ${bookmark.category}, but ${top.count} of ${others.length} other bookmarks in "${folder.path.join("/")}" are ${top.key}`;
      results.push({
        id: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        fromParentId: bookmark.parentId,
        fromPath: bookmark.path,
        to: target ? { folderId: target.folder.id, label: target.folder.path.join("/"), newFolder: null } : null,
        confidence: target ? (target.sameSite ? "high" : "medium") : "low",
        reason: target ? `${why}. "${target.folder.path.join("/")}" holds mostly ${bookmark.category}.` : `${why}. No better folder found.`,
      });
    }
  }
  return results.sort((a, b) => CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence] || a.fromPath.join("/").localeCompare(b.fromPath.join("/")));
}

export function buildPlan(
  tree,
  { minNewFolderSize = 2, pinned = new Set(), organizeAnyway = new Set(), dismissed = new Set() } = {},
) {
  const { roots, folders, bookmarks, barRootId } = flatten(tree);
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
  // Largest folder first, so a loose shopping site goes to the main shopping folder.
  const categoryFolders = folderProfiles(folders, bookmarks).targets.sort((a, b) => b.list.length - a.list.length);
  const decisions = [];
  const candidates = [];
  const quickAccess = [];
  const unclassified = [];

  for (const bookmark of loose) {
    // On the bookmarks bar, shortcuts (mail, ChatGPT, bookmarklets...) are left exactly where they are.
    if (bookmark.parentId === barRootId) {
      const why = quickAccessReason(bookmark, { pinned, organizeAnyway });
      if (why) {
        quickAccess.push({ bookmark, reason: why });
        continue;
      }
    }
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
    const kindFolder = category && categoryFolders.find((t) => t.category === category);
    if (!category) {
      unclassified.push({ bookmark, reason: "No matching folder or known category" });
    } else if (existing.has(category.toLowerCase())) {
      decisions.push({
        bookmark,
        to: toExisting(existing.get(category.toLowerCase())),
        confidence: "medium",
        reason: `Category "${category}" matches your existing folder`,
      });
    } else if (kindFolder) {
      decisions.push({
        bookmark,
        to: toExisting(kindFolder.folder),
        confidence: "medium",
        reason: `"${kindFolder.folder.path.join("/")}" mostly holds ${category} sites`,
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
  const review = findMisplaced(folders, bookmarks, dismissed);

  return {
    summary: {
      bookmarks: bookmarks.length,
      folders: folders.length,
      loose: loose.length,
      moves: moves.length,
      quickAccess: quickAccess.length,
      review: review.length,
      unclassified: unclassified.length,
      duplicateGroups: duplicates.length,
    },
    moves,
    quickAccess,
    review,
    barRootId,
    unclassified,
    duplicates,
    emptyFolders: folders.filter((f) => f.empty).map((f) => f.path.join("/")),
  };
}
