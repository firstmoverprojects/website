// TikTok quick-jump bar, ?embed=1 nav hiding, and the share/embed/license widget.
// Install once if playwright-core is not on the module path:
//   npm install --prefix /tmp/issue07-pw playwright-core
//   PLAYWRIGHT_CORE=/tmp/issue07-pw/node_modules/playwright-core/index.mjs node --test tests/tiktok-flywheel.test.mjs
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

let chromium;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PROMPT = "Came from TikTok, Reels, or Shorts? Tap the rule change you watched:";
const MAILTO = "mailto:firstmoverprojects@gmail.com?subject=White-Label%20Tool%20License";
const CHIPS = [
  ["Sun, Nov 1", "EU <= EUR 150 Product IDs", "/tools/eu-product-id-check/"],
  ["Sun, Nov 1 / Nov 19", "IRS FIRE-to-IRIS 1099 Cutoff", "/tools/fire-to-iris-check/"],
  ["Mon, Nov 2", "Amazon $1M Insurance (3-Month Rule)", "/tools/amazon-coi-check/"],
  ["", "Etsy Unedited Real-Photo Rule", "/tools/etsy-photo-audit-check/"],
  ["Fri, Dec 11", "OpenAI Custom GPT Retirement", "/tools/custom-gpt-retirement-checker/"],
  ["", "Loom Creator Lite 5-Min Cap & Seat Check", "/tools/loom-seat-audit-calculator/"]
];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function toolPages() {
  return readdirSync(path.join(ROOT, "tools"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `tools/${entry.name}/index.html`)
    .filter((rel) => existsSync(path.join(ROOT, rel)) && read(rel).includes('id="fmp-share"'))
    .sort();
}

function element(html, id) {
  const at = html.indexOf(`id="${id}"`);
  assert.notEqual(at, -1, id);
  const start = html.lastIndexOf("<", at);
  const gt = html.indexOf(">", start);
  const tag = html.slice(start + 1, gt).split(/\s/)[0];
  const open = "<" + tag;
  const close = `</${tag}>`;
  let depth = 1;
  let i = gt + 1;
  while (depth) {
    const nxtOpen = html.indexOf(open, i);
    const nxtClose = html.indexOf(close, i);
    assert.notEqual(nxtClose, -1, tag);
    const after = nxtOpen === -1 ? "" : html.slice(nxtOpen + open.length, nxtOpen + open.length + 1);
    if (nxtOpen !== -1 && nxtOpen < nxtClose && (after === " " || after === ">" || after === "/")) {
      depth += 1;
      i = nxtOpen + open.length;
    } else {
      depth -= 1;
      i = nxtClose + close.length;
    }
  }
  return { start, end: i, html: html.slice(start, i) };
}

test("home and tools hub show the same six TikTok quick-jump chips", () => {
  for (const rel of ["index.html", "tools/index.html"]) {
    const html = read(rel);
    assert.equal(html.split(PROMPT).length - 1, 1, rel);
    assert.match(html, /class="tiktok-jump"/, rel);
    assert.match(html, /a\.tiktok-chip\{[^}]*background:#f4c84a/, rel);
    assert.match(html, /a\.tiktok-chip\{[^}]*min-height:48px/, rel);
    assert.match(html, /a\.tiktok-chip\{[^}]*color:#04101f !important/, rel);
    const chips = [...html.matchAll(/<a class="tiktok-chip" href="([^"]+)">([\s\S]*?)<\/a>/g)];
    assert.equal(chips.length, CHIPS.length, rel);
    chips.forEach((chip, index) => {
      const [when, what, href] = CHIPS[index];
      assert.equal(chip[1], href, rel);
      const text = chip[2].replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&amp;/g, "&").replace(/&gt;/g, ">");
      if (when) assert.ok(text.includes(when), rel + " " + text);
      assert.ok(text.includes(what), rel + " " + text);
    });
    const jumpAt = html.indexOf('class="tiktok-jump"');
    const heroAt = html.indexOf('class="hero"');
    assert.ok(jumpAt !== -1 && heroAt !== -1 && jumpAt < heroAt, rel);
  }
});

test("every interactive checker has an embed snippet, license link, and embed-mode nav hide", () => {
  const pages = toolPages();
  assert.equal(pages.length, 9, pages.join(","));
  for (const rel of pages) {
    const slug = rel.split("/")[1];
    const html = read(rel);
    assert.match(html, /<script id="fmp-embed-boot">/, rel);
    assert.ok(html.includes("embed=1(?:&|$)"), rel);
    assert.match(html, /html\.fmp-embed \.site-nav\{display:none !important\}/, rel);
    assert.match(html, /class="[^"]*\bsite-nav\b/, rel);
    const resultId = html.includes('id="results"') ? "results" : "res";
    const result = element(html, resultId);
    const shareAt = html.indexOf('id="fmp-share"');
    assert.ok(shareAt > result.end, rel + " share box is below the result area");
    assert.equal(result.html.includes("fmp-share"), false, rel);
    assert.equal(html.split('id="fmp-share"').length - 1, 1, rel);
    assert.ok(html.includes(">Share, Embed, or License This Tool</summary>"), rel);
    assert.ok(html.includes(`https://firstmoverprojects.com/tools/${slug}/?embed=1`), rel);
    assert.ok(html.includes(`href="https://firstmoverprojects.com/tools/${slug}/"`), rel);
    assert.ok(html.includes('class="fmp-powered">Powered by <a href="https://firstmoverprojects.com/">First Mover Projects</a>'), rel);
    assert.ok(html.includes(`href="${MAILTO}"`), rel);
    assert.match(html, /Commercial white-label \/ agency license:/, rel);
    assert.equal(html.split("fmp-copy-embed").length - 1, 2, rel);
    const boot = html.slice(html.indexOf('id="fmp-embed-boot"'), html.indexOf("</script>", html.indexOf('id="fmp-embed-boot"')));
    for (const banned of ["fetch(", "sendBeacon", "localStorage", "XMLHttpRequest"]) {
      assert.equal(boot.includes(banned), false, rel + " " + banned);
    }
  }
});

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

async function open(rel, search) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  const url = pathToFileURL(path.join(ROOT, rel)).href + (search || "");
  await page.goto(url, { waitUntil: "load" });
  return { page, errors };
}

