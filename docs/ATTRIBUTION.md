# Checkout attribution

Gumroad checkout links on this site carry UTM parameters. Gumroad records them in **Analytics → Links** (it creates the row the first time someone opens that exact link). A purchase is tied to the link when it happens within 7 days and the buyer's browser accepts Gumroad's own cookie. This site does not set a cookie and does not load another analytics script for this.

The referrer Gumroad stores is only `https://firstmoverprojects.com`. Checkout links use `strict-origin-when-cross-origin`, so the referrer list cannot tell pages or social posts apart. Read the Links table instead.

## What each value means

| Parameter | Value | How to read it |
| --- | --- | --- |
| `utm_source` | The `utm_source` on the visit that opened the tab, or `site` | The channel. A social reply tagged `utm_source=tiktok` stays `tiktok` through later pages in that tab. |
| `utm_medium` | `site` | The click happened on this website. |
| `utm_campaign` | Page slug, such as `fire-to-iris-check` or `amazon-insurance-nov-2` | Which page the button was on. |
| `utm_content` | Button position, such as `footer`, `result-card`, `fire-check-result`, `above-fold`, `tools-kit` | Which button on that page. Open the link row to see Content. |

Gumroad counts the visit only when source, medium, and campaign are all present. It lowercases them and turns other characters into hyphens. The site script does that before it writes `utm_source`, so the href matches the row Gumroad stores. Product links attribute sales of that product only.

## How the source survives the click

`assets/gumroad-utm.js` is inlined on each page as `#fmp-utm`. On the first page of a tab it saves a usable `utm_source` in `sessionStorage` under `fmp_utm_source`. Later pages in that tab copy it onto Gumroad links. There is no cookie and no request to any other host. The value ends when the tab closes. If the visit had no `utm_source`, the links keep `utm_source=site`.

Ignore rows whose source is `fmp_test_exclude`. That value marks test visits.

## Example

Someone opens `https://firstmoverprojects.com/?utm_source=tiktok` and uses the footer button on the FIRE checker. Gumroad sees:

`https://firstmoverprojects.gumroad.com/l/fire-to-iris-switch-checklist?wanted=true&utm_source=tiktok&utm_medium=site&utm_campaign=fire-to-iris-check&utm_content=footer`

In Analytics → Links, that is source `tiktok`, medium `site`, campaign `fire-to-iris-check`. The same button with no landing tag is source `site`.
