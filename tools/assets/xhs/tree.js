// Runs the real planner on the fictional demo library and returns the bookmarks bar before and
// after. The 小红书 images draw from this, so what they show is what the app really does.
import { applyPlan } from "../../../extension/src/apply.js";
import { installDemo } from "../../../extension/src/demo.js";
import { loadEmbedder } from "../../../extension/src/model-loader.js";
import { buildPlan } from "../../../extension/src/planner.js";

const describe = (node) => ({
  title: node.title,
  folder: node.children !== undefined,
  count: node.children?.filter((c) => c.url !== undefined).length ?? 0,
});

async function snapshot() {
  const [top] = await chrome.bookmarks.getTree();
  const [bar, other] = top.children;
  return { bar: bar.children.map(describe), other: other.children.map(describe) };
}

export async function beforeAfter() {
  installDemo();
  const before = await snapshot();
  const embedder = await loadEmbedder();
  const plan = buildPlan(await chrome.bookmarks.getTree(), { embedder });
  const removeIds = plan.duplicates.flatMap((group) => group.slice(1).map((b) => b.id));
  await applyPlan(chrome.bookmarks, { moves: [...plan.moves, ...plan.review], removeIds, folderOps: plan.folderOps, orderOps: plan.orderOps });
  const after = await snapshot();
  return { before, after, plan };
}
