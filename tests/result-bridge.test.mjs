// Result bridge under the Amazon COI and Etsy photo checker results.
// Hidden until a result exists. Price comes from the page's product JSON-LD.
//   PLAYWRIGHT_CORE=playwright RESULT_BRIDGE_SHOTS=/tmp/result-bridge node --test tests/result-bridge.test.mjs
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { blockExternalOnPage, chromiumLaunchOptions, importChromium } from "./playwright-helpers.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const NOTE = "Not a fit? The checker stays free.";
const SOFT = "Want the full checklist anyway?";
const CLEAN = [
  "Insured: Sample Goods LLC",
  "Commercial general liability",
  "Coverage form: occurrence",
  "Additional insured: Amazon.com Services LLC and its affiliates and assignees",
  "Each occurrence $1,000,000",
  "General aggregate $2,000,000",
  "Deductible $5,000",
  "30 days notice of cancellation"
].join("\n");

const PAGES = [
  {
    id: "amazon-coi",
    rel: "tools/amazon-coi-check/index.html",
    slug: "amazon-coi-check",
    product: "/l/amazon-1m-insurance-readiness-kit",
    what: "a 12-file ZIP of checklists and templates",
    fnEnd: "function resultIsFine",
    async runNeedsWork(page) {
      await page.locator('input[name="q1"][value="yes"]').check();
      await page.locator("#sample").click();
    },
    async runFine(page) {
      await page.evaluate((text) => {
        document.querySelectorAll('input[name="q1"]').forEach((node) => { node.checked = node.value === "yes"; });
        document.querySelectorAll('input[name="q2"]').forEach((node) => { node.checked = node.value === "no"; });
        document.querySelectorAll('input[name="q3"]').forEach((node) => { node.checked = node.value === "no"; });
        document.getElementById("coi").value = text;
        document.getElementById("entity").value = "Sample Goods LLC";
        document.getElementById("expiry").value = "2027-01-01";
        const result = window.checkCOI(text, "Sample Goods LLC", false, "2027-01-01", new Date("2026-10-26"));
        result.checks.forEach((item) => {
          item.status = "ok";
          item.statusLabel = "Looks right";
        });
        window.FMP_COI.paint(result);
      }, CLEAN);
    },
    async runScopeFine(page) {
      await page.locator('input[name="q1"][value="no"]').check();
      await page.locator('input[name="q2"][value="no"]').check();
      await page.locator('input[name="q3"][value="no"]').check();
      await page.locator("#go").click();
    }
  },
  {
    id: "etsy-photo",
    rel: "tools/etsy-photo-audit-check/index.html",
    slug: "etsy-photo-audit-check",
    product: "/l/lnfgc",
    what: "a PDF shot list and a CSV listing sheet",
    fnEnd: "function applyResultOffer",
    async runNeedsWork(page) {
      await page.locator("#inp").fill([
        "title,photos,primary,variations,disclosure",
        "FAKE wall print,1,mockup,missing,missing"
      ].join("\n"));
      await page.locator("#go").click();
    },
    async runFine(page) {
      await page.locator("#inp").fill([
        "title,photos,primary,variations,disclosure",
        "Blue ceramic mug,5,real,none,not-needed"
      ].join("\n"));
      await page.locator("#go").click();
    },
    async runDisclosure(page) {
      await page.locator("#inp").fill([
        "title,photos,primary,variations,disclosure",
        "FAKE gift gift gift coaster,5,real,linked,missing"
      ].join("\n"));
      await page.locator("#go").click();
    }
  }
];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function bridgeMarkup(html) {
  const at = html.indexOf('<div id="result-bridge"');
  const close = html.indexOf("</div>", at);
  assert.ok(at !== -1 && close > at);
  return html.slice(at, close);
}

