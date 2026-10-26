import { applyPlan, undoRun } from "./src/apply.js";
import { loadEmbedder } from "./src/model-loader.js";
import { buildPlan, dismissKey, flatten, hostOf, normalizeUrl } from "./src/planner.js";
import { CONFIDENCE, avatarHue, avatarLetter, describeWhy, displayUrl, folderChip, isOpenable, shortcutWhy } from "./src/present.js";
import { loadVisits } from "./src/usage.js";

// Outside Chrome (previews, screenshots) fall back to fictional demo data.
const isDemo = !globalThis.chrome?.bookmarks;
if (isDemo) (await import("./src/demo.js")).installDemo();

const $ = (id) => document.getElementById(id);
const state = {
  plan: null,
  lastRun: null,
  moves: new Set(),
  review: new Set(),
  removals: new Set(),
  folderOps: new Set(),
  seenFolderOps: new Set(),
  orderOps: new Set(),
  seenOrderOps: new Set(),
  archive: new Set(),
  seenMoves: new Set(),
  expanded: { moves: false, review: false, dups: false, folders: false, order: false, archive: false },
  justApplied: false,
  busy: false,
  // "loading" until the bundled model is read, then "ready"; "failed" means word matching only.
  model: { status: "loading", embedder: null, seconds: 0 },
  smartMatching: true,
  // Browsing history is optional: "available" when Chrome can ask for it, "granted" once allowed.
  history: { available: !!globalThis.chrome?.permissions?.request, granted: false, visits: null },
};
const PREVIEW_ROWS = 6;

// ---------------------------------------------------------------- helpers

// All bookmark text is inserted as text nodes, never as HTML. Empty children (null, false)
// are skipped, otherwise append() would print the word "null".
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "style") node.setAttribute("style", value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, "");
    else if (value !== false && value != null) node.setAttribute(key, value);
  }
  node.append(...children.flat(Infinity).filter((child) => child != null && child !== false));
  return node;
}

// Static, trusted icon markup only. Never put bookmark text in here.
const ICONS = {
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  bar: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  top: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
  inbox: '<path d="M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
};
function icon(name, size = 16, width = 2) {
  const holder = document.createElement("span");
  holder.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return holder.firstElementChild;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const percent = (value) => `${Math.round(value * 100)}%`;

let toastTimer = null;
function toast(text, kind = "") {
  const node = $("toast");
  node.textContent = text;
  node.className = `toast${kind ? ` is-${kind}` : ""}`;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (node.hidden = true), kind === "error" ? 9000 : 4500);
}

// ---------------------------------------------------------------- remembered choices

// Shortcuts to keep on the bar, items to organize even though they look like shortcuts,
// and "keep it here" answers. Stored on this device only.
const SETTING_KEYS = ["pinned", "organizeAnyway", "dismissed"];

async function readSettings() {
  const stored = await chrome.storage.local.get(SETTING_KEYS);
  return Object.fromEntries(SETTING_KEYS.map((key) => [key, new Set(stored[key] ?? [])]));
}

async function changeSettings(mutate) {
  const settings = await readSettings();
  mutate(settings);
  await chrome.storage.local.set(Object.fromEntries(SETTING_KEYS.map((key) => [key, [...settings[key]]])));
  const y = window.scrollY;
  await load();
  window.scrollTo(0, y);
}

const keepOnBar = (url) =>
  changeSettings((s) => {
    s.pinned.add(normalizeUrl(url));
    s.organizeAnyway.delete(normalizeUrl(url));
  });
const organizeAnyway = (url) =>
  changeSettings((s) => {
    s.organizeAnyway.add(normalizeUrl(url));
    s.pinned.delete(normalizeUrl(url));
  });
const keepHere = (item) => changeSettings((s) => s.dismissed.add(dismissKey({ url: item.url, parentId: item.fromParentId })));

// ---------------------------------------------------------------- data

