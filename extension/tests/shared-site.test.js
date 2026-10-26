// Regression tests for false alarms where a shared website, not a shared topic, made a
// bookmark look like it belonged in another folder. The structure mirrors a real report:
// topic folders (Contract, GitHub Copilot, Power Automate) beside a SharePoint folder, with
// several folders holding links on the same company sites. Names here are fictional.
import assert from "node:assert/strict";
import { test } from "node:test";

import { createMemoryBookmarks } from "../src/memory-bookmarks.js";
import { buildPlan } from "../src/planner.js";

const bm = (title, url) => ({ title, url });
const folder = (title, children = []) => ({ title, children });

function workspace(extra = {}) {
  const sp = "https://contoso.sharepoint.com/sites";
  return [
    folder("App Explore", [
      folder("SharePoint", [
        bm("Research home", `${sp}/ResearchHome/SitePages/Home.aspx`),
        bm("Differences between team sites and hubs", `${sp}/ResearchHome/Shared%20Documents/Sites.docx`),
        bm("Operations hub overview", `${sp}/OpsHub/SitePages/Home.aspx`),
        bm("contoso.sharepoint.com/sites/ResearchRepor...", `${sp}/ResearchReports/Reports`),
        bm("contoso.sharepoint.com/sites/Intranet/SitePages...", `${sp}/Intranet/SitePages/Team.aspx`),
        bm("Sharing guidelines", `${sp}/Intranet/Shared%20Documents/Sharing.pdf`),
      ]),
      folder("Contract", [
        bm("Vendor NDA request form - Service Portal", "https://contoso.service-now.com/sp?id=sc_cat_item&sys_id=a1"),
        bm("New contract request - Service Portal", "https://contoso.service-now.com/sp?id=sc_cat_item&sys_id=b2"),
        bm("Vendor agreement form - Service Portal", "https://contoso.service-now.com/sp?id=sc_cat_item&sys_id=c3"),
        bm("Contract Templates", "https://contoso.sharepoint.com/sites/Legal/Templates"),
        bm("Signing authority matrix", "https://contoso.sharepoint.com/sites/Legal/Matrix"),
        ...(extra.contract ?? []),
      ]),
      folder("GitHub Copilot", [
        bm("Copilot in VS Code docs", "https://github.com/features/copilot"),
        bm("GitHub Copilot Chat", "https://github.com/features/copilot/chat"),
        bm("Copilot extensions", "https://github.com/features/copilot/extensions"),
        bm("Copilot Workspace preview", "https://github.com/features/copilot/workspace"),
        bm("Copilot coding agent", "https://github.com/features/copilot/agent"),
        ...(extra.copilot ?? []),
      ]),
      folder("Power Automate", [
        bm("Power Automate cloud flows", "https://learn.microsoft.com/power-automate/get-started"),
        bm("Power Automate desktop flows", "https://learn.microsoft.com/power-automate/desktop-flows"),
        bm("Flow connectors reference", "https://learn.microsoft.com/connectors/connector-reference"),
        bm("Approvals in Power Automate", "https://learn.microsoft.com/power-automate/approvals"),
        bm("Power Automate admin center", "https://admin.powerplatform.microsoft.com/environments"),
        ...(extra.automate ?? []),
      ]),
    ]),
  ];
}

async function planFor(children) {
  const api = createMemoryBookmarks([
    { id: "1", title: "Bookmarks bar", children },
    { id: "2", title: "Other bookmarks", children: [] },
  ]);
  return buildPlan(await api.getTree());
}

const flaggedTitles = (plan) => plan.review.map((r) => r.title);

test("a link whose title is just a web address stays in its specific folder", async () => {
  const plan = await planFor(
    workspace({
      contract: [bm("contoso.sharepoint.com/sites/Governance/Shared%20Documents/Forms", "https://contoso.sharepoint.com/sites/Governance/Shared%20Documents/Forms")],
    }),
  );
  assert.deepEqual(flaggedTitles(plan), []);
});

test("sharing a company website with another folder is not a reason to move a bookmark there", async () => {
  const plan = await planFor(
    workspace({ copilot: [bm("The Falcon Team", "https://contoso.sharepoint.com/sites/Falcon")] }),
  );
  assert.deepEqual(flaggedTitles(plan), []);
});

test("sharing a service portal with another folder is not a reason to move a bookmark there", async () => {
  const plan = await planFor(
    workspace({ automate: [bm("Copilot Studio learning hub for Microsoft 365", "https://contoso.service-now.com/kb?id=kb_article_view&sys_kb_id=d4")] }),
  );
  assert.deepEqual(flaggedTitles(plan), []);
});

test("all three together produce no suggestions at all", async () => {
  const plan = await planFor(
    workspace({
      contract: [bm("contoso.sharepoint.com/sites/Governance/Forms", "https://contoso.sharepoint.com/sites/Governance/Forms")],
      copilot: [bm("The Falcon Team", "https://contoso.sharepoint.com/sites/Falcon")],
      automate: [bm("Copilot Studio learning hub for Microsoft 365", "https://contoso.service-now.com/kb?id=d4")],
    }),
  );
  assert.equal(plan.review.length, 0);
  assert.equal(plan.moves.length, 0);
});

test("a real topic mismatch on the same company site is still caught, because the words agree", async () => {
  const plan = await planFor(
    workspace({
      contract: [bm("Power Automate cloud flow tips and connectors", "https://contoso.sharepoint.com/sites/Automation/flows")],
    }),
  );
  const hit = plan.review.find((r) => r.title.startsWith("Power Automate cloud flow tips"));
  assert.ok(hit, "a bookmark about Power Automate sitting in Contract should be flagged");
  assert.deepEqual(hit.to.path.slice(-1), ["Power Automate"]);
  assert.match(hit.reason, /Power Automate/);
});

test("living on the same sub-site as its folder is a good reason to stay", async () => {
  const plan = await planFor(
    workspace({
      contract: [bm("Power Automate cloud flow tips and connectors", "https://contoso.sharepoint.com/sites/Legal/flows")],
    }),
  );
  assert.deepEqual(flaggedTitles(plan), []);
});
