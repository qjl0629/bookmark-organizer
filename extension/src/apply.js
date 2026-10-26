// Applies and undoes plans through an injected bookmarks API (chrome.bookmarks or a test double).

export async function applyPlan(api, { moves, removeIds = [] }) {
  const undo = { time: Date.now(), created: [], moved: [], removed: [] };
  const result = { moved: 0, skipped: 0, removed: 0, error: null, undo };
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
  } catch (error) {
    result.error = error.message; // keep the partial undo log so the caller can still save it
  }
  return result;
}

export async function undoRun(api, undo) {
  const errors = [];
  const attempt = async (action) => {
    try {
      await action();
    } catch (error) {
      errors.push(error.message);
    }
  };
  for (const item of [...undo.removed].reverse()) {
    await attempt(() => api.create({ parentId: item.parentId, index: item.index, title: item.title, url: item.url }));
  }
  for (const item of [...undo.moved].reverse()) {
    await attempt(() => api.move(item.id, { parentId: item.parentId, index: item.index }));
  }
  for (const id of [...undo.created].reverse()) {
    await attempt(() => api.remove(id)); // only succeeds when the folder is empty again
  }
  return { errors };
}
