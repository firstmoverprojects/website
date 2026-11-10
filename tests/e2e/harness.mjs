// Local static server and a Playwright page with the clock pinned.
// Third-party requests are recorded. GoatCounter, the analytics already on
// these pages, is stubbed so a missing counter script is not a console error.
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_FROZEN = "2026-11-10T18:00:00.000Z";
const FROZEN = DEFAULT_FROZEN;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon"
};

const ANALYTICS = [
  /^https:\/\/gc\.zgo\.at\//,
  /^https:\/\/firstmoverprojects\.goatcounter\.com\//
];

function isAnalytics(url) {
  return ANALYTICS.some((pattern) => pattern.test(url));
}

export function startServer() {
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

async function launchBrowser() {
  const args = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];
  const base = { headless: true, args };
  if (process.env.CHROME_PATH) {
    return chromium.launch({ ...base, executablePath: process.env.CHROME_PATH });
  }
  try {
    return await chromium.launch(base);
  } catch (err) {
    const chrome = "/usr/bin/google-chrome";
    if (existsSync(chrome)) return chromium.launch({ ...base, executablePath: chrome });
    throw err;
  }
}

export async function startBrowser() {
  const browser = await launchBrowser();
  const context = await browser.newContext({
    timezoneId: "America/Chicago",
    viewport: { width: 1280, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"]
  });
  return { browser, context };
}

export async function openPage(context, origin, pagePath, frozenIso) {
  const pinned = frozenIso || FROZEN;
  const page = await context.newPage();
  const thirdParty = [];
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:")) {
      return route.continue();
    }
    if (isAnalytics(url)) {
      const script = /count\.js(?:$|\?)/.test(url);
      return route.fulfill({
        status: 200,
        contentType: script ? "application/javascript" : "text/plain",
        body: script ? "window.goatcounter=window.goatcounter||{count:function(){}};" : ""
      });
    }
    thirdParty.push(`${route.request().method()} ${url}`);
    return route.abort();
  });
  await page.clock.install({ time: new Date(pinned) });
  const response = await page.goto(origin + pagePath, { waitUntil: "load" });
  assert.ok(response, pagePath + " did not navigate");
  assert.equal(response.status(), 200, pagePath);
  return {
    page,
    thirdPartyOnLoad: thirdParty.slice(),
    consoleErrors
  };
}

function notableConsole(errors) {
  return errors.filter((line) => !/favicon\.ico/i.test(line));
}

export function assertQuietLoad(opened, label) {
  assert.deepEqual(
    opened.thirdPartyOnLoad,
    [],
    label + " sent a third-party request on load:\n" + opened.thirdPartyOnLoad.join("\n")
  );
  const errors = notableConsole(opened.consoleErrors);
  assert.deepEqual(errors, [], label + " console errors:\n" + errors.join("\n"));
}

export async function assertLive(page, selector) {
  const node = page.locator(selector);
  assert.equal(await node.count(), 1, selector + " missing");
  assert.equal(await node.getAttribute("aria-live"), "polite", selector + " aria-live");
}

export async function pick(page, name, value) {
  await page.locator(`input[name="${name}"][value="${value}"]`).check();
}

export async function lines(page, selector) {
  return page.locator(selector).allTextContents();
}

export const FROZEN_INSTANT = DEFAULT_FROZEN;
