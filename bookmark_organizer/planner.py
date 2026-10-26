"""Build a reviewable reorganization plan. Nothing here modifies any file."""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path as FsPath
from typing import Dict, List, Optional, Tuple
from urllib.parse import parse_qsl, urlencode, urlsplit

from .categories import categorize
from .model import Node, Path, walk_bookmarks, walk_folders

TRACKING_PARAMS = ("utm_", "fbclid", "gclid", "mc_cid", "mc_eid")
CONFIDENCE_ORDER = {"high": 0, "medium": 1, "low": 2}


def host_of(url: str) -> str:
    try:
        host = urlsplit(url).hostname or ""
    except ValueError:
        host = ""
    host = host.lower()
    return host[4:] if host.startswith("www.") else host


TWO_PART_SUFFIXES = {
    "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.jp", "co.nz",
    "com.cn", "net.cn", "org.cn", "gov.cn", "com.hk", "com.tw", "co.kr", "com.br", "co.in", "co.za",
}


def base_domain(host: str) -> str:
    """Registrable domain: news.bbc.co.uk -> bbc.co.uk, mail.google.com -> google.com."""
    parts = host.split(".")
    keep = 3 if len(parts) >= 3 and ".".join(parts[-2:]) in TWO_PART_SUFFIXES else 2
    return ".".join(parts[-keep:]) if len(parts) > keep else host


def normalize_url(url: str) -> str:
    url = url.strip()
    try:
        parts = urlsplit(url)
    except ValueError:
        return url
    query = sorted(
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if not k.lower().startswith(TRACKING_PARAMS)
    )
    result = f"{parts.scheme.lower()}://{host_of(url)}{parts.path.rstrip('/')}"
    return result + (f"?{urlencode(query)}" if query else "")


def find_duplicates(root: Node) -> List[List[dict]]:
    groups: Dict[str, list] = defaultdict(list)
    for order, (node, path) in enumerate(walk_bookmarks(root)):
        groups[normalize_url(node.url)].append((node.add_date or 10**12, order, node, path))
    result = []
    for entries in groups.values():
        if len(entries) > 1:
            entries.sort(key=lambda e: (e[0], e[1]))  # earliest first = the one kept
            result.append(
                [{"id": n.id, "title": n.name, "url": n.url, "folder": list(p)} for _, _, n, p in entries]
            )
    return result


def _stem(token: str) -> str:
    return token[:-1] if len(token) > 3 and token.endswith("s") else token


def _tokens(text: str) -> set:
    return {_stem(t) for t in re.findall(r"\w+", text.lower()) if len(t) > 1}


def _folder_matches(name: str, title: str, host: str) -> bool:
    name_l = name.strip().lower()
    if not name_l:
        return False
    text = f"{title} {host}".lower()
    if not name_l.isascii():
        return len(name_l) >= 2 and name_l in text
    name_tokens = _tokens(name_l)
    return bool(name_tokens) and name_tokens <= _tokens(text)


def _learn(filed: List[Tuple[Node, Path]]):
    by_host: Dict[str, Counter] = defaultdict(Counter)
    by_base: Dict[str, Counter] = defaultdict(Counter)
    for node, path in filed:
        host = host_of(node.url)
        if host:
            by_host[host][path] += 1
            by_base[base_domain(host)][path] += 1
    return by_host, by_base


def _from_counts(counter: Optional[Counter], label: str, min_count: int = 1, min_share: float = 0.6, cap: Optional[str] = None):
    if not counter:
        return None
    path, count = counter.most_common(1)[0]
    total = sum(counter.values())
    if count < min_count or count / total < min_share:
        return None
    confidence = cap or ("high" if count >= 2 else "medium")
    return path, confidence, f"{count} of {total} bookmarks from {label} are already in '{'/'.join(path)}'"


def build_plan(root: Node, source: FsPath, source_sha256: str, min_new_folder_size: int = 2) -> dict:
    items = list(walk_bookmarks(root))
    loose = [(n, p) for n, p in items if len(p) == 1]
    filed = [(n, p) for n, p in items if len(p) > 1]
    by_host, by_base = _learn(filed)

    existing: Dict[str, Path] = {}
    for node, path in walk_folders(root):
        key = node.name.strip().lower()
        if len(path) >= 2 and key and (key not in existing or len(path) < len(existing[key])):
            existing[key] = path

    decisions = []  # (node, from_path, to_path, confidence, reason)
    category_candidates = []  # (node, from_path, category)
    unclassified = []
    for node, path in loose:
        host = host_of(node.url)
        # Exact host first. The whole registrable domain is weaker evidence (google.com hosts
        # everything), so it needs a strong majority and is never rated "high".
        found = _from_counts(by_host.get(host), host) or _from_counts(
            by_base.get(base_domain(host)), base_domain(host), min_count=3, min_share=0.8, cap="medium"
        )
        if found:
            decisions.append((node, path, *found))
            continue
        matches = [(name, p) for name, p in existing.items() if _folder_matches(name, node.name, host)]
        if matches:
            name, target = max(matches, key=lambda m: len(_tokens(m[0])) or len(m[0]))
            decisions.append((node, path, target, "medium", f"title or site mentions existing folder '{name}'"))
            continue
        category = categorize(node.url, node.name)
        if category is None:
            unclassified.append((node, path, "no matching folder or known category"))
        elif category.lower() in existing:
            decisions.append((node, path, existing[category.lower()], "medium", f"category '{category}' matches an existing folder"))
        else:
            category_candidates.append((node, path, category))

    counts = Counter((path[0], category) for _, path, category in category_candidates)
    for node, path, category in category_candidates:
        if counts[(path[0], category)] >= min_new_folder_size:
            decisions.append((node, path, (path[0], category), "low", f"category '{category}' (new folder suggested)"))
        else:
            unclassified.append((node, path, f"only one '{category}' bookmark; not enough for a new folder"))

    decisions.sort(key=lambda d: (CONFIDENCE_ORDER[d[3]], "/".join(d[2])))
    moves = [
        {"id": n.id, "title": n.name, "url": n.url, "from": list(src), "to": list(dst),
         "confidence": conf, "reason": reason, "approved": True}
        for n, src, dst, conf, reason in decisions
    ]
    new_folders = sorted({"/".join(m["to"]) for m in moves if len(m["to"]) >= 2 and m["to"][-1].lower() not in existing})
    return {
        "version": 1,
        "created": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": str(source),
        "source_sha256": source_sha256,
        "summary": {
            "bookmarks": len(items),
            "loose": len(loose),
            "moves": len(moves),
            "unclassified": len(unclassified),
            "duplicate_groups": len(find_duplicates(root)),
        },
        "moves": moves,
        "new_folders": new_folders,
        "unclassified": [
            {"id": n.id, "title": n.name, "url": n.url, "folder": list(p), "reason": r} for n, p, r in unclassified
        ],
        "duplicates": find_duplicates(root),
        "empty_folders": ["/".join(p) for node, p in walk_folders(root) if not node.children and len(p) >= 2],
    }
