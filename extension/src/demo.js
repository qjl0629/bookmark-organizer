// Fictional sample bookmarks, used only when the page is opened outside Chrome (the live demo,
// previews and screenshots). Everything here is invented or an ordinary public website;
// nothing is real user data. Dates are relative to "now" so the demo never looks stale.
import { createMemoryBookmarks, createMemoryStorage } from "./memory-bookmarks.js";

const day = 86_400_000;
const ago = (days) => Date.now() - days * day;

// [title, url, days since saved, days since last opened (omit if never)]
const bm = ([title, url, saved, opened]) => ({ title, url, dateAdded: ago(saved), ...(opened === undefined ? {} : { dateLastUsed: ago(opened) }) });
const folder = (title, items) => ({ title, children: items.map(bm) });

const RECIPES = [
  ["Easy weeknight chicken curry", "https://www.bbcgoodfood.com/recipes/easy-chicken-curry", 290, 6],
  ["Sourdough bread for beginners", "https://www.kingarthurbaking.com/recipes/beginners-sourdough", 270],
  ["Best chocolate chip cookies", "https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/", 250],
  ["15-minute garlic noodles", "https://www.seriouseats.com/garlic-noodles", 230, 12],
  ["Vegetarian chili with black beans", "https://cookieandkate.com/vegetarian-chili/", 210],
  ["How to cook perfect rice", "https://www.simplyrecipes.com/how-to-cook-rice/", 190],
  ["Homemade pizza dough", "https://www.jamieoliver.com/recipes/pizza-dough", 170],
  ["Weekly meal prep ideas", "https://www.budgetbytes.com/meal-prep-ideas/", 150],
  ["Mapo tofu authentic recipe", "https://www.chinasichuanfood.com/mapo-tofu/", 130],
  ["Roth conversion ladder explained", "https://www.investopedia.com/roth-conversion-ladder", 40], // belongs in Money
];

const TRAVEL = [
  ["Tokyo 5-day itinerary", "https://www.lonelyplanet.com/japan/tokyo/itineraries", 200, 20],
  ["Cheap flights Vancouver to Tokyo", "https://www.skyscanner.ca/routes/yvr/tyoa", 190],
  ["Best hotels in Kyoto", "https://www.booking.com/city/jp/kyoto.html", 180],
  ["Japan Rail Pass guide", "https://www.japan-guide.com/e/e2361.html", 170],
  ["Osaka street food tour", "https://www.tripadvisor.com/Attraction_Review-Osaka", 160],
  ["Packing list for two weeks", "https://www.rei.com/learn/expert-advice/packing-list.html", 150],
  ["Visa rules for Japan", "https://www.japan-guide.com/e/e2002.html", 140],
  ["Vegan brownies recipe", "https://minimalistbaker.com/vegan-brownies", 35], // belongs in Recipes
];

const MONEY = [
  ["How index funds work", "https://www.investopedia.com/terms/i/indexfund.asp", 260, 30],
  ["Tax free savings account limits", "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account.html", 240],
  ["Credit card rewards compared", "https://www.nerdwallet.com/best/credit-cards/rewards", 220],
  ["Emergency fund: how much do you need", "https://www.ramseysolutions.com/saving/emergency-fund", 200],
  ["Mortgage calculator", "https://www.ratehub.ca/mortgage-payment-calculator", 180, 25],
  ["Budget spreadsheet template", "https://www.vertex42.com/ExcelTemplates/budget-spreadsheet.html", 160],
  ["Understanding your credit score", "https://www.experian.ca/credit-score", 140],
  ["Mortgage calculator", "https://www.ratehub.ca/mortgage-payment-calculator", 90], // saved twice
  ["Best savings accounts this month", "https://www.bankrate.com/banking/savings/best-high-yield-interests-savings-accounts/", 120],
  ["Beginner yoga flow for flexibility", "https://www.yogajournal.com/poses/yoga-flow-for-flexibility", 33], // belongs in Health
];

const HEALTH = [
  ["Beginner strength training plan", "https://www.healthline.com/health/strength-training-for-beginners", 240],
  ["How much sleep do adults need", "https://www.sleepfoundation.org/how-sleep-works/how-much-sleep-do-we-really-need", 220],
  ["Find a family doctor in BC", "https://www.healthlinkbc.ca/health-services/find-a-doctor", 200, 45],
  ["Stretching routine for desk workers", "https://www.mayoclinic.org/healthy-lifestyle/office-ergonomics/in-depth/office-stretches/art-20046041", 180],
  ["Vitamin D deficiency symptoms", "https://www.webmd.com/diet/vitamin-d-deficiency", 160],
  ["Guided meditation for anxiety", "https://www.headspace.com/meditation/anxiety", 140],
  ["Couch to 5K running plan", "https://www.nhs.uk/live-well/exercise/running-and-aerobic-exercises/get-running-with-couch-to-5k/", 120],
  ["Neural networks explained simply", "https://www.3blue1brown.com/topics/neural-networks", 28], // belongs in Learning
];

const SHOPPING = [
  ["Wireless noise cancelling headphones review", "https://www.rtings.com/headphones/reviews/best/wireless", 210],
  ["Standing desk, adjustable height", "https://www.amazon.com/dp/B0EXAMPLE2", 190],
  ["Ergonomic office chair deals", "https://www.costco.ca/office-chairs.html", 170],
  ["Running shoes sale", "https://www.sportchek.ca/categories/shoes/running-shoes.html", 150],
  ["Mechanical keyboard under $100", "https://www.wirecutter.com/reviews/best-budget-mechanical-keyboard/", 130],
  ["Ceramic coffee mugs set", "https://www.etsy.com/market/ceramic_coffee_mugs", 110],
  ["Winter jacket clearance", "https://www.mec.ca/en/products/clothing/jackets", 90],
  ["Quick chicken stir fry for two", "https://www.recipetineats.com/chicken-stir-fry", 26], // belongs in Recipes
];

