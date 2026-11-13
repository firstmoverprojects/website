// First screen of the Amazon and Etsy kit pages at 390x844.
// Those URLs are the kit offer and the free checker.
// A buyer should see what the kit is, the price, and a tappable buy link
// without scrolling. The checker route is that same buy link.
//   npm ci
//   npx playwright install chromium
//   node --test tests/first-screen-buy-path.test.mjs
// Screenshots go to offer-page-screenshots/ (OFFER_SCREENSHOT_DIR overrides).
// GoatCounter is stubbed. Other third-party hosts, including Gumroad, are blocked.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { chromiumLaunchOptions, importChromium } from "./playwright-helpers.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const VIEWPORT = { width: 390, height: 844 };
const SHOP = "firstmoverprojects.gumroad.com";
const MIN_TAP = 44;

const PAGES = [
  {
    id: "amazon-coi-check",
    name: "Amazon kit page",
    route: "/tools/amazon-coi-check/",
    slug: "amazon-1m-insurance-readiness-kit",
    phrases: [
      { label: "what the page is", source: "certificate of insurance" },
      { label: "what the kit is", source: "downloadable kit" },
      { label: "what is in the kit", source: "12-file ZIP" },
      { label: "price", source: "\\$19(?!\\d)" }
    ]
  },
  {
    id: "etsy-photo-audit-check",
    name: "Etsy kit page",
    route: "/tools/etsy-photo-audit-check/",
    slug: "lnfgc",
    phrases: [
      { label: "what the page is", source: "Real-Photo" },
      { label: "what the kit is", source: "downloadable kit" },
      { label: "what is in the kit", source: "PDF" },
      { label: "listing sheet", source: "CSV" },
      { label: "price", source: "\\$9(?!\\d)" }
    ]
  }
];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml"
};

let server;
let baseUrl;
let browser;

function screenshotDir() {
  return process.env.OFFER_SCREENSHOT_DIR
    ? path.resolve(process.env.OFFER_SCREENSHOT_DIR)
    : path.join(ROOT, "offer-page-screenshots");
}

function resolveSitePath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.split("/").includes("..")) return null;
  const rel = decoded.replace(/^\/+/, "");
  const candidates = [];
  if (rel === "" || rel.endsWith("/")) candidates.push(path.join(rel, "index.html"));
  else {
    candidates.push(rel);
    if (!path.extname(rel)) {
      candidates.push(`${rel}.html`);
      candidates.push(path.join(rel, "index.html"));
    }
  }
  for (const candidate of candidates) {
    const abs = path.resolve(ROOT, candidate);
    if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) continue;
    if (existsSync(abs) && statSync(abs).isFile()) return abs;
  }
  return null;
}

function startServer() {
  const httpServer = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const file = resolveSitePath(url.pathname);
    if (!file || (req.method !== "GET" && req.method !== "HEAD")) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("missing");
      return;
    }
    const body = readFileSync(file);
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file)] || "application/octet-stream",
      "content-length": body.length
    });
    res.end(req.method === "HEAD" ? undefined : body);
  });
  return new Promise((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => {
      const { port } = httpServer.address();
      resolve({ server: httpServer, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function buyProblem(raw, slug) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return `${raw} is not a URL`;
  }
  if (url.protocol !== "https:") return `${raw} is not https`;
  if (url.hostname !== SHOP) return `${raw} is not ${SHOP}`;
  if (url.pathname !== `/l/${slug}`) return `${raw} is not /l/${slug}`;
  return "";
}

function roundBox(box) {
  if (!box) return null;
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height)
  };
}

before(async () => {
  const started = await startServer();
  server = started.server;
  baseUrl = started.baseUrl;
  const chromium = await importChromium();
  browser = await chromium.launch(chromiumLaunchOptions());
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function openOffer(context, route) {
  const page = await context.newPage();
  const blocked = [];
  await page.route("**/*", (routeRequest) => {
    const url = routeRequest.request().url();
    if (url.startsWith(baseUrl) || url.startsWith("data:") || url.startsWith("blob:")) {
      return routeRequest.continue();
    }
    if (/^https:\/\/(?:gc\.zgo\.at|firstmoverprojects\.goatcounter\.com)\//.test(url)) {
      const script = /count\.js(?:$|\?)/.test(url);
      return routeRequest.fulfill({
        status: 200,
        contentType: script ? "application/javascript" : "text/plain",
        body: script ? "window.goatcounter=window.goatcounter||{count:function(){}};" : ""
      });
    }
    blocked.push(url);
    return routeRequest.abort();
  });
  const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "load" });
  return { page, blocked, status: response ? response.status() : 0 };
}

async function visiblePhrases(page, source) {
  return page.evaluate((patternSource) => {
    const pattern = new RegExp(patternSource, "g");
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent) continue;
      let hidden = false;
      for (let el = parent; el; el = el.parentElement) {
        if (skip.has(el.tagName) || el.hidden) {
          hidden = true;
          break;
        }
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") {
          hidden = true;
          break;
        }
      }
      if (hidden) continue;
      const text = node.textContent;
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text))) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const rects = [...range.getClientRects()].filter((rect) => rect.width > 0.5 && rect.height > 0.5);
        if (rects.length === 0) continue;
        const box = {
          top: Math.min(...rects.map((rect) => rect.top)),
          bottom: Math.max(...rects.map((rect) => rect.bottom)),
          left: Math.min(...rects.map((rect) => rect.left)),
          right: Math.max(...rects.map((rect) => rect.right))
        };
        const fully = box.top >= -1
          && box.bottom <= viewport.height + 1
          && box.left >= -1
          && box.right <= viewport.width + 1;
        hits.push({
          text: match[0],
          fully,
          top: Math.round(box.top),
          bottom: Math.round(box.bottom)
        });
        if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
      }
    }
    return { viewport, hits };
  }, source);
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (active && active !== document.body && active.blur) active.blur();
    const root = document.documentElement;
    const width = root.clientWidth;
    let offender = null;
    for (const el of document.body.querySelectorAll("*")) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 && rect.height < 1) continue;
      if (rect.right <= width + 1 && rect.left >= -1) continue;
      let clipped = false;
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        const overflow = getComputedStyle(parent).overflowX;
        if (overflow === "auto" || overflow === "scroll" || overflow === "hidden" || overflow === "clip") {
          clipped = true;
          break;
        }
      }
      if (clipped) continue;
      if (!offender || rect.right > offender.right) {
        offender = {
          right: Math.round(rect.right),
          left: Math.round(rect.left),
          tag: el.tagName,
          id: el.id,
          cls: String(el.className).slice(0, 80)
        };
      }
    }
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: width,
      offender: root.scrollWidth > width + 1 ? offender : null
    };
  });
}

