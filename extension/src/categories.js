// Fallback categories for bookmarks that match no existing folder.
// A token ending in "." matches a whole domain label ("amazon." matches www.amazon.ca).
// A token containing "/" matches against host + path. Other tokens match the domain
// or any subdomain of it, so "x.com" never matches "netflix.com". First match wins.
const RULES = [
  ["Careers", ["indeed.", "glassdoor.", "greenhouse.io", "lever.co", "linkedin.com/jobs"], ["resume", "careers"]],
  ["AI Tools", ["openai.com", "chatgpt.com", "claude.ai", "anthropic.com", "gemini.google.com", "perplexity.ai"], []],
  ["Development", ["github.com", "gitlab.com", "stackoverflow.com", "npmjs.com", "pypi.org", "developer.mozilla.org", "docs.python.org"], ["api reference"]],
  ["Learning", ["coursera.org", "udemy.com", "edx.org", "khanacademy.org", "wikipedia.org", "medium.com"], ["tutorial", "course"]],
  ["Shopping", ["amazon.", "ebay.", "etsy.", "aliexpress.", "walmart.", "costco.", "bestbuy.", "taobao.com", "tmall.com", "jd.com"], []],
  ["Video & Entertainment", ["youtube.com", "youtu.be", "netflix.com", "bilibili.com", "twitch.tv", "disneyplus.com", "hulu.com", "imdb.com", "spotify.com"], []],
  ["Social", ["facebook.com", "instagram.com", "twitter.com", "x.com", "reddit.com", "linkedin.com", "weibo.com", "tiktok.com", "discord.com", "xiaohongshu.com"], []],
  ["News", ["cnn.com", "bbc.", "nytimes.com", "theguardian.com", "reuters.com", "bloomberg.com", "cbc.ca"], []],
  ["Finance", ["paypal.com", "wealthsimple.com", "robinhood.com", "tdcanadatrust.com", "td.com", "rbc.com", "chase.com", "bankofamerica.com", "coinbase.com"], []],
  ["Travel", ["booking.com", "airbnb.", "expedia.", "tripadvisor.", "skyscanner.", "aircanada.com", "google.com/maps"], ["flight", "hotel"]],
  ["Work & Productivity", ["notion.so", "slack.com", "zoom.us", "atlassian.net", "trello.com", "docs.google.com", "drive.google.com", "office.com", "sharepoint.com", "asana.com"], []],
];

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function hostMatches(host, token) {
  if (token.endsWith(".")) return host.split(".").includes(token.slice(0, -1));
  return host === token || host.endsWith("." + token);
}

export function categorize(url, title = "") {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  let host = parsed.hostname.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  const hostPath = host + parsed.pathname.toLowerCase();
  const titleLower = title.toLowerCase();
  for (const [category, tokens, words] of RULES) {
    for (const token of tokens) {
      if (token.includes("/") ? hostPath.includes(token) : hostMatches(host, token)) return category;
    }
    for (const word of words) {
      if (new RegExp(`\\b${escapeRegExp(word)}\\b`).test(titleLower)) return category;
    }
  }
  return null;
}
