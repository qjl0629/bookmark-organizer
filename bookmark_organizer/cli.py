"""Command line interface: scan, plan, apply."""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path as FsPath

from .applier import apply_plan, write_netscape_html
from .model import walk_bookmarks, walk_folders
from .parser import default_chrome_bookmarks_path, file_sha256, load_chrome_bookmarks
from .planner import build_plan, find_duplicates


def _source(args) -> FsPath:
    path = FsPath(args.file).expanduser() if args.file else default_chrome_bookmarks_path()
    if not path.exists():
        sys.exit(f"Bookmarks file not found: {path}\nPass one with --file.")
    return path


def cmd_scan(args) -> None:
    source = _source(args)
    root = load_chrome_bookmarks(source)
    items = list(walk_bookmarks(root))
    per_folder = Counter("/".join(p) for _, p in items)
    print(f"File: {source}")
    print(f"Bookmarks: {len(items)}  Folders: {sum(1 for _ in walk_folders(root))}")
    print(f"Loose (directly in a root folder): {sum(1 for _, p in items if len(p) == 1)}")
    print(f"Duplicate groups: {len(find_duplicates(root))}")
    print("Largest folders:")
    for folder, count in per_folder.most_common(10):
        print(f"  {count:5d}  {folder}")


def cmd_plan(args) -> None:
    source = _source(args)
    plan = build_plan(load_chrome_bookmarks(source), source, file_sha256(source), args.min_new_folder_size)
    out = FsPath(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(plan, indent=2, ensure_ascii=False), encoding="utf-8")
    confidence = Counter(m["confidence"] for m in plan["moves"])
    print(f"Plan written to {out} (nothing has been changed).")
    print(f"Proposed moves: {len(plan['moves'])}  " + "  ".join(f"{k}: {v}" for k, v in sorted(confidence.items())))
    print(f"New folders: {len(plan['new_folders'])}  Unclassified: {len(plan['unclassified'])}  Duplicate groups: {len(plan['duplicates'])}")
    print('Review the file. Set "approved": false or edit "to" on any move, then run `apply`.')


def cmd_apply(args) -> None:
    plan = json.loads(FsPath(args.plan).read_text(encoding="utf-8"))
    source = FsPath(args.file).expanduser() if args.file else FsPath(plan["source"])
    if file_sha256(source) != plan["source_sha256"]:
        sys.exit("The bookmarks file changed since this plan was created. Run `plan` again.")
    root = load_chrome_bookmarks(source)
    before = sum(1 for _ in walk_bookmarks(root))
    approved = sum(1 for m in plan["moves"] if m.get("approved", True))
    print(f"About to apply {approved} approved moves" + (" and drop duplicates" if args.drop_duplicates else "") + ".")
    if not args.yes and input("Type 'yes' to continue: ").strip().lower() != "yes":
        sys.exit("Cancelled. Nothing was changed.")
    out = FsPath(args.out)
    backup = out.parent / f"Bookmarks.backup-{datetime.now():%Y%m%d-%H%M%S}"
    out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, backup)
    stats = apply_plan(root, plan, args.drop_duplicates)
    after = sum(1 for _ in walk_bookmarks(root))
    if after != before - stats["dropped_duplicates"]:
        sys.exit("Bookmark count check failed; no output written.")
    write_netscape_html(root, out)
    print(f"Moved {stats['moved']}, skipped {stats['skipped']}, dropped duplicates {stats['dropped_duplicates']}.")
    print(f"Backup of the original: {backup}\nOrganized file: {out}")
    print("To use it: Chrome > Bookmarks > Bookmark manager > menu > Import bookmarks.")


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(prog="bookmark-organizer", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    scan = sub.add_parser("scan", help="summarize a Chrome bookmarks file")
    scan.add_argument("--file", help="path to Chrome's Bookmarks file (default: auto-detect)")
    scan.set_defaults(func=cmd_scan)

    plan = sub.add_parser("plan", help="write a reorganization plan for review")
    plan.add_argument("--file")
    plan.add_argument("--out", default="plans/plan.json")
    plan.add_argument("--min-new-folder-size", type=int, default=2, help="minimum bookmarks needed to suggest a new folder")
    plan.set_defaults(func=cmd_plan)

    apply = sub.add_parser("apply", help="apply a reviewed plan and write an importable HTML file")
    apply.add_argument("--plan", default="plans/plan.json")
    apply.add_argument("--file")
    apply.add_argument("--out", default="output/organized.html")
    apply.add_argument("--drop-duplicates", action="store_true")
    apply.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    apply.set_defaults(func=cmd_apply)

    args = parser.parse_args(argv)
    args.func(args)