async function load() {
  const settings = await readSettings();
  const { lastRun } = await chrome.storage.local.get("lastRun");
  state.lastRun = lastRun ?? null;
  const { smartMatching = true } = await chrome.storage.local.get("smartMatching");
  state.smartMatching = smartMatching;
  state.plan = buildPlan(await chrome.bookmarks.getTree(), { ...settings, embedder: smartMatching ? state.model.embedder : null, visits: state.history.visits });

  // Keep the user's ticks across reloads; moves that appear for the first time start selected.
  const previous = state.moves;
  const seen = state.seenMoves;
  state.moves = new Set(state.plan.moves.filter((m) => !seen.has(m.id) || previous.has(m.id)).map((m) => m.id));
  state.seenMoves = new Set(state.plan.moves.map((m) => m.id));
  state.review = new Set([...state.review].filter((id) => state.plan.review.some((r) => r.id === id)));
  state.removals = new Set();
  // Certain folder changes (empty folders, same-name folders side by side) start ticked; the
  // rest wait for the user, like possible mix-ups do.
  const previousOps = state.folderOps;
  state.folderOps = new Set(
    state.plan.folderOps.filter((op) => (!state.seenFolderOps.has(op.id) && op.confidence === "high") || previousOps.has(op.id)).map((op) => op.id),
  );
  state.seenFolderOps = new Set(state.plan.folderOps.map((op) => op.id));
  // The bookmarks used most start ticked when I'm sure; Archive always waits for the user.
  const previousOrder = state.orderOps;
  state.orderOps = new Set(
    state.plan.orderOps.filter((op) => (!state.seenOrderOps.has(op.id) && op.confidence === "high") || previousOrder.has(op.id)).map((op) => op.id),
  );
  state.seenOrderOps = new Set(state.plan.orderOps.map((op) => op.id));
  state.archive = new Set([...state.archive].filter((id) => state.plan.archive.some((a) => a.id === id)));
  render();
}

const duplicateRows = () =>
  state.plan.duplicates.flatMap((group) =>
    group.slice(1).map((b) => ({ id: b.id, title: b.title, url: b.url, path: b.path, keepPath: group[0].path })),
  );
const changeCount = () =>
  state.plan.moves.length + state.plan.review.length + duplicateRows().length + state.plan.folderOps.length + state.plan.orderOps.length + state.plan.archive.length;
const selectedFolderOps = () => state.plan.folderOps.filter((op) => state.folderOps.has(op.id));
const selectedOrderOps = () => state.plan.orderOps.filter((op) => state.orderOps.has(op.id));

// Moves the user has ticked. A bookmark that is also ticked for removal is only removed.
const selectedMoves = () =>
  [
    ...state.plan.moves.filter((m) => state.moves.has(m.id)),
    ...state.plan.review.filter((r) => state.review.has(r.id)),
    ...state.plan.archive.filter((a) => state.archive.has(a.id)),
  ].filter((m) => !state.removals.has(m.id));

// ---------------------------------------------------------------- building blocks

function avatar(item) {
  const host = hostOf(item.url);
  return el("span", { class: "avatar", style: `--h:${avatarHue(host)}`, "aria-hidden": "true" }, avatarLetter(item.title, host));
}

function siteCell(item) {
  const label = item.title || hostOf(item.url) || item.url;
  const body = [
    avatar(item),
    el("div", { class: "site-text" }, el("div", { class: "title", text: label }), el("div", { class: "url", text: displayUrl(item.url) })),
  ];
  // Opening a bookmark lets people check what it is before agreeing to move it.
  return isOpenable(item.url)
    ? el("a", { class: "site is-link", href: item.url.trim(), target: "_blank", rel: "noopener noreferrer", title: `Open in a new tab\n${item.url}` }, body)
    : el("div", { class: "site", title: item.url }, body);
}

function folderChipEl(path, variant, { isNew = false } = {}) {
  const chip = folderChip(path, { isNew });
  return el(
    "span",
    { class: `chip ${variant}`, title: chip.full },
    icon(chip.isRoot ? "bar" : "folder", 15),
    el("span", { class: "name", text: chip.name }),
    chip.hint ? el("span", { class: "hint", text: chip.hint }) : null,
    chip.isNew ? el("span", { class: "tag-new", text: "New" }) : null,
  );
}

const leg = (label, node) => el("div", { class: "leg" }, el("span", { class: "leg-label", text: label }), node);
const route = (from, toNode, [fromLabel, toLabel] = ["Now in", "Move to"]) =>
  el("div", { class: "route" }, leg(fromLabel, Array.isArray(from) ? folderChipEl(from, "from") : from), icon("arrow", 18), leg(toLabel, toNode));

function placeChip(name, hint, variant, iconName = "folder") {
  return el("span", { class: `chip ${variant}` }, icon(iconName, 15), el("span", { class: "name", text: name }), hint ? el("span", { class: "hint", text: hint }) : null);
}

function folderCell(title, sub) {
  return el(
    "div",
    { class: "site" },
    el("span", { class: "avatar", style: "--h:215", "aria-hidden": "true" }, icon("folder", 18)),
    el("div", { class: "site-text" }, el("div", { class: "title", text: title }), el("div", { class: "url", text: sub })),
  );
}

