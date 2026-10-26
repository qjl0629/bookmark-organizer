"""Fallback categories for bookmarks that match no existing folder.

Host tokens match whole domain labels (so "x.com" does not match "netflix.com").
A token ending in "." matches a domain label, e.g. "amazon." matches www.amazon.ca.
A token containing "/" matches against host + path. Order matters: first match wins.
"""
from __future__ import annotations

import re
from typing import Optional
from urllib.parse import urlsplit

RULES = [
    ("Careers", ("indeed.", "glassdoor.", "greenhouse.io", "lever.co", "linkedin.com/jobs"), ("resume", "careers")),
    ("AI Tools", ("openai.com", "chatgpt.com", "claude.ai", "anthropic.com", "gemini.google.com", "perplexity.ai"), ()),
    ("Development", ("github.com", "gitlab.com", "stackoverflow.com", "npmjs.com", "pypi.org", "developer.mozilla.org", "docs.python.org"), ("api reference",)),
    ("Learning", ("coursera.org", "udemy.com", "edx.org", "khanacademy.org", "wikipedia.org", "medium.com"), ("tutorial", "course")),
    ("Shopping", ("amazon.", "ebay.", "etsy.", "aliexpress.", "walmart.", "costco.", "bestbuy.", "taobao.com", "jd.com"), ()),
    ("Video & Entertainment", ("youtube.com", "youtu.be", "netflix.com", "bilibili.com", "twitch.tv", "disneyplus.com", "hulu.com", "imdb.com", "spotify.com"), ()),
    ("Social", ("facebook.com", "instagram.com", "twitter.com", "x.com", "reddit.com", "linkedin.com", "weibo.com", "tiktok.com", "discord.com", "xiaohongshu.com"), ()),
    ("News", ("cnn.com", "bbc.", "nytimes.com", "theguardian.com", "reuters.com", "bloomberg.com", "cbc.ca"), ()),
    ("Finance", ("paypal.com", "wealthsimple.com", "robinhood.com", "tdcanadatrust.com", "td.com", "rbc.com", "chase.com", "bankofamerica.com", "coinbase.com"), ()),
    ("Travel", ("booking.com", "airbnb.", "expedia.", "tripadvisor.", "skyscanner.", "aircanada.com", "google.com/maps"), ("flight", "hotel")),
    ("Work & Productivity", ("notion.so", "slack.com", "zoom.us", "atlassian.net", "trello.com", "docs.google.com", "drive.google.com", "office.com", "sharepoint.com", "asana.com"), ()),
]


def _host_matches(host: str, token: str) -> bool:
    if token.endswith("."):
        return token[:-1] in host.split(".")
    return host == token or host.endswith("." + token)


def categorize(url: str, title: str) -> Optional[str]:
    try:
        parts = urlsplit(url)
    except ValueError:
        return None
    host = (parts.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    host_path = host + parts.path.lower()
    title_l = title.lower()
    for category, tokens, title_words in RULES:
        for token in tokens:
            if "/" in token:
                if token in host_path:
                    return category
            elif _host_matches(host, token):
                return category
        for word in title_words:
            if re.search(r"\b" + re.escape(word) + r"\b", title_l):
                return category
    return None
