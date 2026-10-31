import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PAGE = "deadlines/new-mexico-pfas-jan-1-2027.html";
const html = readFileSync(path.join(ROOT, PAGE), "utf8");

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function loadCheck() {
  const match = html.match(/<script id="pfas-logic">\n([\s\S]*?)\n<\/script>/);
  assert.ok(match, "pfas logic script");
  const sandbox = {};
  vm.runInNewContext(match[1], sandbox, { filename: "pfas-logic.js" });
  return sandbox.fmpNmPfasCheck;
}

test("the page is unlisted and reuses the Brevo signup", () => {
  assert.match(html, /<meta name="robots" content="noindex, follow" \/>/);
  assert.equal(html.split('id="signup"').length - 1, 1);
  assert.equal(/<a\b[^>]*gumroad\.com/i.test(html), false);
  assert.equal(html.includes("$29"), false);
  assert.equal(/waitlist/i.test(html), false);
  assert.equal(html.includes("\u2014"), false);
  assert.equal(html.includes("\u2013"), false);
  assert.equal(/kids['’]/i.test(html), false);
  const beforeSources = html.slice(0, html.indexOf('id="src-h"'));
  assert.equal(beforeSources.includes("15,000"), false);
  assert.equal(beforeSources.includes("25,000"), false);
  assert.equal(/fifteen thousand|twenty-five thousand/i.test(beforeSources), false);
  for (const phrase of [
    "A banned product cannot be fixed by reporting or labeling.",
    "Initial NMED report fee: $2,500 (NMED).",
    "no later than December 2, 2026",
    "This check does not make your products compliant and does not test products. Check the official NMED pages and get qualified advice for your situation.",
    "General guidance, not legal, tax or IT advice.",
    "Not affiliated with or endorsed by the State of New Mexico or NMED.",
    "Thank you for your time.",
    "Know another small brand that ships to New Mexico? Please share this with them.",
    "Share it with someone it could help.",
    "used products: exempt",
    "fluoropolymer: report-exempt, label still applies"
  ]) {
    assert.equal(html.includes(phrase), true, phrase);
  }
  assert.equal(/<input\b(?![^>]*type="radio")[^>]*>/i.test(html), false);
  assert.equal(/type="file"/i.test(html), false);
  assert.match(html, /no company field and no SKU upload/);
  assert.match(html, /is not saved or sent/);
});

test("the page is not in the sitemap, deadlines index, feed, calendar, or finder", () => {
  const name = "new-mexico-pfas-jan-1-2027.html";
  for (const rel of ["sitemap.xml", "deadlines/index.html", "deadlines/feed.xml", "deadlines/deadlines.ics", "deadlines/finder/index.html", "deadlines/finder/finder.js"]) {
    assert.equal(read(rel).includes(name), false, rel);
  }
});

test("FAQPage JSON matches the visible questions and answers", () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)];
  const data = blocks.map((block) => JSON.parse(block[1])).find((item) => item["@type"] === "FAQPage");
  assert.ok(data);
  const questions = [...html.matchAll(/<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)];
  assert.equal(questions.length, data.mainEntity.length);
  data.mainEntity.forEach((item, i) => {
    assert.equal(item.name, questions[i][1]);
    assert.equal(item.acceptedAnswer.text, questions[i][2]);
  });
});

test("the in-browser check places waves and the manufacturer test", () => {
  const check = loadCheck();
  const base = { used: "no", added: "yes", fluoro: "no", made: "yes", importer: "no", usOffice: "yes" };
  const cookware = check({ ...base, category: "cookware" });
  assert.equal(cookware.wave, "2027");
  assert.equal(cookware.manufacturer, "yes");
  assert.match(cookware.text, /A banned product cannot be fixed by reporting or labeling\./);
  assert.match(cookware.text, /Initial NMED report fee: \$2,500 \(NMED\)\./);
  assert.match(cookware.text, /no later than December 2, 2026/);
  assert.match(cookware.text, /does not make your products compliant/);
  assert.equal(cookware.text.includes("15,000"), false);

  for (const category of ["food-packaging", "dental-floss", "juvenile", "firefighting-foam"]) {
    assert.equal(check({ ...base, category }).wave, "2027", category);
  }
  for (const category of ["carpets", "cleaning", "cosmetics", "fabric", "feminine", "textiles", "textile-furnishings", "ski-wax", "upholstered"]) {
    const result = check({ ...base, category });
    assert.equal(result.wave, "2028", category);
    assert.match(result.text, /not in the January 1, 2027 list/);
  }
  assert.equal(check({ ...base, category: "other" }).wave, "2032");

  const used = check({ ...base, used: "yes", category: "cookware" });
  assert.equal(used.wave, "used");
  assert.match(used.text, /used products: exempt/);

  const fluoro = check({ ...base, category: "cookware", fluoro: "yes" });
  assert.equal(fluoro.wave, "fluoropolymer");
  assert.match(fluoro.text, /fluoropolymer: report-exempt, label still applies/);
  assert.match(fluoro.text, /do not treat that fee as owed/);

  const none = check({ ...base, added: "no", category: "cookware" });
  assert.equal(none.wave, "none");

  const importer = check({ ...base, category: "cookware", made: "no", importer: "yes", usOffice: "no" });
  assert.equal(importer.manufacturer, "yes");
  assert.match(importer.text, /does not have an office or employees in the United States/);

  const domesticBrand = check({ ...base, category: "cookware", made: "no", importer: "yes", usOffice: "yes" });
  assert.equal(domesticBrand.manufacturer, "not-p2");
  assert.match(domesticBrand.text, /do not place you in that part of the definition/);

  const reseller = check({ ...base, category: "cookware", made: "no", importer: "no", usOffice: "no" });
  assert.equal(reseller.manufacturer, "no");
  assert.match(reseller.text, /distributors and retailers/);
  assert.equal(/not liable/i.test(reseller.text), false);
});
