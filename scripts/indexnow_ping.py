#!/usr/bin/env python3
"""Submit site URLs to IndexNow (Bing, Yandex, and other participating engines).

Reads the public key from the /<key>.txt file at the repository root. With no
URL arguments, submits every <loc> in sitemap.xml. Otherwise submits the URLs
given on the command line.

    python3 scripts/indexnow_ping.py --dry-run
    python3 scripts/indexnow_ping.py
    python3 scripts/indexnow_ping.py https://firstmoverprojects.com/deadlines/

--dry-run prints the JSON body and does not contact the API. Do not send a
live ping until https://firstmoverprojects.com/<key>.txt is deployed and
returns the key. Standard library only.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITEMAP = ROOT / "sitemap.xml"
HOST = "firstmoverprojects.com"
ENDPOINT = "https://api.indexnow.org/indexnow"
SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
KEY_RE = re.compile(r"^[0-9a-f]{32}$")


def load_key() -> str:
    matches: list[str] = []
    for path in sorted(ROOT.glob("*.txt")):
        if not KEY_RE.fullmatch(path.stem):
            continue
        body = path.read_text(encoding="utf-8").strip()
        if body == path.stem:
            matches.append(path.stem)
    if len(matches) != 1:
        raise SystemExit(
            f"expected exactly one 32-hex IndexNow key file at the repo root, found {len(matches)}"
        )
    return matches[0]


def urls_from_sitemap() -> list[str]:
    tree = ET.parse(SITEMAP)
    locs: list[str] = []
    for el in tree.findall(f".//{{{SITEMAP_NS}}}loc"):
        if el.text and el.text.strip():
            locs.append(el.text.strip())
    if not locs:
        raise SystemExit(f"no <loc> entries in {SITEMAP.name}")
    return locs


def check_url(url: str) -> str:
    if not url.startswith(f"https://{HOST}/") and url != f"https://{HOST}":
        raise SystemExit(f"refusing URL outside https://{HOST}/: {url}")
    return url


def build_body(key: str, urls: list[str]) -> dict:
    return {
        "host": HOST,
        "key": key,
        "keyLocation": f"https://{HOST}/{key}.txt",
        "urlList": urls,
    }


def post(body: dict) -> None:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        ENDPOINT,
        data=data,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "firstmoverprojects-indexnow/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            status = response.status
            text = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        print(f"IndexNow HTTP {exc.code}: {text}", file=sys.stderr)
        raise SystemExit(1) from exc
    print(f"IndexNow HTTP {status}")
    if text:
        print(text)
    if status not in (200, 202):
        raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "urls",
        nargs="*",
        help="URLs to submit. Defaults to every loc in sitemap.xml.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the JSON body and do not contact IndexNow.",
    )
    args = parser.parse_args()

    key = load_key()
    urls = [check_url(url) for url in (args.urls or urls_from_sitemap())]
    body = build_body(key, urls)
    payload = json.dumps(body, indent=2, ensure_ascii=False) + "\n"
    if args.dry_run:
        sys.stdout.write(payload)
        return
    post(body)


if __name__ == "__main__":
    main()
