import assert from "node:assert/strict";
import { test } from "node:test";

import { applyPlan, undoRun } from "../src/apply.js";
import { createMemoryBookmarks } from "../src/memory-bookmarks.js";
import { buildPlan, dismissKey, flatten, normalizeUrl } from "../src/planner.js";
import { quickAccessReason } from "../src/quickaccess.js";

const bm = (title, url) => ({ title, url });
const folder = (title, children = []) => ({ title, children });

const makeApi = (barChildren, otherChildren = []) =>
  createMemoryBookmarks([
    { id: "1", title: "Bookmarks bar", children: barChildren },
    { id: "2", title: "Other bookmarks", children: otherChildren },
  ]);

async function planFor(barChildren, otherChildren = [], options) {
  return buildPlan(await makeApi(barChildren, otherChildren).getTree(), options);
}

const devFolder = folder("Dev", [
  bm("a", "https://github.com/a/a"),
  bm("b", "https://github.com/b/b"),
]);

// ---- quick access -------------------------------------------------------

test("shortcuts on the bookmarks bar are left alone", async () => {
  const shortcuts = [
    bm("Gmail", "https://mail.google.com/mail/u/0/#inbox"),
    bm("ChatGPT", "https://chatgpt.com/"),
    bm("", "https://example.com/tool/page"),
    bm("Bookmarklet", "javascript:void(0)"),
    bm("Reddit", "https://www.reddit.com/"),
    bm("Calendar", "https://calendar.google.com/calendar/u/0/r"),
  ];
  const plan = await planFor([devFolder, ...shortcuts]);
  assert.equal(plan.moves.length, 0);
  assert.equal(plan.quickAccess.length, shortcuts.length);
  assert.equal(plan.summary.quickAccess, shortcuts.length);
});

test("a deep content page on the bar is still organized", async () => {
  const plan = await planFor([devFolder, bm("Interesting article about compilers", "https://github.com/org/compilers")]);
  assert.equal(plan.quickAccess.length, 0);
  assert.equal(plan.moves.length, 1);
});

test("a saved ChatGPT conversation is not a shortcut, the ChatGPT entry page is", () => {
  assert.equal(quickAccessReason(bm("Trip planning chat", "https://chatgpt.com/c/abc-123")), null);
  assert.match(quickAccessReason(bm("ChatGPT", "https://chatgpt.com/")), /Web app/);
});

test("only the bookmarks bar is protected, loose items elsewhere are still organized", async () => {
  const plan = await planFor([], [bm("Gmail", "https://mail.google.com/mail/u/0/")]);
  assert.equal(plan.quickAccess.length, 0);
});

test("the user can pin an item, or override the rules and organize it anyway", async () => {
  const article = bm("Interesting article about compilers", "https://github.com/org/compilers");
  const pinned = await planFor([devFolder, article], [], { pinned: new Set([normalizeUrl(article.url)]) });
  assert.equal(pinned.moves.length, 0);
  assert.equal(pinned.quickAccess[0].reason, "Kept on the bar by you");

  const gmail = bm("Gmail", "https://mail.google.com/mail/u/0/#inbox");
  const forced = await planFor([gmail], [], { organizeAnyway: new Set([normalizeUrl(gmail.url)]) });
  assert.equal(forced.quickAccess.length, 0);
});

// ---- misplaced bookmarks ------------------------------------------------

const buy = () =>
  folder("Buy", [
    bm("Earbuds", "https://www.amazon.ca/dp/1"),
    bm("Desk", "https://www.ebay.com/itm/2"),
    bm("Mug", "https://www.etsy.com/listing/3"),
    bm("Lamp", "https://www.walmart.ca/ip/4"),
    bm("Documentary series", "https://www.netflix.com/title/5"),
  ]);
const watch = () =>
  folder("Watch", [
    bm("Lo-fi", "https://www.youtube.com/watch?v=1"),
    bm("Anime", "https://www.bilibili.com/video/2"),
    bm("Stream", "https://www.twitch.tv/3"),
  ]);

