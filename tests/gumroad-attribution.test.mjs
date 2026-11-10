// First-party Gumroad UTM pass-through. No cookies, no extra hosts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const UTM = readFileSync(path.join(ROOT, "assets/gumroad-utm.js"), "utf8").trim();
const DEADLINE = readFileSync(path.join(ROOT, "assets/deadline-count.js"), "utf8").trim();
// Quiet unlisted checkers must not carry the pass-through script: it names
// gumroad.com, and their own tests forbid that word (or, for Deadline Watch
// and the 1098-VLI check, forbid the sessionStorage the script uses).
const QUIET_HTML = new Set([
  "deadlines/1098-vli-check/index.html",
  "tools/deadline-watch/index.html",
  "tools/detroit-business-tax-check/index.html",
  "tools/ga-annual-registration-check/index.html",
  "tools/mo-zero-return-check/index.html",
  "tools/nj-contractor-check/index.html",
  "tools/sam-renewal-check/index.html",
  "tools/sba-7a-buyer-calculator/index.html",
  "tools/sba-surety-fee-check/index.html",
  "tools/tx-franchise-report-check/index.html"
]);
const CONTENTS = new Set([
  "above-fold", "article", "bottom-cta", "card", "checklist", "comparison", "faq", "footer",
  "1099-result-k-only", "1099-result-nec", "1099-result-none", "1099-result-split", "1099-result-warn", "amazon-coi-result-check", "amazon-coi-result-fix", "amazon-coi-result-ontrack", "coi-check-result", "coi-check-sticky", "coi-check-top", "etsy-check-result", "etsy-photo-check-sticky", "etsy-photo-check-top", "etsy-photo-result-fix", "etsy-photo-result-mockup", "etsy-photo-result-ontrack", "fire-check-result", "fire-check-sticky", "fire-check-top", "fire-result-need-tcc", "fire-result-nov9", "fire-result-ontrack", "fire-result-still-fire", "fire-result-warn", "gtin-helper", "hub", "kit-preview", "link", "post-check", "product-demo", "result-card", "ws-check-result", "ws2016",
  "result-cta", "sticky-cta", "tools-free", "tools-kit", "top-cta", "trade-pill", "eu-fee"
]);
const OFFER_TOOL_PAGES = new Set([
  "tools/amazon-coi-check/index.html",
  "tools/etsy-photo-audit-check/index.html"
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".html")) out.push(full);
  }
  return out;
}

function pageSlug(rel) {
  if (rel === "index.html") return "home";
  if (rel === "tools/index.html") return "tools";
  if (rel === "deadlines/index.html") return "deadlines";
  if (rel === "deadlines/finder/index.html") return "deadline-finder";
  if (rel === "games/index.html") return "games";
  if (rel === "privacy.html") return "privacy";
  if (rel === "terms.html") return "terms";
  if (rel === "refund-policy.html") return "refund-policy";
  let match = rel.match(/^tools\/([^/]+)\/index\.html$/);
  if (match) return match[1];
  match = rel.match(/^deadlines\/([^/]+)\.html$/);
  if (match) return match[1];
  match = rel.match(/^help\/([^/]+)\.html$/);
  if (match) return match[1];
  match = rel.match(/^shopify-quickbooks-cleanup\/([^/]+)\.html$/);
  if (match) return match[1] === "index" ? "shopify-quickbooks-cleanup" : "shopify-quickbooks-cleanup-" + match[1];
  return rel.replace(/\.html$/, "").split("/").filter(Boolean).join("-");
}

function scriptBody(html, id) {
  const match = html.match(new RegExp(`<script id="${id}">\\n([\\s\\S]*?)\\n</script>`));
  return match ? match[1] : "";
}

