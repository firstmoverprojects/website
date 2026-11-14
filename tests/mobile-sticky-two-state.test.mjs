// Mobile-only two-state sticky bars on the Amazon COI and Etsy photo check pages.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { blockExternalOnPage, chromiumLaunchOptions, importChromium } from "./playwright-helpers.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SHOTS = process.env.MOBILE_STICKY_SHOTS || "";
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 2400 };
const CLEAN_COI = [
  "Insured: Sample Goods LLC",
  "Commercial general liability",
  "Coverage form: occurrence",
  "Additional insured: Amazon.com Services LLC and its affiliates and assignees",
  "Each occurrence $1,000,000",
  "General aggregate $2,000,000",
  "Deductible $5,000",
  "30 days notice of cancellation"
].join("\n");

function stickyVisible(page) {
  return page.evaluate(() => {
    const bar = document.getElementById("kit-sticky");
    if (!bar || bar.hidden) return false;
    return !!(bar.offsetWidth || bar.offsetHeight || bar.getClientRects().length);
  });
}

const PAGES = [
  {
    slug: "amazon-coi-check",
    file: path.join(ROOT, "tools/amazon-coi-check/index.html"),
    focusId: "coi",
    gcRun: "cta/coi-check-sticky-run",
    async runWithBuyCta(page) {
      await page.evaluate(() => {
        document.querySelectorAll('input[name="q1"]').forEach((n) => { n.checked = n.value === "yes"; });
        document.querySelectorAll('input[name="q2"]').forEach((n) => { n.checked = n.value === "no"; });
        document.querySelectorAll('input[name="q3"]').forEach((n) => { n.checked = n.value === "no"; });
      });
      await page.evaluate((text) => {
        document.getElementById("coi").value = text;
        document.getElementById("entity").value = "Sample Goods LLC";
        document.getElementById("expiry").value = "2027-01-01";
      }, CLEAN_COI);
      await page.click("#go");
    }
  },
  {
    slug: "etsy-photo-audit-check",
    file: path.join(ROOT, "tools/etsy-photo-audit-check/index.html"),
    focusId: "inp",
    gcRun: "cta/etsy-photo-check-sticky-run",
    async runWithBuyCta(page) {
      await page.evaluate(() => {
        document.getElementById("inp").value = "title,photos,primary,variations,disclosure\nFAKE wall print,1,mockup,missing,missing";
      });
      await page.click("#go");
    }
  }
];

test("mobile sticky State A and State B on Amazon and Etsy checkers", { timeout: 180000 }, async () => {
  const chromium = await importChromium();
  const browser = await chromium.launch(chromiumLaunchOptions());
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });

  for (const item of PAGES) {
    const mobile = await browser.newPage({ viewport: MOBILE });
    await blockExternalOnPage(mobile);
    await mobile.goto(pathToFileURL(item.file).href, { waitUntil: "load" });

    await mobile.evaluate(() => window.scrollTo(0, 0));
    assert.equal(await stickyVisible(mobile), false, item.slug + " State A hidden at top");
    await mobile.evaluate(() => {
      const end = document.getElementById("tool-input-end");
      if (end && end.scrollIntoView) end.scrollIntoView({ block: "center" });
    });
    await mobile.waitForTimeout(100);
    await mobile.evaluate(() => window.scrollBy(0, Math.round(window.innerHeight * 0.85)));
    await mobile.waitForTimeout(150);
    assert.equal(await stickyVisible(mobile), true, item.slug + " State A after scroll");
    const runLabel = await mobile.evaluate(() => document.getElementById("kit-sticky-label").textContent);
    assert.equal(runLabel, "Free check, nothing uploaded", item.slug + " State A label");
    await mobile.click("#kit-sticky-run");
    await mobile.waitForTimeout(400);
    const focusId = await mobile.evaluate(() => document.activeElement && document.activeElement.id);
    assert.equal(focusId, item.focusId, item.slug + " run button focuses input");
    if (SHOTS) await mobile.screenshot({ path: path.join(SHOTS, item.slug + "-390-state-a.png") });

    await item.runWithBuyCta(mobile);
    await mobile.waitForTimeout(200);
    const resultCtaInView = await mobile.evaluate(() => {
      const link = document.getElementById("kit-result");
      if (!link || link.hidden) return false;
      const r = link.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;
    });
    if (resultCtaInView) {
      assert.equal(await stickyVisible(mobile), false, item.slug + " State B hides when result buy CTA in view");
    }
    await mobile.evaluate(() => {
      const footer = document.querySelector("footer") || document.body;
      footer.scrollIntoView({ block: "end" });
    });
    await mobile.waitForTimeout(150);
    assert.equal(await stickyVisible(mobile), true, item.slug + " State B shows when buy CTA off-screen");
    const buyLabel = await mobile.evaluate(() => document.getElementById("kit-sticky-label").textContent);
    assert.match(buyLabel, /\$\d+/, item.slug + " State B keeps price label");
    if (SHOTS) await mobile.screenshot({ path: path.join(SHOTS, item.slug + "-390-state-b.png") });

    await mobile.close();

    const desktop = await browser.newPage({ viewport: DESKTOP });
    await blockExternalOnPage(desktop);
    await desktop.goto(pathToFileURL(item.file).href, { waitUntil: "load" });
    await desktop.evaluate(() => {
      const end = document.getElementById("tool-input-end");
      if (end && end.scrollIntoView) end.scrollIntoView({ block: "end" });
      else window.scrollTo(0, document.body.scrollHeight);
    });
    assert.equal(await stickyVisible(desktop), false, item.slug + " desktop shows no State A bar");
    await desktop.close();
  }

  await browser.close();
});