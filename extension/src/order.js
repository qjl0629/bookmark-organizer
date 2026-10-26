// Proposals about ORDER and about what to tuck away, based on what the user actually uses:
//  - promote: the bookmarks and folders used most go to the top of their folder.
//  - archive: bookmarks saved long ago and not opened since go to an Archive folder.
// Everything not promoted keeps its order, so newer bookmarks stay at the bottom as Chrome
// puts them. Pure functions: nothing here touches Chrome.
import { DAY, daysAgo } from "./usage.js";

export const ORDER_RULES = {
  minFolderSize: 6, // smaller folders are quick to scan, so they are left alone
  maxPerFolder: 5,
  shareOfFolder: 0.25,
  recentDays: 45, // "opened recently" when only the last-opened date is known
  minVisits: 3, // visits in the last 3 months to count as used often
  maxFolders: 3,
  minFolderVisits: 5,
  minFolderRecent: 2, // bookmarks opened recently in a folder
  staleDays: 365,
  minCoverage: 0.1, // share of bookmarks with an opened date before "not opened" can be trusted
  minWithDate: 10,
};

export const ARCHIVE_NAME = "Archive";

const CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 };

// visits: Map url -> visits in the last 90 days, or null when history is not allowed.
export function planOrdering({ folders, bookmarks, roots, barRootId, otherRootId, visits = null, now = Date.now(), skip = new Set(), dismissed = () => false, rules = ORDER_RULES }) {
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const mode = visits ? "visits" : "lastUsed";
  const visitsOf = (b) => visits?.get(b.url) ?? 0;
  const recent = (b) => b.lastUsed > 0 && now - b.lastUsed <= rules.recentDays * DAY;

  const withDate = bookmarks.filter((b) => b.lastUsed > 0).length;
  const coverage = bookmarks.length ? withDate / bookmarks.length : 0;
  const usage = { mode, total: bookmarks.length, withDate, coverage, archiveReady: withDate >= rules.minWithDate && coverage >= rules.minCoverage };

  const evidenceFor = (b) => (visits ? { visits: visitsOf(b), days: b.lastUsed ? daysAgo(b.lastUsed, now) : null } : { visits: null, days: daysAgo(b.lastUsed, now) });

  // ---- bookmarks used most go to the top of their folder
  const promote = [];
  const byFolder = new Map();
  for (const b of bookmarks) {
    if (!folderById.has(b.parentId) || skip.has(b.id)) continue;
    if (!byFolder.has(b.parentId)) byFolder.set(b.parentId, []);
    byFolder.get(b.parentId).push(b);
  }
  const children = new Map(); // parent id -> number of children (bookmarks and folders)
  for (const b of bookmarks) children.set(b.parentId, (children.get(b.parentId) ?? 0) + 1);
  for (const f of folders) children.set(f.parentId, (children.get(f.parentId) ?? 0) + 1);

  for (const [folderId, list] of byFolder) {
    const folder = folderById.get(folderId);
    const all = bookmarks.filter((b) => b.parentId === folderId).length;
    if (all < rules.minFolderSize) continue;
    const limit = Math.max(1, Math.min(rules.maxPerFolder, Math.floor(all * rules.shareOfFolder)));
    const used = visits ? list.filter((b) => visitsOf(b) >= rules.minVisits) : list.filter(recent);
    used.sort((a, b) => (visits ? visitsOf(b) - visitsOf(a) : 0) || b.lastUsed - a.lastUsed);
    const top = used.slice(0, limit);
    const atTop = (b) => b.position < top.length;
    for (const b of top.filter((x) => !atTop(x))) {
      const e = evidenceFor(b);
      promote.push({
        id: `top:${b.id}`,
        kind: "promote",
        bookmarkId: b.id,
        parentId: folderId,
        title: b.title,
        url: b.url,
        path: folder.path,
        fromPath: folder.path,
        position: b.position + 1,
        size: children.get(folderId),
        confidence: (visits ? visitsOf(b) >= 10 : b.lastUsed && now - b.lastUsed <= 14 * DAY) ? "high" : "medium",
        why: { type: "usedOften", visits: e.visits, days: e.days, folder: folder.title },
        rank: top.indexOf(b),
      });
    }
  }

  // ---- folders used most go first among their sibling folders
  const score = new Map();
  const parentOf = new Map(folders.map((f) => [f.id, f.parentId]));
  for (const b of bookmarks) {
    const value = visits ? visitsOf(b) : recent(b) ? 1 : 0;
    if (!value) continue;
    for (let id = b.parentId; folderById.has(id); id = parentOf.get(id)) score.set(id, (score.get(id) ?? 0) + value);
  }
  const siblings = new Map();
  for (const f of folders) {
    if (!siblings.has(f.parentId)) siblings.set(f.parentId, []);
    siblings.get(f.parentId).push(f);
  }
  const promoteFolders = [];
  for (const [parentId, list] of siblings) {
    if (list.length < 3) continue;
    const slots = [...list].sort((a, b) => a.position - b.position);
    const need = visits ? rules.minFolderVisits : rules.minFolderRecent;
    const top = list.filter((f) => (score.get(f.id) ?? 0) >= need).sort((a, b) => score.get(b.id) - score.get(a.id)).slice(0, rules.maxFolders);
    const slotOf = (f) => slots.indexOf(f);
    for (const f of top.filter((x) => slotOf(x) >= top.length)) {
      promoteFolders.push({
        id: `folder:${f.id}`,
        kind: "promoteFolder",
        folderId: f.id,
        parentId,
        title: f.title,
        path: f.path,
        position: slotOf(f) + 1,
        size: list.length,
        confidence: score.get(f.id) >= (visits ? 20 : 4) ? "high" : "medium",
        why: { type: "usedFolder", visits: visits ? score.get(f.id) : null, count: visits ? null : score.get(f.id), folder: f.title },
        rank: top.indexOf(f),
      });
    }
  }

  // ---- long-unused bookmarks are tucked into Archive (off the bar, under Other bookmarks)
  const archive = [];
  const otherRoot = roots.find((r) => r.id === otherRootId);
  if (otherRoot && usage.archiveReady) {
    const existing = folders.find((f) => f.parentId === otherRootId && f.title.trim().toLowerCase() === ARCHIVE_NAME.toLowerCase());
    const to = existing
      ? { folderId: existing.id, label: existing.path.join("/"), path: existing.path, newFolder: null }
      : { folderId: null, label: `${otherRoot.title}/${ARCHIVE_NAME}`, path: [otherRoot.title, ARCHIVE_NAME], newFolder: { parentId: otherRootId, title: ARCHIVE_NAME } };
    for (const b of bookmarks) {
      if (skip.has(b.id) || b.parentId === barRootId || b.parentId === existing?.id || dismissed(b)) continue;
      if (!b.dateAdded || now - b.dateAdded < rules.staleDays * DAY) continue;
      if (b.lastUsed > 0 && now - b.lastUsed < rules.staleDays * DAY) continue;
      if (visits && visitsOf(b) > 0) continue;
      const old = now - b.dateAdded >= 2 * rules.staleDays * DAY;
      archive.push({
        id: b.id,
        title: b.title,
        url: b.url,
        fromParentId: b.parentId,
        fromPath: b.path,
        to,
        confidence: old ? "medium" : "low",
        reason: b.lastUsed ? "Not opened for over a year" : "No sign it has been opened since it was saved",
        why: { type: "unused", saved: daysAgo(b.dateAdded, now), lastOpened: b.lastUsed ? daysAgo(b.lastUsed, now) : null },
      });
    }
    archive.sort((a, b) => CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence] || b.why.saved - a.why.saved);
  }

  const byConfidence = (a, b) => CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
  const order = [...promoteFolders, ...promote].sort(byConfidence);
  return { order, archive, usage };
}
