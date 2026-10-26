// URL helpers shared by the planner and the quick-access rules.

const TRACKING = ["utm_", "fbclid", "gclid", "mc_cid", "mc_eid"];

const TWO_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.jp", "co.nz",
  "com.cn", "net.cn", "org.cn", "gov.cn", "com.hk", "com.tw", "co.kr", "com.br", "co.in", "co.za",
]);

export function hostOf(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "";
  }
}

// Registrable domain: "news.bbc.co.uk" -> "bbc.co.uk", "mail.google.com" -> "google.com".
export function baseDomain(host) {
  const parts = host.split(".");
  const keep = parts.length >= 3 && TWO_PART_SUFFIXES.has(parts.slice(-2).join(".")) ? 3 : 2;
  return parts.length > keep ? parts.slice(-keep).join(".") : host;
}

export function normalizeUrl(url) {
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return url.trim();
  }
  const params = [...parsed.searchParams.entries()]
    .filter(([key]) => !TRACKING.some((prefix) => key.toLowerCase().startsWith(prefix)))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = new URLSearchParams(params).toString();
  return `${parsed.protocol}//${hostOf(url)}${parsed.pathname.replace(/\/+$/, "")}${query ? "?" + query : ""}`;
}

export function pathDepth(url) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).length;
  } catch {
    return 0;
  }
}

// URL path parts that name a kind of page rather than a subject.
export const GENERIC_SEGMENTS = new Set([
  "sites", "site", "teams", "team", "personal", "pages", "page", "sitepages", "shared documents", "documents",
  "lists", "forms", "wiki", "browse", "view", "docs", "doc", "d", "c", "p", "s", "r", "g", "u", "en", "en-us",
  "app", "apps", "home", "index", "dashboard", "portal", "search", "login", "signin", "kb", "sp", "files",
]);

export const safeDecode = (text) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

export const looksLikeId = (segment) => /^\d+$/.test(segment) || /^[0-9a-f-]{12,}$/i.test(segment);

// A title that is just a web address (or a shortened one ending in "...") has no words of its own.
export const looksLikeAddress = (title) => /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}([/?#:]|\.\.\.|…|$)/i.test(title.trim());
