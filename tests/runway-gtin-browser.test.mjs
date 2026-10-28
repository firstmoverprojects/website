// Layout and click checks for the Runway pill and the GTIN fee helper.
// Install once if playwright-core is not on the module path:
//   npm install --prefix /tmp/issue07-pw playwright-core
//   PLAYWRIGHT_CORE=/tmp/issue07-pw/node_modules/playwright-core/index.mjs node --test tests/runway-gtin-browser.test.mjs
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PILL = "Listed on The Runway (LaunchFree.io) — Upvote This Free Tool";
const LISTINGS = {
  "tools/loom-seat-audit-calculator/index.html":
    "https://launchfree.io/listings/loom-seat-audit-and-creator-lite-migration-calculator.html",
  "tools/amazon-coi-check/index.html":
    "https://launchfree.io/listings/amazon-nov-2-coi-pre-check.html",
  "tools/fire-to-iris-check/index.html":
    "https://launchfree.io/listings/irs-fire-to-iris-readiness-and-1099-csv-header-check.html",
  "tools/after-hours-gap-check/index.html":
    "https://launchfree.io/listings/after-hours-lead-capture-side-by-side-scorecard.html",
  "tools/etsy-photo-audit-check/index.html":
    "https://launchfree.io/listings/etsy-real-photo-and-listing-audit-check.html",
  "tools/custom-gpt-retirement-checker/index.html":
    "https://launchfree.io/listings/custom-gpt-retirement-checker.html"
};
const CHECKOUT = {
  "tools/amazon-coi-check/index.html":
    "https://firstmoverprojects.gumroad.com/l/amazon-1m-insurance-readiness-kit?wanted=true&utm_source=firstmoverprojects&utm_medium=amazon-coi-check&utm_campaign=amazon-1m-insurance-readiness-kit&utm_content=gtin-helper",
  "tools/etsy-photo-audit-check/index.html":
    "https://firstmoverprojects.gumroad.com/l/lnfgc?wanted=true&utm_source=firstmoverprojects&utm_medium=etsy-photo-check&utm_campaign=lnfgc&utm_content=gtin-helper"
};

let chromium;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
let browser;

before(async () => {
  const mod = process.env.PLAYWRIGHT_CORE || "playwright-core";
  ({ chromium } = await import(mod));
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });
});

after(async () => {
  if (browser) await browser.close();
});

function toolNetwork(urls) {
  return urls.filter((url) => !/^https:\/\/(?:gc\.zgo\.at|firstmoverprojects\.goatcounter\.com)(?:[/?#]|$)/.test(url));
}

async function open(rel) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  const nets = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("request", (req) => {
    if (/^https?:/i.test(req.url())) nets.push(req.url());
  });
  await page.goto(pathToFileURL(path.join(ROOT, rel)).href, { waitUntil: "load" });
  return { page, errors, nets };
}

async function assertNoHScroll(page) {
  const box = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth
  }));
  assert.equal(box.sw, box.cw, JSON.stringify(box));
}

test("Runway pills and the GTIN helper run without horizontal scroll", async () => {
  for (const [rel, href] of Object.entries(LISTINGS)) {
    const { page, errors, nets } = await open(rel);
    const pill = page.locator("a.runway-pill");
    assert.equal(await pill.count(), 1, rel);
    assert.equal(await pill.innerText(), PILL, rel);
    assert.equal(await pill.getAttribute("href"), href, rel);
    await assertNoHScroll(page);
    if (CHECKOUT[rel]) {
      assert.equal(await page.locator("#gtin-out").isVisible(), false, rel);
      await page.fill("#gtin-code", "036000291453");
      await page.fill("#gtin-price", "24.00");
      await page.fill("#gtin-cost", "8.50");
      await page.fill("#gtin-fee-pct", "15");
      await page.click("#gtin-go");
      assert.match(await page.innerText("#gtin-code-line"), /Check digit does not match/, rel);
      assert.match(await page.innerText("#gtin-code-line"), /036000291452/, rel);
      assert.match(await page.innerText("#gtin-fee-line"), /\$3\.60/, rel);
      assert.match(await page.innerText("#gtin-be-line"), /Break-even sale price: \$10\.00/, rel);
      assert.equal(await page.getAttribute("#gtin-checkout", "href"), CHECKOUT[rel], rel);
      const signup = page.locator("#gtin-fee a[href='/deadlines/#signup']");
      assert.equal(await signup.count(), 1, rel);
      await page.fill("#gtin-code", "5901234123457");
      await page.click("#gtin-go");
      assert.match(await page.innerText("#gtin-code-line"), /EAN-13 \(GTIN-13\)/, rel);
      await assertNoHScroll(page);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await assertNoHScroll(page);
    assert.deepEqual(errors, [], rel);
    assert.deepEqual(toolNetwork(nets), [], rel);
    await page.close();
  }
});
