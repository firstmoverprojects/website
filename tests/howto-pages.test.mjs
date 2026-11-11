// Sourced how-to pages for search and AI-answer traffic.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ADVICE = "General guidance, not legal, tax or IT advice.";

const PAGES = [
  {
    file: "deadlines/etsy-listing-photo-requirements.html",
    loc: "https://firstmoverprojects.com/deadlines/etsy-listing-photo-requirements.html",
    question: "What do Etsy sellers need to know about the unedited listing photo rule?",
    offer: "/tools/etsy-photo-audit-check/",
    product: "https://firstmoverprojects.gumroad.com/l/lnfgc",
    sources: [
      "https://help.etsy.com/hc/en-us/articles/115015663347-Requirements-and-Best-Practices-for-Images-in-Your-Etsy-Shop",
      "https://help.etsy.com/hc/en-us/articles/44297885802647-How-Do-Etsy-s-Listing-Image-Requirements-Apply-to-My-Listings"
    ],
    must: [
      "at least one unedited photo of the actual item against a real background",
      "635 pixels",
      "These two Etsy Help pages do not name a single last day"
    ],
    mustNot: ["October 22", "Oct 22", "early 2027", "3.5%"]
  },
  {
    file: "deadlines/amazon-fba-fees-2027.html",
    loc: "https://firstmoverprojects.com/deadlines/amazon-fba-fees-2027.html",
    question: "What should Amazon sellers check about the 2027 FBA fee changes?",
    offer: "/tools/amazon-coi-check/",
    product: "https://firstmoverprojects.gumroad.com/l/amazon-1m-insurance-readiness-kit",
    sources: [
      "https://sellingpartners.aboutamazon.com/update-to-us-referral-and-fulfillment-by-amazon-fees-for-2027",
      "https://sellercentral.amazon.com/gp/help/external/G201411300"
    ],
    must: [
      "$0.19 per unit sold",
      "approximately 0.8%",
      "January 15, 2027",
      "February 1, 2027",
      "below 28 days of supply",
      "This page does not restate those rates"
    ],
    mustNot: ["3.5%", "upfront fee", "inbound placement fee"]
  },
  {
    file: "deadlines/loom-creator-lite-deprecation.html",
    loc: "https://firstmoverprojects.com/deadlines/loom-creator-lite-deprecation.html",
    question: "What should Loom admins check when Creator Lite is discontinued?",
    offer: "/tools/loom-seat-audit-calculator/",
    product: "https://firstmoverprojects.gumroad.com/l/loom-seat-audit-exit-pack",
    sources: [
      "https://support.atlassian.com/loom/docs/loom-customer-integration-with-atlassian-pricing-billing-and-role-changes/",
      "https://support.atlassian.com/loom/docs/how-long-can-i-record/"
    ],
    must: [
      "no single public date",
      "next billing date",
      "no more 5-minute limit",
      "no more 25-video limit",
      "does not print one"
    ],
    mustNot: ["$8 per", "$15 per", "February 2026"]
  },
  {
    file: "deadlines/windows-server-2016-end-of-support.html",
    loc: "https://firstmoverprojects.com/deadlines/windows-server-2016-end-of-support.html",
    question: "What should you check before Windows Server 2016 support ends?",
    offer: "/tools/windows-server-2016-check/",
    product: "https://firstmoverprojects.gumroad.com/l/windows-server-2016-end-of-support-kit",
    sources: [
      "https://learn.microsoft.com/en-us/lifecycle/products/windows-server-2016",
      "https://learn.microsoft.com/en-us/azure/azure-arc/servers/prepare-extended-security-updates",
      "https://support.microsoft.com/en-us/servicing/os/windows/docs/2026/09/windows-server-2016-essentials-end-support"
    ],
    must: [
      "January 12, 2027",
      "1/13/2027 6:59:59 AM Pacific Time",
      "August 3, 2026",
      "January 13, 2027",
      "version 1.62 or higher",
      "remotewebaccess.com"
    ],
    mustNot: ["$437", "per core"]
  }
];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

test("each how-to page answers first, cites primary sources, and is in the sitemap", () => {
  const sitemap = read("sitemap.xml");
  const hub = read("deadlines/index.html");
  const feed = read("deadlines/feed.xml");
  const llms = read("llms.txt");
  for (const page of PAGES) {
    const html = read(page.file);
    const answerAt = html.indexOf('class="answer-first"');
    const h2At = html.indexOf("<h2");
    assert.ok(answerAt !== -1 && answerAt < h2At, page.file);
    assert.equal(html.includes(page.question), true, page.file);
    assert.equal(html.includes(ADVICE), true, page.file);
    assert.match(html, /<title>[^<]+<\/title>/, page.file);
    assert.match(html, /<meta name="description" content="[^"]+"/);
    assert.match(html, new RegExp(`<link rel="canonical" href="${page.loc}" />`));
    assert.match(html, /<meta property="og:image" content="https:\/\/firstmoverprojects\.com\/[^"]+"/);
    assert.equal(html.includes("\u2014"), false, page.file);
    assert.equal(html.includes("\u2013"), false, page.file);
    assert.match(html, new RegExp(`href="${page.offer}"`));
    for (const source of page.sources) assert.equal(html.includes(source), true, source);
    for (const line of page.must) assert.equal(html.includes(line), true, page.file + " " + line);
    for (const line of page.mustNot) assert.equal(html.includes(line), false, page.file + " " + line);
    assert.match(sitemap, new RegExp(`<loc>${page.loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>`));
    assert.equal(feed.includes(page.loc), true, page.file);
    assert.equal(llms.includes(page.loc), true, page.file);
    assert.equal(hub.includes(page.file.slice("deadlines/".length)), true, page.file);
    const hrefs = [...html.matchAll(/<a\b[^>]*href="(https:\/\/firstmoverprojects\.gumroad\.com\/l\/[^"]+)"/g)].map((match) => match[1].replace(/&amp;/g, "&"));
    assert.equal(hrefs.length, 2, page.file);
    for (const href of hrefs) {
      const url = new URL(href);
      assert.equal(url.origin + url.pathname, page.product);
      assert.equal(url.searchParams.get("wanted"), "true");
      assert.equal(url.searchParams.get("utm_source"), "site");
      assert.equal(url.searchParams.get("utm_medium"), "site");
      assert.equal(url.searchParams.get("utm_campaign"), page.file.slice("deadlines/".length, -".html".length));
    }
    assert.equal(new URL(hrefs[0]).searchParams.get("utm_content"), "top-cta");
    assert.equal(new URL(hrefs[1]).searchParams.get("utm_content"), "bottom-cta");
  }
  assert.equal(sitemap.includes("irs-fire-shutting-down-1099"), false);
});

test("FAQPage JSON matches the visible questions and answers", () => {
  for (const page of PAGES) {
    const html = read(page.file);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)].map((block) => JSON.parse(block[1]));
    const faq = blocks.find((item) => item["@type"] === "FAQPage");
    assert.ok(faq, page.file);
    assert.equal(faq.dateModified, "2026-11-11");
    const visible = html.slice(html.indexOf('id="faq-h"'), html.indexOf('id="src-h"'));
    const questions = [...visible.matchAll(/<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)];
    assert.equal(questions.length, faq.mainEntity.length, page.file);
    assert.ok(questions.length >= 4, page.file);
    faq.mainEntity.forEach((item, i) => {
      assert.equal(item.name, questions[i][1], page.file);
      assert.equal(item.acceptedAnswer.text, questions[i][2], page.file);
    });
  }
});
