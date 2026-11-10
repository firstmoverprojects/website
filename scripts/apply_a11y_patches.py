#!/usr/bin/env python3
"""Apply shared a11y CSS links and skip links to allowed static pages."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

BLOCKED = {
    "deadlines/styles.css",
    "deadlines/index.html",
    "deadlines/finder/index.html",
    "deadlines/finder/finder.js",
    "deadlines/fire-to-iris-transition-checklist.html",
    "deadlines/file-1099-nec-2027-iris.html",
    "deadlines/iris-tcc-application-how-long.html",
    "deadlines/irs-fire-retirement-nov-19.html",
    "deadlines/office-2021-windows-11-24h2-oct-13.html",
    "deadlines/whiteboard-azure-oct-16.html",
    "deadlines/exchange-online-ews-retirement-apr-1.html",
    "tools/index.html",
    "tools/fire-to-iris-check/index.html",
    "tools/1099-nec-or-1099-k-check/index.html",
    "sitemap.xml",
}

SITE_A11Y = '<link rel="stylesheet" href="./assets/site-a11y.css" />'
DEADLINE_PATCH = '<link rel="stylesheet" href="a11y-patch.css" />'
DEADLINE_PATCH_NESTED = '<link rel="stylesheet" href="../a11y-patch.css" />'
TOOL_PATCH = '<link rel="stylesheet" href="../assets/a11y-patch.css" />'
GAMES_PATCH = '<link rel="stylesheet" href="/deadlines/a11y-patch.css" />'
HELP_PATCH = '<link rel="stylesheet" href="../deadlines/a11y-patch.css" />'

SKIP_MAIN = '<a class="skip-link" href="#main">Skip to main content</a>'
SKIP_TOOL = '<a class="skip" href="#main">Skip to main content</a>'


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def is_blocked(path: Path) -> bool:
    return rel(path) in BLOCKED or "/tests/" in rel(path)


def ensure_stylesheet(html: str, needle: str, link_tag: str) -> str:
    if link_tag in html:
        return html
    if needle in html:
        close = needle
        if not needle.rstrip().endswith("/>"):
            close = needle.rstrip() + " />"
            html = html.replace(needle, close, 1)
            needle = close
        return html.replace(needle, needle + "\n    " + link_tag, 1)
    return html


def ensure_skip(html: str, skip_html: str) -> str:
    if "skip-link" in html or 'class="skip"' in html:
        return html
    return re.sub(r"(<body[^>]*>\s*)", r"\1\n" + skip_html + "\n", html, count=1)


def ensure_main_id(html: str) -> str:
    if 'id="main"' in html:
        return html
    return re.sub(r"<main(\s|>)", r'<main id="main"\1', html, count=1)


def patch_root_legal(path: Path, html: str) -> str:
    html = ensure_stylesheet(html, 'href="./assets/styles-Bi5nM5kw.css"', SITE_A11Y.replace("./", "./"))
    html = ensure_skip(html, SKIP_MAIN)
    html = ensure_main_id(html)
    return html


def patch_index(html: str) -> str:
    html = ensure_stylesheet(html, 'href="./assets/styles-Bi5nM5kw.css"', SITE_A11Y)
    if SKIP_MAIN not in html:
        html = html.replace("<body>\n    <div id=\"app\">", "<body>\n    " + SKIP_MAIN + "\n    <div id=\"app\">")
    html = re.sub(r"<main>", '<main id="main">', html, count=1)
    return html


def patch_deadline_page(path: Path, html: str) -> str:
    nested = "/index.html" in rel(path) and path.parent.name != "deadlines"
    link = DEADLINE_PATCH_NESTED if nested else DEADLINE_PATCH
    if 'href="styles.css"' in html:
        html = ensure_stylesheet(html, 'href="styles.css"', link)
    elif 'href="../styles.css"' in html:
        html = ensure_stylesheet(html, 'href="../styles.css"', DEADLINE_PATCH)
    elif 'href="/deadlines/styles.css"' in html:
        html = ensure_stylesheet(html, 'href="/deadlines/styles.css"', GAMES_PATCH)
    return html


def patch_tool(html: str) -> str:
    patch_path = ROOT / "tools/assets/a11y-patch.css"
    marker = "/* fmp-tool-a11y-patch */"
    html = html.replace('<link rel="stylesheet" href="../assets/a11y-patch.css" />\n', "")
    if marker not in html and patch_path.exists() and "</style>" in html:
        patch_css = patch_path.read_text(encoding="utf-8").strip()
        wrapped = f"\n{marker}\n{patch_css}\n"
        html = html.replace("</style>", wrapped + "</style>", 1)
    html = ensure_skip(html, SKIP_TOOL)
    html = ensure_main_id(html)
    return html


def patch_games(html: str) -> str:
    return ensure_stylesheet(html, 'href="/deadlines/styles.css"', GAMES_PATCH)


def patch_help(html: str) -> str:
    return ensure_stylesheet(html, 'href="../shopify-quickbooks-cleanup/help-article.css"', HELP_PATCH)


def main() -> None:
    changed: list[str] = []

    index = ROOT / "index.html"
    if index.exists():
        old = index.read_text(encoding="utf-8")
        new = patch_index(old)
        if new != old:
            index.write_text(new, encoding="utf-8")
            changed.append(rel(index))

    for name in ("privacy.html", "terms.html", "refund-policy.html"):
        path = ROOT / name
        if not path.exists():
            continue
        old = path.read_text(encoding="utf-8")
        new = patch_root_legal(path, old)
        if new != old:
            path.write_text(new, encoding="utf-8")
            changed.append(rel(path))

    games = ROOT / "games/index.html"
    if games.exists():
        old = games.read_text(encoding="utf-8")
        new = patch_games(old)
        if new != old:
            games.write_text(new, encoding="utf-8")
            changed.append(rel(games))

    help_page = ROOT / "help/shopify-quickbooks-connector-migration-problems.html"
    if help_page.exists():
        old = help_page.read_text(encoding="utf-8")
        new = patch_help(old)
        if new != old:
            help_page.write_text(new, encoding="utf-8")
            changed.append(rel(help_page))

    for path in sorted(ROOT.glob("deadlines/**/*.html")):
        if is_blocked(path):
            continue
        old = path.read_text(encoding="utf-8")
        new = patch_deadline_page(path, old)
        if new != old:
            path.write_text(new, encoding="utf-8")
            changed.append(rel(path))

    for path in sorted(ROOT.glob("tools/*/index.html")):
        if is_blocked(path):
            continue
        old = path.read_text(encoding="utf-8")
        new = patch_tool(old)
        if new != old:
            path.write_text(new, encoding="utf-8")
            changed.append(rel(path))

    for path in ROOT.glob("shopify-quickbooks-cleanup/*.html"):
        if is_blocked(path):
            continue
        old = path.read_text(encoding="utf-8")
        new = patch_help(old) if "help-article" in old else old
        if new != old:
            path.write_text(new, encoding="utf-8")
            changed.append(rel(path))

    print(f"Patched {len(changed)} files")
    for c in changed:
        print(" ", c)


if __name__ == "__main__":
    main()
