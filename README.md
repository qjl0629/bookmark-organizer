# Bookmark Organizer

A Chrome extension that organizes your bookmarks the way you already do. It learns from the folders you built, shows every proposed move, and can undo the whole run.

- **Learns from you.** A loose bookmark follows the folder that already holds most bookmarks from the same site, or the folder that mostly holds that kind of site (a folder called "Buy" full of shopping sites counts as your shopping folder). Built-in categories are only a fallback.
- **Your shortcuts stay put.** Things on the bookmarks bar that you click to *use* (Gmail, ChatGPT, bookmarklets, icon-only bookmarks, short-named home pages) are never moved. You can mark any item "Keep on bar" or "Organize it anyway", and it is remembered.
- **Catches misfiled bookmarks.** Learns what each of your folders is about from what is already in it, then flags a bookmark that resembles a different folder much more than its own, and says which bookmarks it resembles. Works for work and internal sites too. Suggestions are never pre-selected, and "Keep here" is remembered.
- **You approve everything.** Review proposed moves grouped by destination, untick anything you disagree with, then apply.
- **One-click undo.** Restores the original positions of the last run.
- **Private by design.** No account, no API key, no network requests. The only permissions are `bookmarks` and `storage`.
- **Safe by default.** Bookmarks you already filed are only moved if you tick a suggestion. Duplicates are only removed if you tick them.

> Status: v0.1, not yet on the Chrome Web Store. Install it from source below.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the `extension` folder.
4. Click the extension's toolbar button to open the organizer.

## How it decides

**Shortcuts first.** A bookmark directly on the bookmarks bar is left alone if it looks like something you click to use: no title (icon only), a bookmarklet, a web app you open often (mail, calendar, ChatGPT, Claude, ...), a site home page with a short name, or a very short custom name. A saved ChatGPT conversation is *not* a shortcut. Leaving something alone is the safe failure mode, so the rules lean towards protecting.

**Loose bookmarks** (directly in a root folder, not protected above), in this order:

1. **Same site, already filed.** Most bookmarks from that site are already in one of your folders.
2. **Same registrable domain, strong evidence.** At least 3 bookmarks and 80% in one folder. Rated "medium" at most, because platforms like `google.com` host everything.
3. **Folder name matches the title.** Handles plurals, and Chinese or other non-ASCII folder names.
4. **Folder that mostly holds that kind of site**, whatever it is called.
5. **Built-in category** (Shopping, Social, Development, Video & Entertainment, Travel, ...). Suggested as a new folder only when at least 2 bookmarks fit.
6. Otherwise it is left alone and listed under "Left alone".

**Bookmarks already in folders** are checked two ways, and only flagged when another folder clearly fits better:

- **By content, learned from your own folders.** Each bookmark is turned into its address, the first parts of its path and the words in its title, then compared with what every folder already holds. A bookmark that resembles a different folder much more than its own is flagged, with the two or three bookmarks it resembles shown as the reason. This works for work and internal sites that no built-in list could know. As a test, every bookmark is hidden in turn and its folder guessed from the rest. Folders where that guess is right less than half the time (their bookmarks don't resemble each other) are skipped, and listed under "How I read your folders" so you can see why.
- **By kind of site.** A shopping site inside a folder of videos, using the built-in categories. Holding folders such as "Read later" are never judged.

Loose bookmarks that match no rule above are also placed by content similarity before a new folder is suggested.

Every proposal shows its confidence and the reason.

**Limits.** It judges by words and addresses, not by what a page says, so two unrelated pages with similar titles can be confused, and folders with fewer than 4 bookmarks can't be judged. On a library with few bookmarks per folder expect more false alarms, which is why nothing in "Possibly in the wrong folder" is pre-selected. A wrong suggestion costs more trust than a missed one.

## Try it without touching your bookmarks

Opening `extension/organizer.html` outside Chrome loads fictional demo data, which is handy for screenshots:

```bash
python3 -m http.server 8765 --directory extension
# open http://127.0.0.1:8765/organizer.html
```

## Development

No build step and no dependencies.

```bash
node --test extension/tests/*.test.js    # Node 22+
```

- `extension/src/planner.js`: classification and misfiled detection, pure functions
- `extension/src/learn.js`: learns what each folder is about (TF-IDF similarity, leave-one-out check)
- `extension/src/quickaccess.js`: which bookmarks-bar items count as shortcuts
- `extension/src/url.js`: URL helpers
- `extension/src/apply.js`: apply and undo through an injected bookmarks API
- `extension/src/memory-bookmarks.js`: in-memory `chrome.bookmarks` used by tests and demo mode
- `extension/organizer.js`: the interface (all bookmark text is rendered as text, never HTML)

## Command-line version

The original Python version works on a Chrome `Bookmarks` file and writes an importable HTML file instead of editing Chrome directly. It is the basic version: it does **not** include shortcut protection or misfiled-bookmark detection. See `bookmark_organizer/`.

```bash
python3 -m bookmark_organizer scan
python3 -m bookmark_organizer plan     # writes plans/plan.json, changes nothing
python3 -m bookmark_organizer apply    # asks for confirmation, writes output/organized.html
python3 -m unittest discover -s tests
```

## Roadmap

- Chrome Web Store listing and icons
- Dead-link detection (opt-in)
- Optional local or bring-your-own-key AI for naming new folders
- Edit a proposed destination before applying

## License

MIT
