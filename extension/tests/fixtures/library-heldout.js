// A second invented library on different topics, written AFTER the thresholds were tuned on
// library.js. It exists to check that the tuning generalizes instead of memorizing one library.
// Same shape as library.js. Every site and title is made up or an ordinary public website.

const FOLDERS = {
  Gardening: [
    ["When to plant tomatoes in zone 6", "https://www.gardenersworld.com/plants/tomatoes-planting"],
    ["Composting for beginners", "https://www.epa.gov/recycle/composting-home"],
    ["How to prune roses", "https://www.rhs.org.uk/roses/pruning"],
    ["Companion planting chart", "https://www.almanac.com/companion-planting-chart"],
    ["Best shade-loving perennials", "https://www.bhg.com/gardening/shade-perennials"],
    ["Raised bed soil mix recipe", "https://www.gardeners.com/raised-bed-soil"],
    ["Getting rid of aphids naturally", "https://www.gardeningknowhow.com/aphids"],
  ],
  Music: [
    ["Learn guitar chords for beginners", "https://www.justinguitar.com/chords"],
    ["Best albums of 2025", "https://pitchfork.com/best-albums-2025"],
    ["Piano scales practice routine", "https://www.pianote.com/scales"],
    ["Home recording setup on a budget", "https://www.soundonsound.com/home-recording"],
    ["Jazz standards every player should know", "https://www.jazzguitar.be/standards"],
    ["Concert tickets this fall", "https://www.ticketmaster.ca/concerts"],
    ["Music theory for songwriters", "https://www.musictheory.net/lessons"],
  ],
  Career: [
    ["How to negotiate your salary", "https://hbr.org/negotiate-salary"],
    ["Resume template for analysts", "https://www.indeed.com/career-advice/resumes/analyst"],
    ["Common behavioral interview questions", "https://www.themuse.com/advice/interview-questions"],
    ["LinkedIn profile checklist", "https://www.linkedin.com/business/talent/profile-tips"],
    ["Remote job boards", "https://weworkremotely.com/jobs"],
    ["Asking for a promotion", "https://www.glassdoor.com/blog/promotion"],
    ["Writing a strong cover letter", "https://www.grammarly.com/blog/cover-letter"],
  ],
  Cars: [
    ["Winter tires buying guide", "https://www.consumerreports.org/tires/winter"],
    ["How to check your engine oil", "https://www.cars.com/articles/check-oil"],
    ["Used car inspection checklist", "https://www.carfax.ca/inspection-checklist"],
    ["Electric vehicle charging map", "https://www.plugshare.com/map"],
    ["Brake pad replacement cost", "https://www.repairpal.com/brake-pads"],
    ["Car insurance comparison", "https://www.ratehub.ca/car-insurance"],
    ["Best compact SUVs 2026", "https://www.caranddriver.com/compact-suvs"],
  ],
  Photography: [
    ["Rule of thirds explained", "https://digital-photography-school.com/rule-of-thirds"],
    ["Best lenses for portraits", "https://www.dpreview.com/portrait-lenses"],
    ["Lightroom presets for travel", "https://www.adobe.com/products/lightroom/presets"],
    ["Golden hour photography tips", "https://www.photographylife.com/golden-hour"],
    ["Cleaning a camera sensor", "https://petapixel.com/clean-sensor"],
    ["Street photography ethics", "https://www.streetphotography.com/ethics"],
    ["Mirrorless vs DSLR in 2026", "https://www.techradar.com/mirrorless-vs-dslr"],
  ],
  News: [
    ["Today's headlines", "https://www.bbc.com/news"],
    ["Markets close higher on tech rally", "https://www.reuters.com/markets"],
    ["City council approves transit plan", "https://www.cbc.ca/news/canada/vancouver"],
    ["Weather forecast this weekend", "https://weather.gc.ca/forecast"],
    ["Election results explained", "https://www.theguardian.com/politics"],
    ["Science news roundup", "https://www.sciencedaily.com/news"],
    ["Opinion: the future of remote work", "https://www.nytimes.com/opinion/remote-work"],
  ],
};

// [title, url, folder it was put in, folder it belongs in]
const PLANTED = [
  ["Best time to fertilize your lawn", "https://www.scotts.com/lawn-fertilizer-schedule", "Cars", "Gardening"],
  ["Used Honda Civic reviews", "https://www.edmunds.com/honda/civic/used", "Photography", "Cars"],
  ["Beginner drum lessons online", "https://www.drumeo.com/beginner", "Career", "Music"],
  ["How to prepare for a panel interview", "https://www.themuse.com/advice/panel-interview", "Music", "Career"],
  ["Pruning apple trees in winter", "https://extension.umn.edu/fruit/pruning-apple-trees", "News", "Gardening"],
  ["Tripod buying guide", "https://www.bhphotovideo.com/tripod-guide", "Cars", "Photography"],
  ["Oil change interval myths", "https://www.edmunds.com/car-maintenance/oil-change", "Gardening", "Cars"],
  ["Federal budget announcement", "https://www.cbc.ca/news/politics/budget", "Photography", "News"],
];

const LOOSE = [
  ["Guitar pedal for beginners", "https://www.sweetwater.com/guitar-pedals", "Music"],
  ["Growing basil indoors", "https://www.gardeningchannel.com/basil", "Gardening"],
  ["Salary expectations for data analysts", "https://www.glassdoor.com/salaries/data-analyst", "Career"],
  ["Flat tire repair steps", "https://www.aaa.com/flat-tire", "Cars"],
  ["Black and white photo editing", "https://www.photoshop.com/bw-editing", "Photography"],
  ["Evening news summary", "https://www.cbc.ca/news/world", "News"],
];

const bm = ([title, url]) => ({ title, url });

export function buildHeldOutLibrary() {
  const folders = Object.fromEntries(Object.entries(FOLDERS).map(([name, items]) => [name, items.map(bm)]));
  for (const [title, url, into] of PLANTED) folders[into].push({ title, url });
  return {
    children: [...Object.entries(folders).map(([title, kids]) => ({ title, children: kids })), ...LOOSE.map(bm)],
    planted: new Map(PLANTED.map(([title, , , truth]) => [title, truth])),
    loose: new Map(LOOSE.map(([title, , truth]) => [title, truth])),
    decoys: [],
  };
}