test("bridge markup names no new price", () => {
  for (const spec of PAGES) {
    const html = read(spec.rel);
    const block = bridgeMarkup(html);
    assert.equal(/\$\d/.test(block), false, spec.rel);
    assert.match(block, new RegExp('data-kit-what="' + spec.what.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"'));
    assert.match(block, /Not a fit\? The checker stays free\./);
    assert.match(block, new RegExp('utm_source=site&amp;utm_medium=checker_result&amp;utm_campaign=' + spec.slug + '&amp;utm_content=result-bridge'));
    assert.match(block, new RegExp('data-goatcounter-click="cta/' + spec.slug + '-result-bridge"'));
    const fn = html.slice(html.indexOf("function readKitFacts"), html.indexOf(spec.fnEnd));
    assert.ok(fn.includes("product-jsonld"), spec.rel);
    assert.equal(fn.includes("$19"), false, spec.rel);
    assert.equal(fn.includes("$9"), false, spec.rel);
    assert.equal(block.includes("\u2014") || block.includes("\u2013") || fn.includes("\u2014") || fn.includes("\u2013"), false, spec.rel);
  }
});

async function shown(page, selector) {
  return page.locator(selector).evaluate((el) => {
    if (!el || el.hidden) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

async function bridgeFit(page) {
  return page.evaluate(() => {
    const el = document.getElementById("result-bridge");
    el.scrollIntoView({ block: "start" });
    const rect = el.getBoundingClientRect();
    const sticky = document.getElementById("kit-sticky");
    let stickyTop = window.innerHeight;
    if (sticky && !sticky.hidden && (sticky.offsetWidth || sticky.offsetHeight || sticky.getClientRects().length)) {
      stickyTop = sticky.getBoundingClientRect().top;
    }
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      height: rect.height,
      iw: window.innerWidth,
      ih: window.innerHeight,
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      stickyTop
    };
  });
}

test("bridge stays hidden until a result, then links the existing kit", { timeout: 180000 }, async () => {
  const shots = process.env.RESULT_BRIDGE_SHOTS;
  if (shots) mkdirSync(shots, { recursive: true });
  const chromium = await importChromium();
  const browser = await chromium.launch(chromiumLaunchOptions());
  try {
    for (const spec of PAGES) {
      for (const width of [390, 1280]) {
        const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
        const errors = [];
        page.on("pageerror", (err) => errors.push(String(err)));
        await page.addInitScript(() => {
          window.__gc = [];
          const record = (payload) => {
            window.__gc.push({
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
          document.addEventListener("click", (ev) => {
            const node = ev.target && ev.target.closest ? ev.target.closest("a") : null;
            if (!node) return;
            const href = node.getAttribute("href") || "";
            if (href.indexOf("gumroad.com") !== -1) ev.preventDefault();
          }, true);
        });
        await blockExternalOnPage(page);
        await page.goto(pathToFileURL(path.join(ROOT, spec.rel)).href, { waitUntil: "load" });
        const label = spec.id + " " + width;

        assert.equal(await shown(page, "#results"), false, label + " results");
        assert.equal(await shown(page, "#result-bridge"), false, label + " bridge before");
        if (shots) await page.screenshot({ path: path.join(shots, spec.id + "-" + width + "-before.png") });

        await spec.runNeedsWork(page);
        await page.locator("#results").waitFor({ state: "visible" });
        assert.equal(await shown(page, "#result-bridge"), true, label + " bridge after");
        const meaning = await page.locator("#result-bridge-meaning").innerText();
        assert.equal(meaning.includes(SOFT), false, label + " " + meaning);
        assert.equal(await page.locator("#result-bridge-free").innerText(), NOTE, label);

        const facts = await page.evaluate(() => {
          const data = JSON.parse(document.getElementById("product-jsonld").textContent);
          const top = document.getElementById("kit-top").textContent || "";
          const shownPrice = (top.match(/\$\d+(?:\.\d+)?/) || [])[0] || "";
          return {
            name: data.name,
            price: "$" + String(data.offers.price),
            shownPrice
          };
        });
        assert.equal(facts.price, facts.shownPrice, label);
        const kit = await page.locator("#result-bridge-kit").innerText();
        assert.match(kit, new RegExp("The " + facts.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        assert.match(kit, /is a downloadable kit/);
        assert.match(kit, new RegExp(spec.what.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        assert.match(kit, new RegExp("Price: \\" + facts.price + "\\."));
        assert.equal(await page.locator("#result-bridge-link").innerText(), "Get the " + facts.price + " kit", label);

        const href = await page.getAttribute("#result-bridge-link", "href");
        const url = new URL(href);
        assert.equal(url.protocol, "https:");
        assert.equal(url.hostname, "firstmoverprojects.gumroad.com");
        assert.equal(url.pathname, spec.product, href);
        assert.equal(url.searchParams.get("wanted"), "true", href);
        assert.equal(url.searchParams.get("utm_source"), "site", href);
        assert.equal(url.searchParams.get("utm_medium"), "checker_result", href);
        assert.equal(url.searchParams.get("utm_campaign"), spec.slug, href);
        assert.equal(url.searchParams.get("utm_content"), "result-bridge", href);

        const fit = await bridgeFit(page);
        assert.equal(fit.sw, fit.cw, label + " h-scroll " + JSON.stringify(fit));
        assert.ok(fit.left >= -1 && fit.right <= fit.iw + 1, label + " width " + JSON.stringify(fit));
        assert.ok(fit.top >= -1, label + " top " + JSON.stringify(fit));
        assert.ok(fit.bottom <= fit.ih + 1, label + " fully visible " + JSON.stringify(fit));
        assert.ok(fit.bottom <= fit.stickyTop + 1, label + " sticky " + JSON.stringify(fit));
        assert.ok(fit.height >= 48 && fit.height < fit.ih, label + " height " + fit.height);
        if (shots) await page.screenshot({ path: path.join(shots, spec.id + "-" + width + "-after.png") });

        const ran = "check/" + spec.slug + "-ran";
        const bridgeEvent = "cta/" + spec.slug + "-result-bridge";
        const beforeClick = await page.evaluate(() => window.__gc.map((row) => row.path));
        assert.equal(beforeClick.filter((item) => item === ran).length, 1, label + " " + beforeClick.join(","));
        assert.equal(beforeClick.includes(bridgeEvent), false, label);

        await page.locator("#result-bridge-link").click();
        const clicked = await page.evaluate(() => window.__gc.slice());
        const bridgeHits = clicked.filter((row) => row.path === bridgeEvent);
        assert.equal(bridgeHits.length, 1, label + " " + JSON.stringify(clicked));
        assert.equal(bridgeHits[0].title, "Result bridge: " + spec.slug, label);
        assert.equal(bridgeHits[0].event, true, label);
        assert.equal(clicked.filter((row) => row.path === ran).length, 1, label);

        await spec.runFine(page);
        const fine = await page.locator("#result-bridge-meaning").innerText();
        assert.match(fine, new RegExp(SOFT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), label + " " + fine);
        assert.equal(await shown(page, "#result-bridge"), true, label + " fine still shown");
        const fineFit = await bridgeFit(page);
        assert.equal(fineFit.sw, fineFit.cw, label + " fine h-scroll");
        assert.ok(fineFit.bottom <= fineFit.ih + 1 && fineFit.right <= fineFit.iw + 1, label + " fine fit " + JSON.stringify(fineFit));

        await page.locator("#clear").click();
        assert.equal(await shown(page, "#results"), false, label + " cleared results");
        assert.equal(await shown(page, "#result-bridge"), false, label + " cleared bridge");
        assert.deepEqual(errors, [], label);
        await page.close();
      }
    }

    const amazon = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await blockExternalOnPage(amazon);
    await amazon.goto(pathToFileURL(path.join(ROOT, PAGES[0].rel)).href, { waitUntil: "load" });
    await PAGES[0].runScopeFine(amazon);
    const scope = await amazon.locator("#result-bridge-meaning").innerText();
    assert.match(scope, /Neither rule appears to apply based on your answers\./);
    assert.match(scope, /Want the full checklist anyway\?/);
    assert.equal(await shown(amazon, "#result-bridge"), true);
    const scopeFit = await bridgeFit(amazon);
    assert.equal(scopeFit.sw, scopeFit.cw, JSON.stringify(scopeFit));
    assert.ok(scopeFit.bottom <= scopeFit.ih + 1 && scopeFit.right <= scopeFit.iw + 1, JSON.stringify(scopeFit));
    await amazon.close();

    const etsy = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await blockExternalOnPage(etsy);
    await etsy.goto(pathToFileURL(path.join(ROOT, PAGES[1].rel)).href, { waitUntil: "load" });
    await PAGES[1].runDisclosure(etsy);
    assert.equal(await shown(etsy, "#result-bridge"), true);
    assert.equal(await shown(etsy, "#kit-result"), false);
    const disclosure = await etsy.locator("#result-bridge-meaning").innerText();
    assert.match(disclosure, /production partner/);
    assert.equal(disclosure.includes(SOFT), false, disclosure);
    const disclosureFit = await bridgeFit(etsy);
    assert.equal(disclosureFit.sw, disclosureFit.cw, JSON.stringify(disclosureFit));
    assert.ok(disclosureFit.bottom <= disclosureFit.ih + 1 && disclosureFit.right <= disclosureFit.iw + 1, JSON.stringify(disclosureFit));
    await etsy.close();
  } finally {
    await browser.close();
  }
});
