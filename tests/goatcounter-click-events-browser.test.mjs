// Headless browser proof that kit buy clicks send GoatCounter event URLs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function startServer() {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (rel.endsWith("/")) rel += "index.html";
      const file = path.join(ROOT, rel);
      if (!existsSync(file)) {
        res.writeHead(404);
        return res.end("nf");
      }
      const ext = path.extname(file);
      const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".webp": "image/webp",
        ".svg": "image/svg+xml"
      };
      res.writeHead(200, {
        "content-type": types[ext] || "application/octet-stream",
        "cache-control": "no-store"
      });
      res.end(readFileSync(file));
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, origin: `http://127.0.0.1:${srv.address().port}` }));
  });
}

const BEFORE_CUTOFF = "2026-11-19T19:59:59.000Z";
const AFTER_CUTOFF = "2026-11-19T20:05:00.000Z";

async function captureOnClick(pagePath, selector, when) {
  const { srv, origin } = await startServer();
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const counts = [];
  try {
    if (when) {
      await page.clock.install({ time: new Date(when) });
      await page.clock.setFixedTime(new Date(when));
    }
    page.on("request", (req) => {
      const u = req.url();
      if (u.includes("goatcounter.com/count")) counts.push(u);
    });
    await page.route(/goatcounter\.com\/count|gc\.zgo\.at/, (r) => r.fulfill({ status: 204, body: "" }));
    await page.route(/gumroad\.com|brevo\.com|sendinblue\.com/i, (r) => r.abort());
    await page.goto(origin + pagePath, { waitUntil: "networkidle" });
    const before = counts.length;
    await page.locator(selector).first().click({ button: "middle" });
    await page.waitForTimeout(500);
    return counts.slice(before).map((u) => new URL(u).searchParams.get("p"));
  } finally {
    await browser.close();
    srv.close();
  }
}

async function closedFirePage() {
  const { srv, origin } = await startServer();
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  try {
    await page.clock.install({ time: new Date(AFTER_CUTOFF) });
    await page.clock.setFixedTime(new Date(AFTER_CUTOFF));
    await page.route(/goatcounter\.com\/count|gc\.zgo\.at/, (r) => r.fulfill({ status: 204, body: "" }));
    await page.route(/gumroad\.com|brevo\.com|sendinblue\.com/i, (r) => r.abort());
    await page.goto(origin + "/tools/fire-to-iris-check/", { waitUntil: "networkidle" });
    return {
      kitVisible: await page.locator("#kit-top").isVisible(),
      visibleGumroad: await page.locator("a[href*='gumroad.com']:visible").count(),
      answer: await page.locator("#aeo-answer").innerText(),
      keepSelling: await page.evaluate(() => window.FMP_FIRE_KIT_KEEP_SELLING)
    };
  } finally {
    await browser.close();
    srv.close();
  }
}

test("primary kit CTAs emit click-amazon-kit and click-etsy-kit, and the FIRE kit link is gone", async () => {
  const cases = [
    ["/tools/amazon-coi-check/", 'a[href*="amazon-1m-insurance"][href*="wanted=true"]', "click-amazon-kit"],
    ["/tools/etsy-photo-audit-check/", 'a[href*="lnfgc"][href*="wanted=true"]', "click-etsy-kit"]
  ];
  for (const [pagePath, selector, eventPath, when] of cases) {
    const paths = await captureOnClick(pagePath, selector, when);
    assert.equal(paths.includes(eventPath), true, pagePath + " paths=" + paths.join(","));
    assert.equal(paths.some((p) => p && p.includes("gumroad-click")), true, pagePath);
  }
  const closed = await closedFirePage();
  assert.equal(closed.kitVisible, false);
  assert.equal(closed.visibleGumroad, 0);
  assert.equal(closed.keepSelling, false);
  assert.equal(closed.answer.includes("The IRS FIRE system closed for filing on Nov 19, 2026 at 3 p.m. ET."), true);
  assert.equal(closed.answer.includes("IRIS"), true);
});
