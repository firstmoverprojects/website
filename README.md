# First Mover Projects

Static site published at https://firstmoverprojects.com from the `main` branch (GitHub Pages).

## Search indexing

`sitemap.xml` `<lastmod>` values are the latest git commit date of each page. Refresh them after editing pages, before you commit:

```bash
python3 scripts/update_sitemap_lastmod.py
```

IndexNow (Bing, which feeds Copilot and ChatGPT search, plus Yandex and other participating engines) is pinged by `.github/workflows/indexnow.yml` after GitHub Pages finishes deploying `main`. The key file is public by design, so the workflow needs no secrets.

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
