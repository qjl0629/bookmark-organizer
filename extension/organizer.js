import { applyPlan, undoRun } from "./src/apply.js";
import { buildPlan, dismissKey, hostOf, normalizeUrl } from "./src/planner.js";

// Outside Chrome (previews, screenshots) fall back to fictional demo data.
const isDemo = !globalThis.chrome?.bookmarks;
if (isDemo) (await import("./src/demo.js")).installDemo();

const $ = (id) => document.getElementById(id);
const state = { plan: null, moves: new Set(), review: new Set(), removals: new Set(), seenMoves: new Set(), busy: false };

// All bookmark text is inserted as text nodes, never as HTML. Empty children (null, false)
// are skipped, otherwise append() would print the word "null".
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, "");
    else if (value !== false && value != null) node.setAttribute(key, value);
  }
  node.append(...children.flat(Infinity).filter((child) => child != null && child !== false));
  return node;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const copies = (n, prefix = "") => `${n} ${prefix}cop${n === 1 ? "y" : "ies"}`;

// Re-rendering a section after a bulk change must not collapse groups the user has opened.
const openGroups = (root) =>
  new Set([...root.querySelectorAll("details")].filter((d) => d.open).map((d) => d.querySelector(".group-name")?.textContent));
const isOpen = (open, label, fallback) => (open ? open.has(label) : fallback);

// "Select all" / "High & medium only" / "Clear" for one section. `items` need an id, and a
// confidence when the middle button should be offered.
const CONFIDENT = new Set(["high", "medium"]);
function selectionTools(items, selected, refresh) {
  const choose = (pick) => {
    for (const item of items) {
      if (pick(item)) selected.add(item.id);
      else selected.delete(item.id);
    }
    refresh();
    updateFooter();
  };
  const confident = items.filter((item) => CONFIDENT.has(item.confidence)).length;
  return el(
    "div",
    { class: "tools" },
    el("button", { class: "tool", text: `Select all (${items.length})`, onclick: () => choose(() => true) }),
    confident > 0 && confident < items.length
      ? el("button", { class: "tool", text: `High & medium only (${confident})`, onclick: () => choose((item) => CONFIDENT.has(item.confidence)) })
      : null,
    el("button", { class: "tool", text: "Clear", onclick: () => choose(() => false) }),
  );
}

function setStatus(text, kind = "") {
  const node = $("status");
  node.textContent = text;
  node.className = kind;
}

// Choices the user made, remembered across runs: shortcuts to keep on the bar, items to
// organize even though they look like shortcuts, and "keep here" answers for review items.
const SETTING_KEYS = ["pinned", "organizeAnyway", "dismissed"];

async function readSettings() {
  const stored = await chrome.storage.local.get(SETTING_KEYS);
  return Object.fromEntries(SETTING_KEYS.map((key) => [key, new Set(stored[key] ?? [])]));
}

