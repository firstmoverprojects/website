// First-party Gumroad UTM pass-through. No cookies, no extra hosts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const UTM = readFileSync(path.join(ROOT, "assets/gumroad-utm.js"), "utf8").trim();
const DEADLINE = readFileSync(path.join(ROOT, "assets/deadline-count.js"), "utf8").trim();
const CONTENTS = new Set([
  "above-fold", "article", "bottom-cta", "card", "checklist", "comparison", "faq", "footer",
  "fire-check-result", "gtin-helper", "hub", "kit-preview", "link", "post-check", "product-demo", "result-card",
  "result-cta", "sticky-cta", "tools-free", "tools-kit", "top-cta", "trade-pill"
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
    const html = readFileSync(full, "utf8");
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
    const html = readFileSync(full, "utf8");
    const matches = html.match(re) || [];
    for (const raw of matches) {
      count += 1;
      const url = new URL(raw.replace(/&amp;/g, "&"));
      assert.equal(url.searchParams.get("utm_source"), "site", raw);
      assert.equal(url.searchParams.get("utm_medium"), "site", raw);
      assert.equal(url.searchParams.get("utm_campaign"), pageSlug(rel), raw);
      const content = url.searchParams.get("utm_content");
      assert.equal(CONTENTS.has(content), true, rel + " " + content);
      if (!url.pathname.endsWith("/pdkqbs")) assert.equal(url.searchParams.get("wanted"), "true", raw);
    }
  }
  assert.ok(count >= 89, String(count));
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
  const first = runUtm("?utm_source=TikTok&utm_medium=social", [SAMPLE]);
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
