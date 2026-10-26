# Privacy policy

*Marksly (Chrome extension). Last updated: October 2026.*

**Short version: Marksly does not collect, send or sell any data. Everything happens on your computer.**

## What Marksly reads

- **Your bookmarks** (titles, addresses and folders), through Chrome's `bookmarks` permission, to suggest where they belong and to move them when you confirm.
- **When each bookmark was last opened**, a date Chrome stores for each bookmark, to find what you use most and what you have not opened for a long time.
- **Optional: browsing history counts.** Only if you press "Allow and use my history", Chrome asks for the optional `history` permission. Marksly then counts how many times you visited each bookmarked page in the last 3 months. It does not read other history, and you can turn it off at any time in the page or in `chrome://extensions`.

## What Marksly stores

Marksly uses Chrome's `storage` permission to keep, **on this device only**, small settings: which bar items you chose to keep in place, suggestions you dismissed, whether smart matching is on, and the undo record of the last run (bookmark ids and their previous positions).

## What Marksly sends

**Nothing.** The extension makes no network requests. The model it uses to understand what a page is about is a file bundled inside the extension and is read from there. The source code is public, and an automated test fails if network code is added.

## Third parties

None. No analytics, no advertising, no remote code. The bundled model is [`minishlab/potion-base-8M`](https://huggingface.co/minishlab/potion-base-8M) (MIT licence); it runs locally.

## Your control

Nothing is moved or deleted until you confirm, and the last run can be undone from the same page. Removing the extension removes its stored settings.

## Contact

Questions: open an issue at <https://github.com/qjl0629/bookmark-organizer/issues>.
