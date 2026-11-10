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

async function captureOnClick(pagePath, selector) {
  const { srv, origin } = await startServer();
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const counts = [];
  page.on("request", (req) => {
    const u = req.url();
    if (u.includes("goatcounter.com/count")) counts.push(u);
  });
  await page.goto(origin + pagePath, { waitUntil: "networkidle" });
  const before = counts.length;
  await page.locator(selector).first().click({ button: "middle" });
  await page.waitForTimeout(500);
  await browser.close();
  srv.close();
  return counts.slice(before).map((u) => new URL(u).searchParams.get("p"));
}

test("primary kit CTAs emit click-fire-kit, click-amazon-kit, and click-etsy-kit", async () => {
  const cases = [
    ["/tools/fire-to-iris-check/", 'a[data-goatcounter-click="cta/fire-check-top"]', "click-fire-kit"],
    ["/tools/amazon-coi-check/", 'a[href*="amazon-1m-insurance"][href*="wanted=true"]', "click-amazon-kit"],
    ["/tools/etsy-photo-audit-check/", 'a[href*="lnfgc"][href*="wanted=true"]', "click-etsy-kit"]
  ];
  for (const [pagePath, selector, eventPath] of cases) {
    const paths = await captureOnClick(pagePath, selector);
    assert.equal(paths.includes(eventPath), true, pagePath + " paths=" + paths.join(","));
    assert.equal(paths.some((p) => p && p.includes("gumroad-click")), true, pagePath);
  }
});
