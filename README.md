# First Mover Projects

Static site published at https://firstmoverprojects.com from the `main` branch (GitHub Pages).

## Search indexing

`sitemap.xml` `<lastmod>` values are the latest git commit date of each page. Refresh them after editing pages, before you commit:

```bash
python3 scripts/update_sitemap_lastmod.py
```

Put `[no-lastmod]` in the message of any commit that doesn't change page content. The refresh script skips those commits, so a tag-only or analytics-only change does not move `<lastmod>`.

IndexNow (Bing, which feeds Copilot and ChatGPT search, plus Yandex and other participating engines) is pinged by `.github/workflows/indexnow.yml` after GitHub Pages finishes deploying `main`. The workflow submits only HTML pages changed in that deploy. The key file is public by design, so the workflow needs no secrets.

After this is on `main` and `https://firstmoverprojects.com/<key>.txt` is live (the 32-hex `.txt` file at the site root, containing only the key), send the first ping from a checkout of `main`:

```bash
python3 scripts/indexnow_ping.py
```

Preview the JSON body without contacting IndexNow:

```bash
python3 scripts/indexnow_ping.py --dry-run
```

Pass URLs to submit a subset instead of the whole sitemap:

```bash
python3 scripts/indexnow_ping.py https://firstmoverprojects.com/deadlines/
```
