"""Apply an approved plan to an in-memory tree and export the result."""
from __future__ import annotations

import html
from pathlib import Path as FsPath

from .model import Node, find_folder, remove_node, walk_bookmarks
from .planner import normalize_url


def apply_plan(root: Node, plan: dict, drop_duplicates: bool = False) -> dict:
    stats = {"moved": 0, "skipped": 0, "dropped_duplicates": 0}
    index = {n.id: (n, p) for n, p in walk_bookmarks(root) if n.id}

    for move in plan.get("moves", []):
        hit = index.get(move.get("id", ""))
        target = tuple(move.get("to", ()))
        if not move.get("approved", True) or hit is None or not target:
            stats["skipped"] += 1
            continue
        node, current = hit
        # Skip if the bookmark is no longer where the plan saw it, or the target root doesn't exist
        if list(current) != list(move["from"]) or find_folder(root, target[:1]) is None:
            stats["skipped"] += 1
            continue
        remove_node(find_folder(root, current), node)
        find_folder(root, target, create=True).children.append(node)
        index[node.id] = (node, target)
        stats["moved"] += 1

    if drop_duplicates:
        groups = {}
        for order, (node, path) in enumerate(walk_bookmarks(root)):
            groups.setdefault(normalize_url(node.url), []).append((node.add_date or 10**12, order, node, path))
        for entries in groups.values():
            entries.sort(key=lambda e: (e[0], e[1]))  # keep the earliest-added bookmark
            for _, _, node, path in entries[1:]:
                remove_node(find_folder(root, path), node)
                stats["dropped_duplicates"] += 1
    return stats


def write_netscape_html(root: Node, out_path: FsPath) -> None:
    """Netscape bookmark HTML, which Chrome's 'Import bookmarks' accepts."""
    lines = [
        "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
        '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
        "<TITLE>Bookmarks</TITLE>",
        "<H1>Bookmarks</H1>",
        "<DL><p>",
    ]

    def emit(node: Node, depth: int) -> None:
        pad = "    " * depth
        for child in node.children:
            if child.is_folder:
                toolbar = ' PERSONAL_TOOLBAR_FOLDER="true"' if child.role == "toolbar" else ""
                lines.append(f'{pad}<DT><H3 ADD_DATE="{child.add_date}"{toolbar}>{html.escape(child.name)}</H3>')
                lines.append(f"{pad}<DL><p>")
                emit(child, depth + 1)
                lines.append(f"{pad}</DL><p>")
            else:
                lines.append(
                    f'{pad}<DT><A HREF="{html.escape(child.url, quote=True)}" ADD_DATE="{child.add_date}">'
                    f"{html.escape(child.name)}</A>"
                )

    emit(root, 1)
    lines.append("</DL><p>")
    out_path = FsPath(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
