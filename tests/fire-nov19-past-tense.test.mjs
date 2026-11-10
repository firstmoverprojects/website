// After the Nov 19, 2026 3 p.m. ET cutoff, visible copy and JSON-LD on the
// FIRE check and the Nov 19 deadline page must not tell readers to file
// through FIRE as a future action.
//
// data-fire-kit nodes are left out of the phrase scan. The hide script
// (id="fmp-fire-kit") sets those nodes hidden at CUTOFF, Date.UTC(2026, 10, 19, 20, 0, 0),
// which is Nov 19, 2026, 3 p.m. ET. After that instant the buy buttons are not shown.
// The script, CUTOFF, and the Gumroad hrefs inside those nodes stay as they are.
//
// Date guards are also left out of the phrase scan, and this file asserts their
// source is unchanged:
// - fmp-next-irs still writes NOV19_LINE before the cutoff and CLOSED at the cutoff.
// - fmp-passed-dates still marks Nov 1 and Nov 9.
// - deadline-status.js still needs the Nov 19 chip to say "Upcoming" so it can
//   flip that chip to "Expired. Passed Nov 19" at data-cutoff. The chip is not
//   a filing instruction.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PAGES = [
  "tools/fire-to-iris-check/index.html",
  "deadlines/irs-fire-retirement-nov-19.html"
];
const PAST_EASTERN = "Nov 19, 2026 at 3 p.m. Eastern was the last day to file information returns through FIRE.";
const PAST_ET = "Nov 19, 2026 at 3 p.m. ET was the last day to file information returns through FIRE.";
const IRIS = "IRIS is the only system after Jan. 1, 2027.";
const NOV9 = "Nov 9, 2026 was the last day to change IR Applications for TCC, and those applications are now read-only.";
const FAQ_Q = "When was the last day to file information returns through FIRE?";
const H1 = "When was the last day to file on IRS FIRE?";
const NEXT_IRS = `${PAST_ET} ${IRIS} ${NOV9}`;
const FORBIDDEN = [
  "is the last day",
  "file through FIRE by",
  "before Nov 19",
  "Before Nov 19",
  "before the November 19",
  "you can still file",
  "You can still file",
  "Next IRS date: Nov 19",
  "Next IRS date: November 19",
  "next IRS date is November 19",
  "next IRS date is Nov 19",
  "is the next IRS date",
  "plan to submit through FIRE",
  "plan to file on FIRE",
  "still plan to file on FIRE",
  "Submit any remaining live FIRE",
  "anything still due in FIRE",
  "file through FIRE ourselves",
  "closes on Nov 19",
  "system that is closing",
  "takes its last filings"
];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function script(html, id) {
  const match = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`));
  assert.ok(match, id);
  return match[1];
}

// Phrase scan: visible markup, JSON-LD, and non-guard scripts.
// Guard scripts and data-fire-kit nodes are removed first.
function scanText(html) {
  return html
    .replace(/<script id="fmp-next-irs">[\s\S]*?<\/script>/g, "")
    .replace(/<script id="fmp-passed-dates">[\s\S]*?<\/script>/g, "")
    .replace(/<script id="fmp-fire-kit">[\s\S]*?<\/script>/g, "")
    .replace(/<(p|a)\b[^>]*\bdata-fire-kit="1"[^>]*>[\s\S]*?<\/\1>/gi, "");
}

test("both FIRE pages use past tense for Nov 19 and drop future filing lines", () => {
  for (const rel of PAGES) {
    const html = read(rel);
    const scanned = scanText(html);
    for (const phrase of FORBIDDEN) {
      assert.equal(scanned.includes(phrase), false, rel + " still says: " + phrase);
    }
    assert.equal(scanned.includes("\u2014"), false, rel);
    assert.equal(scanned.includes("\u2013"), false, rel);
    assert.equal(html.includes('var CUTOFF = Date.UTC(2026, 10, 19, 20, 0, 0);'), true, rel);
    assert.equal(script(html, "fmp-next-irs").includes('var NOV19_LINE = "Last day to file on FIRE: Nov 19, 2026, 3 p.m. ET. ";'), true, rel);
    assert.equal(script(html, "fmp-next-irs").includes('var CLOSED = "FIRE is closed. IRIS is the only IRS e-file system for information returns from Jan 1, 2027.";'), true, rel);
    assert.equal(html.includes('["", "event", "tiktok-follow-click-"].join("/")'), true, rel);
    assert.equal(html.includes("Refunds: within 30 days if a file is corrupt or materially not as described."), true, rel);
    assert.match(html, /data-next-irs-copy="">Nov 19, 2026 at 3 p\.m\. ET was the last day to file information returns through FIRE\. IRIS is the only system after Jan\. 1, 2027\. Nov 9, 2026 was the last day to change IR Applications for TCC, and those applications are now read-only\. /);
    const dates = [...html.matchAll(/"dateModified": "([^"]+)"/g)].map((match) => match[1]);
    assert.ok(dates.length > 0, rel);
    for (const date of dates) assert.equal(date, "2026-11-19", rel + " " + date);
    assert.equal(html.includes(NEXT_IRS), true, rel);
  }
});

test("the deadline FAQ question and answer are past tense and match JSON-LD", () => {
  const html = read("deadlines/irs-fire-retirement-nov-19.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)].map((block) => JSON.parse(block[1]));
  const faq = blocks.find((item) => item["@type"] === "FAQPage");
  const item = faq.mainEntity.find((entry) => entry.acceptedAnswer.text === PAST_EASTERN);
  assert.equal(item.name, FAQ_Q);
  const visible = html.slice(html.indexOf('id="faq-h"'), html.indexOf('id="src-h"'));
  assert.equal(visible.includes("<summary>" + FAQ_Q + "</summary>"), true);
  assert.equal(visible.includes("<p>" + PAST_EASTERN + "</p>"), true);
  assert.equal(html.includes("<h1>" + H1 + "</h1>"), true);
  const article = blocks.find((entry) => Array.isArray(entry["@graph"]))["@graph"].find((entry) => entry["@type"] === "Article");
  assert.equal(article.headline, H1);
  assert.equal(article.dateModified, "2026-11-19");
  assert.equal(html.includes(PAST_EASTERN), true);
  assert.equal(html.includes("List whether we have an IRIS Application for TCC started. " + PAST_ET), true);
  assert.equal(html.includes("5. Nov 9, 2026 was the last day to change an IR Application for TCC, and those applications are now read-only. " + PAST_ET), true);
  assert.equal(html.includes("The IRS says " + PAST_ET.slice(0, -1) + ", and " + IRIS), true);
});

test("the FIRE check states the passed filing day outside the kit hide nodes", () => {
  const html = read("tools/fire-to-iris-check/index.html");
  assert.equal(html.split(PAST_EASTERN).length - 1 >= 2, true);
  assert.equal(html.includes("We had 2026 or prior-year returns, corrections, or test files. " + PAST_ET), true);
  assert.equal(html.split(PAST_ET).length - 1 >= 4, true);
  assert.equal(html.includes("Nov. 1, 2026 was the last day to file test information returns through the FIRE Trading Partner Test System. " + PAST_ET), true);
  assert.equal(html.includes(PAST_EASTERN + " " + IRIS), true);
  assert.equal(html.includes(PAST_EASTERN + " " + IRIS + " The checklist lists the IRS dates and links, your FIRE account steps and 2027 prep on 3 pages."), true);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((block) => JSON.parse(block[1]));
  const faq = blocks.find((item) => item["@type"] === "FAQPage");
  assert.equal(faq.dateModified, "2026-11-19");
  const dates = faq.mainEntity.find((item) => item.name === "What November 2026 FIRE dates does the IRS list?");
  assert.equal(dates.acceptedAnswer.text.endsWith(PAST_EASTERN), true);
  assert.equal(dates.acceptedAnswer.text.includes("is the last day"), false);
  assert.equal(dates.acceptedAnswer.text.includes("is the next IRS date"), false);
});
