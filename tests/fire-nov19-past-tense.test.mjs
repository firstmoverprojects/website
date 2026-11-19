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
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PAGES = [
  "tools/fire-to-iris-check/index.html",
  "deadlines/irs-fire-retirement-nov-19.html"
];
const PAST_EASTERN = "Nov 19, 2026 at 3 p.m. Eastern was the last day to file information returns through FIRE.";
const PAST_ET = "Nov 19, 2026 at 3 p.m. ET was the last day to file information returns through FIRE.";
const FAQ_Q = "When was the last day to file information returns through FIRE?";
const H1 = "When was the last day to file on IRS FIRE?";
const R3 = "FIRE is closed. After Jan 1, 2027, IRIS is the IRS e-file system for information returns (foreign filers without a U.S. TIN use IDES).";
const R4_CHECK = "We still have 2026 or prior-year returns or corrections to file (FIRE filing ended Nov 19, 2026 at 3 p.m. ET; the IRS says IRIS takes tax year 2022 and later returns and corrections)";
const R4_TEXT = "FIRE filing ended Nov 19, 2026 at 3 p.m. ET. The IRS says you can e-file information returns for tax year 2022 and later, and corrections, in IRIS.";
const R4_QUOTE2 = "You can e-file information returns for tax year 2022 and later with the Information Returns Intake System (IRIS). The system also lets you file corrections and request automatic extensions.";
const FORBIDDEN = [
  "is the last day",
  "file through FIRE by",
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
    .replace(/<(p|a|div|section|details|span)\b[^>]*\bdata-fire-kit="1"[^>]*>[\s\S]*?<\/\1>/gi, "");
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
    assert.equal(script(html, "fmp-next-irs").includes('var CLOSED = "' + R3 + '";'), true, rel);
    assert.equal(html.includes(R3), true, rel);
    assert.equal(html.includes("IRIS is the only IRS e-file system"), false, rel);
    assert.equal(html.includes('"event/tiktok-follow-click-" + toolSlug'), true, rel);
    assert.equal(html.includes("Refunds: within 30 days if a file is corrupt or materially not as described."), true, rel);
    assert.match(html, /data-next-irs-copy="">FIRE is closed\. After Jan 1, 2027, IRIS is the IRS e-file system for information returns \(foreign filers without a U\.S\. TIN use IDES\)\./);
    assert.match(html, /<a href="https:\/\/www\.irs\.gov\/filing\/e-file-information-returns-with-iris" rel="noopener noreferrer">irs\.gov\/iris<\/a>/);
    assert.match(html, /\[data-fire-kit\]\[hidden\]\{display:none !important\}/);
    const dates = [...html.matchAll(/"dateModified": "([^"]+)"/g)].map((match) => match[1]);
    assert.ok(dates.length > 0, rel);
    for (const date of dates) assert.equal(date, "2026-11-19", rel + " " + date);
    assert.equal(html.includes(R3), true, rel);
    assert.equal(html.includes('property="og:image" content="https://firstmoverprojects.com/assets/fmp-logo-460.png"') || html.includes('property="og:image" content="https://firstmoverprojects.com/assets/fmp-logo-460.png" />'), true, rel);
    assert.equal(html.includes("kit-preview"), html.includes("/assets/previews/fire-to-iris-kit-preview-1280x720"), rel);
    assert.equal((html.match(/og:image" content="[^"]*kit-preview/g) || []).length, 0, rel);
    assert.equal((html.match(/twitter:image" content="[^"]*kit-preview/g) || []).length, 0, rel);
    assert.equal(html.includes('name="twitter:card" content="summary"') || html.includes('name="twitter:card" content="summary" />'), true, rel);
    assert.equal(html.includes("summary_large_image"), false, rel);
    const jsonBlocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((block) => JSON.parse(block[1]));
    assert.equal(JSON.stringify(jsonBlocks).includes("checklist"), false, rel);
    assert.equal(JSON.stringify(jsonBlocks).includes("kit-preview"), false, rel);
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
  assert.equal(html.includes("2. If we filed through FIRE ourselves, list anything still open (2026 corrections or late returns) and whether we have an IRIS Application for TCC started. FIRE filing has ended, so anything still open would go through IRIS."), true);
  assert.equal(html.includes("5. Nov 9, 2026 was the last day to change an IR Application for TCC, and those applications are now read-only."), true);
  assert.equal(html.includes("5. Nov 9, 2026 was the last day to change an IR Application for TCC, and those applications are now read-only. " + PAST_ET), false);
  assert.equal(html.includes("The IRS says " + PAST_ET.slice(0, -1) + ". After Jan 1, 2027, IRIS is the IRS e-file system for information returns (foreign filers without a U.S. TIN use IDES)."), true);
  assert.equal(html.includes("and IRIS is the only system after Jan. 1, 2027"), false);
  assert.equal(html.includes('aria-label="Free check"'), true);
  assert.equal(html.includes('aria-label="Free check and checklist"'), false);
});

test("the FIRE check states the passed filing day outside the kit hide nodes", () => {
  const html = read("tools/fire-to-iris-check/index.html");
  assert.equal(html.split(PAST_EASTERN).length - 1 >= 2, true);
  const CHECK_PRE = "We still have 2026 or prior-year returns, corrections, or test files we plan to submit through FIRE before Nov 19, 2026 at 3 p.m. ET";
  assert.equal(html.includes('id="c-open-2026-copy">' + R4_CHECK), true);
  assert.equal(html.includes('var CHECK_PRE = "' + CHECK_PRE + '";'), true);
  assert.equal(html.includes('var CHECK_POST = "' + R4_CHECK + '";'), true);
  assert.equal(html.includes('problem.textContent = "' + R4_TEXT + '"'), true);
  assert.equal(html.includes('"Nov 19, 2026 (passed)", "' + R4_TEXT + '"'), true);
  assert.equal(html.includes(R4_QUOTE2), true);
  assert.equal(html.includes("You still need a separate IRIS Application for TCC. FIRE filing ended Nov 19, 2026 at 3 p.m. ET."), true);
  assert.equal(html.includes("You still have a step to finish. FIRE filing ended Nov 19, 2026 at 3 p.m. ET."), true);
  assert.equal(html.includes('<div class="kit-conv-box" data-fire-kit="1">'), true);
  assert.equal(html.includes("(last day to file information returns through the FIRE system; that date has passed). <a href=\"https://www.irs.gov/newsroom/"), true);
  assert.equal(html.includes("(last day to file information returns through the FIRE system; that date has passed) <a"), false);
  assert.equal(html.includes("Nothing urgent was flagged from your selections. Review the list below."), true);
  assert.equal(html.includes("No immediate FIRE cutoff blockers flagged from your selections. Review the checklist below."), false);
  assert.equal(html.includes("Because you still have returns or corrections to file, the checklist lists the IRS dates and links, your IRIS TCC steps and 2027 prep on 3 pages."), true);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((block) => JSON.parse(block[1]));
  const faq = blocks.find((item) => item["@type"] === "FAQPage");
  assert.equal(faq.dateModified, "2026-11-19");
  const dates = faq.mainEntity.find((item) => item.name === "What November 2026 FIRE dates does the IRS list?");
  assert.equal(dates.acceptedAnswer.text.endsWith(PAST_EASTERN), true);
  assert.equal(dates.acceptedAnswer.text.includes("is the last day"), false);
  assert.equal(dates.acceptedAnswer.text.includes("is the next IRS date"), false);
});

function visibleState() {
  function shown(el) {
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      if (node.hidden) return false;
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  }
  const text = document.body.innerText || "";
  const gumroad = [...document.querySelectorAll("a[href*='gumroad.com']")].filter(shown).length;
  const nov19 = document.querySelector("#cd-nov19");
  const next = document.getElementById("next-irs");
  return {
    text,
    gumroad,
    nov19: nov19 ? nov19.innerText : "",
    next: next ? next.innerText.replace(/\s+/g, " ").trim() : ""
  };
}

test("at the cutoff the kit is hidden and the Nov 19 card is Passed, and before it Today can still show", async () => {
  const mod = process.env.PLAYWRIGHT_CORE || "playwright-core";
  const { chromium } = await import(mod);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });
  const r3 = R3.replace(/\s+/g, " ").trim();
  async function openAt(rel, when) {
    const context = await browser.newContext({ timezoneId: "America/New_York" });
    const page = await context.newPage();
    await page.clock.install({ time: new Date(when) });
    await page.goto(pathToFileURL(path.join(ROOT, rel)).href, { waitUntil: "load" });
    const state = await page.evaluate(visibleState);
    await context.close();
    return state;
  }
  try {
    for (const rel of PAGES) {
      const after = await openAt(rel, "2026-11-19T20:05:00.000Z");
      assert.equal(after.text.includes("$9"), false, rel + " $9");
      assert.equal(after.text.includes("checklist is optional"), false, rel);
      assert.equal(after.text.includes("Refunds:"), false, rel);
      assert.equal(after.gumroad, 0, rel + " gumroad");
      assert.equal(after.text.includes(r3), true, rel);
      assert.equal(after.text.includes("before Nov 19"), false, rel);
      assert.equal(after.text.includes("Today (Nov 19"), false, rel);
      assert.equal(after.next, r3, rel + " next");
      const html = read(rel);
      assert.equal(html.includes("What is in the $9 checklist"), true, rel);
      const json = [...html.matchAll(/<script type="application\/ld\+json"[\s\S]*?<\/script>/g)].join("\n");
      assert.equal(json.includes("What is in the $9 checklist"), false, rel);
      assert.equal(html.includes(R3), true, rel);
    }
    const before = await openAt("tools/fire-to-iris-check/index.html", "2026-11-19T19:59:59.000Z");
    assert.equal(before.nov19.includes("Today (Nov 19, 2026)"), true, before.nov19);
    assert.equal(before.text.includes("$9"), true);
    const passed = await openAt("tools/fire-to-iris-check/index.html", "2026-11-19T20:05:00.000Z");
    assert.equal(passed.nov19.includes("Passed (Nov 19, 2026)"), true, passed.nov19);
    assert.equal(passed.nov19.includes("Today (Nov 19"), false, passed.nov19);
    const tool = read("tools/fire-to-iris-check/index.html");
    assert.equal(tool.includes(R4_CHECK), true);
    assert.equal(tool.includes(R4_TEXT), true);
    assert.equal(tool.includes(R4_QUOTE2), true);
  } finally {
    await browser.close();
  }
});

const KIT_BANS = ["$9", "INSTANT DOWNLOAD", "checklist is optional", "Refunds:", "The checklist button is at the top"];

test("after the cutoff a finished check hides the result kit box, and before it the box still shows $9", async () => {
  const mod = process.env.PLAYWRIGHT_CORE || "playwright-core";
  const { chromium } = await import(mod);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });
  const tool = pathToFileURL(path.join(ROOT, "tools/fire-to-iris-check/index.html")).href;
  const flows = [
    { self: true, iris: false, open: false },
    { self: true, iris: true, open: true }
  ];
  async function run(when, flags) {
    const context = await browser.newContext({ timezoneId: "America/New_York" });
    const page = await context.newPage();
    await page.clock.install({ time: new Date(when) });
    await page.goto(tool, { waitUntil: "load" });
    await page.evaluate((state) => {
      document.getElementById("c-self").checked = state.self;
      document.getElementById("c-iris-tcc").checked = state.iris;
      document.getElementById("c-ir-changes").checked = false;
      document.getElementById("c-open-2026").checked = state.open;
      document.getElementById("c-over100").checked = false;
    }, flags);
    await page.getByRole("button", { name: "Check my readiness" }).click();
    await page.locator("#results").waitFor({ state: "visible" });
    const text = await page.evaluate(() => document.body.innerText || "");
    const boxHidden = await page.evaluate(() => {
      const box = document.querySelector("#results .kit-conv-box");
      return !!(box && box.hidden);
    });
    await context.close();
    return { text, boxHidden };
  }
  try {
    for (const flags of flows) {
      const after = await run("2026-11-19T20:00:00.000Z", flags);
      assert.equal(after.boxHidden, true, JSON.stringify(flags));
      for (const phrase of KIT_BANS) {
        assert.equal(after.text.includes(phrase), false, phrase + " " + JSON.stringify(flags));
      }
      if (flags.self && !flags.iris && !flags.open) {
        assert.equal(after.text.includes("flagged before the November"), false, JSON.stringify(flags));
        assert.equal(after.text.includes("item to follow up on was flagged from your selections."), true, JSON.stringify(flags));
      }
      const before = await run("2026-11-19T19:59:59.000Z", flags);
      assert.equal(before.boxHidden, false, JSON.stringify(flags));
      assert.equal(before.text.includes("$9"), true, JSON.stringify(flags));
    }
  } finally {
    await browser.close();
  }
});