const LEARNING = [
  ["Linear algebra, visually", "https://www.3blue1brown.com/topics/linear-algebra", 250, 40],
  ["Statistics and probability course", "https://www.khanacademy.org/math/statistics-probability", 230],
  ["How to learn anything faster", "https://www.coursera.org/learn/learning-how-to-learn", 210],
  ["Spaced repetition explained", "https://ncase.me/remember/", 190],
  ["Public speaking basics", "https://www.edx.org/learn/public-speaking", 170],
  ["Music theory for beginners", "https://www.musictheory.net/lessons", 150],
  ["Intro to data visualization", "https://www.coursera.org/learn/data-visualization", 100],
  ["Wireless earbuds review", "https://www.rtings.com/headphones/reviews/best/earbuds", 24], // belongs in Shopping
];

const DEV = [
  ["How to center a div", "https://css-tricks.com/centering-css-complete-guide/", 200, 15],
  ["Python asyncio documentation", "https://docs.python.org/3/library/asyncio.html", 190, 30],
  ["TypeScript handbook: generics", "https://www.typescriptlang.org/docs/handbook/2/generics.html", 180],
  ["REST API design best practices", "https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design", 170],
  ["Docker compose cheat sheet", "https://devhints.io/docker-compose", 160, 8],
  ["Regex tester", "https://regex101.com/", 150, 4],
  ["Git branching strategies", "https://www.atlassian.com/git/tutorials/comparing-workflows", 140, 3],
  ["React useEffect complete guide", "https://overreacted.io/a-complete-guide-to-useeffect/", 130, 2],
  ["MDN: Array.prototype.map", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map", 120, 1],
];

const PHOTO = [
  ["Rule of thirds explained", "https://digital-photography-school.com/rule-of-thirds", 80],
  ["Best lenses for portraits", "https://www.dpreview.com/articles/portrait-lenses", 75],
  ["Golden hour photography tips", "https://www.photographylife.com/golden-hour", 70],
  ["Cleaning a camera sensor", "https://petapixel.com/how-to-clean-your-camera-sensor/", 65],
];

const COOKING = [
  ["Crispy air fryer salmon", "https://www.delish.com/cooking/recipe-ideas/air-fryer-salmon", 60],
  ["Overnight oats, five ways", "https://www.bbcgoodfood.com/recipes/collection/overnight-oats", 58],
  ["Easy vegetable soup", "https://www.simplyrecipes.com/recipes/vegetable_soup/", 55],
];

// Saved long ago, never opened since.
const MISC = [
  ["Ten productivity tips for 2023", "https://example-blog.com/productivity-tips-2023", 1010],
  ["Top 20 sites for free fonts", "https://example-design.com/free-fonts", 980],
  ["Wedding venue ideas", "https://example-weddings.com/venues", 940],
  ["Best podcasts of 2022", "https://example-audio.com/best-podcasts-2022", 900],
  ["Router setup forum thread", "https://forum.example-tech.com/t/router-setup/4411", 860],
  ["Webinar sign-up page", "https://example-events.com/webinar/signup", 820],
  ["Free ebook download", "https://example-books.com/free-ebook", 790],
  ["Concert tickets, summer 2023", "https://example-tickets.com/summer-2023", 750],
  ["Moving checklist", "https://example-home.com/moving-checklist", 720],
  ["Old gadget review roundup", "https://example-reviews.com/gadgets-roundup", 690],
];

const LOOSE_ON_BAR = [
  ["Homemade ramen broth from scratch", "https://www.justonecookbook.com/homemade-ramen-broth", 5],
  ["Lisbon travel guide for first timers", "https://www.timeout.com/lisbon/travel-guide", 4],
  ["Best budgeting apps 2026", "https://www.nerdwallet.com/best/banking/budgeting-apps", 3],
  ["Noise cancelling earbuds deal of the week", "https://www.bestbuy.ca/en-ca/deals/earbuds", 2],
  ["Python decorators explained", "https://realpython.com/primer-on-python-decorators/", 2],
  ["Knee pain stretches after running", "https://www.healthline.com/health/knee-pain-stretches", 1],
];

export function installDemo() {
  const bar = [
    bm(["Gmail", "https://mail.google.com/mail/u/0/#inbox", 900, 0]),
    bm(["ChatGPT", "https://chatgpt.com/", 800, 0]),
    bm(["Google Calendar", "https://calendar.google.com/calendar/u/0/r/week", 780, 0]),
    folder("Recipes", RECIPES),
    folder("Travel", TRAVEL),
    folder("Money", MONEY),
    folder("Health", HEALTH),
    folder("Shopping", SHOPPING),
    folder("Learning", LEARNING),
    folder("Dev", DEV),
    folder("New folder", PHOTO),
    folder("Cooking", COOKING),
    folder("Old", []),
    ...LOOSE_ON_BAR.map(bm),
  ];
  const other = [folder("Misc", MISC)];
  const bookmarks = createMemoryBookmarks([
    { id: "1", title: "Bookmarks bar", children: bar },
    { id: "2", title: "Other bookmarks", children: other },
    { id: "3", title: "Mobile bookmarks", children: [] },
  ]);
  globalThis.chrome = { bookmarks, storage: { local: createMemoryStorage() } };
}
