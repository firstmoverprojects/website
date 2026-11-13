// Headless proof that each checker sends one GoatCounter event the first time
// a result is shown. window.goatcounter.count is stubbed. Count URLs are
// fulfilled locally so the live GoatCounter host is never contacted.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { blockExternalOnPage, chromiumLaunchOptions, importChromium } from "./playwright-helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = "2966146";
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 }
];

const PAGES = [
  {
    path: "/tools/fire-to-iris-check/",
    slug: "fire-to-iris-check",
    kind: "on-track",
    async prepare(page) {
      await page.locator("#c-iris-tcc").check();
    },
    async run(page) {
      await page.locator("#go").click();
    },
    async changeAndRerun(page) {
      await page.locator("#c-open-2026").check();
      await page.locator("#go").click();
    },
    expectText: "Nothing urgent was flagged from the boxes you checked."
  },
  {
    path: "/tools/amazon-coi-check/",
    slug: "amazon-coi-check",
    kind: "no-fit",
    async prepare() {},
    async run(page) {
      await page.locator("#go").click();
    },
    async changeAndRerun(page) {
      await page.locator('input[name="q1"][value="no"]').check();
      await page.locator("#go").click();
    },
    expectText: "Because you have not chosen Yes, No, or Not sure"
  },
  {
    path: "/tools/etsy-photo-audit-check/",
    slug: "etsy-photo-audit-check",
    kind: "on-track",
    async prepare(page) {
      await page.locator("#inp").fill([
        "title,photos,primary,variations,disclosure",
        "Blue ceramic mug,5,real,none,not-needed"
      ].join("\n"));
    },
    async run(page) {
      await page.locator("#go").click();
    },
    async changeAndRerun(page) {
      await page.locator("#inp").fill([
        "title,photos,primary,variations,disclosure",
        "FAKE wall print,1,mockup,missing,missing"
      ].join("\n"));
      await page.locator("#go").click();
    },
    expectText: "These checks did not find a problem on the rows you entered."
  }
];

function startServer() {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      let rel = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
      if (rel.endsWith("/")) rel += "index.html";
      const baseline = rel.startsWith("/baseline/");
      if (baseline) rel = rel.slice("/baseline".length);
      rel = rel.replace(/^\/+/, "");
      if (!rel || rel.includes("..")) {
        res.writeHead(400);
        return res.end("bad");
      }
      let body;
      if (baseline) {
        try {
          body = execFileSync("git", ["show", `${BASELINE}:${rel}`], { cwd: ROOT });
        } catch {
          res.writeHead(404);
          return res.end("nf");
        }
      } else {
        const file = path.join(ROOT, rel);
        if (!file.startsWith(ROOT + path.sep) || !existsSync(file)) {
          res.writeHead(404);
          return res.end("nf");
        }
        body = readFileSync(file);
      }
      const ext = path.extname(rel);
      const types = {
        ".html": "text/html; charset=utf-8",
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
      res.end(body);
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, origin: `http://127.0.0.1:${srv.address().port}` }));
  });
}

function stripScripts(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

function expectedEvent(slug, testVisit) {
  return {
    path: (testVisit ? "TEST-EXCLUDE/" : "") + "check/" + slug + "-ran",
    title: "Check ran: " + slug,
    event: true
  };
}

async function visualSignature(page) {
  return page.evaluate(() => {
    const skip = { SCRIPT: 1, STYLE: 1 };
    const lines = [];
    const nodes = document.body ? document.body.querySelectorAll("*") : [];
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (skip[el.tagName]) continue;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      let text = "";
      for (let c = 0; c < el.childNodes.length; c++) {
        if (el.childNodes[c].nodeType === 3) text += el.childNodes[c].textContent;
      }
      text = text.replace(/\s+/g, " ").trim();
      lines.push([
        el.tagName,
        el.id || "",
        typeof el.className === "string" ? el.className : "",
        el.hidden ? "hidden" : "shown",
        style.display,
        style.visibility,
        Math.round(rect.x),
        Math.round(rect.y),
        Math.round(rect.width),
        Math.round(rect.height),
        style.color,
        style.backgroundColor,
        style.fontSize,
        text
      ].join("|"));
    }
    return lines.join("\n");
  });
}

async function arm(page, { stub }) {
  const beacons = [];
  await page.route(/goatcounter\.com|gc\.zgo\.at/i, (route) => {
    beacons.push(route.request().url());
    return route.fulfill({ status: 204, body: "" });
  });
  await page.addInitScript(() => {
    window.__errors = [];
    window.addEventListener("error", (ev) => {
      window.__errors.push(String(ev.message || ev.error || "error"));
    });
    window.addEventListener("unhandledrejection", (ev) => {
      window.__errors.push("rejection:" + String(ev.reason));
    });
  });
  if (stub) {
    await page.addInitScript(() => {
      window.__gcEvents = [];
      const record = (payload) => {
        window.__gcEvents.push({
          path: payload && payload.path,
          title: payload && payload.title,
          event: payload && payload.event
        });
      };
      let current = { count: record };
      Object.defineProperty(window, "goatcounter", {
        configurable: true,
        enumerable: true,
        get() { return current; },
        set(value) {
          current = value && typeof value === "object" ? value : {};
          if (typeof current.count !== "function") current.count = record;
        }
      });
    });
  }
  return beacons;
}

async function openPage(browser, origin, urlPath, { stub = true, viewport = VIEWPORTS[1] } = {}) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await blockExternalOnPage(page, { allowUrlPrefix: origin });
  const beacons = await arm(page, { stub });
  await page.goto(origin + urlPath, { waitUntil: "load" });
  return { page, errors, beacons };
}

