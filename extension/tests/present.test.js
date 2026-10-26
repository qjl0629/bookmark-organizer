import assert from "node:assert/strict";
import { test } from "node:test";

import { createMemoryBookmarks } from "../src/memory-bookmarks.js";
import { buildPlan } from "../src/planner.js";
import { avatarHue, avatarLetter, describeWhy, folderChip, kindPhrase, shorten } from "../src/present.js";

const bm = (title, url) => ({ title, url });
const folder = (title, children = []) => ({ title, children });

test("each kind of reason reads as a plain sentence", () => {
  assert.equal(describeWhy({ type: "sameSite", host: "github.com", count: 3, total: 5, folder: "Dev" }), "You keep 3 of your 5 github.com bookmarks in “Dev”.");
  assert.equal(describeWhy({ type: "sameSite", host: "github.com", count: 4, total: 4, folder: "Dev" }), "Your other github.com bookmarks are in “Dev”.");
  assert.equal(describeWhy({ type: "folderName", folder: "Recipes" }), "Its title or website matches your “Recipes” folder.");
  assert.equal(describeWhy({ type: "kindFolder", category: "Shopping", folder: "Buy" }), "Your “Buy” folder is mostly shopping sites, like this one.");
  assert.equal(describeWhy({ type: "similar", titles: ["Atlas plan", "Atlas roadmap"], folder: "Project Atlas" }), "Looks a lot like your “Atlas plan” and “Atlas roadmap” in “Project Atlas”.");
  assert.equal(describeWhy({ type: "similar", titles: [], folder: "Project Atlas" }), "Looks similar to what's in “Project Atlas”.");
  assert.equal(describeWhy({ type: "newFolder", category: "Travel" }), "Looks like travel sites. I'd start a new “Travel” folder for these.");
  assert.match(describeWhy({ type: "otherKind", host: "netflix.com", category: "Video & Entertainment", ownKind: "Shopping", ownFolder: "Buy", folder: "Watch" }), /netflix\.com looks like a video or entertainment site, but most of “Buy” is shopping sites\. “Watch” is a better home\./);
  assert.match(describeWhy({ type: "duplicate", keepFolder: "Dev" }), /earlier copy in “Dev”/);
  assert.equal(describeWhy(undefined), "");
});

test("long titles are shortened inside sentences", () => {
  const long = "A".repeat(100);
  assert.ok(shorten(long).length <= 42);
  assert.ok(describeWhy({ type: "similar", titles: [long], folder: "F" }).length < 120);
});

test("folder chips name the folder and only add where it lives when that helps", () => {
  assert.deepEqual(folderChip(["Bookmarks bar"]), { name: "Bookmarks bar", hint: "not in a folder", isRoot: true, isNew: false, full: "Bookmarks bar" });
  assert.equal(folderChip(["Bookmarks bar", "Dev"]).hint, "");
  assert.equal(folderChip(["Bookmarks bar", "App Explore", "Copilot"]).name, "Copilot");
  assert.equal(folderChip(["Bookmarks bar", "App Explore", "Copilot"]).hint, "in App Explore");
  assert.equal(folderChip(["Bookmarks bar", "Travel"], { isNew: true }).isNew, true);
  // folder names containing a slash stay intact because paths are arrays, not joined strings
  assert.equal(folderChip(["Bookmarks bar", "Work/Home"]).name, "Work/Home");
});

test("avatar letters and colours are stable", () => {
  assert.equal(avatarLetter("Gmail", "mail.google.com"), "M");
  assert.equal(avatarLetter("", "www.amazon.ca"), "A");
  assert.equal(avatarLetter("双十一", ""), "双");
  assert.equal(avatarLetter("", ""), "?");
  assert.equal(avatarHue("github.com"), avatarHue("github.com"));
  assert.notEqual(avatarHue("github.com"), avatarHue("amazon.ca"));
  assert.ok(avatarHue("x.com") >= 0 && avatarHue("x.com") < 360);
});

test("kind phrases fall back gracefully for unknown categories", () => {
  assert.equal(kindPhrase("Shopping"), "shopping sites");
  assert.equal(kindPhrase("Gardening"), "gardening sites");
});

// Every suggestion the planner can make must carry a reason that reads as plain English.
test("every planned suggestion has a plain-language reason, with no paths or jargon", async () => {
  const api = createMemoryBookmarks([
    {
      id: "1",
      title: "Bookmarks bar",
      children: [
        folder("Dev", [bm("a", "https://github.com/a/a"), bm("b", "https://github.com/b/b")]),
        folder("Recipes", [bm("Soup", "https://food.example.com/soup")]),
        folder("Buy", [bm("A", "https://www.amazon.ca/dp/1"), bm("B", "https://www.ebay.com/itm/2"), bm("C", "https://www.etsy.com/l/3"), bm("D", "https://www.walmart.ca/ip/4"), bm("Documentary", "https://www.netflix.com/title/5")]),
        folder("Watch", [bm("Lo-fi", "https://www.youtube.com/watch?v=1"), bm("Anime", "https://www.bilibili.com/video/2"), bm("Stream", "https://www.twitch.tv/3")]),
        folder("Project Atlas", [bm("Atlas roadmap", "https://wiki.corp.example/atlas/roadmap"), bm("Atlas design", "https://wiki.corp.example/atlas/design"), bm("Atlas launch", "https://wiki.corp.example/atlas/launch"), bm("Atlas retry", "https://jira.corp.example/browse/ATLAS-1")]),
        bm("Another repo about compilers", "https://github.com/org/compilers"),
        bm("Best pasta recipes", "https://pasta.example.org/best"),
        bm("Earbuds on sale", "https://www.costco.ca/earbuds/12"),
        bm("Atlas retro from Friday", "https://docs.corp.example/atlas/retro"),
        bm("Flights to Tokyo", "https://www.skyscanner.com/flights/1"),
        bm("Tokyo hotels", "https://www.booking.com/city/tokyo"),
      ],
    },
    { id: "2", title: "Other bookmarks", children: [] },
  ]);
  const plan = buildPlan(await api.getTree());
  const items = [...plan.moves, ...plan.review];
  assert.ok(items.length >= 5, `only ${items.length} suggestions to check`);
  for (const item of items) {
    const sentence = describeWhy(item.why);
    assert.ok(sentence.length > 10, `no sentence for ${item.title}: ${JSON.stringify(item.why)}`);
    assert.doesNotMatch(sentence, /\w\/\w/, `looks like a path: ${sentence}`);
    assert.doesNotMatch(sentence, /undefined|null|NaN|\[object/, sentence);
    assert.doesNotMatch(sentence, /score|cosine|TF-IDF|similarity/i, sentence);
    assert.ok(Array.isArray(item.to.path) && item.to.path.length >= 2, `destination path missing for ${item.title}`);
  }
});
