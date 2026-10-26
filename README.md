# Bookmark Organizer

A Chrome extension that organizes your bookmarks the way you already do. It learns from the folders you built, shows every proposed move, and can undo the whole run.

- **Learns from you.** A loose bookmark follows the folder that already holds most bookmarks from the same site, or a folder whose name matches its title. Built-in categories are only a fallback.
- **You approve everything.** Review proposed moves grouped by destination, untick anything you disagree with, then apply.
- **One-click undo.** Restores the original positions of the last run.
- **Private by design.** No account, no API key, no network requests. The only permissions are `bookmarks` and `storage`.
- **Safe by default.** Bookmarks you already filed are never moved. Duplicates are only removed if you tick them.

> Status: v0.1, not yet on the Chrome Web Store. Install it from source below.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the `extension` folder.
4. Click the extension's toolbar button to open the organizer.

## How it decides

For each bookmark that sits loose in a root folder (for example directly on the bookmarks bar), in this order:

1. **Same site, already filed.** Most bookmarks from that site are already in one of your folders.
2. **Same registrable domain, strong evidence.** At least 3 bookmarks and 80% in one folder. Rated "medium" at most, because platforms like `google.com` host everything.
3. **Folder name matches the title.** Handles plurals, and Chinese or other non-ASCII folder names.
4. **Built-in category** (Shopping, Social, Development, Video & Entertainment, Travel, ...). Suggested as a new folder only when at least 2 bookmarks fit.
5. Otherwise it is left alone and listed under "Left alone".

Every proposal shows its confidence and the reason.

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

- `extension/src/planner.js`: classification, pure functions
- `extension/src/apply.js`: apply and undo through an injected bookmarks API
- `extension/src/memory-bookmarks.js`: in-memory `chrome.bookmarks` used by tests and demo mode
- `extension/organizer.js`: the interface (all bookmark text is rendered as text, never HTML)

## Command-line version

The original Python version works on a Chrome `Bookmarks` file and writes an importable HTML file instead of editing Chrome directly. See `bookmark_organizer/`.

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
