import json
import tempfile
import unittest
from pathlib import Path

from bookmark_organizer.applier import apply_plan, write_netscape_html
from bookmark_organizer.categories import categorize
from bookmark_organizer.cli import main
from bookmark_organizer.model import walk_bookmarks
from bookmark_organizer.parser import parse_chrome_bookmarks
from bookmark_organizer.planner import build_plan, find_duplicates, normalize_url


def url(i, name, link, added="13300000000000000"):
    return {"type": "url", "id": str(i), "name": name, "url": link, "date_added": added}


def folder(i, name, children):
    return {"type": "folder", "id": str(i), "name": name, "children": children}


def chrome_data(bar_children, other_children=()):
    return {
        "roots": {
            "bookmark_bar": folder(1, "Bookmarks bar", list(bar_children)),
            "other": folder(2, "Other bookmarks", list(other_children)),
            "synced": folder(3, "Mobile bookmarks", []),
        }
    }


class OrganizerTests(unittest.TestCase):
    def plan_for(self, data, **kwargs):
        return build_plan(parse_chrome_bookmarks(data), Path("x"), "hash", **kwargs)

    def test_normalize_url_ignores_tracking_and_trailing_slash(self):
        self.assertEqual(
            normalize_url("https://www.Example.com/a/?utm_source=x&b=2#frag"),
            normalize_url("https://example.com/a?b=2"),
        )

    def test_category_matches_whole_domain_labels_only(self):
        self.assertEqual(categorize("https://www.netflix.com/browse", ""), "Video & Entertainment")
        self.assertEqual(categorize("https://x.com/home", ""), "Social")
        self.assertEqual(categorize("https://www.amazon.ca/dp/1", ""), "Shopping")
        self.assertIsNone(categorize("https://notamazon.example.org", ""))

    def test_loose_bookmark_follows_existing_folder_by_domain(self):
        data = chrome_data([
            folder(10, "Dev", [url(11, "repo a", "https://github.com/a"), url(12, "repo b", "https://github.com/b")]),
            url(13, "some repo", "https://github.com/c"),
        ])
        plan = self.plan_for(data)
        move = next(m for m in plan["moves"] if m["id"] == "13")
        self.assertEqual(move["to"], ["Bookmarks bar", "Dev"])
        self.assertEqual(move["confidence"], "high")

    def test_new_folder_needs_at_least_two_bookmarks(self):
        data = chrome_data([
            url(1, "Item", "https://www.amazon.ca/dp/1"),
            url(2, "Item 2", "https://www.amazon.com/dp/2"),
            url(3, "Movie", "https://www.netflix.com/title/1"),
        ])
        plan = self.plan_for(data)
        moved = {m["id"]: m["to"] for m in plan["moves"]}
        self.assertEqual(moved["1"], ["Bookmarks bar", "Shopping"])
        self.assertEqual(moved["2"], ["Bookmarks bar", "Shopping"])
        self.assertNotIn("3", moved)
        self.assertEqual([u["id"] for u in plan["unclassified"]], ["3"])

    def test_apply_moves_bookmarks_and_keeps_all_of_them(self):
        data = chrome_data([
            folder(10, "Dev", [url(11, "a", "https://github.com/a"), url(12, "b", "https://github.com/b")]),
            url(13, "c", "https://github.com/c"),
        ])
        root = parse_chrome_bookmarks(data)
        plan = build_plan(root, Path("x"), "hash")
        before = len(list(walk_bookmarks(root)))
        stats = apply_plan(root, plan)
        self.assertEqual(stats["moved"], 1)
        self.assertEqual(len(list(walk_bookmarks(root))), before)
        self.assertTrue(all(len(p) == 2 for _, p in walk_bookmarks(root)))

    def test_unapproved_and_edited_moves_are_respected(self):
        data = chrome_data([
            folder(10, "Dev", [url(11, "a", "https://github.com/a"), url(12, "b", "https://github.com/b")]),
            url(13, "c", "https://github.com/c"),
            url(14, "d", "https://github.com/d"),
        ])
        root = parse_chrome_bookmarks(data)
        plan = build_plan(root, Path("x"), "hash")
        for m in plan["moves"]:
            if m["id"] == "13":
                m["approved"] = False
            if m["id"] == "14":
                m["to"] = ["Other bookmarks", "Custom"]
        stats = apply_plan(root, plan)
        placed = {n.id: p for n, p in walk_bookmarks(root)}
        self.assertEqual(placed["13"], ("Bookmarks bar",))
        self.assertEqual(placed["14"], ("Other bookmarks", "Custom"))
        self.assertEqual(stats["moved"], 1)

    def test_move_to_unknown_root_is_skipped(self):
        data = chrome_data([url(1, "a", "https://github.com/a")])
        root = parse_chrome_bookmarks(data)
        plan = build_plan(root, Path("x"), "hash")
        plan["moves"] = [{"id": "1", "from": ["Bookmarks bar"], "to": ["Nonexistent root", "X"], "approved": True}]
        self.assertEqual(apply_plan(root, plan)["skipped"], 1)

    def test_duplicates_detected_and_dropped_keeping_earliest(self):
        data = chrome_data([
            url(1, "later", "https://example.com/a/?utm_source=z", added="13300000000000000"),
            url(2, "earlier", "https://example.com/a", added="13200000000000000"),
        ])
        root = parse_chrome_bookmarks(data)
        self.assertEqual(len(find_duplicates(root)), 1)
        stats = apply_plan(root, {"moves": []}, drop_duplicates=True)
        remaining = [n.id for n, _ in walk_bookmarks(root)]
        self.assertEqual(stats["dropped_duplicates"], 1)
        self.assertEqual(remaining, ["2"])

    def test_html_export_escapes_and_marks_toolbar(self):
        data = chrome_data([url(1, 'A & "B"', "https://example.com/?a=1&b=2")])
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "out.html"
            write_netscape_html(parse_chrome_bookmarks(data), out)
            text = out.read_text(encoding="utf-8")
        self.assertIn("PERSONAL_TOOLBAR_FOLDER", text)
        self.assertIn("A &amp; &quot;B&quot;", text)
        self.assertIn("a=1&amp;b=2", text)

    def test_cli_end_to_end_and_changed_source_is_rejected(self):
        data = chrome_data([
            folder(10, "Dev", [url(11, "a", "https://github.com/a"), url(12, "b", "https://github.com/b")]),
            url(13, "c", "https://github.com/c"),
        ])
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            src, plan_file, out = tmp / "Bookmarks", tmp / "plan.json", tmp / "out" / "organized.html"
            src.write_text(json.dumps(data), encoding="utf-8")
            main(["plan", "--file", str(src), "--out", str(plan_file)])
            self.assertTrue(plan_file.exists())
            self.assertEqual(json.loads(src.read_text()), data)  # plan never touches the source
            main(["apply", "--plan", str(plan_file), "--file", str(src), "--out", str(out), "--yes"])
            self.assertTrue(out.exists())
            self.assertEqual(json.loads(src.read_text()), data)  # apply never overwrites the source
            self.assertEqual(len(list((tmp / "out").glob("Bookmarks.backup-*"))), 1)
            src.write_text(json.dumps(chrome_data([url(99, "new", "https://example.com")])), encoding="utf-8")
            with self.assertRaises(SystemExit):
                main(["apply", "--plan", str(plan_file), "--file", str(src), "--out", str(out), "--yes"])


if __name__ == "__main__":
    unittest.main()
