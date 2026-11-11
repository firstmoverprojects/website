// Buyer fit notes and FAQ on the two live offer pages.
// Questions and answers must match the FAQPage JSON-LD, and the new blocks
// must not add Gumroad hrefs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const REFUND = "Refunds: within 30 days if a file is corrupt or materially not as described.";
const PAGES = [
  {
    rel: "tools/amazon-coi-check/index.html",
    hrefs: [
      "https://firstmoverprojects.gumroad.com/l/amazon-1m-insurance-readiness-kit?wanted=true&amp;utm_source=site&amp;utm_medium=offer_page&amp;utm_campaign=amazon-coi-check&amp;utm_content=coi-check-top",
      "https://firstmoverprojects.gumroad.com/l/amazon-1m-insurance-readiness-kit?wanted=true&amp;utm_source=site&amp;utm_medium=offer_page&amp;utm_campaign=amazon-coi-check&amp;utm_content=amazon-coi-result-fix",
      "https://firstmoverprojects.gumroad.com/l/amazon-1m-insurance-readiness-kit?wanted=true&amp;utm_source=site&amp;utm_medium=offer_page&amp;utm_campaign=amazon-coi-check&amp;utm_content=footer",
      "https://firstmoverprojects.gumroad.com/l/amazon-1m-insurance-readiness-kit?wanted=true&amp;utm_source=site&amp;utm_medium=offer_page&amp;utm_campaign=amazon-coi-check&amp;utm_content=coi-check-sticky"
    ]
  },
  {
    rel: "tools/etsy-photo-audit-check/index.html",
    hrefs: [
      "https://firstmoverprojects.gumroad.com/l/lnfgc?wanted=true&amp;utm_source=site&amp;utm_medium=offer_page&amp;utm_campaign=etsy-photo-audit-check&amp;utm_content=etsy-photo-check-top",
      "https://firstmoverprojects.gumroad.com/l/lnfgc?wanted=true&amp;utm_source=site&amp;utm_medium=offer_page&amp;utm_campaign=etsy-photo-audit-check&amp;utm_content=gtin-helper",
      "https://firstmoverprojects.gumroad.com/l/lnfgc?wanted=true&amp;utm_source=site&amp;utm_medium=offer_page&amp;utm_campaign=etsy-photo-audit-check&amp;utm_content=etsy-photo-result-mockup",
      "https://firstmoverprojects.gumroad.com/l/lnfgc?wanted=true&amp;utm_source=site&amp;utm_medium=offer_page&amp;utm_campaign=etsy-photo-audit-check&amp;utm_content=footer",
      "https://firstmoverprojects.gumroad.com/l/lnfgc?wanted=true&amp;utm_source=site&amp;utm_medium=offer_page&amp;utm_campaign=etsy-photo-audit-check&amp;utm_content=etsy-photo-check-sticky"
    ]
  }
];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function section(html, id) {
  const start = html.indexOf(`id="${id}"`);
  assert.notEqual(start, -1, `missing #${id}`);
  const open = html.lastIndexOf("<section", start);
  const end = html.indexOf("</section>", start);
  assert.ok(open !== -1 && end !== -1, `#${id} is not a section`);
  return html.slice(open, end + "</section>".length);
}

function pairs(fragment) {
  return [...fragment.matchAll(/<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)].map((match) => ({
    q: match[1].replace(/\s+/g, " ").trim(),
    a: match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
  }));
}

function jsonBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
}

for (const page of PAGES) {
  test(`${page.rel} explains fit and has a 5-7 question buyer FAQ with FAQPage JSON-LD`, () => {
    const html = read(page.rel);
    const top = html.indexOf('id="kit-top"');
    const fitAt = html.indexOf('id="is-this-for-you"');
    const faqAt = html.indexOf('id="buyer-faq"');
    assert.ok(top !== -1 && fitAt > top && faqAt > fitAt, "fit and FAQ should follow the top buy button");

    const fit = section(html, "is-this-for-you");
    assert.match(fit, /<h2 id="fit-h">Is this for you\?<\/h2>/);
    assert.match(fit, /<h3>A fit<\/h3>\s*<p>[^<]+<\/p>/);
    assert.match(fit, /<h3>Not a fit<\/h3>\s*<p>[^<]+<\/p>/);
    assert.equal(/gumroad\.com/i.test(fit), false, "fit section must not add a Gumroad link");

    const faq = section(html, "buyer-faq");
    assert.match(faq, /<h2 id="buyer-faq-h">Before you buy<\/h2>/);
    const visible = pairs(faq);
    assert.ok(visible.length >= 5 && visible.length <= 7, `expected 5-7 questions, got ${visible.length}`);
    const blob = visible.map((item) => `${item.q} ${item.a}`).join(" ");
    assert.match(blob, /ZIP/);
    assert.match(blob, /Gumroad/);
    assert.match(blob, /within 30 days/);
    assert.match(blob, /corrupt or materially not as described/);
    assert.equal(blob.includes(REFUND), true);
    assert.equal(/money-?back guarantee|no questions asked|full refund/i.test(blob), false);
    assert.equal(/<a\b[^>]*gumroad/i.test(faq), false, "buyer FAQ must not add a Gumroad link");
    assert.match(faq, /<a href="\/refund-policy.html">Refund Policy<\/a>/);
    assert.equal(faq.includes("\u2014") || faq.includes("\u2013") || faq.includes("&mdash;"), false);
    assert.equal(fit.includes("\u2014") || fit.includes("\u2013") || fit.includes("&mdash;"), false);

    const block = html.match(/<script type="application\/ld\+json" id="buyer-faq-jsonld">([\s\S]*?)<\/script>/);
    assert.ok(block, "missing buyer FAQ JSON-LD");
    const data = JSON.parse(block[1]);
    assert.equal(data["@context"], "https://schema.org");
    assert.equal(data["@type"], "FAQPage");
    assert.equal(data.mainEntity.length, visible.length);
    data.mainEntity.forEach((item, index) => {
      assert.equal(item["@type"], "Question");
      assert.equal(item.name, visible[index].q);
      assert.equal(item.acceptedAnswer["@type"], "Answer");
      assert.equal(item.acceptedAnswer.text, visible[index].a);
    });

    const pages = jsonBlocks(html).filter((item) => item["@type"] === "FAQPage");
    assert.equal(pages.length, 2);
    assert.equal(pages[0].dateModified, "2026-11-10");
    assert.notEqual(pages[0], data);

    const hrefs = [...html.matchAll(/\bhref="([^"]*gumroad\.com[^"]*)"/g)].map((match) => match[1]);
    assert.deepEqual(hrefs, page.hrefs);
  });
}
