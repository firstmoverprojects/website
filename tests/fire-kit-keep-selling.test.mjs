// Both kit-link states, before and after Nov 19, 2026, 20:00 UTC.
// FMP_FIRE_KIT_KEEP_SELLING defaults to false on the same line in each fmp-fire-kit script.
// A shared script src is blocked by these pages' script-src CSP, so the line is inlined.
// Chief flips that one assignment to true only after Risk GOs the v1.4 ZIP.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import { startBrowser, startServer } from "./e2e/harness.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const E3 = "FIRE is closed. After Jan 1, 2027, IRIS is the IRS e-file system for information returns (foreign filers without a U.S. TIN use IDES).";
const FLAG_LINE = 'if (typeof window.FMP_FIRE_KIT_KEEP_SELLING !== "boolean") window.FMP_FIRE_KIT_KEEP_SELLING = false;';
const PERMALINK = "https://firstmoverprojects.gumroad.com/l/fire-to-iris-switch-checklist";
const BEFORE = "2026-11-19T19:59:59.000Z";
const AFTER = "2026-11-19T20:05:00.000Z";
const PAGES = [
  "tools/fire-to-iris-check/index.html",
  "tools/index.html",
  "tools/1099-nec-or-1099-k-check/index.html",
  "deadlines/index.html",
  "deadlines/finder/index.html",
  "deadlines/irs-fire-retirement-nov-19.html",
  "deadlines/fire-to-iris-transition-checklist.html",
  "deadlines/iris-tcc-application-how-long.html",
  "deadlines/file-1099-nec-2027-iris.html",
  "deadlines/office-2021-windows-11-24h2-oct-13.html",
  "deadlines/whiteboard-azure-oct-16.html"
];
const SHOTS = [
  { path: "/tools/fire-to-iris-check/", file: "fire-to-iris-check" },
  { path: "/deadlines/irs-fire-retirement-nov-19.html", file: "irs-fire-retirement-nov-19" }
];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function loadHide(rel, keep) {
  const html = read(rel);
  const match = html.match(/<script id="fmp-fire-kit">([\s\S]*?)<\/script>/);
  assert.ok(match, rel);
  const nodes = [{ hidden: false, id: "kit" }];
  const sandbox = {
    Date,
    document: {
      readyState: "complete",
      addEventListener() {},
      getElementById() { return null; },
      querySelectorAll(sel) {
        assert.equal(sel, "[data-fire-kit]");
        return nodes;
      }
    }
  };
  sandbox.window = sandbox;
  sandbox.FMP_FIRE_KIT_KEEP_SELLING = keep;
  vm.runInNewContext(match[1], sandbox, { filename: rel });
  return { api: sandbox.FMP_FIRE_KIT, nodes };
}

test("every FIRE kit script has the same keep-selling flag line, default false", () => {
  for (const rel of PAGES) {
    const html = read(rel);
    assert.equal(html.split(FLAG_LINE).length - 1, 1, rel);
    assert.equal(html.includes('src="/assets/fire-kit-cutoff.js"'), false, rel);
  }
});

test("each hide script keeps the kit after the cutoff only when the flag is true", () => {
  for (const rel of PAGES) {
    const html = read(rel);
    assert.equal(html.includes(PERMALINK), true, rel);
    assert.equal(html.includes("REMOVE Nov 20, 2026"), false, rel);
    for (const keep of [false, true]) {
      for (const when of [BEFORE, AFTER]) {
        const { api, nodes } = loadHide(rel, keep);
        nodes[0].hidden = false;
        api.hide(new Date(when));
        const expired = new Date(when).getTime() >= Date.parse("2026-11-19T20:00:00.000Z");
        const hidden = nodes[0].hidden === true;
        assert.equal(hidden, expired && keep !== true, rel + " keep=" + keep + " " + when);
      }
    }
  }
});

test("after the cutoff the two FIRE pages show E3, and the flag keeps the kit link", async () => {
  const outDir = "/opt/cursor/artifacts/fire-cutoff";
  mkdirSync(outDir, { recursive: true });
  const started = await startServer();
  const { browser } = await startBrowser();
  try {
    for (const spec of SHOTS) {
      for (const keep of [false, true]) {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 900 },
          timezoneId: "America/New_York"
        });
        if (keep) {
          await context.addInitScript(() => {
            window.FMP_FIRE_KIT_KEEP_SELLING = true;
          });
        }
        const page = await context.newPage();
        await page.clock.install({ time: new Date(AFTER) });
        const response = await page.goto(started.origin + spec.path, { waitUntil: "load" });
        assert.equal(response.status(), 200, spec.path);
        const next = (await page.locator("#next-irs").innerText()).replace(/\s+/g, " ").trim();
        assert.equal(next.startsWith(E3), true, spec.file + " " + next);
        assert.equal(await page.locator("#kit-top").isVisible(), keep, spec.file + " kit visible");
        const href = await page.locator("#kit-top").getAttribute("href");
        assert.equal(href.startsWith(PERMALINK), true, href);
        const shot = path.join(outDir, spec.file + (keep ? "-keep-selling" : "-hidden") + ".png");
        await page.screenshot({ path: shot, fullPage: false });
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => started.server.close(resolve));
  }
});
