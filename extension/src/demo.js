// Fictional sample bookmarks, used only when the page is opened outside Chrome
// (for previews and screenshots). Nothing here is real user data.
import { createMemoryBookmarks, createMemoryStorage } from "./memory-bookmarks.js";

const day = 86_400_000;
const t = (daysAgo) => Date.now() - daysAgo * day;

export function installDemo() {
  const bookmarks = createMemoryBookmarks([
    {
      id: "1",
      title: "Bookmarks bar",
      children: [
        {
          title: "Dev",
          children: [
            { title: "vuejs/core", url: "https://github.com/vuejs/core", dateAdded: t(400) },
            { title: "Learn Rust", url: "https://github.com/rust-lang/book", dateAdded: t(380) },
            { title: "How to center a div", url: "https://stackoverflow.com/q/114543", dateAdded: t(300) },
            { title: "MDN: Array.map", url: "https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array/map", dateAdded: t(250) },
          ],
        },
        {
          title: "Recipes",
          children: [
            { title: "15-minute noodles", url: "https://noodles.example.com/quick", dateAdded: t(200) },
            { title: "Sourdough for beginners", url: "https://bread.example.org/start", dateAdded: t(190) },
          ],
        },
        { title: "Work", children: [{ title: "Team wiki", url: "https://team.notion.so/wiki", dateAdded: t(100) }] },
        { title: "Open-source project board", url: "https://github.com/orgs/example/projects/3", dateAdded: t(30) },
        { title: "vuejs/core", url: "https://github.com/vuejs/core?utm_source=newsletter", dateAdded: t(20) },
        { title: "GitHub Actions docs", url: "https://github.com/features/actions", dateAdded: t(15) },
        { title: "Best pasta recipes", url: "https://pasta.example.org/best", dateAdded: t(40) },
        { title: "Easy weeknight dinner recipes", url: "https://dinner.example.net/weeknight", dateAdded: t(35) },
        { title: "Wireless earbuds", url: "https://www.amazon.ca/dp/B0EXAMPLE1", dateAdded: t(60) },
        { title: "Standing desk", url: "https://www.amazon.com/dp/B0EXAMPLE2", dateAdded: t(55) },
        { title: "Backpack deal", url: "https://www.ebay.com/itm/123456", dateAdded: t(50) },
        { title: "Documentary series", url: "https://www.netflix.com/title/81000000", dateAdded: t(45) },
        { title: "Lo-fi mix to focus", url: "https://www.youtube.com/watch?v=jfKfPfyJRdk", dateAdded: t(44) },
        { title: "Conference talk: type systems", url: "https://www.youtube.com/watch?v=example", dateAdded: t(43) },
        { title: "Interesting thread", url: "https://www.reddit.com/r/programming/comments/1", dateAdded: t(12) },
        { title: "Wedding photo album", url: "https://photos.example.org/album/22", dateAdded: t(8) },
      ],
    },
    {
      id: "2",
      title: "Other bookmarks",
      children: [
        { title: "Flights to Tokyo", url: "https://www.skyscanner.com/transport/flights/yvr/tyoa", dateAdded: t(90) },
        { title: "Tokyo hotels", url: "https://www.booking.com/city/jp/tokyo.html", dateAdded: t(89) },
        { title: "Tokyo itinerary", url: "https://www.tripadvisor.com/Tourism-g298184-Tokyo", dateAdded: t(88) },
      ],
    },
    { id: "3", title: "Mobile bookmarks", children: [] },
  ]);
  globalThis.chrome = { bookmarks, storage: { local: createMemoryStorage() } };
}