// The reason is there when you want it, not in the way when you don't.
function explain(text) {
  if (!text) return { button: null, panel: null };
  const panel = el("p", { class: "why-text", hidden: true, text });
  const button = el("button", {
    class: "textbtn why-btn",
    text: "Why?",
    "aria-expanded": "false",
    onclick: () => {
      const open = panel.hidden;
      panel.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
      button.textContent = open ? "Hide" : "Why?";
    },
  });
  return { button, panel };
}

function sure(confidence) {
  const filled = { high: 3, medium: 2, low: 1 }[confidence] ?? 1;
  const info = CONFIDENCE[confidence] ?? CONFIDENCE.low;
  return el(
    "span",
    { class: "sure", title: info.hint },
    el("span", { class: "meter", "aria-hidden": "true" }, [1, 2, 3].map((n) => el("i", { class: n <= filled ? "on" : "" }))),
    info.word,
  );
}

function checkbox(checked, label, onChange) {
  const input = el("input", { type: "checkbox", "aria-label": label });
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  return el("label", { class: "check" }, input, el("span", { class: "box" }, icon("check", 14, 3)));
}

function planRow(item, selected, { toNode, why, extra = null, showSure = true, labels, inline = false, fromNode = null, cell = null }) {
  const row = el("li", { class: `row${selected.has(item.id) ? " is-selected" : ""}` });
  const { button, panel } = inline ? { button: el("span", { class: "evidence", text: why }), panel: null } : explain(why);
  row.append(
    checkbox(selected.has(item.id), `Select ${item.title || item.url}`, (on) => {
      if (on) selected.add(item.id);
      else selected.delete(item.id);
      row.classList.toggle("is-selected", on);
      updateBar();
    }),
    cell ?? siteCell(item),
    route(fromNode ?? item.fromPath ?? item.path, toNode, labels),
    el("div", { class: "meta" }, showSure ? sure(item.confidence) : null, button, extra),
    ...(panel ? [panel] : []),
  );
  return row;
}

const CONFIDENT = new Set(["high", "medium"]);
function selectionTools(items, selected, refresh) {
  const choose = (pick) => {
    for (const item of items) {
      if (pick(item)) selected.add(item.id);
      else selected.delete(item.id);
    }
    refresh();
    updateBar();
  };
  const confident = items.filter((item) => CONFIDENT.has(item.confidence)).length;
  return el(
    "div",
    { class: "tools" },
    el("button", { class: "tool", text: "Select all", onclick: () => choose(() => true) }),
    confident > 0 && confident < items.length
      ? el("button", { class: "tool", text: `Only the likely ones (${confident})`, onclick: () => choose((item) => CONFIDENT.has(item.confidence)) })
      : null,
    el("button", { class: "tool", text: "Clear", onclick: () => choose(() => false) }),
  );
}

function planCard({ id, kind, tone, iconName, title, blurb, items, selected, row, tools = true }) {
  const expanded = state.expanded[kind];
  const shown = expanded ? items : items.slice(0, PREVIEW_ROWS);
  const hidden = items.length - shown.length;
  return el(
    "section",
    { class: "card", id, "aria-labelledby": `${id}-title` },
    el(
      "header",
      { class: "card-head" },
      el("span", { class: `icon-badge${tone ? ` is-${tone}` : ""}` }, icon(iconName, 20)),
      el("div", {}, el("h3", { id: `${id}-title` }, title, el("span", { class: "count", text: String(items.length) })), el("p", { text: blurb })),
      tools ? selectionTools(items, selected, () => refreshCard(kind)) : null,
    ),
    el("ul", { class: "rows" }, shown.map(row)),
    hidden > 0 || (expanded && items.length > PREVIEW_ROWS)
      ? el("button", {
          class: "more",
          text: expanded ? "Show fewer" : `Show ${hidden} more`,
          onclick: () => {
            state.expanded[kind] = !expanded;
            refreshCard(kind);
          },
        })
      : null,
  );
}

function quietCard({ id, tone, iconName, title, blurb, open = false }, ...content) {
  const details = el(
    "details",
    { class: "card", id },
    el(
      "summary",
      {},
      el("span", { class: `icon-badge${tone ? ` is-${tone}` : ""}` }, icon(iconName, 20)),
      el("div", {}, el("h3", { text: title }), el("p", { text: blurb })),
      el("span", { class: "chevron" }, icon("chevron", 20)),
    ),
    ...content,
  );
  details.open = open;
  return details;
}

