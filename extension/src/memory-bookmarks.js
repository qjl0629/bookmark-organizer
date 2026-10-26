// In-memory stand-in for chrome.bookmarks. Used by tests and by the demo mode when
// the page is opened outside Chrome, so behaviour can be checked without a browser.

export function createMemoryBookmarks(roots) {
  let counter = 1000;
  const byId = new Map();
  const top = { id: "0", title: "", children: [] };
  byId.set("0", top);

  const add = (spec, parent, index = parent.children.length) => {
    const node = {
      id: spec.id ?? String(counter++),
      title: spec.title ?? "",
      dateAdded: spec.dateAdded ?? Date.now(),
      parentId: parent.id,
    };
    if (spec.url === undefined) node.children = [];
    else node.url = spec.url;
    byId.set(node.id, node);
    parent.children.splice(index, 0, node);
    for (const child of spec.children ?? []) add(child, node);
    return node;
  };
  roots.forEach((root) => add(root, top));

  const view = (node, deep) => {
    const parent = byId.get(node.parentId);
    const copy = {
      id: node.id,
      parentId: node.parentId,
      index: parent ? parent.children.indexOf(node) : 0,
      title: node.title,
      dateAdded: node.dateAdded,
    };
    if (node.url !== undefined) copy.url = node.url;
    else if (deep) copy.children = node.children.map((child) => view(child, true));
    return copy;
  };
  const need = (id) => {
    const node = byId.get(String(id));
    if (!node) throw new Error("Can't find bookmark for id.");
    return node;
  };

  return {
    async getTree() {
      return [view(top, true)];
    },
    async get(id) {
      return [view(need(id), false)];
    },
    async getChildren(id) {
      return need(id).children.map((child) => view(child, false));
    },
    async update(id, changes) {
      const node = need(id);
      if (changes.title !== undefined) node.title = changes.title;
      if (changes.url !== undefined && node.url !== undefined) node.url = changes.url;
      return view(node, false);
    },
    async create({ parentId, index, title = "", url }) {
      const parent = need(parentId);
      if (parent.url !== undefined) throw new Error("Parent is not a folder.");
      return view(add({ title, url }, parent, index ?? parent.children.length), false);
    },
    async move(id, { parentId, index } = {}) {
      const node = need(id);
      const oldParent = byId.get(node.parentId);
      const target = parentId ? need(parentId) : oldParent;
      oldParent.children.splice(oldParent.children.indexOf(node), 1);
      target.children.splice(index ?? target.children.length, 0, node);
      node.parentId = target.id;
      return view(node, false);
    },
    async remove(id) {
      const node = need(id);
      if (node.children?.length) throw new Error("Can't remove non-empty folder.");
      const parent = byId.get(node.parentId);
      parent.children.splice(parent.children.indexOf(node), 1);
      byId.delete(node.id);
    },
  };
}

export function createMemoryStorage() {
  const data = {};
  return {
    async get(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((key) => key in data).map((key) => [key, structuredClone(data[key])]));
    },
    async set(values) {
      Object.assign(data, structuredClone(values));
    },
    async remove(key) {
      delete data[key];
    },
  };
}
