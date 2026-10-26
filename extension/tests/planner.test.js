import assert from "node:assert/strict";
import { test } from "node:test";

import { categorize } from "../src/categories.js";
import { createMemoryBookmarks } from "../src/memory-bookmarks.js";
import { baseDomain, buildPlan, findDuplicates, flatten, normalizeUrl } from "../src/planner.js";

const bm = (title, url, extra = {}) => ({ title, url, ...extra });
const folder = (title, children = []) => ({ title, children });

async function planFor(barChildren, otherChildren = [], options) {
  const api = createMemoryBookmarks([
    { id: "1", title: "Bookmarks bar", children: barChildren },
    { id: "2", title: "Other bookmarks", children: otherChildren },
  ]);
  return buildPlan(await api.getTree(), options);
}

test("normalizeUrl ignores tracking params, www, fragment and trailing slash", () => {
  assert.equal(
    normalizeUrl("https://www.Example.com/a/?utm_source=x&b=2#frag"),
    normalizeUrl("https://example.com/a?b=2"),
  );
});

test("categorize matches whole domain labels only", () => {
  assert.equal(categorize("https://www.netflix.com/browse"), "Video & Entertainment");
  assert.equal(categorize("https://x.com/home"), "Social");
  assert.equal(categorize("https://www.amazon.ca/dp/1"), "Shopping");
  assert.equal(categorize("https://notamazon.example.org"), null);
  assert.equal(categorize("https://www.linkedin.com/jobs/view/1"), "Careers");
  assert.equal(categorize("not a url"), null);
});

test("a loose bookmark follows the folder that already holds its site", async () => {
  const plan = await planFor([
    folder("Dev", [bm("a", "https://github.com/a"), bm("b", "https://github.com/b")]),
    bm("loose repo", "https://github.com/c"),
  ]);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].to.label, "Bookmarks bar/Dev");
  assert.equal(plan.moves[0].confidence, "high");
});

test("already filed bookmarks are never moved", async () => {
  const plan = await planFor([folder("Dev", [bm("a", "https://github.com/a")]), folder("Misc", [bm("b", "https://github.com/b")])]);
  assert.equal(plan.moves.length, 0);
});

test("a new folder needs at least two bookmarks, singletons stay unclassified", async () => {
  const plan = await planFor([
    bm("Item", "https://www.amazon.ca/dp/1"),
    bm("Item 2", "https://www.amazon.com/dp/2"),
    bm("Movie", "https://www.netflix.com/title/1"),
  ]);
  const targets = plan.moves.map((m) => m.to.label);
  assert.deepEqual(targets, ["Bookmarks bar/Shopping", "Bookmarks bar/Shopping"]);
  assert.ok(plan.moves.every((m) => m.to.folderId === null && m.confidence === "low"));
  assert.deepEqual(plan.unclassified.map((u) => u.bookmark.title), ["Movie"]);
});

test("title matching handles plurals against existing folder names", async () => {
  const plan = await planFor([folder("Recipe", [bm("x", "https://food.example.com/x")]), bm("Best pasta recipes", "https://pasta.example.org")]);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].to.label, "Bookmarks bar/Recipe");
});

test("non-ASCII folder names match by substring", async () => {
  const plan = await planFor([folder("购物", [bm("x", "https://shop.example.cn/x")]), bm("双十一购物清单", "https://list.example.org")]);
  assert.equal(plan.moves[0].to.label, "Bookmarks bar/购物");
});

test("a category reuses an existing folder with the same name", async () => {
  const plan = await planFor([folder("Shopping", []), bm("Item", "https://www.amazon.ca/dp/1")]);
  assert.equal(plan.moves[0].to.label, "Bookmarks bar/Shopping");
  assert.ok(plan.moves[0].to.folderId);
});

test("base-domain learning is conservative: shared platforms and a couple of siblings are not enough", async () => {
  const plan = await planFor([
    folder("Work", [bm("a", "https://docs.google.com/a"), bm("b", "https://drive.google.com/b")]),
    bm("A map", "https://maps.google.com/place"),
    folder("Recipes", [bm("x", "https://bread.example.org/x"), bm("y", "https://soup.example.org/y")]),
    bm("Wedding photos", "https://photos.example.org/album"),
  ]);
  assert.equal(plan.moves.length, 0);
});

test("base-domain learning still works with strong evidence, at medium confidence", async () => {
  const plan = await planFor([
    folder("Team", [bm("1", "https://a.corp.example/1"), bm("2", "https://b.corp.example/2"), bm("3", "https://c.corp.example/3")]),
    bm("New tool", "https://d.corp.example/4"),
  ]);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].to.label, "Bookmarks bar/Team");
  assert.equal(plan.moves[0].confidence, "medium");
});

test("baseDomain keeps the registrable part for two-level suffixes", () => {
  assert.equal(baseDomain("news.bbc.co.uk"), "bbc.co.uk");
  assert.equal(baseDomain("bbc.co.uk"), "bbc.co.uk");
  assert.equal(baseDomain("shop.example.com.cn"), "example.com.cn");
  assert.equal(baseDomain("mail.google.com"), "google.com");
  assert.equal(baseDomain("example.com"), "example.com");
});

test("sites under different .co.uk domains are not treated as one site", async () => {
  const plan = await planFor([
    folder("News", [bm("1", "https://www.bbc.co.uk/1"), bm("2", "https://www.bbc.co.uk/2"), bm("3", "https://www.bbc.co.uk/3")]),
    bm("A shop", "https://www.shop.co.uk/item"),
  ]);
  assert.equal(plan.moves.length, 0);
});

test("duplicates are grouped after normalizing, earliest first", async () => {
  const api = createMemoryBookmarks([
    {
      id: "1",
      title: "Bookmarks bar",
      children: [
        bm("later", "https://example.com/a/?utm_source=z", { dateAdded: 2000 }),
        bm("earlier", "https://example.com/a", { dateAdded: 1000 }),
        bm("unique", "https://example.com/b", { dateAdded: 3000 }),
      ],
    },
  ]);
  const groups = findDuplicates(flatten(await api.getTree()).bookmarks);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map((b) => b.title), ["earlier", "later"]);
});