async function assertNoHScroll(page) {
  const box = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth
  }));
  assert.equal(box.sw, box.cw, JSON.stringify(box));
}

test("quick-jump chips stay on screen at phone width without sideways scroll", async () => {
  for (const rel of ["index.html", "tools/index.html"]) {
    const { page, errors } = await open(rel);
    assert.deepEqual(errors, []);
    assert.equal(await page.locator(".tiktok-jump").isVisible(), true, rel);
    assert.equal(await page.locator("a.tiktok-chip").count(), 6, rel);
    for (const chip of CHIPS) {
      const link = page.locator(`a.tiktok-chip[href="${chip[2]}"]`);
      assert.equal(await link.isVisible(), true, rel + " " + chip[2]);
      const box = await link.boundingBox();
      assert.ok(box && box.height >= 44, rel + " " + chip[2]);
    }
    await assertNoHScroll(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await assertNoHScroll(page);
    await page.close();
  }
});

test("?embed=1 hides the site nav and keeps the powered-by link and kit button", async () => {
  for (const rel of toolPages()) {
    const plain = await open(rel);
    assert.deepEqual(plain.errors, [], rel);
    assert.equal(await plain.page.locator(".site-nav").first().isVisible(), true, rel);
    assert.equal(await plain.page.evaluate(() => document.documentElement.classList.contains("fmp-embed")), false, rel);
    await plain.page.close();

    const { page, errors } = await open(rel, "?embed=1");
    assert.deepEqual(errors, [], rel);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("fmp-embed")), true, rel);
    assert.equal(await page.locator(".site-nav").first().isVisible(), false, rel);
    assert.equal(await page.locator(".fmp-powered").isVisible(), true, rel);
    assert.match(await page.innerText(".fmp-powered"), /Powered by First Mover Projects/, rel);
    const kit = page.locator("#paid-link, a.trade-link").first();
    assert.equal(await kit.isVisible(), true, rel);
    await page.locator("#fmp-share summary").click();
    const snippet = await page.locator("#fmp-embed-snippet").inputValue();
    const slug = rel.split("/")[1];
    assert.match(snippet, new RegExp(`<iframe src="https://firstmoverprojects.com/tools/${slug}/\\?embed=1"`), rel);
    assert.match(snippet, new RegExp(`<a href="https://firstmoverprojects.com/tools/${slug}/">First Mover Projects</a>`), rel);
    assert.equal(await page.getAttribute(".fmp-license a", "href"), MAILTO, rel);
    await page.locator("#fmp-copy-embed").click();
    await page.waitForFunction(() => {
      const el = document.getElementById("fmp-copy-status");
      return el && /copied|Select the snippet/.test(el.textContent || "");
    });
    const status = await page.innerText("#fmp-copy-status");
    assert.match(status, /Embed snippet copied|Select the snippet above/, rel);
    await assertNoHScroll(page);
    await page.close();
  }
});
