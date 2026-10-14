#!/usr/bin/env python3
"""Refresh <lastmod> in sitemap.xml from each URL's latest git commit date.

Uses the committer calendar date stored on the commit (YYYY-MM-DD), so the
result does not depend on the machine's timezone. Standard library only.

    python3 scripts/update_sitemap_lastmod.py
"""

from __future__ import annotations

import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
SITEMAP = ROOT / "sitemap.xml"
HOST = "firstmoverprojects.com"
SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"


def loc_to_repo_path(loc: str) -> Path:
    """Map a sitemap loc on this host to a file in the repository."""
    prefix = f"https://{HOST}"
    if loc == prefix:
        url_path = "/"
    elif loc.startswith(prefix + "/"):
        url_path = loc[len(prefix) :]
    else:
        raise SystemExit(f"sitemap loc is not on https://{HOST}: {loc}")

    if "?" in url_path or "#" in url_path:
        raise SystemExit(f"sitemap loc must not include a query or fragment: {loc}")

    rel = url_path.lstrip("/")
    if rel == "" or rel.endswith("/"):
        candidates = [rel + "index.html"]
    else:
        candidates = [rel, rel + "/index.html"]
        if not rel.endswith(".html"):
            candidates.append(rel + ".html")

    for candidate in candidates:
        path = ROOT / candidate
        if path.is_file():
            return path
    tried = ", ".join(candidates)
    raise SystemExit(f"no file in the repo for {loc} (tried {tried})")


def commit_date(path: Path) -> str:
    """Return YYYY-MM-DD for the latest commit that touched path."""
    rel = path.relative_to(ROOT).as_posix()
    proc = subprocess.run(
        ["git", "-C", str(ROOT), "log", "-1", "--format=%cI", "--", rel],
        check=False,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        detail = proc.stderr.strip() or f"git exited {proc.returncode}"
        raise SystemExit(f"git log failed for {rel}: {detail}")
    raw = proc.stdout.strip()
    # %cI is the committer timestamp with its original offset, e.g.
    # 2026-10-13T15:43:37-05:00. The date portion is that commit's calendar day.
    if len(raw) < 10 or raw[4] != "-" or raw[7] != "-":
        raise SystemExit(f"no git commit date for {rel}")
    return raw[:10]


def child_text(parent: ET.Element, tag: str) -> str:
    el = parent.find(f"{{{SITEMAP_NS}}}{tag}")
    if el is None or el.text is None:
        return ""
    return el.text.strip()


def load_urls(path: Path) -> list[dict[str, str]]:
    tree = ET.parse(path)
    root = tree.getroot()
    if root.tag != f"{{{SITEMAP_NS}}}urlset":
        raise SystemExit(f"unexpected sitemap root: {root.tag}")
    urls: list[dict[str, str]] = []
    for url_el in root.findall(f"{{{SITEMAP_NS}}}url"):
        loc = child_text(url_el, "loc")
        if not loc:
            raise SystemExit("sitemap url is missing <loc>")
        urls.append(
            {
                "loc": loc,
                "changefreq": child_text(url_el, "changefreq"),
                "priority": child_text(url_el, "priority"),
            }
        )
    if not urls:
        raise SystemExit("sitemap has no <url> entries")
    return urls


def render(urls: list[dict[str, str]]) -> str:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<urlset xmlns="{SITEMAP_NS}">',
    ]
    for url in urls:
        lines.append("  <url>")
        lines.append(f"    <loc>{escape(url['loc'])}</loc>")
        lines.append(f"    <lastmod>{url['lastmod']}</lastmod>")
        if url["changefreq"]:
            lines.append(f"    <changefreq>{escape(url['changefreq'])}</changefreq>")
        if url["priority"]:
            lines.append(f"    <priority>{escape(url['priority'])}</priority>")
        lines.append("  </url>")
    lines.append("</urlset>")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    urls = load_urls(SITEMAP)
    for url in urls:
        path = loc_to_repo_path(url["loc"])
        url["lastmod"] = commit_date(path)
        rel = path.relative_to(ROOT).as_posix()
        print(f"{url['lastmod']}  {rel}  {url['loc']}")
    rendered = render(urls)
    if SITEMAP.read_text(encoding="utf-8") == rendered:
        print(f"{SITEMAP.name} already up to date ({len(urls)} URLs)")
        return
    SITEMAP.write_text(rendered, encoding="utf-8")
    print(f"Updated {SITEMAP.name} ({len(urls)} URLs)")


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        sys.exit(0)