// ---------------------------------------------------------------- cards

function movesCard() {
  const { moves, barRootId } = state.plan;
  if (!moves.length) return null;
  return planCard({
    id: "sec-moves",
    kind: "moves",
    iconName: "folder",
    title: "Move into folders",
    blurb: "These aren't in a folder yet. I matched each one to a folder you already have, or suggested a new one.",
    items: moves,
    selected: state.moves,
    row: (item) =>
      planRow(item, state.moves, {
        toNode: folderChipEl(item.to.path, "to", { isNew: !!item.to.newFolder }),
        why: describeWhy(item.why),
        extra:
          item.fromParentId === barRootId
            ? el("button", { class: "textbtn keep", text: "Keep on bar", title: "It's a shortcut I click to open. Don't move it.", onclick: () => keepOnBar(item.url) })
            : null,
      }),
  });
}

function reviewCard() {
  const { review } = state.plan;
  if (!review.length) return null;
  return planCard({
    id: "sec-review",
    kind: "review",
    tone: "warn",
    iconName: "swap",
    title: "Might be in the wrong folder",
    blurb: "These are in a folder, but they look like they belong somewhere else. Skip any you disagree with.",
    items: review,
    selected: state.review,
    row: (item) =>
      planRow(item, state.review, {
        toNode: folderChipEl(item.to.path, "to"),
        why: describeWhy(item.why),
        extra: el("button", { class: "textbtn keep", text: "Keep it here", onclick: () => keepHere(item) }),
      }),
  });
}

function orderCard() {
  const items = state.plan.orderOps;
  if (!items.length) return null;
  return planCard({
    id: "sec-order",
    kind: "order",
    iconName: "top",
    title: "Put what you use most at the top",
    blurb: "The bookmarks and folders you open most, moved to the top of where they are. Everything else keeps its order, with the newest at the bottom.",
    items,
    selected: state.orderOps,
    row: (item) =>
      item.kind === "promote"
        ? planRow(item, state.orderOps, {
            fromNode: placeChip(item.path[item.path.length - 1], `#${item.position} of ${item.size}`, "from"),
            toNode: placeChip("Top of the folder", null, "to", "top"),
            labels: ["Now", "Move to"],
            why: describeWhy(item.why),
            inline: true,
          })
        : planRow(item, state.orderOps, {
            cell: folderCell(item.title, "Folder"),
            fromNode: placeChip(item.title, `#${item.position} of ${item.size} folders`, "from"),
            toNode: placeChip("First of its folders", null, "to", "top"),
            labels: ["Now", "Move to"],
            why: describeWhy(item.why),
            inline: true,
          }),
  });
}

function archiveCard() {
  const items = state.plan.archive;
  if (!items.length) return null;
  return planCard({
    id: "sec-archive",
    kind: "archive",
    iconName: "archive",
    title: "Rarely used: tuck away in Archive",
    blurb: "Saved over a year ago and not opened since, as far as Chrome can tell. They'd go in an Archive folder under Other bookmarks, off your bar. Nothing is deleted, and none of these are ticked for you.",
    items,
    selected: state.archive,
    row: (item) =>
      planRow(item, state.archive, {
        toNode: folderChipEl(item.to.path, "to", { isNew: !!item.to.newFolder }),
        why: describeWhy(item.why),
        inline: true,
        extra: el("button", { class: "textbtn keep", text: "Keep it here", onclick: () => keepHere(item) }),
      }),
  });
}

function historyCard() {
  const h = state.history;
  if (!h.available || !h.checked || h.granted) return null;
  return quietCard(
    { id: "sec-history", iconName: "sparkle", title: "Find what you use most", blurb: "Chrome only knows when a bookmark was last opened. Allow history and I can count visits too.", open: true },
    el("p", { class: "note", text: "I'd count how often you visited each bookmarked page in the last 3 months. It happens on this computer, nothing is stored or sent anywhere, and you can turn it off any time." }),
    el("div", { class: "note-actions" }, el("button", { class: "btn btn-primary btn-small", text: "Allow and use my history", onclick: allowHistory })),
  );
}

