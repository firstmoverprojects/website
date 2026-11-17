// Amazon 2027 fee change checker. Facts come from the page copy.
// Screenshots: AMAZON_FEE_SHOTS=/opt/cursor/artifacts node --test tests/amazon-2027-fee-check.test.mjs
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { blockExternalOnPage, chromiumLaunchOptions, importChromium } from "./playwright-helpers.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const REL = "tools/amazon-2027-fee-check/index.html";
const SHOTS = process.env.AMAZON_FEE_SHOTS || "";

function read() {
  return readFileSync(path.join(ROOT, REL), "utf8");
}

test("the page is indexable and cites the official Amazon pages", () => {
  const html = read();
  assert.equal(/noindex/i.test(html), false);
  assert.match(html, /content="index, follow"/);
  assert.match(html, /<p id="last-checked">Last checked November 16, 2026\.<\/p>/);
  assert.equal(html.includes("Opened again on 2026-11-17"), false);
  assert.match(html, /"dateModified": "2026-11-16"/);
  assert.equal(html.includes("2026-11-17"), false);
  assert.match(html, /https:\/\/sellingpartners\.aboutamazon\.com\/update-to-us-referral-and-fulfillment-by-amazon-fees-for-2027/);
  assert.match(html, /https:\/\/sellercentral\.amazon\.com\/seller-forums\/discussions\/t\/da850a57-839d-4e38-a96f-298dbc450b69/);
  assert.match(html, /https:\/\/sellercentral\.amazon\.com\/help\/hub\/reference\/external\/G201411300/);
  assert.match(html, /https:\/\/sellercentral\.amazon\.com\/help\/hub\/reference\/external\/G200442350/);
  assert.match(html, /It lists more changes this check doesn't repeat\. Those include referral-fee, per-size fulfillment, storage, and "Buy X, Get Y" details\. This check does not guess those numbers\./);
  assert.match(html, /That policy page does not show the January 11 date, so this check uses the notice wording for the date\./);
  assert.equal(/login/i.test(html), false);
  assert.match(html, /Show what applies to me/);
  assert.match(html, /that apply to that setup/);
  assert.equal(html.includes("Show what hits me"), false);
  assert.equal(html.includes("hit you"), false);
  assert.equal(html.includes("hit that setup"), false);
  assert.equal(html.includes("marked as a hit"), false);
  assert.equal(html.includes("Unconfirmed here"), false);
  assert.equal(html.includes("$0.78"), false);
  assert.equal(html.includes("$2.78"), false);
  assert.equal(html.includes("$6.68"), false);
  assert.match(html, /amazon-1m-insurance-readiness-kit/);
  assert.match(html, /not a 2027 fee calculator/);
  assert.match(html, /It does not calculate 2027 fees/);
  assert.match(html, /It only helps if Amazon asks you for a \$1 million liability certificate\./);
  assert.equal(html.includes("\u2014") || html.includes("\u2013"), false);
  const sitemap = readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  const feeBlock = sitemap.split("https://firstmoverprojects.com/tools/amazon-2027-fee-check/")[1] || "";
  assert.match(feeBlock.slice(0, 120), /<lastmod>2026-11-16<\/lastmod>/);
  const tools = readFileSync(path.join(ROOT, "tools/index.html"), "utf8");
  assert.match(tools, /changes Amazon has published that apply to that setup/);
  assert.equal(tools.includes("that hit that setup"), false);
});

test("none apply and some apply at phone and desktop widths", async () => {
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const chromium = await importChromium();
  const browser = await chromium.launch(chromiumLaunchOptions());
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: width < 500 ? 900 : 800 } });
      const errors = [];
      page.on("pageerror", (err) => errors.push(String(err)));
      await blockExternalOnPage(page);
      await page.goto(pathToFileURL(path.join(ROOT, REL)).href, { waitUntil: "load" });
      assert.equal(await page.locator("#results").isHidden(), true, width + " before");
      assert.equal(await page.locator("#result-bridge").isHidden(), true, width + " bridge before");

      assert.equal(await page.locator("#go").innerText(), "Show what applies to me");
      await page.locator("#go").click();
      await page.locator("#results").waitFor({ state: "visible" });
      assert.equal(await page.locator("#result-headline").innerText(), "None of these changes apply to you.");
      assert.equal(await page.locator("#result-hits article").count(), 0, width + " none apply");
      assert.equal(await page.locator("#result-bridge").isHidden(), true, width + " none bridge");
      const noneScroll = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth
      }));
      assert.equal(noneScroll.sw, noneScroll.cw, width + " none " + JSON.stringify(noneScroll));
      if (SHOTS) {
        await page.locator("#results").screenshot({ path: path.join(SHOTS, "amazon-2027-fee-none-" + width + ".png") });
      }

      await page.locator("#fba").check();
      await page.locator("#age271").check();
      await page.locator("#bundles").check();
      await page.locator("#category").selectOption("other");
      await page.locator("#go").click();
      const text = await page.locator("#results").innerText();
      assert.match(text, /These changes apply to you\./);
      assert.match(text, /January 15, 2027/);
      assert.match(text, /February 1, 2027/);
      assert.match(text, /January 11, 2027/);
      assert.match(text, /older than 271 days/);
      assert.equal(await page.locator("#result-hits article").count(), 3, width + " some apply");
      assert.equal(await page.locator("#result-bridge").isVisible(), true, width + " kit");
      const kit = await page.locator("#result-bridge-kit").innerText();
      assert.match(kit, /The Amazon \$1M Insurance Readiness Kit is a downloadable kit/);
      assert.match(kit, /not a 2027 fee calculator/);
      assert.match(kit, /Price: \$19\./);
      assert.match(kit, /It only helps if Amazon asks you for a \$1 million liability certificate\./);
      assert.equal(await page.locator("#result-bridge-free").innerText(), "Not a fit? The checker stays free.");
      const href = await page.getAttribute("#result-bridge-link", "href");
      const url = new URL(href);
      assert.equal(url.pathname, "/l/amazon-1m-insurance-readiness-kit");
      assert.equal(url.searchParams.get("utm_medium"), "checker_result");
      assert.equal(url.searchParams.get("utm_campaign"), "amazon-2027-fee-check");
      assert.equal(url.searchParams.get("utm_content"), "result-bridge");
      const someScroll = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth
      }));
      assert.equal(someScroll.sw, someScroll.cw, width + " some " + JSON.stringify(someScroll));
      if (SHOTS) {
        await page.locator("#results").screenshot({ path: path.join(SHOTS, "amazon-2027-fee-some-" + width + ".png") });
      }
      assert.deepEqual(errors, [], width);
      await page.close();
    }

    const page = await browser.newPage();
    await blockExternalOnPage(page);
    await page.goto(pathToFileURL(path.join(ROOT, REL)).href, { waitUntil: "load" });
    const cases = await page.evaluate(() => {
      const ev = window.FMP_FBA_2027.evaluate;
      return {
        exempt: ev({ bundles: true, category: "camera" }),
        young: ev({ fba: true }),
        media: ev({ bundles: true, category: "media" }),
        agedOnly: ev({ age365: true })
      };
    });
    assert.equal(cases.exempt.none, true);
    assert.equal(cases.exempt.showKit, false);
    assert.match(cases.exempt.notes.join(" "), /does not apply to you/);
    assert.match(cases.young.notes.join(" "), /not marked as applying to you/);
    assert.match(cases.agedOnly.notes.join(" "), /does not apply to you/);
    assert.equal(cases.young.showKit, true);
    assert.equal(cases.young.hits.map((hit) => hit.id).join(","), "fba-jan15,storage-feb1");
    assert.match(cases.young.hits[1].action, /under six months/);
    assert.match(cases.media.hits[0].action, /Books, Music, Video, DVD, and Video Games/);
    assert.equal(cases.agedOnly.none, true);
    assert.match(cases.agedOnly.notes.join(" "), /do not sell with FBA/);
    await page.close();
  } finally {
    await browser.close();
  }
});
