// A fictional but realistic bookmark library used to measure the organizer. Everything here is
// invented: ordinary public websites for everyday topics, plus a small made-up workplace
// (contoso) with several folders that share the same internal sites.
//
// `planted` lists bookmarks deliberately filed in the wrong folder (title -> the folder they
// belong in). `loose` lists unfiled bookmarks and where a person would put them. `decoys`
// are bookmarks that look odd to a machine but are correctly filed and must stay put.

const sp = "https://contoso.sharepoint.com/sites";
const sn = "https://contoso.service-now.com";

const FOLDERS = {
  Recipes: [
    ["Easy weeknight chicken curry", "https://www.bbcgoodfood.com/recipes/easy-chicken-curry"],
    ["Sourdough bread for beginners", "https://www.kingarthurbaking.com/recipes/beginners-sourdough"],
    ["Best chocolate chip cookies", "https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/"],
    ["15-minute garlic noodles", "https://www.seriouseats.com/garlic-noodles"],
    ["Vegetarian chili with black beans", "https://cookieandkate.com/vegetarian-chili/"],
    ["How to cook perfect rice", "https://www.simplyrecipes.com/how-to-cook-rice/"],
    ["Homemade pizza dough", "https://www.jamieoliver.com/recipes/pizza-dough"],
    ["Weekly meal prep ideas", "https://www.budgetbytes.com/meal-prep-ideas/"],
    ["Mapo tofu authentic recipe", "https://www.chinasichuanfood.com/mapo-tofu/"],
    ["Banana bread with walnuts", "https://www.foodnetwork.com/recipes/banana-bread"],
  ],
  Travel: [
    ["Tokyo 5-day itinerary", "https://www.lonelyplanet.com/japan/tokyo/itineraries"],
    ["Cheap flights Vancouver to Tokyo", "https://www.skyscanner.ca/routes/yvr/tyoa"],
    ["Best hotels in Kyoto", "https://www.booking.com/city/jp/kyoto.html"],
    ["Japan Rail Pass guide", "https://www.japan-guide.com/e/e2361.html"],
    ["Osaka street food tour", "https://www.tripadvisor.com/Attraction_Review-Osaka"],
    ["Visa requirements for Japan", "https://www.ca.emb-japan.go.jp/visa"],
    ["Packing list for two weeks in Europe", "https://www.rei.com/learn/packing-list"],
    ["Airbnb Lisbon old town", "https://www.airbnb.com/s/Lisbon"],
    ["Train from Paris to Amsterdam", "https://www.thetrainline.com/paris-amsterdam"],
    ["Hiking trails near Banff", "https://www.alltrails.com/parks/canada/alberta/banff-national-park"],
  ],
  Finance: [
    ["Roth IRA vs traditional explained", "https://www.investopedia.com/roth-vs-traditional-ira"],
    ["Monthly budget spreadsheet template", "https://www.vertex42.com/budget-template"],
    ["TFSA contribution limits 2026", "https://www.canada.ca/en/revenue-agency/tfsa-limits"],
    ["How to file taxes as a freelancer", "https://www.nerdwallet.com/article/taxes/freelance-taxes"],
    ["Index funds for beginners", "https://www.investopedia.com/index-funds-guide"],
    ["Mortgage payment calculator", "https://www.ratehub.ca/mortgage-payment-calculator"],
    ["Credit score basics", "https://www.equifax.ca/credit-score-basics"],
    ["Emergency fund: how much to save", "https://www.nerdwallet.com/emergency-fund"],
    ["Stock market glossary", "https://www.investopedia.com/terms/"],
    ["Compare high interest savings accounts", "https://www.ratehub.ca/savings-accounts"],
  ],
  Shopping: [
    ["Wireless noise cancelling headphones review", "https://www.rtings.com/headphones/reviews/best-noise-cancelling"],
    ["Standing desk, adjustable height", "https://www.amazon.ca/dp/B0STANDING"],
    ["Ergonomic office chair deals", "https://www.costco.ca/office-chairs.html"],
    ["Running shoes sale", "https://www.nike.com/ca/w/sale-shoes"],
    ["Mechanical keyboard under $100", "https://www.bestbuy.ca/en-ca/collection/keyboards"],
    ["Ceramic coffee mugs set", "https://www.etsy.com/ca/listing/ceramic-mugs"],
    ["Winter jacket clearance", "https://www.mec.ca/en/products/jackets/sale"],
    ["Waterproof laptop backpack", "https://www.aliexpress.com/item/backpack"],
    ["Best rated air fryer", "https://www.walmart.ca/en/browse/air-fryers"],
    ["Gift ideas for dad", "https://www.uncommongoods.com/gifts-for-dad"],
  ],
  Learning: [
    ["Python for data analysis course", "https://www.coursera.org/learn/python-data-analysis"],
    ["Statistics and probability lessons", "https://www.khanacademy.org/math/statistics-probability"],
    ["Machine learning crash course", "https://developers.google.com/machine-learning/crash-course"],
    ["Learn SQL in 10 hours", "https://www.youtube.com/watch?v=sql10hours"],
    ["Linear algebra lectures", "https://ocw.mit.edu/courses/18-06-linear-algebra"],
    ["How to read a research paper", "https://www.science.org/careers/how-to-read-paper"],
    ["Spaced repetition study technique", "https://www.edutopia.org/spaced-repetition"],
    ["Introduction to economics online class", "https://www.edx.org/learn/economics"],
    ["Business writing course", "https://www.udemy.com/course/business-writing"],
    ["Excel pivot tables tutorial", "https://support.microsoft.com/excel/pivottables"],
  ],
  Dev: [
    ["React useEffect complete guide", "https://overreacted.io/a-complete-guide-to-useeffect/"],
    ["MDN Array.prototype.map", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map"],
    ["How to center a div", "https://stackoverflow.com/questions/114543/how-to-center-a-div"],
    ["Python asyncio documentation", "https://docs.python.org/3/library/asyncio.html"],
    ["Git branching strategies", "https://www.atlassian.com/git/tutorials/comparing-workflows"],
    ["Docker compose cheat sheet", "https://devhints.io/docker-compose"],
    ["TypeScript handbook: generics", "https://www.typescriptlang.org/docs/handbook/2/generics.html"],
    ["REST API design best practices", "https://learn.microsoft.com/azure/architecture/best-practices/api-design"],
    ["Regex tester", "https://regex101.com/"],
    ["VS Code keyboard shortcuts", "https://code.visualstudio.com/docs/reference/default-keybindings"],
  ],
  Health: [
    ["Beginner strength training plan", "https://www.healthline.com/health/strength-training-for-beginners"],
    ["How much sleep do adults need", "https://www.sleepfoundation.org/how-sleep-works/how-much-sleep-do-we-really-need"],
    ["Find a family doctor in BC", "https://www.healthlinkbc.ca/find-a-doctor"],
    ["Stretching routine for desk workers", "https://www.mayoclinic.org/stretching-desk"],
    ["Vitamin D deficiency symptoms", "https://www.webmd.com/vitamins/vitamin-d"],
    ["Dental coverage claim form", "https://www.sunlife.ca/claims/dental"],
    ["Guided meditation for anxiety", "https://www.headspace.com/meditation/anxiety"],
    ["Couch to 5K running plan", "https://www.nhs.uk/live-well/exercise/couch-to-5k"],
  ],
  Design: [
    ["Figma auto layout tutorial", "https://www.figma.com/resources/learn-design/auto-layout"],
    ["Color palette generator", "https://coolors.co/"],
    ["Typography basics for the web", "https://practicaltypography.com/"],
    ["Free icon library", "https://lucide.dev/icons"],
    ["Material design guidelines", "https://m3.material.io/"],
    ["Wireframe kit for mobile apps", "https://www.uxpin.com/wireframes"],
    ["Brand style guide examples", "https://www.canva.com/learn/brand-style-guide"],
    ["Spacing and grids in UI", "https://www.refactoringui.com/previews/spacing"],
  ],
  // A made-up workplace where several folders live on the same two internal sites.
  SharePoint: [
    ["Research home", `${sp}/ResearchHome/SitePages/Home.aspx`],
    ["Differences between team sites and hubs", `${sp}/ResearchHome/Shared%20Documents/Sites.docx`],
    ["Operations hub overview", `${sp}/OpsHub/SitePages/Home.aspx`],
    ["contoso.sharepoint.com/sites/ResearchRepor...", `${sp}/ResearchReports/Reports`],
    ["contoso.sharepoint.com/sites/Intranet/SitePages...", `${sp}/Intranet/SitePages/Team.aspx`],
    ["Sharing guidelines", `${sp}/Intranet/Shared%20Documents/Sharing.pdf`],
  ],
  Contract: [
    ["Vendor NDA request form - Service Portal", `${sn}/sp?id=sc_cat_item&sys_id=a1`],
    ["New contract request - Service Portal", `${sn}/sp?id=sc_cat_item&sys_id=b2`],
    ["Vendor agreement form - Service Portal", `${sn}/sp?id=sc_cat_item&sys_id=c3`],
    ["Contract templates", `${sp}/Legal/Templates`],
    ["Signing authority matrix", `${sp}/Legal/Matrix`],
  ],
  "GitHub Copilot": [
    ["Copilot in VS Code docs", "https://github.com/features/copilot"],
    ["GitHub Copilot Chat", "https://github.com/features/copilot/chat"],
    ["Copilot extensions", "https://github.com/features/copilot/extensions"],
    ["Copilot Workspace preview", "https://github.com/features/copilot/workspace"],
    ["Copilot coding agent", "https://github.com/features/copilot/agent"],
  ],
  "Power Automate": [
    ["Power Automate cloud flows", "https://learn.microsoft.com/power-automate/get-started"],
    ["Power Automate desktop flows", "https://learn.microsoft.com/power-automate/desktop-flows"],
    ["Flow connectors reference", "https://learn.microsoft.com/connectors/connector-reference"],
    ["Approvals in Power Automate", "https://learn.microsoft.com/power-automate/approvals"],
    ["Power Automate admin center", "https://admin.powerplatform.microsoft.com/environments"],
  ],
};

// Bookmarks filed in the wrong place on purpose: [title, url, folder it is in, folder it belongs in].
const PLANTED = [
  ["Quick chicken stir fry for two", "https://www.recipetineats.com/chicken-stir-fry", "Shopping", "Recipes"],
  ["Roth conversion ladder explained", "https://www.investopedia.com/roth-conversion-ladder", "Recipes", "Finance"],
  ["Cheap flights Tokyo to Osaka", "https://www.kayak.com/flight-routes/Tokyo-TYO/Osaka-OSA", "Finance", "Travel"],
  ["React server components explained", "https://react.dev/reference/rsc/server-components", "Travel", "Dev"],
  ["Ergonomic standing desk converter", "https://www.amazon.ca/dp/B0CONVERTER", "Learning", "Shopping"],
  ["Beginner yoga flow for flexibility", "https://www.yogajournal.com/yoga-flow-beginners", "Shopping", "Health"],
  ["Figma component variants guide", "https://www.figma.com/best-practices/component-variants", "Dev", "Design"],
  ["Neural networks explained simply", "https://www.3blue1brown.com/topics/neural-networks", "Health", "Learning"],
  ["Wireless earbuds review", "https://www.rtings.com/headphones/reviews/best-earbuds", "Recipes", "Shopping"],
  ["Weekend hotel deals in Paris", "https://www.expedia.ca/Paris-Hotels", "Shopping", "Travel"],
  ["Mortgage rates this week", "https://www.ratehub.ca/best-mortgage-rates", "Health", "Finance"],
  ["TypeScript utility types cheat sheet", "https://www.typescriptlang.org/docs/handbook/utility-types.html", "Design", "Dev"],
  ["Vegan brownies recipe", "https://minimalistbaker.com/vegan-brownies", "Travel", "Recipes"],
  ["Marathon training schedule for beginners", "https://www.runnersworld.com/training/marathon-training-plan", "Finance", "Health"],
];

// Unfiled bookmarks on the bar: [title, url, folder a person would choose].
const LOOSE = [
  ["Homemade ramen broth from scratch", "https://www.justonecookbook.com/homemade-ramen-broth", "Recipes"],
  ["Lisbon travel guide for first timers", "https://www.timeout.com/lisbon/travel-guide", "Travel"],
  ["Best budgeting apps 2026", "https://www.nerdwallet.com/best/banking/budgeting-apps", "Finance"],
  ["Noise cancelling earbuds deal of the week", "https://www.bestbuy.ca/en-ca/deals/earbuds", "Shopping"],
  ["Calculus for beginners", "https://www.khanacademy.org/math/calculus-1", "Learning"],
  ["Python decorators explained", "https://realpython.com/primer-on-python-decorators/", "Dev"],
  ["Knee pain stretches after running", "https://www.healthline.com/health/knee-pain-stretches", "Health"],
  ["Logo design inspiration gallery", "https://www.behance.net/search/projects/logo", "Design"],
  ["Power Automate approvals tutorial", "https://learn.microsoft.com/power-automate/modern-approvals", "Power Automate"],
  ["Copilot agent mode documentation", "https://docs.github.com/copilot/agent-mode", "GitHub Copilot"],
  ["Mutual NDA template for vendors", `${sp}/Legal/NDA-template`, "Contract"],
  ["Slow cooker beef stew", "https://www.tasteofhome.com/slow-cooker-beef-stew", "Recipes"],
];

// Correctly filed bookmarks that share a site with another folder but belong where they are.
const DECOYS = [
  ["contoso.sharepoint.com/sites/Governance/Shared%20Documents/Forms", `${sp}/Governance/Shared%20Documents/Forms`, "Contract"],
  ["The Falcon Team", `${sp}/Falcon`, "GitHub Copilot"],
  ["Copilot Studio learning hub for Microsoft 365", `${sn}/kb?id=kb_article_view&sys_kb_id=d4`, "Power Automate"],
];

const bm = ([title, url]) => ({ title, url });

// Builds the tree children. `include` chooses which extras to add.
export function buildLibrary({ planted = true, loose = true, decoys = true } = {}) {
  const folders = Object.fromEntries(Object.entries(FOLDERS).map(([name, items]) => [name, items.map(bm)]));
  if (planted) for (const [title, url, into] of PLANTED) folders[into].push({ title, url });
  if (decoys) for (const [title, url, into] of DECOYS) folders[into].push({ title, url });
  const children = [
    ...Object.entries(folders).map(([title, kids]) => ({ title, children: kids })),
    ...(loose ? LOOSE.map(bm) : []),
  ];
  return {
    children,
    planted: new Map(PLANTED.map(([title, , , truth]) => [title, truth])),
    plantedIn: new Map(PLANTED.map(([title, , into]) => [title, into])),
    loose: new Map(LOOSE.map(([title, , truth]) => [title, truth])),
    decoys: DECOYS.map(([title]) => title),
  };
}

export const folderNames = () => Object.keys(FOLDERS);