async function gcEvents(page) {
  return page.evaluate(() => (window.__gcEvents || []).slice());
}

async function pageErrors(page, extra) {
  const fromPage = await page.evaluate(() => (window.__errors || []).slice());
  return extra.concat(fromPage);
}

test("checker markup outside scripts is unchanged", () => {
  for (const spec of PAGES) {
    const rel = spec.path.slice(1) + "index.html";
    const current = readFileSync(path.join(ROOT, rel), "utf8");
    const baseline = execFileSync("git", ["show", `${BASELINE}:${rel}`], { cwd: ROOT, encoding: "utf8" });
    assert.equal(stripScripts(current), stripScripts(baseline), rel);
  }
});

test("loading, running, rerunning, clearing, and test visits", async () => {
  const { srv, origin } = await startServer();
  const chromium = await importChromium();
  const browser = await chromium.launch(chromiumLaunchOptions());
  try {
    for (const spec of PAGES) {
      const event = expectedEvent(spec.slug, false);
      const first = await openPage(browser, origin, spec.path);
      assert.deepEqual(await gcEvents(first.page), [], spec.slug + " load");
      assert.equal(await first.page.locator("#results").getAttribute("hidden"), "", spec.slug + " results hidden on load");
      await first.page.locator("#clear").click();
      assert.deepEqual(await gcEvents(first.page), [], spec.slug + " clear");
      assert.equal(await first.page.locator("#results").getAttribute("hidden"), "", spec.slug + " clear keeps results hidden");

      await spec.prepare(first.page);
      await spec.run(first.page);
      await first.page.locator("#results").waitFor({ state: "visible" });
      assert.deepEqual(await gcEvents(first.page), [event], spec.slug + " " + spec.kind);
      assert.match(await first.page.locator("#results").innerText(), new RegExp(spec.expectText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      if (spec.kind === "no-fit") {
        assert.equal(await first.page.locator("#nofit-next").getAttribute("hidden"), null, spec.slug);
      }
      assert.equal(first.beacons.some((url) => url.includes("goatcounter.com/count")), false, spec.slug + " live count");
      assert.deepEqual(await pageErrors(first.page, first.errors), [], spec.slug + " errors");

      await spec.changeAndRerun(first.page);
      assert.deepEqual(await gcEvents(first.page), [event], spec.slug + " rerun");

      await first.page.reload({ waitUntil: "load" });
      assert.deepEqual(await gcEvents(first.page), [], spec.slug + " reload");
      await spec.prepare(first.page);
      await spec.run(first.page);
      await first.page.locator("#results").waitFor({ state: "visible" });
      assert.deepEqual(await gcEvents(first.page), [event], spec.slug + " reload run");
      await first.page.close();

      const testVisit = await openPage(browser, origin, spec.path + "?fmp_test=1");
      await spec.prepare(testVisit.page);
      await spec.run(testVisit.page);
      await testVisit.page.locator("#results").waitFor({ state: "visible" });
      assert.deepEqual(await gcEvents(testVisit.page), [expectedEvent(spec.slug, true)], spec.slug + " fmp_test");
      assert.equal(testVisit.beacons.some((url) => url.includes("goatcounter.com/count")), false, spec.slug + " test visit live count");
      assert.deepEqual(await pageErrors(testVisit.page, testVisit.errors), [], spec.slug + " test visit errors");
      await testVisit.page.close();

      const unset = await openPage(browser, origin, spec.path, { stub: false });
      await spec.prepare(unset.page);
      await spec.run(unset.page);
      await unset.page.locator("#results").waitFor({ state: "visible" });
      assert.match(await unset.page.locator("#results").innerText(), new RegExp(spec.expectText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.equal(await unset.page.evaluate(() => window.goatcounter), undefined, spec.slug + " goatcounter unset");
      assert.deepEqual(await pageErrors(unset.page, unset.errors), [], spec.slug + " unset errors");
      const encoded = encodeURIComponent("check/" + spec.slug + "-ran");
      assert.equal(unset.beacons.some((url) => url.includes(encoded)), true, spec.slug + " fallback beacon " + unset.beacons.join(" "));
      await unset.page.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => srv.close(resolve));
  }
});

test("no visible text or layout change at 390px and desktop", async () => {
  const { srv, origin } = await startServer();
  const chromium = await importChromium();
  const browser = await chromium.launch(chromiumLaunchOptions());
  try {
    for (const spec of PAGES) {
      for (const viewport of VIEWPORTS) {
        const current = await openPage(browser, origin, spec.path, { viewport });
        const baseline = await openPage(browser, origin, "/baseline" + spec.path, { viewport, stub: false });
        assert.equal(await current.page.locator("body").innerText(), await baseline.page.locator("body").innerText(), spec.slug + " " + viewport.width + " text");
        assert.equal(await visualSignature(current.page), await visualSignature(baseline.page), spec.slug + " " + viewport.width + " layout");
        await spec.prepare(current.page);
        await spec.prepare(baseline.page);
        await spec.run(current.page);
        await spec.run(baseline.page);
        await current.page.locator("#results").waitFor({ state: "visible" });
        await baseline.page.locator("#results").waitFor({ state: "visible" });
        assert.equal(await current.page.locator("body").innerText(), await baseline.page.locator("body").innerText(), spec.slug + " " + viewport.width + " result text");
        assert.equal(await visualSignature(current.page), await visualSignature(baseline.page), spec.slug + " " + viewport.width + " result layout");
        await current.page.close();
        await baseline.page.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => srv.close(resolve));
  }
});
