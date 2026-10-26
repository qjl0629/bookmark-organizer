"""Read a Chrome bookmarks file into a Node tree."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path as FsPath
from typing import Union

from .model import Node

WEBKIT_EPOCH_OFFSET = 11_644_473_600  # seconds between 1601-01-01 and 1970-01-01
ROOT_KEYS = ("bookmark_bar", "other", "synced")


def default_chrome_bookmarks_path() -> FsPath:
    home = FsPath.home()
    candidates = [
        home / "Library/Application Support/Google/Chrome/Default/Bookmarks",
        home / ".config/google-chrome/Default/Bookmarks",
        home / "AppData/Local/Google/Chrome/User Data/Default/Bookmarks",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def _to_unix(webkit_time: Union[str, int, None]) -> int:
    try:
        value = int(webkit_time)
    except (TypeError, ValueError):
        return 0
    if value <= 0:
        return 0
    return max(value // 1_000_000 - WEBKIT_EPOCH_OFFSET, 0)


def _parse_node(data: dict) -> Node:
    node = Node(
        name=data.get("name", ""),
        id=str(data.get("id", "")),
        add_date=_to_unix(data.get("date_added")),
    )
    if data.get("type") == "folder":
        node.children = [_parse_node(child) for child in data.get("children", [])]
    else:
        node.url = data.get("url", "")
    return node


def parse_chrome_bookmarks(data: dict) -> Node:
    """Return a synthetic top node whose children are Chrome's root folders."""
    roots = data.get("roots", {})
    top = Node(name="")
    for key in ROOT_KEYS:
        if key in roots:
            root = _parse_node(roots[key])
            if key == "bookmark_bar":
                root.role = "toolbar"
            top.children.append(root)
    return top


def load_chrome_bookmarks(path: FsPath) -> Node:
    return parse_chrome_bookmarks(json.loads(FsPath(path).read_text(encoding="utf-8")))


def file_sha256(path: FsPath) -> str:
    return hashlib.sha256(FsPath(path).read_bytes()).hexdigest()