test("a video site inside a shopping folder is flagged, with the video folder as the target", async () => {
  const plan = await planFor([buy(), watch()]);
  assert.equal(plan.review.length, 1);
  const [item] = plan.review;
  assert.equal(item.title, "Documentary series");
  assert.equal(item.to.label, "Bookmarks bar/Watch");
  assert.equal(item.confidence, "medium");
  assert.match(item.reason, /netflix\.com looks like Video & Entertainment/);
  assert.equal(plan.moves.length, 0); // review items are suggestions, never part of the default moves
});

test("a flag with no better folder is counted but not listed, since there is nothing to act on", async () => {
  const plan = await planFor([buy()]);
  assert.equal(plan.review.length, 0);
  assert.equal(plan.diagnostics.noTarget, 1);
});

test("mixed folders organized by purpose are not judged", async () => {
  const plan = await planFor([
    folder("Trip to Tokyo", [
      bm("Flights", "https://www.skyscanner.com/x"),
      bm("Hotel", "https://www.booking.com/y"),
      bm("Ramen map", "https://tabelog.com/z"),
      bm("Backpack", "https://www.amazon.ca/dp/9"),
      bm("Phrasebook video", "https://www.youtube.com/watch?v=9"),
    ]),
  ]);
  assert.equal(plan.review.length, 0);
});

test("a site the folder already contains is never flagged", async () => {
  const plan = await planFor([
    folder("Buy", [
      bm("A", "https://www.amazon.ca/dp/1"),
      bm("B", "https://www.ebay.com/itm/2"),
      bm("C", "https://www.etsy.com/listing/3"),
      bm("D", "https://www.walmart.ca/ip/4"),
      bm("E", "https://www.youtube.com/watch?v=1"),
      bm("F", "https://www.youtube.com/watch?v=2"),
    ]),
  ]);
  // youtube appears twice here, so neither copy looks out of place on its own site
  assert.equal(plan.review.length, 0);
});

test("holding folders like Read later are never judged", async () => {
  const plan = await planFor([
    folder("Read later", [
      bm("A", "https://www.amazon.ca/dp/1"),
      bm("B", "https://www.ebay.com/itm/2"),
      bm("C", "https://www.etsy.com/listing/3"),
      bm("D", "https://www.walmart.ca/ip/4"),
      bm("E", "https://www.netflix.com/title/5"),
    ]),
  ]);
  assert.equal(plan.review.length, 0);
});

test("a loose shopping site goes to the folder that mostly holds shopping, whatever it is called", async () => {
  const plan = await planFor([
    buy(),
    watch(),
    bm("Standing desk with a long descriptive title", "https://www.costco.ca/desk/standing-desk-9"),
  ]);
  const move = plan.moves.find((m) => m.title.startsWith("Standing desk"));
  assert.equal(move.to.label, "Bookmarks bar/Buy");
  assert.equal(move.confidence, "medium");
  assert.equal(plan.moves.filter((m) => m.to.newFolder).length, 0);
});

test("keep-here decisions are remembered", async () => {
  const [item] = (await planFor([buy(), watch()])).review;
  const dismissed = new Set([dismissKey({ url: item.url, parentId: item.fromParentId })]);
  assert.equal((await planFor([buy(), watch()], [], { dismissed })).review.length, 0);
});

test("accepting a review suggestion moves it, and undo puts it back", async () => {
  const api = makeApi([buy(), watch()]);
  const before = flatten(await api.getTree()).bookmarks.map((b) => `${b.path.join("/")}:${b.title}`).sort();
  const plan = buildPlan(await api.getTree());
  const result = await applyPlan(api, { moves: plan.review.filter((r) => r.to) });
  assert.equal(result.moved, 1);
  const moved = flatten(await api.getTree()).bookmarks.find((b) => b.title === "Documentary series");
  assert.deepEqual(moved.path, ["Bookmarks bar", "Watch"]);

  await undoRun(api, result.undo);
  const after = flatten(await api.getTree()).bookmarks.map((b) => `${b.path.join("/")}:${b.title}`).sort();
  assert.deepEqual(after, before);
});
