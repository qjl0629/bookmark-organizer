// Invented bookmarks for folder clean-up tests: ordinary public sites in folders that are
// duplicated, nameless, vague or empty. Written separately from library.js so thresholds are
// not tuned on the same data they are tested on.
//
// `expect` says what a sensible person would do with each messy folder.

const bm = ([title, url]) => ({ title, url });

const NORMAL = {
  Cooking: [
    ["One pot lemon chicken", "https://www.bonappetit.com/recipe/lemon-chicken"],
    ["Fluffy pancakes from scratch", "https://www.kingarthurbaking.com/recipes/pancakes"],
    ["Slow roasted tomato pasta sauce", "https://www.seriouseats.com/tomato-sauce"],
    ["Crispy oven baked salmon", "https://www.delish.com/baked-salmon"],
    ["Easy vegetable soup", "https://www.simplyrecipes.com/vegetable-soup"],
  ],
  Travel: [
    ["Lisbon three day itinerary", "https://www.lonelyplanet.com/portugal/lisbon"],
    ["Cheap flights to Mexico City", "https://www.skyscanner.ca/mexico-city"],
    ["Best hostels in Barcelona", "https://www.hostelworld.com/barcelona"],
    ["Train passes across Europe", "https://www.eurail.com/passes"],
    ["Packing list for two weeks", "https://www.rei.com/packing-list"],
  ],
  Money: [
    ["How index funds work", "https://www.investopedia.com/index-funds"],
    ["Tax free savings account limits", "https://www.canada.ca/tfsa"],
    ["Credit card rewards compared", "https://www.nerdwallet.com/credit-cards"],
    ["Emergency fund how much", "https://www.ramseysolutions.com/emergency-fund"],
    ["Mortgage calculator", "https://www.ratehub.ca/mortgage-calculator"],
  ],
};

const MESSY = {
  // Same kind of thing under a different name than "Cooking".
  Recipes: [
    ["Vegetarian lasagna", "https://www.allrecipes.com/vegetarian-lasagna"],
    ["Homemade bread rolls", "https://www.foodnetwork.com/bread-rolls"],
    ["Chickpea curry in 30 minutes", "https://www.budgetbytes.com/chickpea-curry"],
  ],
  // Same name as "Travel" apart from a trailing s.
  Travels: [
    ["Visa rules for Japan", "https://www.japan-guide.com/visa"],
    ["Best time to visit Iceland", "https://guidetoiceland.is/best-time"],
  ],
  // Nameless, but holds the same kind of things as "Money".
  "New folder": [
    ["Best savings accounts this month", "https://www.bankrate.com/savings"],
    ["Retirement savings by age", "https://www.fidelity.com/retirement-by-age"],
    ["Understanding your credit score", "https://www.experian.ca/credit-score"],
    ["Budget spreadsheet template", "https://www.vertex42.com/budget-template"],
  ],
  // Nameless and about something no other folder covers.
  Untitled: [
    ["Rule of thirds explained", "https://digital-photography-school.com/rule-of-thirds"],
    ["Best lenses for portraits", "https://www.dpreview.com/portrait-lenses"],
    ["Golden hour photography tips", "https://www.photographylife.com/golden-hour"],
    ["Cleaning a camera sensor", "https://petapixel.com/clean-sensor"],
  ],
  Old: [],
};

export function buildMessyLibrary() {
  const folder = ([title, items]) => ({ title, children: items.map(bm) });
  return {
    children: [...Object.entries(NORMAL).map(folder), ...Object.entries(MESSY).map(folder)],
    expect: {
      deleted: ["Old"],
      // [from, into]
      merged: [["New folder", "Money"], ["Travels", "Travel"], ["Recipes", "Cooking"]],
      renamed: [["Untitled", "Photography"]],
    },
  };
}
