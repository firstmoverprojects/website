// Product JSON-LD for paid kits linked from tool pages.
// Prices, names, and descriptions must already be on the page (or a data file it loads).
// Google merchant listing required fields: Product name, image when the page has a preview,
// Offer price and priceCurrency. Availability, offer URL, and seller
// are included so a shopping assistant can read the kit and the price.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const HOST = "https://firstmoverprojects.com";
// Unpublished on Gumroad. PR #111 removes the EU buy links. The Maryland FAMLI
// notice kit is unpublished because the state posts the 2026 employee notice
// template free. Do not describe either as a product.
const UNPUBLISHED = new Set(["fetwsm", "maryland-famli-payroll-notice-kit"]);
// Past the Nov 19, 2026 FIRE cutoff the check page no longer publishes a Product Offer.
// The Gumroad hrefs stay; the kit hide script covers the buy buttons.
const NO_PRODUCT_OFFER = new Set(["tools/fire-to-iris-check/index.html"]);
const PREVIEW = {
  lnfgc: "/assets/previews/etsy-photo-audit-kit-preview-1280x720.png",
  "fire-to-iris-switch-checklist": "/assets/previews/fire-to-iris-kit-preview-1280x720.png",
  "ews-cutover-kit": "/assets/previews/ews-cutover-kit-preview-1280x720.png",
  "amazon-1m-insurance-readiness-kit": "/assets/previews/amazon-coi-kit-preview-1280x720.png",
  iqnssc: "/assets/previews/custom-gpt-migration-kit-preview-1280x720.png",
  "loom-seat-audit-exit-pack": "/assets/previews/loom-seat-audit-kit-preview-1280x720.png",
  fguyxn: "/assets/previews/loom-seat-audit-kit-preview-1280x720.png",
  afwbvt: "/assets/previews/after-hours-gap-kit-preview-1280x720.png",
  "ahwc-electrical": "/assets/previews/after-hours-gap-kit-preview-1280x720.png",
  "ahwc-garage-door": "/assets/previews/after-hours-gap-kit-preview-1280x720.png",
  "ahwc-plumbing": "/assets/previews/after-hours-gap-kit-preview-1280x720.png",
  "ahwc-water-restoration": "/assets/previews/after-hours-gap-kit-preview-1280x720.png",
  unjou: "/assets/previews/after-hours-gap-kit-preview-1280x720.png",
  lykya: "/assets/previews/after-hours-gap-kit-preview-1280x720.png",
  cybqmi: "/assets/previews/after-hours-gap-kit-preview-1280x720.png",
  ykxxot: "/assets/previews/after-hours-gap-kit-preview-1280x720.png",
  fretzy: "/assets/previews/after-hours-gap-kit-preview-1280x720.png"
};
// The roofing capture kit (wymols) was retired in late October 2026 and has no
// current replacement listing. Do not describe it as a product.
UNPUBLISHED.add("wymols");
const BANNED = [/money-?back guarantee/i, /no questions asked/i, /full refund/i];
const BANNED_KEYS = new Set(["aggregateRating", "review", "reviewRating", "ratingValue", "refundType"]);

function walkHtml(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, out);
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

function flat(value) {
  const text = String(value)
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');
  const alts = [...text.matchAll(/\balt="([^"]*)"/g)].map((match) => match[1]).join(" ");
  const visible = text.replace(/<[^>]+>/g, " ");
  return `${alts} ${visible}`.replace(/\s+/g, " ").trim();
}

function stripProductScript(html) {
  return html.replace(/<script type="application\/ld\+json" id="product-jsonld">[\s\S]*?<\/script>/g, "");
}

