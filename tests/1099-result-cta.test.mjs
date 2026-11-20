// Outcome-specific result CTA on the 1099-NEC or 1099-K check.
// Headless run:
//   PLAYWRIGHT_CORE=/tmp/issue07-pw/node_modules/playwright-core/index.mjs NEC_CTA_SHOTS=/tmp/artifacts/1099-result-cta node --test tests/1099-result-cta.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { blockExternalOnPage, chromiumLaunchOptions, importChromium } from "./playwright-helpers.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PAGE = path.join(ROOT, "tools/1099-nec-or-1099-k-check/index.html");
const REFUND = "Refunds: within 30 days if a file is corrupt or materially not as described.";
const DISCLAIMER = "General guidance, not legal, tax or IT advice.";
const IRS = "Not affiliated with or endorsed by the IRS.";
const BUTTON = "Get the $9 checklist (PDF in a ZIP)";
const QUIET = "Optional: $9 checklist (PDF in a ZIP)";
const FREE = "/tools/fire-to-iris-check/";
const WITHHELD = "If you withheld federal income tax, the amount is not the limit: Form 1099-NEC is still required; see the backup-withholding step above.";
const NONE_LEAD = "You likely do not need to buy a checklist for this payment. " + WITHHELD + " Watch the $2,000 threshold on cash, check, bank transfer, and ACH payments, and keep notes on who you paid and how.";
const FEDERAL = "This covers the federal rule only. Some states still have lower 1099 thresholds; check your state tax agency.";
const UNDER = { purpose: "business", who: "contractor", method: "noncard", noncard: "under" };
const NEC = { purpose: "business", who: "contractor", method: "noncard", noncard: "least" };
const BEFORE_CUTOFF = "2026-11-19T19:59:59.000Z";
const AFTER_CUTOFF = "2026-11-19T20:05:00.000Z";
const FIRE_ENDED = "FIRE filing ended Nov 19, 2026 at 3 p.m. ET.";
const IRIS_GUIDANCE = "After Jan 1, 2027, IRIS is the IRS e-file system for information returns (foreign filers without a U.S. TIN use IDES).";

const CASES = [
  {
    key: "nec",
    answers: { purpose: "business", who: "contractor", method: "noncard", noncard: "least" },
    headline: "1099-NEC is likely yours to file",
    lead: "Because this payment looks like a Form 1099-NEC for you to file, the checklist puts the IRIS steps and a 1099-NEC add-on on one printable list.",
    utm: "1099-result-nec",
    quiet: false,
    nofit: false
  },
  {
    key: "k",
    answers: { purpose: "business", who: "contractor", method: "card", noncard: "none" },
    headline: "The card company or payment app reports it on 1099-K, so you likely don't file a 1099-NEC for those payments",
    lead: "You likely do not need to buy a checklist for this payment. Keep your card and payment-app records. The card company or payment app reports those payments on Form 1099-K. File Form 1099-NEC only if a cash, check, bank transfer, or ACH portion for this payee is $2,000 or more.",
    utm: "1099-result-k-only",
    quiet: true,
    nofit: true
  },
  {
    key: "split",
    answers: { purpose: "business", who: "contractor", method: "mixed", noncard: "least" },
    headline: "Mixed: file 1099-NEC only for the non-card portion",
    lead: "Because you paid both ways and the cash, check, bank transfer, and ACH portion is $2,000 or more, file Form 1099-NEC only for that non-card portion. The checklist puts the IRIS steps and a 1099-NEC add-on on one printable list.",
    utm: "1099-result-split",
    quiet: false,
    nofit: false
  },
  {
    key: "none",
    answers: { purpose: "personal", who: "contractor", method: "noncard", noncard: "under" },
    headline: "Likely no federal 1099 needed",
    lead: NONE_LEAD,
    utm: "1099-result-none",
    quiet: true,
    nofit: true
  },
  {
    key: "warn",
    answers: { purpose: "business", who: "contractor", method: "noncard", noncard: "none" },
    headline: "This check needs a clearer answer before it can pick one result.",
    lead: "Because you said you are not sure, or two answers do not match, this check cannot pick one form yet. If a form is yours to file, the checklist puts the IRIS steps and a 1099-NEC add-on on one printable list.",
    utm: "1099-result-warn",
    quiet: false,
    nofit: false
  }
];

