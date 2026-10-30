// Headless check that each in-scope deadline checker finishes and shows one priced kit button.
// Install once if playwright-core is not on the module path:
//   npm install --prefix /tmp/issue07-pw playwright-core
//   PLAYWRIGHT_CORE=/tmp/issue07-pw/node_modules/playwright-core/index.mjs node --test tests/checker-result-cards.test.mjs
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

let chromium;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

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

function toolNetwork(urls) {
  return urls.filter((url) => !/^https:\/\/(?:gc\.zgo\.at|firstmoverprojects\.goatcounter\.com)(?:[/?#]|$)/.test(url));
}

async function open(rel) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  const nets = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("request", (req) => {
    if (/^https?:/i.test(req.url())) nets.push(req.url());
  });
  await page.goto(pathToFileURL(path.join(ROOT, rel)).href, { waitUntil: "load" });
  return { page, errors, nets };
}

async function assertNoHScroll(page) {
  const box = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth
  }));
  assert.equal(box.sw, box.cw, JSON.stringify(box));
}

test("Etsy, FIRE, and Amazon checkers show one tagged kit button", async () => {
  const cases = [
    {
      rel: "tools/etsy-photo-audit-check/index.html",
      click: "#example",
      problem: /mockup|computer picture/i,
      deadline: /Oct 22, 2026/,
      button: "Get the $9 photo checklist",
      slug: "/l/lnfgc",
      campaign: "etsy-photo-audit-check"
    },
    {
      rel: "tools/fire-to-iris-check/index.html",
      click: "#example",
      problem: /filing code/,
      deadline: /Nov 19, 2026, at 3 p\.m\. Eastern Time/,
      button: "Get the $9 switch checklist",
      slug: "/l/fire-to-iris-switch-checklist",
      campaign: "fire-to-iris-check",
      resultContent: "fire-check-result"
    },
    {
      rel: "tools/amazon-coi-check/index.html",
      click: "#sample",
      problem: /to fix/,
      deadline: /Nov 2, 2026/,
      button: "Get the $29 insurance kit",
      slug: "/l/amazon-1m-insurance-readiness-kit",
      campaign: "amazon-coi-check",
      resultContent: "coi-check-result",
      nameStep: /insured name|legal business name/i,
      skipWeeklyEmail: true
    }
  ];
  for (const item of cases) {
    const { page, errors, nets } = await open(item.rel);
    await page.click(item.click);
    assert.equal(await page.locator("#results").isVisible(), true, item.rel);
    assert.equal(await page.locator("#result-cta").isVisible(), true, item.rel);
    assert.equal(await page.locator("#result-cta a.btn").count(), 1, item.rel);
    assert.match(await page.innerText("#result-problem"), item.problem, item.rel);
    assert.match(await page.innerText("#result-deadline"), item.deadline, item.rel);
    assert.equal(await page.innerText("#kit-result"), item.button, item.rel);
    const resultHref = await page.getAttribute("#kit-result", "href");
    const footerHref = await page.getAttribute("#paid-link", "href");
    for (const href of [resultHref, footerHref]) {
      const url = new URL(href);
      assert.equal(url.pathname.endsWith(item.slug), true, href);
      assert.equal(url.searchParams.get("utm_source"), "site", href);
      assert.equal(url.searchParams.get("utm_medium"), "site", href);
      assert.equal(url.searchParams.get("wanted"), "true", href);
      assert.equal(url.searchParams.get("utm_campaign"), item.campaign, href);
    }
    assert.equal(new URL(resultHref).searchParams.get("utm_content"), item.resultContent || "result-card");
    assert.equal(new URL(footerHref).searchParams.get("utm_content"), "footer");
    if (item.resultContent) {
      assert.equal(await page.locator("#results a[href*='gumroad.com']").count(), 1, item.rel);
      assert.match(await page.innerText("#result-cta"), /General guidance, not legal, tax or IT advice/);
      const steps = await page.locator("#next-steps li").count();
      assert.ok(steps >= 2 && steps <= 3, item.rel + " steps " + steps);
      if (item.nameStep) assert.match(await page.innerText("#next-steps"), item.nameStep, item.rel);
    }
    if (item.skipWeeklyEmail) {
      assert.equal(/free weekly deadline email/.test(await page.innerText("#result-cta")), false, item.rel);
      assert.equal(await page.locator("#results .follow-bar, #results .kit-conv-box, #results .email-cap-box, #results .btn-buy-now").count(), 0, item.rel);
    } else {
      assert.match(await page.innerText("#result-cta"), /free weekly deadline email/);
    }
    assert.deepEqual(errors, [], item.rel);
    assert.deepEqual(toolNetwork(nets), [], item.rel);
    await assertNoHScroll(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await assertNoHScroll(page);
    await page.close();
  }
});