function foldersCard() {
  const items = state.plan.folderOps;
  if (!items.length) return null;
  const actions = { delete: "Delete empty folder", merge: "Merge folders", rename: "Rename folder" };
  return planCard({
    id: "sec-folders",
    kind: "folders",
    iconName: "folder",
    title: "Tidy your folders",
    blurb: "Empty folders, duplicates and folders without a clear name. Merging moves everything inside into the folder that stays.",
    items,
    selected: state.folderOps,
    row: (item) => {
      const from = item.kind === "merge" ? item.fromPath : item.path;
      const toNode =
        item.kind === "delete"
          ? el("span", { class: "chip remove" }, icon("trash", 15), el("span", { class: "name", text: "Delete this folder" }))
          : folderChipEl(item.kind === "merge" ? item.toPath : [...item.path.slice(0, -1), item.toTitle], "to");
      const row = el("li", { class: `row${state.folderOps.has(item.id) ? " is-selected" : ""}` });
      const labels = { delete: ["Empty folder", "Action"], merge: ["This folder", "Merge into"], rename: ["Now called", "Rename to"] }[item.kind];
      const { button, panel } = explain(describeWhy(item.why));
      row.append(
        checkbox(state.folderOps.has(item.id), `Select: ${actions[item.kind]} ${from[from.length - 1]}`, (on) => {
          if (on) state.folderOps.add(item.id);
          else state.folderOps.delete(item.id);
          row.classList.toggle("is-selected", on);
          updateBar();
        }),
        el(
          "div",
          { class: "site" },
          el("span", { class: "avatar", style: "--h:215", "aria-hidden": "true" }, icon("folder", 18)),
          el("div", { class: "site-text" }, el("div", { class: "title", text: actions[item.kind] }), el("div", { class: "url", text: item.count ? plural(item.count, "item") : "Nothing inside" })),
        ),
        route(from, toNode, labels),
        el("div", { class: "meta" }, sure(item.confidence), button),
        panel,
      );
      return row;
    },
  });
}

function dupsCard() {
  const items = duplicateRows();
  if (!items.length) return null;
  return planCard({
    id: "sec-dups",
    kind: "dups",
    tone: "bad",
    iconName: "copy",
    title: "Duplicates",
    blurb: "You saved these more than once. I'd keep the earliest copy and remove the rest.",
    items,
    selected: state.removals,
    row: (item) =>
      planRow(item, state.removals, {
        toNode: el("span", { class: "chip remove" }, icon("trash", 15), el("span", { class: "name", text: "Remove this copy" })),
        why: describeWhy({ type: "duplicate", keepFolder: item.keepPath[item.keepPath.length - 1] }),
        labels: ["Now in", "Action"],
        showSure: false,
      }),
  });
}

function shortcutsCard() {
  const { quickAccess } = state.plan;
  if (!quickAccess.length) return null;
  return quietCard(
    {
      id: "sec-shortcuts",
      tone: "good",
      iconName: "shield",
      title: "Your shortcuts stay put",
      blurb: `${plural(quickAccess.length, "bookmark")} on your bar that you click to open, like Gmail or ChatGPT. I won't move them.`,
    },
    el(
      "ul",
      { class: "rows" },
      quickAccess.map(({ bookmark, reason }) =>
        el(
          "li",
          { class: "row simple" },
          siteCell(bookmark),
          el("p", { class: "why" }, el("span", { text: shortcutWhy(reason) }), el("button", { class: "textbtn", text: "Tidy this one too", onclick: () => organizeAnyway(bookmark.url) })),
        ),
      ),
    ),
  );
}

function unsureCard() {
  const { unclassified } = state.plan;
  if (!unclassified.length) return null;
  return quietCard(
    {
      id: "sec-unsure",
      iconName: "inbox",
      title: "Couldn't place",
      blurb: `${plural(unclassified.length, "bookmark")} I wasn't sure about, so I left alone.`,
    },
    el(
      "ul",
      { class: "rows" },
      unclassified.map(({ bookmark, why }) => el("li", { class: "row simple" }, siteCell(bookmark), el("p", { class: "why", text: describeWhy(why) }))),
    ),
  );
}

// The page appears right away using word matching; once the bundled model has been read the
// plan is redone with it. If the model can't be read, everything keeps working without it.
async function startModel() {
  const started = performance.now();
  try {
    state.model.embedder = await loadEmbedder();
    state.model.status = "ready";
    state.model.seconds = (performance.now() - started) / 1000;
  } catch {
    state.model.status = "failed";
  }
  if (state.model.embedder && state.smartMatching) await load();
  else render();
}