for (const offer of PAGES) {
  test(`${offer.route} shows the kit, the price, and a buy link on the 390px first screen`, { timeout: 60000 }, async () => {
    const dir = screenshotDir();
    mkdirSync(dir, { recursive: true });
    const context = await browser.newContext({
      viewport: VIEWPORT,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
      locale: "en-US",
      timezoneId: "America/Chicago"
    });
    const problems = [];
    const report = { route: offer.route, slug: offer.slug, viewport: VIEWPORT };
    try {
      const opened = await openOffer(context, offer.route);
      const page = opened.page;
      if (opened.status !== 200) problems.push(`${offer.route} loaded HTTP ${opened.status}`);
      await page.screenshot({ path: path.join(dir, `${offer.id}-390-first-screen.png`) });

      report.phrases = {};
      for (const phrase of offer.phrases) {
        const found = await visiblePhrases(page, phrase.source);
        report.phrases[phrase.label] = found.hits;
        if (!found.hits.some((hit) => hit.fully)) {
          const where = found.hits.length
            ? found.hits.map((hit) => `"${hit.text}" top ${hit.top}`).join(", ")
            : "not in the rendered text";
          problems.push(`${offer.name}: ${phrase.label} is not fully on the first screen (${where})`);
        }
      }

      const overflow = await measureOverflow(page);
      report.overflow = overflow;
      if (overflow.scrollWidth > overflow.clientWidth + 1) {
        problems.push(`${offer.name}: horizontal overflow scrollWidth ${overflow.scrollWidth} clientWidth ${overflow.clientWidth} ${JSON.stringify(overflow.offender)}`);
      }

      const cta = page.locator("#kit-top");
      const href = await cta.getAttribute("href");
      const box = await cta.boundingBox();
      report.cta = { href, box: roundBox(box) };
      const buy = buyProblem(href || "", offer.slug);
      if (buy) problems.push(`${offer.name}: #kit-top ${buy}`);
      if (!box) {
        problems.push(`${offer.name}: #kit-top has no box`);
      } else {
        if (box.height < MIN_TAP) problems.push(`${offer.name}: #kit-top is ${Math.round(box.height)}px tall, under ${MIN_TAP}px`);
        const inFirstScreen = box.y >= -1
          && box.y + box.height <= VIEWPORT.height + 1
          && box.x >= -1
          && box.x + box.width <= VIEWPORT.width + 1;
        if (!inFirstScreen) {
          problems.push(`${offer.name}: #kit-top is outside the first screen ${JSON.stringify(roundBox(box))}`);
        } else if (!buy) {
          const requested = [];
          await context.route("**/*", (routeRequest) => {
            const url = routeRequest.request().url();
            if (/gumroad\.com/i.test(url)) requested.push(url);
            return routeRequest.abort();
          });
          const popupPromise = page.waitForEvent("popup", { timeout: 8000 }).catch(() => null);
          await cta.click();
          const popup = await popupPromise;
          const gumroad = requested.find((url) => url.includes(`/l/${offer.slug}`));
          report.clickedUrl = gumroad || (popup ? popup.url() : "");
          const clicked = buyProblem(gumroad || "", offer.slug);
          if (clicked) {
            problems.push(`${offer.name}: click did not open /l/${offer.slug} (saw ${requested.join(" ") || "no request"})`);
          }
          if (popup) await popup.close().catch(() => {});
        }
      }

      const thirdParty = opened.blocked.filter((url) => !/goatcounter\.com|gc\.zgo\.at/i.test(url));
      report.thirdParty = thirdParty;
      if (thirdParty.length) problems.push(`${offer.name}: contacted ${thirdParty.join(", ")}`);
      writeFileSync(path.join(dir, `${offer.id}-390-first-screen.json`), JSON.stringify(report, null, 2));
    } finally {
      await context.close();
    }
    assert.deepEqual(problems, []);
  });
}
