// Answer-first FIRE and IRIS pages for payroll and bookkeeper searches.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FIT = "Good fit if you file 1099s for your business or clients and must move from FIRE to IRIS by Jan 1, 2027. Not needed if your software files for you.";
const DISCLAIMER = "General guidance, not legal, tax or IT advice.";
const PRODUCT = "https://firstmoverprojects.gumroad.com/l/fire-to-iris-switch-checklist";
const PAGES = [
  "deadlines/irs-fire-shutting-down-1099.html",
  "deadlines/iris-tcc-application-how-long.html",
  "deadlines/fire-to-iris-transition-checklist.html",
  "deadlines/file-1099-nec-2027-iris.html"
];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function slug(rel) {
  return rel.slice("deadlines/".length, -".html".length);
}

test("each landing page answers first, cites Publication 5717 and the IRIS pages, and carries the disclaimer", () => {
  const sitemap = read("sitemap.xml");
  const hub = read("deadlines/index.html");
  for (const rel of PAGES) {
    const html = read(rel);
    const name = slug(rel);
    const heroEnd = html.indexOf('id="kit"');
    const answerAt = html.indexOf('class="answer-first"');
    assert.ok(answerAt !== -1 && answerAt < heroEnd, rel);
    assert.equal(html.includes(DISCLAIMER), true, rel);
    assert.equal(html.includes(FIT), true, rel);
    assert.match(html, /https:\/\/www\.irs\.gov\/pub\/irs-pdf\/p5717\.pdf/);
    assert.match(html, /https:\/\/www\.irs\.gov\/filing\/e-file-information-returns-with-iris/);
    assert.match(html, /https:\/\/www\.irs\.gov\/e-file-providers\/filing-information-returns-electronically-fire/);
    assert.equal(html.includes("\u2014"), false, rel);
    assert.equal(html.includes("\u2013"), false, rel);
    assert.equal(html.includes("&mdash;"), false, rel);
    assert.match(sitemap, new RegExp(`<loc>https://firstmoverprojects.com/deadlines/${name}\\.html</loc>`));
    assert.match(hub, new RegExp(`href="${name}\\.html"`));
    const hrefs = [...html.matchAll(/<a\b[^>]*href="(https:\/\/firstmoverprojects\.gumroad\.com\/l\/[^"]+)"/g)].map((match) => match[1].replace(/&amp;/g, "&"));
    assert.equal(hrefs.length, 3, rel);
    const clicks = ["top", "result", "sticky"];
    clicks.forEach((part, i) => {
      assert.match(html, new RegExp(`data-goatcounter-click="cta/${name}-${part}"`));
      const url = new URL(hrefs[i]);
      assert.equal(url.origin + url.pathname, PRODUCT);
      assert.equal(url.searchParams.get("wanted"), "true");
      assert.equal(url.searchParams.get("utm_source"), "site");
      assert.equal(url.searchParams.get("utm_medium"), "site");
      assert.equal(url.searchParams.get("utm_campaign"), name);
    });
    assert.equal(new URL(hrefs[0]).searchParams.get("utm_content"), "fire-check-top");
    assert.equal(new URL(hrefs[1]).searchParams.get("utm_content"), "fire-check-result");
    assert.equal(new URL(hrefs[2]).searchParams.get("utm_content"), "fire-check-sticky");
  }
});

test("FAQPage JSON matches the visible questions and each kit section has Product schema", () => {
  for (const rel of PAGES) {
    const html = read(rel);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)].map((block) => JSON.parse(block[1]));
    const faq = blocks.find((item) => item["@type"] === "FAQPage");
    assert.ok(faq, rel);
    assert.equal(faq.dateModified, "2026-11-05");
    const visible = html.slice(html.indexOf('id="faq-h"'), html.indexOf('id="src-h"'));
    const questions = [...visible.matchAll(/<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)];
    assert.equal(questions.length, faq.mainEntity.length, rel);
    faq.mainEntity.forEach((item, i) => {
      assert.equal(item.name, questions[i][1], rel);
      assert.equal(item.acceptedAnswer.text, questions[i][2], rel);
    });
    for (const id of ["kit", "kit-bottom"]) {
      const start = html.indexOf(`id="${id}"`);
      const end = html.indexOf("</section>", start);
      const section = html.slice(start, end);
      assert.match(section, /class="kit-fit"/, rel + " " + id);
      assert.equal(section.includes(FIT), true, rel + " " + id);
      assert.match(section, /"@type": "Product"/, rel + " " + id);
      const product = blocks.find((item) => item["@type"] === "Product");
      assert.ok(product, rel + " " + id);
      assert.equal(product.offers.price, "9.00");
      assert.equal(product.offers.priceCurrency, "USD");
      assert.equal(product.offers.url, PRODUCT);
    }
  }
});
