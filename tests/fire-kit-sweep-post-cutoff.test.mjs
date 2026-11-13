// Post-cutoff sweep for the FIRE kit pages that PR #140 does not own.
// The kit hide script uses Date.UTC(2026, 10, 19, 20, 0, 0). That instant is closed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const LOGO = "https://firstmoverprojects.com/assets/fmp-logo-460.png";
const PAGES = [
  "tools/index.html",
  "tools/1099-nec-or-1099-k-check/index.html",
  "deadlines/index.html",
  "deadlines/finder/index.html",
  "deadlines/fire-to-iris-transition-checklist.html",
  "deadlines/iris-tcc-application-how-long.html",
  "deadlines/file-1099-nec-2027-iris.html",
  "deadlines/whiteboard-azure-oct-16.html",
  "deadlines/office-2021-windows-11-24h2-oct-13.html"
];
const SHARE_PAGES = [
  "tools/1099-nec-or-1099-k-check/index.html",
  "deadlines/fire-to-iris-transition-checklist.html",
  "deadlines/iris-tcc-application-how-long.html",
  "deadlines/file-1099-nec-2027-iris.html"
];
const BANNED = [
  "$9 FIRE",
  "$9 Switch Checklist",
  "Optional $9 Checklist",
  "$9 IRS filing checklist",
  "Get the $9 checklist",
  "See the $9",
  "Optional: $9",
  "INSTANT DOWNLOAD",
  "checklist is optional",
  "Refunds:",
  "FIRE to IRIS Switch Checklist"
];
const FIRE_JSON = /FIRE checklist|\$9 checklist|checklist is optional|fire-to-iris-switch-checklist|FIRE to IRIS Switch Checklist/i;

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function withCss(rel) {
  const html = read(rel);
  let extra = html;
  const dir = path.dirname(path.join(ROOT, rel));
  for (const match of html.matchAll(/<link[^>]*href="([^"]+\.css)"/g)) {
    const href = match[1];
    if (/^https?:/i.test(href)) continue;
    const abs = href.startsWith("/") ? path.join(ROOT, href) : path.resolve(dir, href.split("?")[0]);
    if (abs.startsWith(ROOT)) extra += "\n" + readFileSync(abs, "utf8");
  }
  return extra;
}

function metaContent(html, attr, name) {
  const patterns = [
    new RegExp(`<meta[^>]*\\b${attr}="${name}"[^>]*\\bcontent="([^"]*)"`, "i"),
    new RegExp(`<meta[^>]*\\bcontent="([^"]*)"[^>]*\\b${attr}="${name}"`, "i")
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function jsonBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((block) => JSON.parse(block[1]));
}

function imageValues(node, out) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) imageValues(item, out);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "image" && typeof value === "string") out.push(value);
    else imageValues(value, out);
  }
}

const E1 = "Last day to file information returns through the FIRE system. That date has passed. The FIRE page says 3 p.m. Eastern time. The news release says 3 p.m. ET.";
const E2 = "The IRS says IRIS will be the only information returns electronic filing system, including current year, prior year, or corrections, after Jan. 1, 2027 (foreign filers without a U.S. TIN use IDES). The IRS says you can e-file information returns for tax year 2022 and later, and corrections, in IRIS.";
const E3 = "The FIRE page says IRIS will be the only information returns electronic filing system, including current year, prior year, or corrections, after Jan. 1, 2027 (foreign filers without a U.S. TIN use IDES). The IRS says you can e-file information returns for tax year 2022 and later, and corrections, in IRIS. The IRS says current FIRE users who will e-file in IRIS themselves must complete a separate IRIS Application for TCC. If a payroll provider, accountant, or paid e-file service files for you, this may already be handled. Ask them.";
const E1_PAGES = [
  "deadlines/fire-to-iris-transition-checklist.html",
  "deadlines/iris-tcc-application-how-long.html",
  "deadlines/file-1099-nec-2027-iris.html"
];
const JAN1 = "IRIS will be the only information returns electronic filing system, including current year, prior year, or corrections, after Jan. 1, 2027.";

