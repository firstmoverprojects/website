// Lead answer under the H1 on the three paid-kit pages.
// Visible HTML only. The paragraph is not copied into FAQPage JSON-LD.
// Words are the whitespace-separated text after tags are removed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PAGES = [
  "tools/fire-to-iris-check/index.html",
  "tools/amazon-coi-check/index.html",
  "tools/etsy-photo-audit-check/index.html"
];
const AMAZON_SENTENCE = "Amazon's November 2 announcement says sellers with products in categories with enhanced safety listing requirements need USD 1 million commercial liability coverage per occurrence and in aggregate, regardless of sales. Paste your certificate text and get a question list to take to your broker before you upload it.";

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function plain(fragment) {
  return fragment
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(fragment) {
  const text = plain(fragment);
  return text ? text.split(" ") : [];
}

function source(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function firstBuyIndex(html) {
  const re = /<a\b[^>]*>/gi;
  let match;
  while ((match = re.exec(html))) {
    const href = /\bhref\s*=\s*"([^"]*)"/i.exec(match[0]);
    if (!href) continue;
    if (/gumroad\.com\/l\//i.test(href[1].replace(/&amp;/g, "&"))) return match.index;
  }
  return -1;
}

for (const rel of PAGES) {
  test(`${rel} has one 40-60 word #aeo-answer after the H1 and before the first Gumroad buy link`, () => {
    const html = source(read(rel));
    assert.equal((html.match(/id="aeo-answer"/g) || []).length, 1);
    const h1 = html.search(/<h1\b/i);
    const answer = html.indexOf('<p class="aeo-answer" id="aeo-answer">');
    const end = html.indexOf("</p>", answer);
    const buy = firstBuyIndex(html);
    assert.ok(h1 !== -1 && answer > h1, "#aeo-answer should follow the H1");
    assert.ok(end > answer, "#aeo-answer should close");
    assert.ok(buy > answer, "#aeo-answer should precede the first Gumroad buy link");
    const count = words(html.slice(answer, end)).length;
    assert.ok(count >= 40 && count <= 60, `word count ${count} is outside 40-60`);
  });
}

test("the Amazon $1M answer sentence appears once", () => {
  const html = source(read("tools/amazon-coi-check/index.html"));
  const text = plain(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " "));
  const hits = text.split(AMAZON_SENTENCE).length - 1;
  assert.equal(hits, 1);
  const answer = html.indexOf('<p class="aeo-answer" id="aeo-answer">');
  const end = html.indexOf("</p>", answer);
  assert.equal(plain(html.slice(answer, end)), AMAZON_SENTENCE);
});
