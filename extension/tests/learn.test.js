import assert from "node:assert/strict";
import { test } from "node:test";

import { createMemoryBookmarks } from "../src/memory-bookmarks.js";
import { buildPlan } from "../src/planner.js";

const bm = (title, url) => ({ title, url });
const folder = (title, children = []) => ({ title, children });

async function planFor(barChildren, options) {
  const api = createMemoryBookmarks([
    { id: "1", title: "Bookmarks bar", children: barChildren },
    { id: "2", title: "Other bookmarks", children: [] },
  ]);
  return buildPlan(await api.getTree(), options);
}

// Work-style folders on internal sites that no built-in category list knows about.
const atlas = () =>
  folder("Project Atlas", [
    bm("Atlas roadmap 2027", "https://wiki.corp.example/atlas/roadmap"),
    bm("Atlas design review notes", "https://wiki.corp.example/atlas/design-review"),
    bm("ATLAS-12 payment retries", "https://jira.corp.example/browse/ATLAS-12"),
    bm("Atlas launch plan", "https://wiki.corp.example/atlas/launch-plan"),
    bm("Atlas dashboard", "https://grafana.corp.example/d/atlas-overview"),
  ]);
const onboarding = () =>
  folder("Onboarding", [
    bm("Benefits enrollment guide", "https://hr.corp.example/benefits/enroll"),
    bm("Payroll and direct deposit", "https://hr.corp.example/payroll/deposit"),
    bm("Laptop setup checklist", "https://it.corp.example/setup/laptop"),
    bm("Org chart and who to ask", "https://hr.corp.example/people/org-chart"),
    bm("Benefits claims form", "https://hr.corp.example/benefits/claims"),
  ]);

test("a bookmark that fits another folder better is flagged, on sites with no known category", async () => {
  const misfiled = bm("Atlas launch checklist", "https://wiki.corp.example/atlas/launch-checklist");
  const ob = onboarding();
  ob.children.push(misfiled);
  const plan = await planFor([atlas(), ob]);

  const flagged = plan.review.find((r) => r.title === "Atlas launch checklist");
  assert.ok(flagged, "the misfiled bookmark should be flagged");
  assert.equal(flagged.to.label, "Bookmarks bar/Project Atlas");
  assert.match(flagged.reason, /similar to/i);
  assert.equal(plan.review.length, 1, "nothing else should be flagged");
  assert.equal(plan.moves.length, 0, "review items are never part of the default moves");
});

test("well-filed folders produce no flags", async () => {
  const plan = await planFor([atlas(), onboarding()]);
  assert.equal(plan.review.length, 0);
});

test("a folder that mixes unrelated things is not judged, and is listed as such", async () => {
  const stuff = folder("Misc stuff", [
    bm("Chicken soup", "https://food.example.org/soup"),
    bm("Tax filing deadlines", "https://tax.example.gov/dates"),
    bm("Hiking trails near me", "https://trails.example.com/near"),
    bm("Guitar chords", "https://music.example.net/chords"),
    bm("Atlas launch checklist", "https://wiki.corp.example/atlas/launch-checklist"),
  ]);
  const plan = await planFor([atlas(), onboarding(), stuff]);
  assert.equal(plan.review.length, 0);
  assert.deepEqual(plan.diagnostics.mixed.map((m) => m.path), ["Bookmarks bar/Misc stuff"]);
});

test("a loose bookmark is placed in the folder it resembles, even on a different host", async () => {
  const plan = await planFor([atlas(), onboarding(), bm("Atlas retro notes from Friday", "https://docs.corp.example/atlas/retro")]);
  const move = plan.moves.find((m) => m.title.startsWith("Atlas retro"));
  assert.equal(move.to.label, "Bookmarks bar/Project Atlas");
  assert.match(move.reason, /similar to/i);
});

test("a loose bookmark that resembles nothing is left alone", async () => {
  const plan = await planFor([atlas(), onboarding(), bm("Sourdough starter tips", "https://bread.example.org/tips")]);
  assert.equal(plan.moves.length, 0);
});

test("keep-here answers apply to learned flags too", async () => {
  const misfiled = bm("Atlas launch checklist", "https://wiki.corp.example/atlas/launch-checklist");
  const ob = onboarding();
  ob.children.push(misfiled);
  const first = await planFor([atlas(), ob]);
  const item = first.review[0];
  const { dismissKey } = await import("../src/planner.js");
  const dismissed = new Set([dismissKey({ url: item.url, parentId: item.fromParentId })]);
  const ob2 = onboarding();
  ob2.children.push(misfiled);
  assert.equal((await planFor([atlas(), ob2], { dismissed })).review.length, 0);
});

test("diagnostics explain how much of the library could be judged", async () => {
  const { diagnostics } = await planFor([atlas(), onboarding()]);
  assert.equal(diagnostics.foldersJudged, 2);
  assert.equal(diagnostics.bookmarksInJudged, 10);
  // Real folders are never perfectly coherent: a few pages share too little with their neighbours.
  assert.ok(diagnostics.accuracy >= 0.6 && diagnostics.accuracy <= 1, `accuracy was ${diagnostics.accuracy}`);
});
