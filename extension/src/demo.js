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
        { title: "Gmail", url: "https://mail.google.com/mail/u/0/#inbox", dateAdded: t(900) },
        { title: "ChatGPT", url: "https://chatgpt.com/", dateAdded: t(800) },
        { title: "Claude", url: "https://claude.ai/new", dateAdded: t(700) },
        { title: "", url: "https://calendar.example.com/week", dateAdded: t(650) },
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
        {
          title: "Buy",
          children: [
            { title: "Wireless earbuds", url: "https://www.amazon.ca/dp/B0EXAMPLE1", dateAdded: t(160) },
            { title: "Desk lamp", url: "https://www.ebay.com/itm/123456", dateAdded: t(150) },
            { title: "Ceramic mug", url: "https://www.etsy.com/listing/777", dateAdded: t(140) },
            { title: "Office chair", url: "https://www.walmart.ca/ip/888", dateAdded: t(130) },
            { title: "Documentary series", url: "https://www.netflix.com/title/81000000", dateAdded: t(120) },
          ],
        },
        {
          title: "Watch",
          children: [
            { title: "Lo-fi mix to focus", url: "https://www.youtube.com/watch?v=jfKfPfyJRdk", dateAdded: t(110) },
            { title: "Anime episode", url: "https://www.bilibili.com/video/BV1example", dateAdded: t(105) },
            { title: "Speedrun stream", url: "https://www.twitch.tv/example", dateAdded: t(102) },
          ],
        },
        { title: "Open-source project board", url: "https://github.com/orgs/example/projects/3", dateAdded: t(30) },
        { title: "vuejs/core", url: "https://github.com/vuejs/core?utm_source=newsletter", dateAdded: t(20) },
        { title: "GitHub Actions docs", url: "https://github.com/features/actions", dateAdded: t(15) },
        { title: "Best pasta recipes", url: "https://pasta.example.org/best", dateAdded: t(40) },
        { title: "Easy weeknight dinner recipes", url: "https://dinner.example.net/weeknight", dateAdded: t(35) },
        { title: "Standing desk, adjustable height", url: "https://www.amazon.com/dp/B0EXAMPLE2", dateAdded: t(55) },
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