test("all five outcomes set the lead, button, utm, and no-fit chrome", async () => {
  const chromium = await importChromium();
  const browser = await chromium.launch(chromiumLaunchOptions());
  try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
  const page = await context.newPage();
  await page.clock.install({ time: new Date(BEFORE_CUTOFF) });
  await page.clock.setFixedTime(new Date(BEFORE_CUTOFF));
  await blockExternalOnPage(page);
  const shots = process.env.NEC_CTA_SHOTS;
  if (shots) mkdirSync(shots, { recursive: true });
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.goto(pathToFileURL(PAGE).href, { waitUntil: "load" });
  await page.evaluate(() => {
    document.addEventListener("click", (ev) => {
      const node = ev.target && ev.target.closest ? ev.target.closest("a") : null;
      if (!node) return;
      const href = node.getAttribute("href") || "";
      if (href.indexOf("firstmoverprojects.gumroad.com/l/") !== -1) ev.preventDefault();
    }, true);
  });

  async function answer(state) {
    await page.evaluate((input) => {
      ["purpose", "who", "method", "noncard"].forEach((name) => {
        const nodes = document.getElementsByName(name);
        for (let i = 0; i < nodes.length; i++) nodes[i].checked = nodes[i].value === input[name];
      });
    }, state);
    await page.click("#go");
  }

  async function stateOf() {
    return page.evaluate(() => {
      function shown(el) {
        if (!el) return false;
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      }
      const link = document.getElementById("kit-result");
      const refund = document.getElementById("kit-refund");
      const disclaimer = document.querySelector("#result-cta .disclaimer");
      const irs = document.getElementById("result-irs");
      const style = link ? getComputedStyle(link) : { backgroundColor: "", color: "", textDecorationLine: "" };
      const url = link ? new URL(link.href) : null;
      const sticky = document.getElementById("kit-sticky-link");
      const stickyLabel = document.getElementById("kit-sticky-label");
      const stickyUrl = sticky ? sticky.getAttribute("href") || "" : "";
      return {
        problem: document.getElementById("result-problem").textContent,
        federalNote: document.getElementById("result-federal-note").textContent,
        federalHidden: document.getElementById("result-federal-note").hidden,
        federalUnder: document.getElementById("result-federal-note").previousElementSibling === document.getElementById("result-problem"),
        lead: document.getElementById("result-kit-lead").textContent,
        leadVisible: shown(document.getElementById("result-kit-lead")),
        steps: document.getElementById("next-steps").innerText,
        linkText: link ? link.textContent : "",
        className: link ? link.className : "",
        linkVisible: shown(link),
        refundVisible: shown(refund),
        refund: refund ? refund.textContent : "",
        disclaimer: disclaimer.textContent,
        disclaimerVisible: shown(disclaimer),
        irs: irs.textContent,
        irsVisible: shown(irs),
        bg: style.backgroundColor,
        color: style.color,
        deco: style.textDecorationLine,
        content: url ? url.searchParams.get("utm_content") : "",
        source: url ? url.searchParams.get("utm_source") : "",
        medium: url ? url.searchParams.get("utm_medium") : "",
        campaign: url ? url.searchParams.get("utm_campaign") : "",
        wanted: url ? url.searchParams.get("wanted") : "",
        click: link ? link.getAttribute("data-goatcounter-click") : "",
        buyButtons: document.querySelectorAll("#result-cta a.btn").length,
        topPaid: shown(document.getElementById("kit-top-offer")),
        topFree: shown(document.getElementById("kit-top-free")),
        topFreeHref: document.getElementById("kit-top-free-link").getAttribute("href"),
        footerPaid: shown(document.getElementById("kit-footer-offer")),
        footerFree: shown(document.getElementById("kit-footer-free")),
        stickyHref: stickyUrl,
        stickyText: sticky ? sticky.textContent : "",
        stickyLabel: stickyLabel ? stickyLabel.textContent : "",
        stickyClick: sticky ? sticky.getAttribute("data-goatcounter-click") : "",
        linkTop: link ? link.getBoundingClientRect().top : 0,
        refundTop: refund ? refund.getBoundingClientRect().top : 0,
        disclaimerTop: disclaimer.getBoundingClientRect().top,
        irsTop: irs.getBoundingClientRect().top,
        cta: document.getElementById("results").getAttribute("data-cta")
      };
    });
  }

  async function shot(name) {
    if (!shots) return;
    await page.evaluate(() => {
      document.getElementById("result-problem").scrollIntoView({ block: "start" });
    });
    const clip = await page.evaluate(() => {
      const start = document.getElementById("result-problem").getBoundingClientRect();
      const end = document.getElementById("result-irs").getBoundingClientRect();
      const x = Math.max(0, Math.floor(start.left - 16));
      const y = Math.max(0, Math.floor(start.top - 16));
      return {
        x,
        y,
        width: Math.min(window.innerWidth - x, Math.ceil(start.width + 32)),
        height: Math.ceil(end.bottom - start.top + 32)
      };
    });
    await page.screenshot({ path: path.join(shots, name), clip });
  }

  for (const item of CASES) {
    await answer(item.answers);
    const state = await stateOf();
    assert.equal(state.problem, item.headline, item.key);
    assert.equal(state.federalUnder, true, item.key);
    if (item.key === "none") {
      assert.equal(state.federalHidden, false, item.key);
      assert.equal(state.federalNote, FEDERAL, item.key);
    } else {
      assert.equal(state.federalHidden, true, item.key);
    }
    assert.equal(state.lead, item.lead, item.key);
    assert.equal(state.leadVisible, true, item.key);
    if (item.key === "none") {
      assert.equal(state.lead.includes(WITHHELD), true, item.key);
      assert.ok(state.lead.indexOf(WITHHELD) < state.lead.indexOf("Watch the $2,000 threshold"), item.key);
      assert.match(state.steps, /If you withheld any federal income tax under the backup withholding rules/, item.key);
      assert.match(state.steps, /report that withholding in box 4/, item.key);
    } else {
      assert.equal(state.lead.includes(WITHHELD), false, item.key);
    }
    assert.equal(state.linkVisible, false, item.key);
    assert.equal(state.refundVisible, false, item.key);
    assert.equal(state.disclaimer, DISCLAIMER, item.key);
    assert.equal(state.disclaimerVisible, true, item.key);
    assert.equal(state.irs, IRS, item.key);
    assert.equal(state.irsVisible, true, item.key);
    assert.ok(state.disclaimerTop > 0, item.key);
    assert.ok(state.disclaimerTop < state.irsTop, item.key);
    assert.equal(state.linkVisible, false, item.key);
    assert.equal(state.buyButtons, 0, item.key);
    assert.equal(state.stickyHref, "", item.key);
    assert.equal(state.topFreeHref, FREE, item.key);
    assert.equal(state.footerFree, true, item.key);
    assert.equal(state.topPaid, false, item.key);
    assert.equal(state.footerPaid, false, item.key);
    if (item.nofit) {
      assert.equal(state.cta, "nofit", item.key);
      assert.equal(state.topFree, true, item.key);
    } else {
      assert.equal(state.cta, "buy", item.key);
      assert.equal(state.topFree, false, item.key);
    }
    await shot("1099-result-" + item.key + "-1280.png");
  }

  await answer(NEC);
  const buyFirst = await stateOf();
  assert.equal(buyFirst.linkVisible, false);
  assert.equal(buyFirst.cta, "buy");
  assert.equal(buyFirst.topPaid, false);
  assert.equal(buyFirst.topFree, false);
  assert.equal(buyFirst.lead.includes(WITHHELD), false);
  assert.equal(buyFirst.stickyHref, "");

  await answer(UNDER);
  const noneUnder = await stateOf();
  assert.equal(noneUnder.problem, "Likely no federal 1099 needed");
  assert.equal(noneUnder.federalHidden, false);
  assert.equal(noneUnder.federalNote, FEDERAL);
  assert.equal(noneUnder.lead, NONE_LEAD);
  assert.equal(noneUnder.leadVisible, true);
  assert.equal(noneUnder.lead.includes(WITHHELD), true);
  assert.ok(noneUnder.lead.indexOf(WITHHELD) < noneUnder.lead.indexOf("Watch the $2,000 threshold"));
  assert.match(noneUnder.steps, /cash, check, bank transfer, and ACH total here is under \$2,000/);
  assert.match(noneUnder.steps, /If you withheld any federal income tax under the backup withholding rules, file Form 1099-NEC for that person no matter the amount\./);
  const stepBeforeLead = await page.evaluate(() => {
    const steps = document.getElementById("next-steps");
    const lead = document.getElementById("result-kit-lead");
    return !!(steps.compareDocumentPosition(lead) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  assert.equal(stepBeforeLead, true);
  assert.equal(noneUnder.linkVisible, false);
  assert.equal(noneUnder.buyButtons, 0);
  assert.equal(noneUnder.refundVisible, false);
  assert.equal(noneUnder.disclaimer, DISCLAIMER);
  assert.equal(noneUnder.irs, IRS);
  assert.equal(noneUnder.cta, "nofit");
  assert.equal(noneUnder.topPaid, false);
  assert.equal(noneUnder.topFree, true);
  assert.equal(noneUnder.footerPaid, false);
  assert.equal(noneUnder.stickyHref, "");
  assert.equal(noneUnder.topFreeHref, FREE);
  await shot("1099-result-none-withholding-1280.png");

  await answer(NEC);
  const buyAgain = await stateOf();
  assert.equal(buyAgain.linkVisible, false);
  assert.equal(buyAgain.cta, "buy");
  assert.equal(buyAgain.topPaid, false);
  assert.equal(buyAgain.topFree, false);
  assert.equal(buyAgain.footerPaid, false);
  assert.equal(buyAgain.lead.includes(WITHHELD), false);
  assert.equal(buyAgain.stickyHref, "");
  assert.equal(buyAgain.refundVisible, false);

  await answer(UNDER);
  const noneAgain = await stateOf();
  assert.equal(noneAgain.lead, NONE_LEAD);
  assert.equal(noneAgain.linkVisible, false);
  assert.equal(noneAgain.buyButtons, 0);
  assert.equal(noneAgain.cta, "nofit");
  assert.equal(noneAgain.topPaid, false);
  assert.equal(noneAgain.stickyHref, "");
  assert.equal(noneAgain.refundVisible, false);

  await page.setViewportSize({ width: 390, height: 844 });
  for (const item of CASES) {
    await answer(item.answers);
    const box = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      sticky: !!document.getElementById("kit-sticky")
    }));
    assert.equal(box.sw, box.cw, item.key + " " + JSON.stringify(box));
    assert.equal(box.sticky, false, item.key + " sticky");
    await shot("1099-result-" + item.key + "-390.png");
  }
  await answer(UNDER);
  const mobileUnder = await stateOf();
  assert.equal(mobileUnder.lead, NONE_LEAD);
  assert.equal(mobileUnder.leadVisible, true);
  assert.equal(mobileUnder.linkVisible, false);
  assert.equal(mobileUnder.buyButtons, 0);
  assert.equal(mobileUnder.cta, "nofit");
  assert.equal(mobileUnder.stickyHref, "");
  assert.equal(mobileUnder.refundVisible, false);
  const mobileBox = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    sticky: !!document.getElementById("kit-sticky")
  }));
  assert.equal(mobileBox.sw, mobileBox.cw, JSON.stringify(mobileBox));
  assert.equal(mobileBox.sticky, false);
  await shot("1099-result-none-withholding-390.png");
  await page.evaluate(() => {
    document.getElementById("result-kit-lead").scrollIntoView({ block: "start" });
  });
  if (shots) {
    await page.screenshot({ path: path.join(shots, "1099-result-none-withholding-390-view.png") });
  }
  await page.setViewportSize({ width: 1280, height: 1400 });
  const wide = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth
  }));
  assert.equal(wide.sw, wide.cw);

  const tagged = await context.newPage();
  await tagged.clock.install({ time: new Date(BEFORE_CUTOFF) });
  await tagged.clock.setFixedTime(new Date(BEFORE_CUTOFF));
  await tagged.goto(pathToFileURL(PAGE).href + "?utm_source=tiktok", { waitUntil: "load" });
  await tagged.evaluate(() => {
    ["purpose", "who", "method", "noncard"].forEach((name) => {
      const want = { purpose: "business", who: "contractor", method: "noncard", noncard: "least" }[name];
      const nodes = document.getElementsByName(name);
      for (let i = 0; i < nodes.length; i++) nodes[i].checked = nodes[i].value === want;
    });
  });
  await tagged.click("#go");
  assert.equal(await tagged.locator("#kit-result").count(), 0);
  assert.equal(await tagged.locator("a[href*='fire-to-iris-switch-checklist']").count(), 0);
  await tagged.evaluate((input) => {
    ["purpose", "who", "method", "noncard"].forEach((name) => {
      const nodes = document.getElementsByName(name);
      for (let i = 0; i < nodes.length; i++) nodes[i].checked = nodes[i].value === input[name];
    });
  }, UNDER);
  await tagged.click("#go");
  const keptNone = await tagged.evaluate(() => {
    return {
      link: !!document.getElementById("kit-result"),
      lead: document.getElementById("result-kit-lead").textContent
    };
  });
  assert.equal(keptNone.link, false);
  assert.equal(keptNone.lead, NONE_LEAD);

  await answer(UNDER);
  const liveCutoff = await page.evaluate(() => ({
    before: window.FMP_FIRE_KIT.expired(new Date("2026-11-19T19:59:59Z")),
    at: window.FMP_FIRE_KIT.expired(new Date("2026-11-19T20:00:00Z"))
  }));
  assert.equal(liveCutoff.before, false);
  assert.equal(liveCutoff.at, true);
  const beforeExpiry = await stateOf();
  assert.equal(beforeExpiry.lead, NONE_LEAD);
  assert.equal(beforeExpiry.linkVisible, false);
  assert.equal(beforeExpiry.refundVisible, false);
  assert.equal(beforeExpiry.className, "");
  await page.evaluate(() => {
    const RealDate = Date;
    const frozen = new RealDate(window.FMP_FIRE_KIT.CUTOFF);
    function FrozenDate(...args) {
      if (!(this instanceof FrozenDate)) return RealDate();
      if (args.length === 0) return new RealDate(frozen.getTime());
      return new RealDate(...args);
    }
    FrozenDate.now = function () { return frozen.getTime(); };
    FrozenDate.parse = RealDate.parse;
    FrozenDate.UTC = RealDate.UTC;
    FrozenDate.prototype = RealDate.prototype;
    window.Date = FrozenDate;
    window.FMP_FIRE_KIT.hide(frozen);
  });
  await answer(UNDER);
  const expiredNone = await stateOf();
  assert.equal(expiredNone.lead, NONE_LEAD);
  assert.equal(expiredNone.leadVisible, true);
  assert.equal(expiredNone.linkVisible, false);
  assert.equal(expiredNone.refundVisible, false);
  assert.equal(expiredNone.buyButtons, 0);
  assert.equal(expiredNone.topPaid, false);
  assert.equal(expiredNone.topFree, true);
  assert.equal(expiredNone.topFreeHref, FREE);
  assert.equal(expiredNone.footerPaid, false);
  assert.equal(expiredNone.cta, "nofit");
  assert.equal(expiredNone.stickyHref, "");
  assert.equal(await page.locator("#kit-sticky").count(), 0);
  await shot("1099-result-none-expired-1280.png");
  await answer(NEC);
  const expiredBuy = await stateOf();
  assert.equal(expiredBuy.problem, "1099-NEC is likely yours to file");
  assert.equal(expiredBuy.lead.includes(WITHHELD), false);
  assert.equal(expiredBuy.linkVisible, false);
  assert.equal(expiredBuy.refundVisible, false);
  assert.equal(expiredBuy.topPaid, false);
  assert.equal(expiredBuy.topFree, false);
  assert.equal(expiredBuy.footerPaid, false);
  assert.equal(expiredBuy.buyButtons, 0);
  assert.equal(await page.locator("#kit-sticky").count(), 0);
  assert.deepEqual(errors.filter((item) => item.indexOf("Failed to fetch") === -1), []);

  const closed = await context.newPage();
  await closed.clock.install({ time: new Date(AFTER_CUTOFF) });
  await closed.clock.setFixedTime(new Date(AFTER_CUTOFF));
  await blockExternalOnPage(closed);
  await closed.goto(pathToFileURL(PAGE).href, { waitUntil: "load" });
  const closedText = await closed.locator("body").innerText();
  assert.equal(closedText.includes(FIRE_ENDED), true);
  assert.equal(closedText.includes(IRIS_GUIDANCE), true);
  assert.equal(await closed.locator("a[href*='gumroad.com']:visible").count(), 0);
  assert.equal(await closed.evaluate(() => window.FMP_FIRE_KIT_KEEP_SELLING), false);
  assert.equal(await closed.locator("#deadline-reminder-h").innerText(), "The FIRE deadline has passed. Get the weekly email for the next deadline");
  assert.equal(await closed.locator("#deadline-reminder-submit").innerText(), "Get the weekly deadline email");
  await closed.setViewportSize({ width: 390, height: 844 });
  for (const item of CASES) {
    await closed.evaluate((input) => {
      ["purpose", "who", "method", "noncard"].forEach((name) => {
        const nodes = document.getElementsByName(name);
        for (let i = 0; i < nodes.length; i++) nodes[i].checked = nodes[i].value === input[name];
      });
    }, item.answers);
    await closed.click("#go");
    const state = await closed.evaluate(() => {
      function shown(el) {
        if (!el) return false;
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      }
      const link = document.getElementById("kit-result");
      const sticky = document.getElementById("kit-sticky");
      return {
        problem: document.getElementById("result-problem").textContent,
        lead: document.getElementById("result-kit-lead").textContent,
        leadVisible: shown(document.getElementById("result-kit-lead")),
        linkVisible: shown(link),
        refundVisible: shown(document.getElementById("kit-refund")),
        topPaid: shown(document.getElementById("kit-top-offer")),
        topFree: shown(document.getElementById("kit-top-free")),
        stickyVisible: shown(sticky),
        stickyText: sticky ? document.getElementById("kit-sticky-link").textContent : "",
        gumroad: [...document.querySelectorAll("a[href*='gumroad.com']")].filter(shown).length
      };
    });
    const selling = /the checklist puts/i.test(item.lead);
    assert.equal(state.problem, item.headline, item.key);
    assert.equal(state.lead, item.lead, item.key);
    assert.equal(state.leadVisible, !selling, item.key);
    assert.equal(state.linkVisible, false, item.key);
    assert.equal(state.refundVisible, false, item.key);
    assert.equal(state.topPaid, false, item.key);
    assert.equal(state.gumroad, 0, item.key);
    if (item.nofit) {
      assert.equal(state.topFree, true, item.key);
    } else {
      assert.equal(state.topFree, false, item.key);
    }
    assert.equal(state.stickyVisible, false, item.key);
  }
  await closed.close();
  } finally {
    await browser.close();
  }
});
