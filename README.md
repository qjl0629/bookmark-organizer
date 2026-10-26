# bookmark-organizer

A command-line tool that analyzes a Chrome bookmarks file and proposes a cleaner folder structure. It never changes anything until you review and confirm the plan.

## How it works

1. **Scan**: read a Chrome bookmarks file and summarize existing folders and bookmarks.
2. **Propose**: group bookmarks using your existing folders first. If nothing fits, suggest new folders based on common categories.
3. **Review**: print the plan (moves, new folders, duplicates) for you to approve.
4. **Apply**: after confirmation, write a new organized file. The original is backed up and never overwritten.

## Status

Early development.

## Privacy

Your real bookmarks stay on your machine. Bookmark exports and backups are excluded by `.gitignore`.