test("every page inlines the same Gumroad pass-through and no other storage", () => {
  assert.equal(/https?:|document\.cookie|localStorage|indexedDB|fetch\(|XMLHttpRequest/.test(UTM), false);
  assert.match(UTM, /sessionStorage/);
  const pages = walk(ROOT);
  assert.ok(pages.length >= 30);
  for (const full of pages) {
    const rel = path.relative(ROOT, full).split(path.sep).join("/");
    if (rel.startsWith("scripts/") && rel.endsWith(".html")) continue;
    const html = readFileSync(full, "utf8");
    if (QUIET_HTML.has(rel)) {
      assert.equal(scriptBody(html, "fmp-utm"), "", rel);
      assert.equal(html.includes('id="fmp-utm"'), false, rel);
      assert.equal(html.includes("sessionStorage"), false, rel);
      assert.equal(html.includes("document.cookie"), false, rel);
      if (rel === "tools/deadline-watch/index.html") {
        assert.equal(/<a\b[^>]*gumroad\.com\/l\//i.test(html), false, rel);
      } else {
        assert.equal(/gumroad/i.test(html), false, rel);
      }
      continue;
    }
    assert.equal(scriptBody(html, "fmp-utm"), UTM, rel);
    assert.equal(html.split('id="fmp-utm"').length - 1, 1, rel);
    const surface = html.replace(/<script id="fmp-utm">[\s\S]*?<\/script>/g, "");
    assert.equal(surface.includes("sessionStorage"), rel === "privacy.html", rel);
    assert.equal(surface.includes("document.cookie"), false, rel);
    const deadline = scriptBody(html, "fmp-deadline");
    if (rel === "tools/fire-to-iris-check/index.html" || rel === "tools/amazon-coi-check/index.html") {
      assert.equal(deadline, DEADLINE, rel);
    } else {
      assert.equal(deadline, "", rel);
    }
  }
});

test("every Gumroad product link carries source, medium, campaign, and content", () => {
  const re = /https:\/\/firstmoverprojects\.gumroad\.com\/l\/[A-Za-z0-9_-]+(?:\?[^"'\s<]*)?/g;
  let count = 0;
  for (const full of walk(ROOT)) {
    const rel = path.relative(ROOT, full).split(path.sep).join("/");
    if (rel.startsWith("scripts/") && rel.endsWith(".html")) continue;
    const html = readFileSync(full, "utf8");
    for (const block of html.matchAll(/<script type="application\/ld\+json" id="product-jsonld">([\s\S]*?)<\/script>/g)) {
      const data = JSON.parse(block[1]);
      const products = data["@graph"] || [data];
      for (const product of products) {
        const offerUrl = product.offers && product.offers.url;
        assert.equal(typeof offerUrl, "string", rel);
        assert.equal(offerUrl.includes("?"), false, rel + " " + offerUrl);
        assert.match(offerUrl, /^https:\/\/firstmoverprojects\.gumroad\.com\/l\/[A-Za-z0-9_-]+$/, rel);
      }
    }
    const visible = html.replace(/<script type="application\/ld\+json" id="product-jsonld">[\s\S]*?<\/script>/g, "");
    const matches = visible.match(re) || [];
    for (const raw of matches) {
      count += 1;
      const url = new URL(raw.replace(/&amp;/g, "&"));
      const medium = url.searchParams.get("utm_medium");
      const content = url.searchParams.get("utm_content");
      const campaign = url.searchParams.get("utm_campaign");
      const internalKitCampaigns = new Set([
        "fire-to-iris-switch-checklist",
        "amazon-1m-insurance-readiness-kit",
        "etsy-photo-audit-kit"
      ]);
      if (medium === "internal") {
        assert.equal(url.searchParams.get("utm_source"), "site", raw);
        assert.equal(content, "link", rel + " " + content);
        assert.equal(internalKitCampaigns.has(campaign), true, rel + " " + campaign);
      } else {
        assert.equal(url.searchParams.get("utm_source"), "site", raw);
        assert.equal(
          medium,
          OFFER_TOOL_PAGES.has(rel) ? "offer_page" : "site",
          raw
        );
        assert.equal(CONTENTS.has(content), true, rel + " " + content);
        if (content === "eu-fee") {
          assert.equal(campaign, "tools", raw);
          assert.equal(rel, "tools/eu-product-id-check/index.html", raw);
        } else {
          assert.equal(campaign, pageSlug(rel), raw);
        }
      }
      if (!url.pathname.endsWith("/pdkqbs")) assert.equal(url.searchParams.get("wanted"), "true", raw);
    }
  }
  assert.ok(count >= 87, String(count));
});

function runUtm(search, hrefs, storage) {
  const anchors = hrefs.map((href) => ({
    href,
    getAttribute(name) { return name === "href" ? this.href : null; },
    setAttribute(name, value) { if (name === "href") this.href = value; }
  }));
  const store = new Map(Object.entries(storage || {}));
  const listeners = {};
  const sandbox = {
    location: { search },
    sessionStorage: {
      getItem(key) { return store.has(key) ? store.get(key) : null; },
      setItem(key, value) { store.set(key, String(value)); }
    },
    document: {
      querySelectorAll() { return anchors; },
      addEventListener(type, fn) { listeners[type] = fn; }
    }
  };
  vm.runInNewContext(UTM, sandbox, { filename: "gumroad-utm.js" });
  return { anchors, listeners, store };
}

const SAMPLE = "https://firstmoverprojects.gumroad.com/l/fire-to-iris-switch-checklist?wanted=true&utm_source=site&utm_medium=site&utm_campaign=fire-to-iris-check&utm_content=footer";

test("landing utm_source is stored and written onto checkout links", () => {
  const first = runUtm("?utm_source=TikTok&utm_medium=newsletter&utm_campaign=newsletter-week&utm_content=nl-body", [SAMPLE]);
  assert.equal(first.store.get("fmp_utm_source"), "tiktok");
  assert.equal(new URL(first.anchors[0].href).searchParams.get("utm_source"), "tiktok");
  assert.equal(new URL(first.anchors[0].href).searchParams.get("utm_medium"), "site");
  assert.equal(new URL(first.anchors[0].href).searchParams.get("utm_campaign"), "fire-to-iris-check");
  assert.equal(new URL(first.anchors[0].href).searchParams.get("utm_content"), "footer");

  const later = runUtm("?utm_source=newsletter", [SAMPLE], { fmp_utm_source: "tiktok" });
  assert.equal(later.store.get("fmp_utm_source"), "tiktok");
  assert.equal(new URL(later.anchors[0].href).searchParams.get("utm_source"), "tiktok");

  const plain = runUtm("", [SAMPLE]);
  assert.equal(plain.store.has("fmp_utm_source"), false);
  assert.equal(plain.anchors[0].href, SAMPLE);

  const blank = runUtm("?utm_source=---", [SAMPLE]);
  assert.equal(blank.store.has("fmp_utm_source"), false);
  assert.equal(blank.anchors[0].href, SAMPLE);

  const markup = runUtm("?utm_source=%3Cscript%3E", [SAMPLE]);
  assert.equal(markup.store.get("fmp_utm_source"), "script");
  assert.equal(new URL(markup.anchors[0].href).searchParams.get("utm_source"), "script");
  assert.equal(markup.anchors[0].href.includes("<"), false);
});

test("a checkout link added after load still picks up the landing source", () => {
  const page = runUtm("?utm_source=x", []);
  const anchor = {
    href: SAMPLE,
    getAttribute(name) { return name === "href" ? this.href : null; },
    setAttribute(name, value) { if (name === "href") this.href = value; }
  };
  page.listeners.click({ target: { closest: () => anchor } });
  assert.equal(new URL(anchor.href).searchParams.get("utm_source"), "x");
  page.listeners.auxclick({ target: { closest: () => anchor } });
  assert.equal(new URL(anchor.href).searchParams.get("utm_content"), "footer");
});
