# bookmark-organizer

A command-line tool that analyzes a Chrome bookmarks file and proposes a cleaner folder structure. It never changes anything until you review and confirm the plan.

## How it works

1. **Scan**: read a Chrome bookmarks file and summarize existing folders and bookmarks.
2. **Propose**: group bookmarks using your existing folders first. If nothing fits, suggest new folders based on common categories.
3. **Review**: print the plan (moves, new folders, duplicates) for you to approve.
4. **Apply**: after confirmation, write a new organized file. The original is backed up and never overwritten.

## Status

Early development (v0.1). Standard library only, Python 3.9+.

## Usage

```bash
python3 -m bookmark_organizer scan                      # summarize your bookmarks
python3 -m bookmark_organizer plan                      # write plans/plan.json (changes nothing)
# review plans/plan.json: set "approved": false or edit "to" on any move
python3 -m bookmark_organizer apply [--drop-duplicates] # asks for confirmation first
```

By default it reads Chrome's `Default` profile bookmarks file. Use `--file` for another path or profile.

`apply` never edits Chrome's file. It copies the original to `output/`, then writes `output/organized.html`. Import it in Chrome via Bookmarks > Bookmark manager > menu > Import bookmarks.

## What it organizes

- Only bookmarks sitting loose in a root folder (for example directly on the bookmarks bar). Bookmarks you already filed are left alone and used to learn your categories.
- Existing folders come first: a bookmark follows the folder that already holds most bookmarks from the same site, or a folder whose name matches the title.
- Otherwise a built-in category (Shopping, Social, Development, ...) is suggested as a new folder, only when at least two bookmarks fit.
- Duplicates (same URL after removing tracking parameters) are reported, and only dropped with `--drop-duplicates`.
- `apply` refuses to run if the bookmarks file changed after the plan was created.

## Tests

```bash
python3 -m unittest discover -s tests
```

## Privacy

Your real bookmarks stay on your machine. Bookmark exports and backups are excluded by `.gitignore`.