async function changeSettings(mutate) {
  const settings = await readSettings();
  mutate(settings);
  await chrome.storage.local.set(Object.fromEntries(SETTING_KEYS.map((key) => [key, [...settings[key]]])));
  await load();
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

async function load() {
  const settings = await readSettings();
  state.plan = buildPlan(await chrome.bookmarks.getTree(), settings);
  // Keep the user's ticks across reloads; moves that appear for the first time start selected.
  const previous = state.moves;
  const seen = state.seenMoves;
  state.moves = new Set(state.plan.moves.filter((m) => !seen.has(m.id) || previous.has(m.id)).map((m) => m.id));
  state.seenMoves = new Set(state.plan.moves.map((m) => m.id));
  state.review = new Set([...state.review].filter((id) => state.plan.review.some((r) => r.id === id)));
  state.removals = new Set();
  render();
  await renderUndo();
}

function render() {
  $("demoBadge").hidden = !isDemo;
  renderStats();
  renderMoves();
  renderReview();
  renderDuplicates();
  renderQuickAccess();
  renderUnclassified();
  renderDiagnostics();
  updateFooter();
}

const percent = (value) => `${Math.round(value * 100)}%`;

// Explains how many bookmarks could actually be judged, so a short list isn't a mystery.
function renderDiagnostics() {
  const d = state.plan.diagnostics;
  const root = $("diag");
  const inFolders = state.plan.summary.bookmarks - state.plan.summary.loose;
  if (!d.foldersWithEnoughBookmarks) {
    root.replaceChildren(el("p", { class: "empty", text: "Not enough bookmarks in folders to learn from yet. Folders need at least 4 bookmarks." }));
    return;
  }
  const lines = [
    `${plural(inFolders, "bookmark")} sit inside folders. ${d.foldersJudged} of ${d.foldersWithEnoughBookmarks} folders with 4 or more bookmarks are clear enough to check by content (${plural(d.bookmarksInJudged, "bookmark")}).`,
    `As a test, I hid each bookmark in turn and guessed its folder from the rest: right ${percent(d.accuracy)} of the time. A folder where I'm right less than half the time is not checked by content, because its bookmarks don't resemble each other.`,
  ];
  if (d.noTarget) lines.push(`${plural(d.noTarget, "bookmark")} looked out of place but no other folder fits, so nothing is suggested for them.`);
  root.replaceChildren(
    ...lines.map((text) => el("p", { text })),
    d.mixed.length
      ? el(
          "details",
          { class: "group" },
          el("summary", {}, el("span", { class: "group-name", text: "Folders not checked by content (bookmarks look unrelated to each other)" }), el("span", { class: "count", text: plural(d.mixed.length, "folder") })),
          d.mixed.map((m) =>
            el("div", { class: "row keep" }, el("span", {}), el("span", { class: "title", text: m.path }), el("span", { class: "host", text: `${plural(m.size, "bookmark")}, ${percent(m.coherence)} recognizable` }), el("span", { class: "badge low", text: "skipped" })),
          ),
        )
      : null,
  );
}

function renderStats() {
  const s = state.plan.summary;
  const items = [
    ["Bookmarks", s.bookmarks],
    ["Folders", s.folders],
    ["Loose", s.loose],
    ["Quick access (kept)", s.quickAccess],
    ["Proposed moves", s.moves],
    ["To review", s.review],
    ["Duplicate groups", s.duplicateGroups],
  ];
  $("stats").replaceChildren(
    ...items.map(([label, value]) => el("div", { class: "stat" }, el("strong", { text: String(value) }), el("span", { text: label }))),
  );
}

function moveRow(move, onChange) {
  const box = el("input", { type: "checkbox" });
  box.checked = state.moves.has(move.id);
  box.addEventListener("change", () => {
    if (box.checked) state.moves.add(move.id);
    else state.moves.delete(move.id);
    onChange();
    updateFooter();
  });
  const reason = el("span", { class: "reason" }, move.reason);
  if (move.fromParentId === state.plan.barRootId) {
    reason.append(
      el("button", {
        class: "link",
        text: "Keep on bar",
        title: "This is a shortcut I click to use. Don't move it.",
        onclick: (event) => {
          event.preventDefault();
          keepOnBar(move.url);
        },
      }),
    );
  }
  const row = el(
    "label",
    { class: "row" },
    box,
    el("span", { class: "title", text: move.title || move.url, title: move.url }),
    el("span", { class: "host", text: hostOf(move.url) }),
    el("span", { class: `badge ${move.confidence}`, text: move.confidence }),
    reason,
  );
  return { row, box };
}

function moveGroup(group, open) {
  const ids = group.moves.map((m) => m.id);
  const all = el("input", { type: "checkbox", "aria-label": `Select all moves to ${group.label}` });
  all.addEventListener("click", (event) => event.stopPropagation()); // don't toggle the <details>
  const sync = () => {
    const selected = ids.filter((id) => state.moves.has(id)).length;
    all.checked = selected === ids.length;
    all.indeterminate = selected > 0 && selected < ids.length;
  };
  const rows = group.moves.map((move) => moveRow(move, sync));
  all.addEventListener("change", () => {
    ids.forEach((id) => (all.checked ? state.moves.add(id) : state.moves.delete(id)));
    rows.forEach(({ box }) => (box.checked = all.checked));
    updateFooter();
  });
  sync();
  return el(
    "details",
    { class: "group", open },
    el(
      "summary",
      {},
      all,
      el("span", { class: "group-name", text: group.label }),
      group.isNew ? el("span", { class: "badge new", text: "new folder" }) : null,
      el("span", { class: "count", text: plural(ids.length, "bookmark") }),
    ),
    rows.map(({ row }) => row),
  );
}

function renderMoves(open = null) {
  const { moves } = state.plan;
  if (!moves.length) {
    $("moves").replaceChildren(el("p", { class: "empty", text: "Nothing to move. No loose bookmark matched one of your folders or a known category." }));
    return;
  }
  const groups = new Map();
  for (const move of moves) {
    if (!groups.has(move.to.label)) groups.set(move.to.label, { label: move.to.label, isNew: !move.to.folderId, moves: [] });
    groups.get(move.to.label).moves.push(move);
  }
  $("moves").replaceChildren(
    selectionTools(moves, state.moves, () => renderMoves(openGroups($("moves")))),
    ...[...groups.values()].map((group, index) => moveGroup(group, isOpen(open, group.label, index < 6))),
  );
}

function renderDuplicates(open = null) {
  const { duplicates } = state.plan;
  const root = $("dups");
  if (!duplicates.length) {
    root.replaceChildren(el("p", { class: "empty", text: "No duplicates found." }));
    return;
  }
  const extras = duplicates.flatMap((group) => group.slice(1).map((b) => ({ id: b.id })));
  const items = duplicates.map((group) => {
    const label = group[0].title || group[0].url;
    return el(
      "details",
      { class: "group", open: isOpen(open, label, true) },
      el("summary", {}, el("span", { class: "group-name", text: label }), el("span", { class: "count", text: copies(group.length) })),
      group.map((bookmark, index) => {
        if (index === 0) {
          return el("div", { class: "row keep" }, el("span", {}), el("span", { class: "title", text: bookmark.path.join("/") }), el("span", { class: "host", text: "earliest, kept" }), el("span", { class: "badge high", text: "keep" }));
        }
        const box = el("input", { type: "checkbox" });
        box.checked = state.removals.has(bookmark.id);
        box.addEventListener("change", () => {
          if (box.checked) state.removals.add(bookmark.id);
          else state.removals.delete(bookmark.id);
          updateFooter();
        });
        return el("label", { class: "row" }, box, el("span", { class: "title", text: bookmark.path.join("/") }), el("span", { class: "host", text: "extra copy" }), el("span", { class: "badge low", text: "remove" }));
      }),
    );
  });
  root.replaceChildren(selectionTools(extras, state.removals, () => renderDuplicates(openGroups($("dups")))), ...items);
}

function renderUnclassified() {
  const { unclassified } = state.plan;
  const root = $("unclassified");
  if (!unclassified.length) {
    root.replaceChildren(el("p", { class: "empty", text: "Every loose bookmark has a proposal." }));
    return;
  }
  root.replaceChildren(
    el(
      "details",
      { class: "group" },
      el("summary", {}, el("span", { class: "group-name", text: "Loose bookmarks with no proposal" }), el("span", { class: "count", text: plural(unclassified.length, "bookmark") })),
      unclassified.map(({ bookmark, reason }) =>
        el("div", { class: "row keep" }, el("span", {}), el("span", { class: "title", text: bookmark.title || bookmark.url, title: bookmark.url }), el("span", { class: "host", text: hostOf(bookmark.url) }), el("span", { class: "badge low", text: "left alone" }), el("span", { class: "reason", text: reason })),
      ),
    ),
  );
}

function renderReview(open = null) {
  const { review } = state.plan;
  const root = $("review");
  if (!review.length) {
    root.replaceChildren(el("p", { class: "empty", text: "Nothing looks out of place." }));
    return;
  }
  const title = "Bookmarks that may be in the wrong folder";
  root.replaceChildren(
    selectionTools(review, state.review, () => renderReview(openGroups($("review")))),
    el(
      "details",
      { class: "group", open: isOpen(open, title, true) },
      el("summary", {}, el("span", { class: "group-name", text: title }), el("span", { class: "count", text: plural(review.length, "bookmark") })),
      review.map((item) => {
        const keep = el("button", { class: "link", text: "Keep here", onclick: (event) => { event.preventDefault(); keepHere(item); } });
        const reason = el("span", { class: "reason" }, item.reason, keep);
        const label = el("span", { class: "host", text: `${item.fromPath.join("/")}  →  ${item.to.label}` });
        const box = el("input", { type: "checkbox" });
        box.checked = state.review.has(item.id);
        box.addEventListener("change", () => {
          if (box.checked) state.review.add(item.id);
          else state.review.delete(item.id);
          updateFooter();
        });
        return el("label", { class: "row" }, box, el("span", { class: "title", text: item.title || item.url, title: item.url }), label, el("span", { class: `badge ${item.confidence}`, text: item.confidence }), reason);
      }),
    ),
  );
}

function renderQuickAccess() {
  const { quickAccess } = state.plan;
  const root = $("quick");
  if (!quickAccess.length) {
    root.replaceChildren(el("p", { class: "empty", text: "No shortcuts detected on the bookmarks bar." }));
    return;
  }
  root.replaceChildren(
    el(
      "details",
      { class: "group" },
      el("summary", {}, el("span", { class: "group-name", text: "Shortcuts kept where they are" }), el("span", { class: "count", text: plural(quickAccess.length, "bookmark") })),
      quickAccess.map(({ bookmark, reason }) =>
        el(
          "div",
          { class: "row keep" },
          el("span", {}),
          el("span", { class: "title", text: bookmark.title || bookmark.url, title: bookmark.url }),
          el("span", { class: "host", text: hostOf(bookmark.url) }),
          el("span", { class: "badge high", text: "kept" }),
          el("span", { class: "reason" }, reason, el("button", { class: "link", text: "Organize it anyway", onclick: () => organizeAnyway(bookmark.url) })),
        ),
      ),
    ),
  );
}

function updateFooter() {
  const moves = state.moves.size + state.review.size;
  const removals = state.removals.size;
  $("selection").textContent = `${plural(moves, "move")} and ${plural(removals, "duplicate removal")} selected`;
  $("applyBtn").disabled = state.busy || moves + removals === 0;
}

// One click for everything in every section. Undo restores it all.
function selectEverything(on) {
  const extras = state.plan.duplicates.flatMap((group) => group.slice(1).map((b) => b.id));
  state.moves = new Set(on ? state.plan.moves.map((m) => m.id) : []);
  state.review = new Set(on ? state.plan.review.map((r) => r.id) : []);
  state.removals = new Set(on ? extras : []);
  renderMoves(openGroups($("moves")));
  renderReview(openGroups($("review")));
  renderDuplicates(openGroups($("dups")));
  updateFooter();
}

async function renderUndo() {
  const { lastRun } = await chrome.storage.local.get("lastRun");
  const banner = $("undoBanner");
  banner.hidden = !lastRun;
  if (!lastRun) return;
  banner.replaceChildren(
    el("span", { text: `Last run ${new Date(lastRun.time).toLocaleString()}: ${lastRun.moved.length} moved, ${lastRun.removed.length} removed. Undo restores the original positions.` }),
    el("button", { text: "Undo last run", onclick: undo }),
  );
}

async function apply() {
  const moves = [
    ...state.plan.moves.filter((m) => state.moves.has(m.id)),
    ...state.plan.review.filter((r) => r.to && state.review.has(r.id)),
  ];
  const removeIds = [...state.removals];
  if (!confirm(`Move ${plural(moves.length, "bookmark")} and remove ${plural(removeIds.length, "duplicate")}?\n\nYou can undo this afterwards.`)) return;
  state.busy = true;
  updateFooter();
  const result = await applyPlan(chrome.bookmarks, { moves, removeIds });
  if (result.moved + result.removed > 0) await chrome.storage.local.set({ lastRun: result.undo });
  state.busy = false;
  const summary = `Moved ${result.moved}, removed ${result.removed}, skipped ${result.skipped}.`;
  await load();
  if (result.error) setStatus(`${summary} Stopped early: ${result.error}. Use "Undo last run" to restore.`, "error");
  else setStatus(summary, "ok");
}

async function undo() {
  const { lastRun } = await chrome.storage.local.get("lastRun");
  if (!lastRun || !confirm("Undo the last run and restore the original positions?")) return;
  const { errors } = await undoRun(chrome.bookmarks, lastRun);
  await chrome.storage.local.remove("lastRun");
  await load();
  if (errors.length) setStatus(`Undone with ${errors.length} problem(s): ${errors[0]}`, "error");
  else setStatus("Restored the original positions.", "ok");
}

$("applyBtn").addEventListener("click", apply);
$("selectAllBtn").addEventListener("click", () => selectEverything(true));
$("clearAllBtn").addEventListener("click", () => selectEverything(false));
await load();