async function startHistory() {
  const h = state.history;
  if (!h.available) return;
  h.granted = !!chrome.history && (await chrome.permissions.contains({ permissions: ["history"] }));
  h.checked = true;
  if (!h.granted) {
    render();
    return;
  }
  const { bookmarks } = flatten(await chrome.bookmarks.getTree());
  h.visits = await loadVisits(chrome.history, bookmarks.map((b) => b.url));
  await load();
}

// Called straight from a click, because Chrome only shows its permission prompt for a user action.
async function allowHistory() {
  const ok = await chrome.permissions.request({ permissions: ["history"] });
  if (!ok) return toast("No problem. I won't look at your history.");
  toast("Counting your visits...");
  await startHistory();
}

async function stopHistory() {
  await chrome.permissions.remove({ permissions: ["history"] });
  Object.assign(state.history, { granted: false, visits: null });
  await load();
}

async function setSmartMatching(on) {
  await chrome.storage.local.set({ smartMatching: on });
  await load();
}

function smartMatchingFact() {
  const { status } = state.model;
  if (status === "loading") return el("li", { text: "Smart matching is getting ready. This takes a moment, and the list may grow when it's done." });
  if (status === "failed") return el("li", { text: "Smart matching isn't available right now, so I'm only comparing websites and words." });
  return el(
    "li",
    {},
    state.smartMatching
      ? "Smart matching is on: I also understand what a page is about, so a pasta recipe belongs with your recipes even if no word is shared. It knows everyday topics well, but not newer or very specific products. "
      : "Smart matching is off, so I only compare websites and words. ",
    el("button", { class: "textbtn", text: state.smartMatching ? "Turn it off" : "Turn it on", onclick: () => setSmartMatching(!state.smartMatching) }),
  );
}

function usageFacts() {
  const u = state.plan.usage;
  const facts = [
    el("li", { text: `Chrome knows when ${u.withDate} of your ${u.total} bookmarks were last opened${state.history.visits ? ", and I count your visits from the last 3 months" : ""}. I use that to find what you use most.` }),
  ];
  if (!u.archiveReady) facts.push(el("li", { text: "There aren't enough last-opened dates yet to tell what's unused, so I won't suggest an Archive." }));
  if (state.history.granted) {
    facts.push(el("li", {}, "I'm using your browsing history, on this computer only. ", el("button", { class: "textbtn", text: "Stop using it", onclick: stopHistory })));
  }
  return facts;
}

function aboutCard() {
  const d = state.plan.diagnostics;
  const facts = [
    "I learn from how you already organize. I compare each bookmark with what's in your folders.",
    "Everything is worked out on your computer. Nothing is uploaded anywhere.",
  ];
  if (d.foldersWithEnoughBookmarks) {
    facts.push(
      `${d.foldersJudged} of ${plural(d.foldersWithEnoughBookmarks, "folder")} with 4 or more bookmarks were clear enough for me to check. In a practice run I put ${percent(d.accuracy)} of their bookmarks back in the right folder on my own.`,
    );
  }
  if (d.noTarget) facts.push(`${plural(d.noTarget, "bookmark")} looked out of place, but no other folder fit, so I left ${d.noTarget === 1 ? "it" : "them"} alone.`);
  if (d.mixed.length) {
    const names = d.mixed.slice(0, 8).map((m) => m.path.split("/").pop());
    facts.push(`I couldn't check ${names.join(", ")}${d.mixed.length > 8 ? ` and ${d.mixed.length - 8} more` : ""}, because the bookmarks in ${d.mixed.length === 1 ? "it don't" : "them don't"} look alike.`);
  }
  return quietCard(
    { id: "sec-about", iconName: "info", title: "How I decide", blurb: "A quick look at how these suggestions are made." },
    el("ul", { class: "facts" }, [...facts.slice(0, 2).map((text) => el("li", { text })), smartMatchingFact(), ...usageFacts(), ...facts.slice(2).map((text) => el("li", { text }))]),
  );
}

function bannerNode() {
  const run = state.lastRun;
  if (!run) return null;
  const moved = run.moved.length - (run.carried ?? 0) - (run.reordered ?? 0);
  const removed = run.removed.length;
  const parts = [
    moved ? plural(moved, "bookmark moved", "bookmarks moved") : null,
    run.reordered ? plural(run.reordered, "item moved to the top", "items moved to the top") : null,
    run.merged ? plural(run.merged, "folder merged", "folders merged") : null,
    run.renamed?.length ? plural(run.renamed.length, "folder renamed", "folders renamed") : null,
    run.deleted ? plural(run.deleted, "empty folder deleted", "empty folders deleted") : null,
    removed ? plural(removed, "duplicate removed", "duplicates removed") : null,
  ].filter(Boolean);
  return el(
    "div",
    { class: "banner", role: "status" },
    el("span", { class: "banner-icon" }, icon("check", 18, 3)),
    el(
      "div",
      { class: "banner-text" },
      state.justApplied
        ? [el("strong", { text: "All done. " }), `${parts.join(", ")}.`]
        : [el("strong", { text: "Last tidy-up: " }), `${parts.join(", ")}, on ${new Date(run.time).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}.`],
    ),
    el("button", { class: "btn btn-quiet btn-small", onclick: undo }, icon("undo", 15), "Undo"),
  );
}

