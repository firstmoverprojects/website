// Bidwick, played through the ?qa=1 hook. No portal, no network.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { blockExternalOnPage, chromiumLaunchOptions, importChromium } from "./playwright-helpers.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".json": "application/json; charset=utf-8"
};
const SCREENS = ["title", "auction", "reveal", "appraise", "recap", "haggle", "shop", "upgrades", "help", "dayend", "daily", "pause"];

function startServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.normalize(path.join(ROOT, rel));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    if (!existsSync(file)) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }
    const body = readFileSync(file);
    const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}

function launchOptions() {
  const options = chromiumLaunchOptions();
  if (!options.executablePath && existsSync("/usr/bin/google-chrome")) {
    options.executablePath = "/usr/bin/google-chrome";
  }
  return options;
}

async function openBidwick(context, origin) {
  const page = await context.newPage();
  const errors = [];
  const leaked = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("request", (req) => {
    const url = req.url();
    if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:")) return;
    leaked.push(url);
  });
  await blockExternalOnPage(page, { allowUrlPrefix: origin });
  await page.goto(origin + "/games/bidwick/index.html?qa=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.BidwickQA && window.BidwickQA.ready);
  return { page, errors, leaked };
}

test("the games index card uses the house lines", () => {
  const html = readFileSync(path.join(ROOT, "games/index.html"), "utf8");
  assert.match(html, /href="\/games\/bidwick\/"/);
  assert.match(html, />Play Bidwick<\/a>/);
  assert.match(html, /General guidance, not legal, tax or IT advice/);
  assert.match(html, /Not affiliated with or endorsed by any auction house or game portal/);
  assert.match(html, /Thank you for playing/);
  assert.match(html, /the coins are not money/);
  const card = html.slice(html.indexOf('id="bw-h"'), html.indexOf('id="sc-h"'));
  assert.equal(card.includes("$"), false);
});

test("Bidwick boots, finishes 50 auctions, saves, and stays inside 360x640", { timeout: 60000 }, async () => {
  const { server, origin } = await startServer();
  const chromium = await importChromium();
  const browser = await chromium.launch(launchOptions());
  const context = await browser.newContext({ viewport: { width: 360, height: 640 } });
  try {
    const { page, errors, leaked } = await openBidwick(context, origin);
    assert.deepEqual(errors, []);
    assert.deepEqual(leaked, []);

    const catalog = await page.evaluate(() => window.BidwickQA.catalog());
    assert.equal(catalog.families, 20);
    assert.equal(catalog.items, 120);

    const rules = await page.evaluate(() => window.BidwickQA.rules());
    assert.equal(rules.lock, true);
    assert.equal(rules.stable, true);
    assert.equal(rules.leaderOk, true);

    const report = await page.evaluate(() => window.BidwickQA.runSeededAuctions(50, 20261121));
    assert.equal(report.finished, 50);
    assert.equal(report.nan, false);
    assert.equal(Number.isFinite(report.coins), true);
    assert.ok(report.coins >= 0);
    assert.equal(report.auctions, 50);

    await page.evaluate(() => {
      window.BidwickQA.reset();
      window.BidwickQA.stamp({
        coins: 321,
        day: 4,
        lotInDay: 2,
        flashlight: true,
        book: false,
        shop: true,
        mute: true,
        shelf: [{ uid: "lamp", name: "Chimney lamp", familyName: "Wick lamps", list: 22, trueValue: 22 }]
      });
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.BidwickQA && window.BidwickQA.ready);
    const loaded = await page.evaluate(() => window.BidwickQA.snapshot());
    assert.equal(loaded.coins, 321);
    assert.equal(loaded.day, 4);
    assert.equal(loaded.lotInDay, 2);
    assert.equal(loaded.flashlight, true);
    assert.equal(loaded.book, false);
    assert.equal(loaded.shop, true);
    assert.equal(loaded.mute, true);
    assert.equal(loaded.shelf.length, 1);
    assert.equal(loaded.shelf[0].name, "Chimney lamp");
    assert.equal(loaded.shelf[0].list, 22);
    assert.equal(await page.locator("#mute").innerText(), "Muted");
    assert.equal(await page.locator("#coins").innerText(), "321 coins");

    const shortTargets = await page.evaluate(() => {
      return [...document.querySelectorAll("button")].filter((btn) => {
        const box = btn.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && (box.width < 44 || box.height < 44);
      }).map((btn) => btn.textContent);
    });
    assert.deepEqual(shortTargets, []);

    for (const name of SCREENS) {
      await page.evaluate((screen) => window.BidwickQA.show(screen), name);
      const box = await page.evaluate(() => window.BidwickQA.layout());
      assert.ok(box.scrollWidth <= box.clientWidth + 1, name + " document width " + box.scrollWidth);
      assert.ok(box.scrollHeight <= box.clientHeight + 1, name + " document height " + box.scrollHeight);
      assert.ok(box.frameLeft >= -1 && box.frameTop >= -1, name + " origin");
      assert.ok(box.frameRight <= box.innerWidth + 1, name + " right " + box.frameRight);
      assert.ok(box.frameBottom <= box.innerHeight + 1, name + " bottom " + box.frameBottom);
      assert.equal(box.text.includes("$"), false, name + " shows a dollar sign");
    }

    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get() { return true; } });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForSelector("#overlay:not([hidden])");

    assert.deepEqual(errors, []);
    assert.deepEqual(leaked, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
