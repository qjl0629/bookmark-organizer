// Turns the planner's structured reasons into plain sentences, and prepares the small
// pieces the interface shows (folder names, confidence words, avatar colours).
// Pure functions: no DOM, so the wording can be tested.

export const CONFIDENCE = {
  high: { word: "Very likely", hint: "I'm quite sure about this one" },
  medium: { word: "Likely", hint: "This looks right, but worth a glance" },
  low: { word: "Possible", hint: "A guess. Check this one before you accept" },
};

// How a category reads inside a sentence: plural ("shopping sites") and singular ("a shopping site").
const KIND = {
  Shopping: ["shopping sites", "a shopping site"],
  "Video & Entertainment": ["video and entertainment sites", "a video or entertainment site"],
  Social: ["social media", "a social media site"],
  News: ["news sites", "a news site"],
  Finance: ["banking and finance sites", "a banking or finance site"],
  Travel: ["travel sites", "a travel site"],
  Development: ["coding and developer sites", "a coding or developer site"],
  Learning: ["learning sites", "a learning site"],
  Careers: ["job-hunting sites", "a job-hunting site"],
  "AI Tools": ["AI tools", "an AI tool"],
  "Work & Productivity": ["work and productivity tools", "a work or productivity tool"],
};
export const kindPhrase = (category) => KIND[category]?.[0] ?? `${String(category).toLowerCase()} sites`;
export const kindOne = (category) => KIND[category]?.[1] ?? `a ${String(category).toLowerCase()} site`;

export const shorten = (text, max = 42) => {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};
const quote = (text) => `“${shorten(text)}”`;
const quoteList = (titles) => {
  const list = (titles ?? []).filter(Boolean).slice(0, 2).map(quote);
  if (!list.length) return "";
  return list.length === 1 ? list[0] : `${list[0]} and ${list[1]}`;
};

export function describeWhy(why) {
  if (!why) return "";
  switch (why.type) {
    case "sameSite":
      return why.count >= why.total
        ? `Your other ${why.host} bookmarks are in ${quote(why.folder)}.`
        : `You keep ${why.count} of your ${why.total} ${why.host} bookmarks in ${quote(why.folder)}.`;
    case "folderName":
      return `Its title or website matches your ${quote(why.folder)} folder.`;
    case "category":
      return `Looks like ${kindPhrase(why.category)}, and you already have a ${quote(why.folder)} folder for those.`;
    case "kindFolder":
      return `Your ${quote(why.folder)} folder is mostly ${kindPhrase(why.category)}, like this one.`;
    case "similar": {
      const seen = quoteList(why.titles);
      return seen ? `Looks a lot like your ${seen} in ${quote(why.folder)}.` : `Looks similar to what's in ${quote(why.folder)}.`;
    }
    case "similarElsewhere": {
      const seen = quoteList(why.titles);
      return seen
        ? `Fits better with your ${seen} in ${quote(why.folder)} than with the rest of ${quote(why.ownFolder)}.`
        : `Fits better in ${quote(why.folder)} than in ${quote(why.ownFolder)}.`;
    }
    case "otherKind": {
      const base = `${why.host} looks like ${kindOne(why.category)}, but most of ${quote(why.ownFolder)} is ${kindPhrase(why.ownKind)}.`;
      return why.folder ? `${base} ${quote(why.folder)} is a better home.` : base;
    }
    case "newFolder":
      return `Looks like ${kindPhrase(why.category)}. I'd start a new ${quote(why.category)} folder for these.`;
    case "duplicate":
      return why.keepFolder ? `You saved this twice. I'd keep the earlier copy in ${quote(why.keepFolder)}.` : "You saved this twice. I'd keep the earlier copy.";
    case "unknown":
      return "I couldn't tell where this belongs, so I left it alone.";
    case "single":
      return `Looks like ${kindPhrase(why.category)}, but it's the only one, so I didn't start a new folder for it.`;
    default:
      return "";
  }
}

// Why a bookmarks-bar item is treated as a shortcut, in everyday words.
export function shortcutWhy(reason) {
  const text = String(reason ?? "");
  if (text.startsWith("Kept on the bar")) return "You asked me to keep this on the bar.";
  if (text.startsWith("Icon-only")) return "It has no name, so it's probably an icon shortcut.";
  if (text.startsWith("Bookmarklet")) return "It's a little tool, not a web page.";
  if (text.startsWith("Browser page")) return "It opens a browser page, like settings.";
  if (text.startsWith("Web app")) return "A site you open every day.";
  if (text.startsWith("Site home")) return "A site's home page with a short name.";
  if (text.startsWith("Short custom")) return "It has a short custom name, like a shortcut.";
  return "It looks like something you click to open.";
}

// A folder path as the interface shows it: a name, and where it lives only when that helps.
export function folderChip(path, { isNew = false } = {}) {
  const parts = path ?? [];
  if (parts.length <= 1) {
    return { name: parts[0] ?? "", hint: "not in a folder", isRoot: true, isNew: false, full: parts.join(" › ") };
  }
  return {
    name: parts[parts.length - 1],
    hint: parts.length >= 3 ? `in ${parts[parts.length - 2]}` : "",
    isRoot: false,
    isNew,
    full: parts.join(" › "),
  };
}

export const avatarLetter = (title, host) => {
  const source = String(host || title || "?").replace(/^www\./, "");
  const match = source.match(/[\p{L}\p{N}]/u);
  return (match ? match[0] : "?").toUpperCase();
};

// A stable hue per website, so the same site always gets the same colour.
export function avatarHue(host) {
  let hash = 0;
  for (const char of String(host ?? "")) hash = (hash * 31 + char.codePointAt(0)) % 360;
  return hash;
}

export const rowsLabel = (n, one, many) => `${n} ${n === 1 ? one : many}`;
