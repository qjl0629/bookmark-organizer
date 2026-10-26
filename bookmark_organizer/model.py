"""Bookmark tree model shared by all modules."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterator, Optional, Tuple

Path = Tuple[str, ...]


@dataclass
class Node:
    name: str
    url: Optional[str] = None  # None means folder
    id: str = ""
    add_date: int = 0  # unix seconds
    role: str = ""  # "toolbar" marks the bookmarks bar root
    children: list = field(default_factory=list)

    @property
    def is_folder(self) -> bool:
        return self.url is None


def walk_bookmarks(node: Node, path: Path = ()) -> Iterator[Tuple[Node, Path]]:
    """Yield (bookmark, folder_path). Paths start with the root folder name."""
    for child in node.children:
        if child.is_folder:
            yield from walk_bookmarks(child, path + (child.name,))
        else:
            yield child, path


def walk_folders(node: Node, path: Path = ()) -> Iterator[Tuple[Node, Path]]:
    for child in node.children:
        if child.is_folder:
            child_path = path + (child.name,)
            yield child, child_path
            yield from walk_folders(child, child_path)


def find_folder(root: Node, path: Path, create: bool = False) -> Optional[Node]:
    node = root
    for name in path:
        match = next(
            (c for c in node.children if c.is_folder and c.name.lower() == name.lower()),
            None,
        )
        if match is None:
            if not create:
                return None
            match = Node(name=name)
            node.children.append(match)
        node = match
    return node


def remove_node(parent: Node, target: Node) -> None:
    """Remove by identity; dataclass equality could match a different bookmark."""
    parent.children[:] = [c for c in parent.children if c is not target]
