// Answer-first FIRE and IRIS pages for payroll and bookkeeper searches.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FIT = "Good fit if you file 1099s for your business or clients and must move from FIRE to IRIS by Jan 1, 2027. Not needed if your software files for you.";
const DISCLAIMER = "General guidance, not legal, tax or IT advice.";
const PRODUCT = "https://firstmoverprojects.gumroad.com/l/fire-to-iris-switch-checklist";
const REFUND = "Refunds: within 30 days if a file is corrupt or materially not as described.";
const PAGES = [
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

function loadKit(html) {
  const match = html.match(/<script id="fmp-fire-kit">([\s\S]*?)<\/script>/);
  assert.ok(match);
  const nodes = [];
  const sandbox = {
    document: {
      readyState: "complete",
      querySelectorAll() { return nodes; },
      addEventListener() {}
    },
    Date
  };
  sandbox.window = sandbox;
  vm.runInNewContext(match[1], sandbox, { filename: "fmp-fire-kit.js" });
  return { api: sandbox.FMP_FIRE_KIT, nodes };
}

test("FAQPage JSON matches the visible questions and the kit sections have no Product schema", () => {
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
    assert.equal(blocks.some((item) => item["@type"] === "Product"), false, rel);
    assert.equal(html.includes("InStock"), false, rel);
    for (const id of ["kit", "kit-bottom"]) {
      const start = html.indexOf(`id="${id}"`);
      const end = html.indexOf("</section>", start);
      const section = html.slice(start, end);
      assert.match(section, /data-fire-kit="1" hidden/, rel + " " + id);
      assert.match(section, /class="kit-fit"/, rel + " " + id);
      assert.equal(section.includes(FIT), true, rel + " " + id);
      assert.equal(section.includes(REFUND), true, rel + " " + id);
      assert.equal(section.includes('"@type": "Product"'), false, rel + " " + id);
    }
  }
});

test("the kit is shown before 20:00:00Z on Nov 19 and hidden at the cutoff", () => {
  const first = read(PAGES[0]);
  for (const rel of PAGES) {
    const html = read(rel);
    assert.equal(html.includes("business days"), false, rel);
    assert.equal(html.includes("approved"), false, rel);
    assert.equal(html.includes(REFUND), true, rel);
    assert.equal(html.includes("Refunds within 30 days if the file is corrupt"), false, rel);
    assert.match(html, /Thanks for your time\. If this isn't right for you, please share it with someone it could help\./);
    assert.match(html, /Not affiliated with or endorsed by the IRS\./);
    assert.match(html, /Check the IRS's own pages for your case\. Not affiliated with or endorsed by the IRS or any vendor named on this page\./);
    assert.equal(html.match(/<script id="fmp-fire-kit">[\s\S]*?<\/script>/)[0], first.match(/<script id="fmp-fire-kit">[\s\S]*?<\/script>/)[0], rel);
  }
  const { api, nodes } = loadKit(first);
  nodes.push({ hidden: false }, { hidden: false });
  assert.equal(api.SHOW, true);
  api.hide(new Date("2026-11-19T19:59:59Z"));
  assert.deepEqual(nodes.map((node) => node.hidden), [false, false]);
  api.hide(new Date("2026-11-19T20:00:00Z"));
  assert.deepEqual(nodes.map((node) => node.hidden), [true, true]);
});

test("the duplicate FIRE shutdown page is gone", () => {
  assert.equal(existsSync(path.join(ROOT, "deadlines/irs-fire-shutting-down-1099.html")), false);
  const sitemap = read("sitemap.xml");
  const hub = read("deadlines/index.html");
  assert.equal(sitemap.includes("irs-fire-shutting-down-1099"), false);
  assert.equal(hub.includes("irs-fire-shutting-down-1099"), false);
});

test("the 1099-NEC page states the 2026 payment threshold", () => {
  const html = read("deadlines/file-1099-nec-2027-iris.html");
  const line = "The IRS lists a $2,000 threshold for payments made in 2026 and a January 31 due date";
  assert.match(html, new RegExp(`<meta name="description" content="${line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(html, new RegExp(`<meta property="og:description" content="${line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(html, /The \$2,000 threshold applies to payments made in 2026 \(the One Big Beautiful Bill Act raised it from \$600 for payments made after December 31, 2025\)\. For payments made after 2026 it is adjusted for inflation\./);
  assert.match(html, /https:\/\/www\.irs\.gov\/businesses\/small-businesses-self-employed\/am-i-required-to-file-a-form-1099-or-other-information-return/);
});