function heroNode() {
  const s = state.plan.summary;
  const total = changeCount();
  const stats = el(
    "div",
    { class: "stats" },
    [
      [s.bookmarks, "bookmarks"],
      [s.folders, "folders"],
      [s.quickAccess, "shortcuts kept safe"],
    ].map(([value, label]) => el("div", { class: "stat" }, el("strong", { text: String(value) }), el("span", { text: label }))),
  );
  if (!total) {
    return el(
      "section",
      { class: "hero hero-tidy" },
      el("span", { class: "big-check" }, icon("check", 32, 3)),
      el("div", {}, el("p", { class: "eyebrow", text: "All good" }), el("h2", { text: "Your bookmarks look tidy" }), el("p", { class: "lead", text: "I didn't find anything to move or remove. Come back after you've saved a few more." }), el("div", { class: "hero-actions" }, stats)),
    );
  }
  return el(
    "section",
    { class: "hero" },
    el(
      "div",
      {},
      el("p", { class: "eyebrow", text: "Your bookmarks" }),
      el("h2", {}, "I found ", el("em", { text: String(total) }), ` ${total === 1 ? "thing" : "things"} to tidy up`),
      el("p", { class: "lead", text: "Here's what I'd change. Nothing happens until you say so, and you can undo it afterwards." }),
      el(
        "div",
        { class: "hero-actions" },
        el("button", { class: "btn btn-primary btn-lg", id: "tidyAllBtn", onclick: tidyEverything }, icon("sparkle", 18), "Tidy up everything"),
        el("button", { class: "textbtn", text: "Let me review first", onclick: () => document.querySelector("#app .card")?.scrollIntoView({ behavior: "smooth", block: "start" }) }),
      ),
    ),
    stats,
  );
}

// ---------------------------------------------------------------- rendering

const CARD_BUILDERS = { moves: movesCard, review: reviewCard, order: orderCard, folders: foldersCard, archive: archiveCard, dups: dupsCard };
const CARD_IDS = { moves: "sec-moves", review: "sec-review", order: "sec-order", folders: "sec-folders", archive: "sec-archive", dups: "sec-dups" };

// Re-render one card after a bulk change so the page doesn't jump or collapse other cards.
function refreshCard(kind) {
  const old = $(CARD_IDS[kind]);
  const next = CARD_BUILDERS[kind]();
  if (old && next) old.replaceWith(next);
}

function render() {
  $("demoBadge").hidden = !isDemo;
  $("app").replaceChildren(
    ...[bannerNode(), heroNode(), historyCard(), movesCard(), reviewCard(), orderCard(), foldersCard(), dupsCard(), archiveCard(), shortcutsCard(), unsureCard(), aboutCard()].filter(Boolean),
  );
  updateBar();
}

