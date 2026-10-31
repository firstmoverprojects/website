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
      campaign: "etsy-photo-audit-check",
      resultContent: "etsy-check-result",
      stepMatch: /unedited photo of the real item/,
      skipWeeklyEmail: true,
      thanks: true,
      contrast: true
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
      if (item.stepMatch) assert.match(await page.innerText("#next-steps"), item.stepMatch, item.rel);
    }
    if (item.thanks) {
      const cardText = await page.innerText("#result-cta");
      assert.match(cardText, /Thank you for your time/);
      assert.match(cardText, /Share it with someone it could help/);
      const kitTop = await page.locator("#kit-result").boundingBox();
      const thanksTop = await page.locator("#result-cta .thanks").boundingBox();
      const shareTop = await page.locator("#result-cta .share-line").boundingBox();
      assert.ok(kitTop && thanksTop && shareTop && kitTop.y < thanksTop.y && thanksTop.y < shareTop.y, item.rel);
    }
    if (item.contrast) {
      const colors = await page.evaluate(() => {
        const card = document.querySelector("#result-cta");
        const heading = document.querySelector("#result-problem");
        const btn = document.querySelector("#kit-result");
        return {
          bg: getComputedStyle(card).backgroundColor,
          text: getComputedStyle(heading).color,
          thanks: getComputedStyle(document.querySelector("#result-cta .thanks")).color,
          share: getComputedStyle(document.querySelector("#result-cta .share-line")).color,
          btnBg: getComputedStyle(btn).backgroundColor,
          btnColor: getComputedStyle(btn).color,
          btnH: btn.getBoundingClientRect().height
        };
      });
      assert.equal(colors.bg, "rgb(255, 255, 255)", item.rel);
      assert.equal(colors.text, "rgb(7, 27, 49)", item.rel);
      assert.equal(colors.thanks, "rgb(7, 27, 49)", item.rel);
      assert.equal(colors.share, "rgb(7, 27, 49)", item.rel);
      assert.equal(colors.btnBg, "rgb(0, 85, 255)", item.rel);
      assert.equal(colors.btnColor, "rgb(255, 255, 255)", item.rel);
      assert.ok(colors.btnH >= 44, item.rel + " button " + colors.btnH);
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

test("EU product ID checker shows one result, the November 1 rule, and one kit button", async () => {
  const { page, errors, nets } = await open("tools/eu-product-id-check/index.html");
  assert.match(await page.locator("#what").innerText(), /^This is a free checker that tells you /);
  const targets = await page.evaluate(() => {
    return ["#go", "#example", "#clear"].map((sel) => {
      const el = document.querySelector(sel);
      const box = el.getBoundingClientRect();
      return { sel, h: box.height, w: box.width };
    });
  });
  for (const target of targets) {
    assert.ok(target.h >= 48, target.sel + " height " + target.h);
    assert.ok(target.w >= 44, target.sel + " width " + target.w);
  }

  await page.click("#example");
  assert.equal(await page.locator("#results").isVisible(), true);
  assert.equal(await page.locator("#result-cta").isVisible(), true);
  assert.equal(await page.locator("#result-cta a").count(), 1);
  assert.equal(await page.locator("#results a[href*='gumroad.com']").count(), 1);
  assert.equal(await page.locator("#results .follow-bar, #results .kit-conv-box, #results .email-cap-box, #results .btn-buy-now").count(), 0);
  assert.match(await page.innerText("#result-problem"), /4 of 6 rows need a fix before November 1, 2026/);
  assert.match(await page.innerText("#result-deadline"), /November 1, 2026/);
  assert.match(await page.innerText("#result-deadline"), /EUR 150/);
  assert.match(await page.innerText("#next-steps"), /Y081/);
  assert.equal(await page.locator("#next-steps li").count(), 3);
  assert.equal(await page.innerText("#kit-result"), "Get the $29 EU Customs Product Data Checker");
  const href = await page.getAttribute("#kit-result", "href");
  const url = new URL(href);
  assert.equal(url.pathname, "/l/fetwsm");
  assert.equal(url.searchParams.get("utm_content"), "result-cta");
  assert.equal(url.searchParams.get("utm_campaign"), "eu-product-id-check");
  const cardText = await page.innerText("#result-cta");
  assert.match(cardText, /Thanks for your time\. If this isn't right for you, please share it with someone it could help\./);
  assert.match(cardText, /General guidance, not legal, tax or IT advice/);
  assert.match(await page.innerText("footer"), /Not affiliated with the European Commission or any customs authority/);
  const colors = await page.evaluate(() => {
    const btn = document.querySelector("#kit-result");
    return {
      bg: getComputedStyle(document.querySelector("#result-cta")).backgroundColor,
      text: getComputedStyle(document.querySelector("#result-problem")).color,
      thanks: getComputedStyle(document.querySelector("#result-cta .thanks")).color,
      btnBg: getComputedStyle(btn).backgroundColor,
      btnColor: getComputedStyle(btn).color,
      btnH: btn.getBoundingClientRect().height
    };
  });
  assert.equal(colors.bg, "rgb(255, 255, 255)");
  assert.equal(colors.text, "rgb(7, 27, 49)");
  assert.equal(colors.thanks, "rgb(7, 27, 49)");
  assert.equal(colors.btnBg, "rgb(0, 85, 255)");
  assert.equal(colors.btnColor, "rgb(255, 255, 255)");
  assert.ok(colors.btnH >= 48, "button " + colors.btnH);
  assert.deepEqual(errors, []);
  assert.deepEqual(toolNetwork(nets), []);
  await assertNoHScroll(page);

  await page.fill("#inp", "FAKE-MUG-BLUE,NOT-A-REAL-MFR-200,4006381333931");
  await page.click("#go");
  assert.match(await page.innerText("#result-problem"), /No problems found in these checks/);
  assert.match(await page.innerText("#result-problem"), /November 1, 2026/);
  assert.equal(await page.locator("#result-cta a").count(), 1);

  await page.fill("#inp", "");
  await page.click("#go");
  assert.match(await page.innerText("#result-problem"), /No rows were checked/);
  await page.click("#clear");
  assert.equal(await page.locator("#results").isVisible(), false);

  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoHScroll(page);
  await page.close();
});
