// Decides whether a bookmark on the Bookmarks bar is a shortcut the user clicks to *use*
// (mail, ChatGPT, a bookmarklet) rather than a page saved to read later. Shortcuts stay put.
// Leaving something alone is the safe failure mode, so the rules lean towards protecting.
import { hostOf, normalizeUrl, pathDepth } from "./url.js";

// Web apps people keep one click away. Any path counts for mail/calendar apps;
// chat apps only count for their entry page, so a saved conversation is still organized.
const ANY_PATH_APPS = [
  "mail.google.com", "calendar.google.com", "outlook.office.com", "outlook.office365.com",
  "outlook.live.com", "teams.microsoft.com", "web.whatsapp.com", "app.slack.com",
];
const ENTRY_PAGE_APPS = [
  "chatgpt.com", "chat.openai.com", "claude.ai", "gemini.google.com", "copilot.microsoft.com",
  "perplexity.ai", "drive.google.com", "notion.so", "github.com", "figma.com", "trello.com",
];

const onHost = (host, list) => list.some((h) => host === h || host.endsWith("." + h));

export function quickAccessReason(bookmark, { pinned = new Set(), organizeAnyway = new Set() } = {}) {
  const key = normalizeUrl(bookmark.url);
  if (organizeAnyway.has(key)) return null;
  if (pinned.has(key)) return "Kept on the bar by you";

  const title = (bookmark.title ?? "").trim();
  if (!title) return "Icon-only bookmark (no title)";

  let parsed;
  try {
    parsed = new URL(bookmark.url);
  } catch {
    return null;
  }
  if (parsed.protocol === "javascript:") return "Bookmarklet";
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "Browser page shortcut";

  const host = hostOf(bookmark.url);
  const depth = pathDepth(bookmark.url);
  if (onHost(host, ANY_PATH_APPS)) return `Web app you open often (${host})`;
  if (onHost(host, ENTRY_PAGE_APPS) && depth <= 1) return `Web app you open often (${host})`;
  if (depth === 0 && title.length <= 14) return "Site home page with a short name";
  if (depth <= 1 && title.length <= 8) return "Short custom name, looks like a shortcut";
  return null;
}