function updateBar() {
  const bar = $("actionbar");
  bar.hidden = changeCount() === 0;
  const moves = selectedMoves().length;
  const removals = state.removals.size;
  const folders = selectedFolderOps().length;
  const ordered = selectedOrderOps().length;
  const total = moves + removals + folders + ordered;
  const detail = [
    moves ? `Moving ${plural(moves, "bookmark")}` : null,
    ordered ? `${moves ? "reordering" : "Reordering"} ${plural(ordered, "item")}` : null,
    folders ? `${moves ? "changing" : "Changing"} ${plural(folders, "folder")}` : null,
    removals ? `${moves || folders ? "removing" : "Removing"} ${plural(removals, "duplicate")}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  $("selection").replaceChildren(
    total ? `${plural(total, "change")} selected` : "Nothing selected yet",
    el("small", { text: total ? detail : "Tick what you'd like me to do" }),
  );
  $("applyBtn").disabled = state.busy || total === 0;
}

// ---------------------------------------------------------------- actions

function selectEverything(on) {
  state.moves = new Set(on ? state.plan.moves.map((m) => m.id) : []);
  state.review = new Set(on ? state.plan.review.map((r) => r.id) : []);
  state.folderOps = new Set(on ? state.plan.folderOps.map((op) => op.id) : []);
  state.orderOps = new Set(on ? state.plan.orderOps.map((op) => op.id) : []);
  // Archive is the one thing "select everything" leaves for the user to tick on purpose.
  if (!on) state.archive = new Set();
  state.removals = new Set(on ? duplicateRows().map((d) => d.id) : []);
  for (const kind of Object.keys(CARD_BUILDERS)) refreshCard(kind);
  updateBar();
}

function tidyEverything() {
  selectEverything(true);
  return apply();
}

function confirmTidy(moves, removeIds, folderOps, orderOps) {
  const newFolders = new Set(moves.filter((m) => m.to.newFolder).map((m) => m.to.path.join("›")));
  const lines = [];
  const archived = moves.filter((m) => state.plan.archive.includes(m));
  const filed = moves.filter((m) => !state.plan.review.includes(m) && !archived.includes(m));
  const misplaced = moves.length - filed.length - archived.length;
  const count = (kind) => folderOps.filter((op) => op.kind === kind).length;
  if (filed.length) lines.push(`Move ${plural(filed.length, "bookmark")} into folders`);
  if (misplaced) lines.push(`Move ${plural(misplaced, "bookmark")} to a better folder`);
  if (newFolders.size) lines.push(`Create ${plural(newFolders.size, "new folder")}`);
  if (orderOps.length) lines.push(`Move ${plural(orderOps.length, "of your most-used bookmark or folder", "of your most-used bookmarks and folders")} to the top`);
  if (archived.length) lines.push(`Move ${plural(archived.length, "rarely used bookmark")} to Archive`);
  if (count("merge")) lines.push(`Merge ${plural(count("merge"), "folder")} into another (everything inside moves with it)`);
  if (count("rename")) lines.push(`Rename ${plural(count("rename"), "folder")}`);
  if (count("delete")) lines.push(`Delete ${plural(count("delete"), "empty folder")}`);
  if (removeIds.length) lines.push(`Remove ${plural(removeIds.length, "duplicate copy", "duplicate copies")}`);
  $("confirmList").replaceChildren(...lines.map((text) => el("li", {}, icon("check", 18, 2.5), text)));

  const dialog = $("confirmDialog");
  return new Promise((resolve) => {
    dialog.returnValue = "";
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "ok"), { once: true });
    dialog.showModal();
  });
}

async function apply() {
  if (state.busy) return;
  const moves = selectedMoves();
  const removeIds = [...state.removals];
  const folderOps = selectedFolderOps();
  const orderOps = selectedOrderOps();
  if (!moves.length && !removeIds.length && !folderOps.length && !orderOps.length) return;
  if (!(await confirmTidy(moves, removeIds, folderOps, orderOps))) return;

  state.busy = true;
  updateBar();
  const result = await applyPlan(chrome.bookmarks, { moves, removeIds, folderOps, orderOps });
  const done = result.moved + result.removed + result.merged + result.deleted + result.renamed + result.reordered;
  if (done > 0) await chrome.storage.local.set({ lastRun: result.undo });
  state.busy = false;
  state.justApplied = done > 0;
  await load();
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (result.error) toast(`I stopped early (${result.error}). You can undo what was done.`, "error");
  else if (!state.justApplied) toast("Nothing needed to change.");
}

async function undo() {
  const { lastRun } = await chrome.storage.local.get("lastRun");
  if (!lastRun) return;
  const { errors } = await undoRun(chrome.bookmarks, lastRun);
  await chrome.storage.local.remove("lastRun");
  state.justApplied = false;
  await load();
  if (errors.length) toast(`Mostly restored, but ${plural(errors.length, "thing")} couldn't be put back.`, "error");
  else toast("Everything is back where it was.");
}

$("applyBtn").addEventListener("click", apply);
$("selectAllBtn").addEventListener("click", () => selectEverything(true));
$("clearAllBtn").addEventListener("click", () => selectEverything(false));

// Close the confirm panel with Esc or by clicking outside it, not only with its buttons.
const confirmDialog = $("confirmDialog");
confirmDialog.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    confirmDialog.close("cancel");
  }
});
confirmDialog.addEventListener("click", (event) => {
  const box = confirmDialog.getBoundingClientRect();
  const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  if (outside) confirmDialog.close("cancel");
});
await load();
startModel();
startHistory();