function referencedFacts(rel, html) {
  let extra = "";
  const dir = path.dirname(path.join(ROOT, rel));
  for (const match of html.matchAll(/\bsrc="([^"]+)"/g)) {
    const url = match[1];
    if (/^https?:/i.test(url) || url.startsWith("/")) continue;
    const abs = path.resolve(dir, url.split("?")[0]);
    if (!abs.startsWith(ROOT) || !existsSync(abs) || !abs.endsWith(".js")) continue;
    const js = readFileSync(abs, "utf8");
    extra += `\n${js}`;
    for (const jsonMatch of js.matchAll(/["']([^"']+\.json)["']/g)) {
      const jsonPath = path.resolve(path.dirname(abs), jsonMatch[1]);
      if (existsSync(jsonPath)) extra += `\n${readFileSync(jsonPath, "utf8")}`;
    }
  }
  return extra;
}

function jsonBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((match) => {
    return JSON.parse(match[1]);
  });
}

function productsOf(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json" id="product-jsonld">([\s\S]*?)<\/script>/g)];
  if (blocks.length === 0) return [];
  assert.equal(blocks.length, 1, "expected one product JSON-LD script");
  const data = JSON.parse(blocks[0][1]);
  const products = data["@graph"] || [data];
  assert.equal(data["@context"], "https://schema.org");
  for (const product of products) assert.equal(product["@type"], "Product");
  return products;
}

function slugsIn(corpus) {
  return new Set([...corpus.matchAll(/firstmoverprojects\.gumroad\.com\/l\/([A-Za-z0-9_-]+)/g)].map((match) => match[1]));
}

function priceFor(corpus, slug) {
  const fromAnchors = new Set();
  const anchor = new RegExp(`gumroad\\.com/l/${slug}[^"']*"[^>]*>([^<]*)`, "g");
  for (const match of corpus.matchAll(anchor)) {
    const prices = [...match[1].matchAll(/\$(\d+)(?!\d)/g)].map((item) => Number(item[1]));
    if (prices.length === 1) fromAnchors.add(prices[0]);
  }
  if (fromAnchors.size === 1) return [...fromAnchors][0];
  const fromArticles = new Set();
  for (const part of corpus.split(/<article\b/i).slice(1)) {
    if (!part.includes(`/l/${slug}`)) continue;
    const kickers = [...part.matchAll(/class="kicker">\$(\d+)(?!\d)/g)].map((item) => Number(item[1]));
    if (kickers.length === 1) fromArticles.add(kickers[0]);
  }
  if (fromArticles.size === 1) return [...fromArticles][0];
  const label = new RegExp(`"label": "([^"]+)"\\s*,\\s*"url": "https://firstmoverprojects\\.gumroad\\.com/l/${slug}\\b`);
  const found = label.exec(corpus);
  if (found) {
    const prices = [...found[1].matchAll(/\$(\d+)(?!\d)/g)].map((item) => Number(item[1]));
    if (prices.length === 1) return prices[0];
  }
  return null;
}

function forbidKeys(node, where) {
  if (Array.isArray(node)) {
    for (const item of node) forbidKeys(item, where);
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    assert.equal(BANNED_KEYS.has(key), false, `${where} has ${key}`);
    forbidKeys(value, where);
  }
}

const toolPages = walkHtml(path.join(ROOT, "tools"), []).map((file) => path.relative(ROOT, file)).sort();

test("the FIRE check and the Nov 19 deadline page have no Product Offer", () => {
  for (const rel of ["tools/fire-to-iris-check/index.html", "deadlines/irs-fire-retirement-nov-19.html"]) {
    const html = readFileSync(path.join(ROOT, rel), "utf8");
    assert.equal(html.includes('id="product-jsonld"'), false, rel);
    assert.equal(html.includes("priceValidUntil"), false, rel);
    assert.equal(/"@type":\s*"Product"/.test(html), false, rel);
    assert.equal(/"@type":\s*"Offer"/.test(html), false, rel);
    const shareTitle = "IRS FIRE filing ended Nov 19, 2026 (3 p.m. ET) - Free IRIS readiness &amp; 1099 CSV check";
    assert.equal(html.split(shareTitle).length - 1, 3, rel);
    assert.match(html, /firstmoverprojects\.gumroad\.com\/l\/fire-to-iris-switch-checklist/, rel);
  }
});