test("E1 to E6 use the approved past-tense lines", () => {
  for (const rel of E1_PAGES) {
    const html = read(rel);
    assert.equal(html.includes(E1), true, rel);
    assert.equal(html.includes("Last day to file information returns through FIRE. The FIRE page says 3 p.m. Eastern time."), false, rel);
    assert.equal(html.includes("When was the last day to file on IRS FIRE?"), true, rel);
    assert.equal(html.includes("When is the last day to file on IRS FIRE?"), false, rel);
  }
  const transition = read("deadlines/fire-to-iris-transition-checklist.html");
  assert.equal(transition.includes(E2), true);
  assert.equal(transition.split(E3).length - 1, 2);
  assert.equal(transition.includes("After January 1, 2027, IRIS is the only e-file system for information returns, including current year, prior year, and corrections."), false);
  const finder = read("deadlines/finder/index.html");
  assert.equal(finder.includes('<p class="chip">Next: Jan 1, 2027</p>'), true);
  assert.equal(finder.includes("Next: Nov 19"), false);
  assert.equal(finder.includes('<li class="past"><strong>passed on Nov 19, 2026, 3 p.m. ET</strong>: Last day to file information returns through FIRE.</li>'), true);
  assert.equal(finder.includes("Anyone who e-filed Forms 1099 or other information returns through the IRS FIRE system themselves."), true);
  assert.equal(finder.includes("who e-files"), false);
  assert.equal(finder.split(JAN1).length - 1, 1);
  assert.equal(finder.includes(JAN1.slice(0, -1) + " (foreign filers without a U.S. TIN use IDES)."), true);
  const data = JSON.parse(finder.match(/<script type="application\/json" id="finder-data">([\s\S]*?)<\/script>/)[1]);
  const fire = data.items.find((item) => item.id === "irs-fire");
  assert.equal(fire.key_dates[3].text, JAN1);
  const hub = read("deadlines/index.html");
  assert.equal(hub.includes("Businesses that e-filed 1099s and other information returns through FIRE ("), true);
  assert.equal(hub.includes("that e-file 1099s"), false);
});

test("share images and JSON-LD do not keep the FIRE kit preview or the kit offer", () => {
  for (const rel of PAGES) {
    const html = read(rel);
    const blocks = jsonBlocks(html);
    const images = [];
    for (const block of blocks) imageValues(block, images);
    const og = metaContent(html, "property", "og:image");
    const twitter = metaContent(html, "name", "twitter:image");
    for (const url of [og, twitter, ...images]) {
      assert.equal(url.includes("fire-to-iris-kit-preview"), false, rel + " " + url);
    }
    assert.equal(FIRE_JSON.test(JSON.stringify(blocks)), false, rel);
    assert.equal(withCss(rel).includes("[data-fire-kit][hidden]{display:none !important}"), true, rel);
  }
  for (const rel of SHARE_PAGES) {
    const html = read(rel);
    assert.equal(metaContent(html, "property", "og:image"), LOGO, rel);
    assert.equal(metaContent(html, "name", "twitter:image"), LOGO, rel);
    assert.equal(metaContent(html, "name", "twitter:card"), "summary", rel);
  }
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
  const gumroad = [...document.querySelectorAll("a[href*='fire-to-iris-switch-checklist']")].filter(shown).length;
  return { text, gumroad };
}

test("the FIRE kit stays on sale one second before the cutoff and is gone at the cutoff", async () => {
  const mod = process.env.PLAYWRIGHT_CORE || "playwright-core";
  const { chromium } = await import(mod);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });

  async function openAt(rel, when) {
    const context = await browser.newContext({ timezoneId: "America/New_York" });
    const page = await context.newPage();
    await page.clock.install({ time: new Date(when) });
    await page.goto(pathToFileURL(path.join(ROOT, rel)).href, { waitUntil: "load" });
    const state = await page.evaluate(visibleState);
    await context.close();
    return state;
  }

  async function runCheck(rel, when) {
    const context = await browser.newContext({ timezoneId: "America/New_York" });
    const page = await context.newPage();
    await page.clock.install({ time: new Date(when) });
    await page.goto(pathToFileURL(path.join(ROOT, rel)).href, { waitUntil: "load" });
    const fireBox = page.locator('input[name="tool"][value="irs-fire"]');
    if (await fireBox.count()) await fireBox.check();
    const button = page.getByRole("button", { name: /^(See the answer|Check my readiness)$/ });
    if (await button.count()) {
      await page.evaluate(() => {
        function pick(name, value) {
          const nodes = document.getElementsByName(name);
          for (let i = 0; i < nodes.length; i++) nodes[i].checked = nodes[i].value === value;
        }
        if (document.getElementsByName("purpose").length) {
          pick("purpose", "business");
          pick("who", "contractor");
          pick("method", "noncard");
          pick("noncard", "least");
        }
      });
      await button.click();
      await page.locator("#results").waitFor({ state: "visible" });
    }
    const state = await page.evaluate(visibleState);
    await context.close();
    return state;
  }

  function assertHidden(state, rel) {
    assert.equal(state.gumroad, 0, rel + " gumroad");
    for (const phrase of BANNED) {
      assert.equal(state.text.includes(phrase), false, rel + " " + phrase);
    }
  }

  try {
    for (const rel of PAGES) {
      const before = await openAt(rel, "2026-11-19T19:59:59.000Z");
      assert.ok(before.gumroad > 0, rel + " offer before cutoff");
      const after = await openAt(rel, "2026-11-19T20:00:00.000Z");
      assertHidden(after, rel);
      const checked = await runCheck(rel, "2026-11-19T20:00:00.000Z");
      assertHidden(checked, rel + " after check");
      if (rel === "tools/1099-nec-or-1099-k-check/index.html") {
        const stillSelling = await runCheck(rel, "2026-11-19T19:59:59.000Z");
        assert.ok(stillSelling.gumroad > 0, rel + " result offer before cutoff");
        assert.equal(stillSelling.text.includes("$9"), true, rel + " $9 before cutoff");
      }
    }
  } finally {
    await browser.close();
  }
});
