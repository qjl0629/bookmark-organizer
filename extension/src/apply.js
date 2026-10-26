// Applies and undoes plans through an injected bookmarks API (chrome.bookmarks or a test double).

export async function applyPlan(api, { moves = [], removeIds = [], folderOps = [] }) {
  const undo = { time: Date.now(), created: [], moved: [], removed: [], foldersRemoved: [], renamed: [], carried: 0, merged: 0, deleted: 0 };
  const result = { moved: 0, skipped: 0, removed: 0, merged: 0, deleted: 0, renamed: 0, error: null, undo };
  const newFolders = new Map();
  const getNode = async (id) => (await api.get(id).catch(() => []))[0];
  // A bookmark that is about to be removed as a duplicate is not worth moving first, and
  // moving it would make the undo log point at a bookmark that no longer exists.
  const doomed = new Set(removeIds);
  moves = moves.filter((move) => !doomed.has(move.id));

  try {
    for (const move of moves) {
      const node = await getNode(move.id);
      // Skip if the bookmark was moved or deleted since the plan was built.
      if (!node || node.parentId !== move.fromParentId) {
        result.skipped++;
        continue;
      }
      let parentId = move.to.folderId;
      if (!parentId) {
        const { parentId: rootId, title } = move.to.newFolder;
        const key = `${rootId}|${title.toLowerCase()}`;
        if (!newFolders.has(key)) {
          const folder = await api.create({ parentId: rootId, title });
          undo.created.push(folder.id);
          newFolders.set(key, folder.id);
        }
        parentId = newFolders.get(key);
      }
      undo.moved.push({ id: move.id, parentId: node.parentId, index: node.index });
      await api.move(move.id, { parentId });
      result.moved++;
    }
    for (const id of removeIds) {
      const node = await getNode(id);
      if (!node || node.url === undefined) {
        result.skipped++;
        continue;
      }
      undo.removed.push({ title: node.title, url: node.url, parentId: node.parentId, index: node.index });
      await api.remove(id);
      result.removed++;
    }

    // Folder changes come last, so bookmarks headed elsewhere have already left a folder
    // before it is merged or deleted.
    for (const op of folderOps) {
      if (op.kind === "merge") {
        const [from, to] = [await getNode(op.fromId), await getNode(op.toId)];
        if (!from || !to || from.url !== undefined || to.url !== undefined) {
          result.skipped++;
          continue;
        }
        for (const child of await api.getChildren(from.id)) {
          undo.moved.push({ id: child.id, parentId: from.id, index: child.index });
          undo.carried++;
          await api.move(child.id, { parentId: to.id });
        }
        undo.foldersRemoved.push({ id: from.id, title: from.title, parentId: from.parentId, index: from.index });
        await api.remove(from.id);
        undo.merged++;
        result.merged++;
      } else if (op.kind === "delete") {
        const node = await getNode(op.folderId);
        // Only delete what is still empty; something may have been moved in since the plan.
        if (!node || node.url !== undefined || (await api.getChildren(node.id)).length) {
          result.skipped++;
          continue;
        }
        undo.foldersRemoved.push({ id: node.id, title: node.title, parentId: node.parentId, index: node.index });
        await api.remove(node.id);
        undo.deleted++;
        result.deleted++;
      } else if (op.kind === "rename") {
        const node = await getNode(op.folderId);
        if (!node || node.url !== undefined || node.title !== op.fromTitle) {
          result.skipped++;
          continue;
        }
        undo.renamed.push({ id: node.id, title: node.title });
        await api.update(node.id, { title: op.toTitle });
        result.renamed++;
      }
    }
  } catch (error) {
    result.error = error.message; // keep the partial undo log so the caller can still save it
  }
  return result;
}

export async function undoRun(api, undo) {
  const errors = [];
  const attempt = async (action) => {
    try {
      return await action();
    } catch (error) {
      errors.push(error.message);
      return null;
    }
  };
  // A folder that was merged or deleted comes back under a new id, so anything that lived in
  // it is pointed at the new one.
  const ids = new Map();
  const live = (id) => ids.get(id) ?? id;

  for (const item of [...(undo.foldersRemoved ?? [])].reverse()) {
    const folder = await attempt(() => api.create({ parentId: live(item.parentId), index: item.index, title: item.title }));
    if (folder) ids.set(item.id, folder.id);
  }
  for (const item of [...undo.removed].reverse()) {
    await attempt(() => api.create({ parentId: live(item.parentId), index: item.index, title: item.title, url: item.url }));
  }
  for (const item of [...undo.moved].reverse()) {
    await attempt(() => api.move(item.id, { parentId: live(item.parentId), index: item.index }));
  }
  for (const id of [...undo.created].reverse()) {
    await attempt(() => api.remove(id)); // only succeeds when the folder is empty again
  }
  for (const item of [...(undo.renamed ?? [])].reverse()) {
    await attempt(() => api.update(item.id, { title: item.title }));
  }
  return { errors };
}
