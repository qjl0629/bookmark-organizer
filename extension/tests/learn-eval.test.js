// Regression guard on randomized but seeded data: eight topic folders on internal sites,
// some bookmarks deliberately filed in the wrong folder. Not real data; it checks that the
// folder-learning mechanism keeps catching misfiled bookmarks and stays fast.
import assert from "node:assert/strict";
import { test } from "node:test";

import { createMemoryBookmarks } from "../src/memory-bookmarks.js";
import { buildPlan } from "../src/planner.js";

const TOPICS = {
  Atlas: ["atlas", "roadmap", "release", "design", "metrics", "payments", "retry", "launch", "review", "backend"],
  Hiring: ["interview", "candidate", "offer", "recruiter", "resume", "panel", "scorecard", "headcount", "job", "posting"],
  Finance: ["budget", "forecast", "invoice", "expense", "quarter", "revenue", "audit", "payroll", "tax", "ledger"],
  Learning: ["course", "tutorial", "lecture", "python", "statistics", "notes", "exercise", "reading", "lesson", "guide"],
  Travel: ["flight", "hotel", "itinerary", "visa", "tokyo", "booking", "train", "map", "museum", "tour"],
  Health: ["clinic", "insurance", "claim", "appointment", "pharmacy", "benefits", "dental", "wellness", "coverage"],
  Design: ["figma", "mockup", "palette", "typography", "icon", "prototype", "spacing", "brand", "wireframe"],
  Ops: ["runbook", "oncall", "alert", "deploy", "pipeline", "cluster", "logs", "dashboard", "capacity"],
};
const GENERIC = ["guide", "overview", "notes", "team", "2026", "update", "new", "tips", "best", "how", "docs"];
const SHARED_HOSTS = ["github.com", "docs.google.com", "youtube.com", "notion.so"];

function random(seed) {
  let state = seed >>> 0;
  return () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

function scenario({ perFolder, planted, seed = 7 }) {
  const rand = random(seed);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const make = (topic) => {
    const words = Array.from({ length: 3 + Math.floor(rand() * 3) }, () => (rand() < 0.75 ? pick(TOPICS[topic]) : pick(GENERIC)));
    const host = rand() < 0.7 ? `${topic.toLowerCase()}${1 + Math.floor(rand() * 3)}.corp.example` : pick(SHARED_HOSTS);
    const path = rand() < 0.6 ? `/${pick(TOPICS[topic])}/${pick(TOPICS[topic])}-${Math.floor(rand() * 999)}` : `/${Math.floor(rand() * 99999)}`;
    return { title: words.join(" "), url: `https://${host}${path}` };
  };
  const names = Object.keys(TOPICS);
  const folders = Object.fromEntries(names.map((t) => [t, Array.from({ length: perFolder }, () => make(t))]));
  const truth = new Map();
  for (let k = 0; k < planted; k++) {
    const from = names[k % names.length];
    const to = names[(k + 3) % names.length];
    const item = folders[from].shift();
    item.title = `PLANTED ${k} ${item.title}`;
    truth.set(item.title, from);
    folders[to].push(item);
  }
  const api = createMemoryBookmarks([
    { id: "1", title: "Bookmarks bar", children: names.map((t) => ({ title: t, children: folders[t] })) },
    { id: "2", title: "Other bookmarks", children: [] },
  ]);
  return { api, truth };
}

async function run(options) {
  const { api, truth } = scenario(options);
  const started = performance.now();
  const plan = buildPlan(await api.getTree());
  const elapsed = performance.now() - started;
  const real = plan.review.filter((r) => truth.has(r.title));
  const rightTarget = real.filter((r) => r.to.label.endsWith(`/${truth.get(r.title)}`));
  const high = plan.review.filter((r) => r.confidence === "high");
  return { plan, real, rightTarget, high, highReal: high.filter((r) => truth.has(r.title)), elapsed };
}

test("catches most misfiled bookmarks in a mid-sized library, and high confidence is trustworthy", async () => {
  const { real, rightTarget, high, highReal, elapsed } = await run({ perFolder: 25, planted: 12 });
  assert.ok(real.length >= 7, `caught ${real.length} of 12`);
  assert.ok(rightTarget.length >= 6, `right target for ${rightTarget.length}`);
  assert.ok(high.length > 0 && highReal.length / high.length >= 0.75, `high confidence precision ${highReal.length}/${high.length}`);
  assert.ok(elapsed < 1000, `took ${elapsed}ms`);
});

test("scales to a large library without turning noisy", async () => {
  const { plan, real, elapsed } = await run({ perFolder: 60, planted: 20 });
  assert.ok(real.length >= 14, `caught ${real.length} of 20`);
  assert.ok(plan.review.length - real.length <= 3, `${plan.review.length - real.length} false positives`);
  assert.ok(elapsed < 1000, `took ${elapsed}ms`);
});

test("nothing is pre-selected: review items are separate from the default moves", async () => {
  const { plan } = await run({ perFolder: 25, planted: 12 });
  assert.equal(plan.moves.length, 0);
});