test("every tool-page JSON-LD block parses", () => {
  for (const rel of toolPages) {
    const html = readFileSync(path.join(ROOT, rel), "utf8");
    jsonBlocks(html);
  }
});

test("live paid-kit links on tool pages have Product offers, and the unpublished EU kit does not", () => {
  for (const rel of toolPages) {
    const html = readFileSync(path.join(ROOT, rel), "utf8");
    if (NO_PRODUCT_OFFER.has(rel)) {
      assert.equal(html.includes('id="product-jsonld"'), false, rel);
      assert.equal(html.includes("priceValidUntil"), false, rel);
      assert.equal(/"@type":\s*"Product"/.test(html), false, rel);
      assert.equal(/"@type":\s*"Offer"/.test(html), false, rel);
      assert.equal(productsOf(html).length, 0, rel);
      assert.match(html, /firstmoverprojects\.gumroad\.com\/l\/fire-to-iris-switch-checklist/, rel);
      continue;
    }
    const stripped = stripProductScript(html);
    const corpus = stripped + referencedFacts(rel, stripped);
    const slugs = [...slugsIn(corpus)];
    const products = productsOf(html);
    const bySlug = new Map();
    for (const product of products) {
      const url = product.offers && product.offers.url;
      const slug = typeof url === "string" ? url.split("/").pop() : "";
      assert.equal(bySlug.has(slug), false, `${rel} repeats ${slug}`);
      bySlug.set(slug, product);
    }
    for (const slug of slugs) {
      if (UNPUBLISHED.has(slug)) {
        assert.equal(bySlug.has(slug), false, `${rel} must not describe unpublished ${slug}`);
        continue;
      }
      const product = bySlug.get(slug);
      assert.ok(product, `${rel} is missing Product JSON-LD for ${slug}`);
      const offer = product.offers;
      assert.equal(offer["@type"], "Offer");
      assert.equal(offer.url, `https://firstmoverprojects.gumroad.com/l/${slug}`);
      assert.equal(typeof offer.price, "number");
      assert.ok(offer.price > 0);
      assert.equal(offer.priceCurrency, "USD");
      assert.equal(offer.availability, "https://schema.org/InStock");
      assert.deepEqual(offer.seller, {
        "@type": "Organization",
        name: "First Mover Projects",
        url: "https://firstmoverprojects.com/"
      });
      assert.equal(offer.hasMerchantReturnPolicy, undefined);
      const pagePrice = priceFor(corpus, slug);
      assert.equal(pagePrice, offer.price, `${rel} ${slug} price ${offer.price} is not the price on the page`);
      const facts = flat(corpus);
      assert.equal(product.name.includes("\n"), false, rel);
      assert.equal(product.description.includes("\n"), false, rel);
      assert.ok(product.name.length > 0, rel);
      assert.ok(facts.includes(flat(product.name)), `${rel} name is not on the page: ${product.name}`);
      assert.ok(facts.includes(flat(product.description)), `${rel} description is not on the page: ${product.description}`);
      const preview = PREVIEW[slug];
      if (preview && corpus.includes(preview)) {
        assert.equal(product.image, HOST + preview, `${rel} ${slug} image`);
      } else {
        assert.equal(product.image, undefined, `${rel} ${slug} image is not on the page`);
      }
      const serialized = JSON.stringify(product);
      for (const phrase of BANNED) assert.equal(phrase.test(serialized), false, `${rel} ${slug} ${phrase}`);
      forbidKeys(product, `${rel} ${slug}`);
    }
    for (const slug of bySlug.keys()) {
      assert.equal(UNPUBLISHED.has(slug), false, slug);
      assert.ok(slugs.includes(slug), `${rel} Product ${slug} has no buy link on the page`);
    }
  }
});
