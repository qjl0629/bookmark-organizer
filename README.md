# Bookmark Organizer

A Chrome extension that organizes your bookmarks the way you already do. It learns from the folders you built, shows every proposed move, and can undo the whole run.

- **You always see where a bookmark is going.** Every suggestion reads as a route: the site, the folder it is in now, an arrow, and the folder I'd put it in, plus one plain sentence on why. No scores or jargon.
- **Learns from you.** A loose bookmark follows the folder that already holds most bookmarks from the same site, or the folder that mostly holds that kind of site (a folder called "Buy" full of shopping sites counts as your shopping folder). Built-in categories are only a fallback.
- **Your shortcuts stay put.** Things on the bookmarks bar that you click to *use* (Gmail, ChatGPT, bookmarklets, icon-only bookmarks, short-named home pages) are never moved. You can mark any item "Keep on bar" or "Organize it anyway", and it is remembered.
- **Understands what a page is about.** A small language model ships inside the extension (about 8 MB, runs on your computer). A bookmark about pasta belongs with your recipes even if no word is shared, and a mortgage article in your Health folder gets flagged. It can be switched off in "How I decide".
- **Catches misfiled bookmarks.** Learns what each of your folders is about from what is already in it, then flags a bookmark that resembles a different folder much more than its own, and says which bookmarks it resembles. Works for work and internal sites too. "Keep here" is remembered.
- **You approve everything, in one click if you trust it.** The top button, **Tidy up everything**, selects every suggestion and asks for a final yes. Each section also has **Select all**, **Only the likely ones** and **Clear**, and a floating bar keeps the count and the **Tidy up** button in reach. Nothing changes until you confirm.
- **One-click undo.** Restores the original positions of the last run, including removed duplicates.
- **Private by design.** No account, no API key, no network requests. The meaning model is a file inside the extension and is read from there, never downloaded. The only permissions are `bookmarks` and `storage`.
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
- **A shared website is not a shared topic.** A site that appears in several of your folders (SharePoint, a ticketing portal) is treated as a platform and ignored, as are generic address parts like `sites` or `wiki`, and a title that is just a web address has no words of its own. To suggest a move, a bookmark must also share at least two words or address parts with the target folder. Bookmarks in a specific folder are not pulled into a general one just because they live on the same website.
- **By kind of site.** A shopping site inside a folder of videos, using the built-in categories. Holding folders such as "Read later" are never judged.

Loose bookmarks that match no rule above are also placed by content similarity before a new folder is suggested.

**Smart matching (the bundled model).** Word overlap can't tell that "Roth conversion ladder" belongs with "Mortgage rates". The extension therefore includes [`minishlab/potion-base-8M`](https://huggingface.co/minishlab/potion-base-8M) (MIT licence), a static word-embedding model: every word has a fixed vector, and a bookmark's meaning is the average of its words. It needs no GPU, loads in about 0.1 s, and takes about 1.4 s to plan 3,300 bookmarks in 120 folders. Each folder is described by the average meaning of its bookmarks, its two closest bookmarks, and its name. A bookmark is flagged only when another folder fits clearly better than its own (a gap that the folder's own members never reach). A website that appears in several folders is left out of the text, so a shared SharePoint host never decides anything. `tools/build_model.py` rebuilds the files in `extension/model/` from the original.

Measured on two invented libraries (tests run on every change). Word matching alone found 0 of 22 planted misfiles; with the model:

| Library | Misfiled found (right folder) | Wrongly flagged | Loose bookmarks placed |
|---|---|---|---|
| A (thresholds tuned on it) | 11 of 14 | 1 | 11 of 12 correct, 0 wrong |
| B (written afterwards, not tuned) | 7 of 8 | 0 | 6 of 6 correct |

These are my own test libraries, not a promise about yours.

**Limits.** The model knows everyday topics (food, travel, money, health, common programming terms) but has never heard of newer or very specific products, so it can't know that "Copilot Studio" belongs with Power Platform. In library A it reads "Copilot Studio" as GitHub Copilot and flags it; that is the one wrong flag above, and the test suite keeps it as a known case. Folders with fewer than 4 bookmarks can't be judged. Knowing such relationships needs a large language model, which would mean sending bookmarks to a server, and this project doesn't do that.

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
- `extension/src/learn.js`: learns what each folder is about (TF-IDF similarity, leave-one-out check, and the meaning-based path)
- `extension/src/semantic.js`, `embed.js`, `model-loader.js`: meaning scores, the small embedder (WordPiece + averaged vectors), and the same-origin model loader
- `extension/src/quickaccess.js`: which bookmarks-bar items count as shortcuts
- `extension/src/url.js`: URL helpers
- `extension/src/present.js`: turns reasons into plain sentences and prepares what the interface shows (tested, so the wording stays human)
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
