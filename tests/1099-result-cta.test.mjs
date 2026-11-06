// Outcome-specific result CTA on the 1099-NEC or 1099-K check.
// Headless run:
//   PLAYWRIGHT_CORE=/tmp/issue07-pw/node_modules/playwright-core/index.mjs NEC_CTA_SHOTS=/opt/cursor/artifacts/1099-result-cta node --test tests/1099-result-cta.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PAGE = path.join(ROOT, "tools/1099-nec-or-1099-k-check/index.html");
const REFUND = "Refunds: within 30 days if a file is corrupt or materially not as described.";
const DISCLAIMER = "General guidance, not legal, tax or IT advice.";
const IRS = "Not affiliated with or endorsed by the IRS.";
const BUTTON = "Get the $9 checklist (instant PDF)";
const QUIET = "Optional: $9 checklist (instant PDF)";
const FREE = "/tools/fire-to-iris-check/";

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
    headline: "Likely no 1099 needed",
    lead: "You likely do not need to buy a checklist for this payment. Watch the $2,000 threshold on cash, check, bank transfer, and ACH payments, and keep notes on who you paid and how.",
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
  const mod = process.env.PLAYWRIGHT_CORE || "playwright-core";
  const { chromium } = await import(mod);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
  const page = await context.newPage();
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
      const style = getComputedStyle(link);
      const url = new URL(link.href);
      const sticky = document.getElementById("kit-sticky-link");
      const stickyUrl = sticky.getAttribute("href") || "";
      return {
        problem: document.getElementById("result-problem").textContent,
        lead: document.getElementById("result-kit-lead").textContent,
        linkText: link.textContent,
        className: link.className,
        linkVisible: shown(link),
        refundVisible: shown(refund),
        refund: refund.textContent,
        disclaimer: disclaimer.textContent,
        disclaimerVisible: shown(disclaimer),
        irs: irs.textContent,
        irsVisible: shown(irs),
        bg: style.backgroundColor,
        color: style.color,
        deco: style.textDecorationLine,
        content: url.searchParams.get("utm_content"),
        source: url.searchParams.get("utm_source"),
        medium: url.searchParams.get("utm_medium"),
        campaign: url.searchParams.get("utm_campaign"),
        wanted: url.searchParams.get("wanted"),
        click: link.getAttribute("data-goatcounter-click"),
        buyButtons: document.querySelectorAll("#result-cta a.btn").length,
        topPaid: shown(document.getElementById("kit-top-offer")),
        topFree: shown(document.getElementById("kit-top-free")),
        topFreeHref: document.getElementById("kit-top-free-link").getAttribute("href"),
        footerPaid: shown(document.getElementById("kit-footer-offer")),
        footerFree: shown(document.getElementById("kit-footer-free")),
        stickyHref: stickyUrl,
        stickyText: sticky.textContent,
        stickyLabel: document.getElementById("kit-sticky-label").textContent,
        stickyClick: sticky.getAttribute("data-goatcounter-click"),
        linkTop: link.getBoundingClientRect().top,
        refundTop: refund.getBoundingClientRect().top,
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
    assert.equal(state.lead, item.lead, item.key);
    assert.equal(state.linkVisible, true, item.key);
    assert.equal(state.refundVisible, true, item.key);
    assert.equal(state.refund, REFUND, item.key);
    assert.equal(state.disclaimer, DISCLAIMER, item.key);
    assert.equal(state.disclaimerVisible, true, item.key);
    assert.equal(state.irs, IRS, item.key);
    assert.equal(state.irsVisible, true, item.key);
    assert.ok(state.linkTop < state.refundTop, item.key);
    assert.ok(state.refundTop < state.disclaimerTop, item.key);
    assert.ok(state.disclaimerTop < state.irsTop, item.key);
    assert.equal(state.content, item.utm, item.key);
    assert.equal(state.source, "site", item.key);
    assert.equal(state.medium, "site", item.key);
    assert.equal(state.campaign, "1099-nec-or-1099-k-check", item.key);
    assert.equal(state.wanted, "true", item.key);
    assert.equal(state.click, "cta/" + item.utm, item.key);
    assert.equal(state.topFreeHref, FREE, item.key);
    assert.equal(state.footerFree, true, item.key);
    if (item.quiet) {
      assert.equal(state.linkText, QUIET, item.key);
      assert.equal(state.className, "paid-quiet", item.key);
      assert.equal(state.buyButtons, 0, item.key);
      assert.equal(state.bg, "rgba(0, 0, 0, 0)", item.key);
      assert.equal(state.color, "rgb(0, 85, 255)", item.key);
      assert.equal(state.deco, "underline", item.key);
    } else {
      assert.equal(state.linkText, BUTTON, item.key);
      assert.equal(state.className, "btn", item.key);
      assert.equal(state.buyButtons, 1, item.key);
      assert.equal(state.bg, "rgb(0, 85, 255)", item.key);
      assert.equal(state.color, "rgb(255, 255, 255)", item.key);
    }
    if (item.nofit) {
      assert.equal(state.cta, "nofit", item.key);
      assert.equal(state.topPaid, false, item.key);
      assert.equal(state.topFree, true, item.key);
      assert.equal(state.footerPaid, false, item.key);
      assert.equal(state.stickyHref, FREE, item.key);
      assert.equal(state.stickyText, "Open the free check", item.key);
      assert.equal(state.stickyLabel, "Free FIRE to IRIS check", item.key);
      assert.equal(state.stickyClick, "cta/1099-sticky-free-fire", item.key);
    } else {
      assert.equal(state.cta, "buy", item.key);
      assert.equal(state.topPaid, true, item.key);
      assert.equal(state.topFree, false, item.key);
      assert.equal(state.footerPaid, true, item.key);
      assert.equal(state.stickyText, "Get the checklist", item.key);
      assert.equal(state.stickyLabel, "$9 FIRE to IRIS checklist", item.key);
      assert.match(state.stickyHref, /utm_content=fire-check-sticky/, item.key);
      assert.match(state.stickyHref, /fire-to-iris-switch-checklist/, item.key);
    }
    const tracked = await page.evaluate(() => {
      window.__gc = [];
      window.goatcounter = window.goatcounter || {};
      window.goatcounter.count = (payload) => { window.__gc.push(payload); };
      document.getElementById("kit-result").click();
      return window.__gc.map((row) => row.path);
    });
    assert.equal(tracked.includes("gumroad-click/fire-to-iris-switch-checklist"), true, item.key + " " + tracked.join(","));
    await shot("1099-result-" + item.key + "-1280.png");
  }

  await page.setViewportSize({ width: 390, height: 844 });
  for (const item of CASES) {
    await answer(item.answers);
    const box = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      sticky: !!(document.getElementById("kit-sticky").offsetWidth || document.getElementById("kit-sticky").offsetHeight)
    }));
    assert.equal(box.sw, box.cw, item.key + " " + JSON.stringify(box));
    assert.equal(box.sticky, true, item.key + " sticky");
    await shot("1099-result-" + item.key + "-390.png");
  }
  await page.setViewportSize({ width: 1280, height: 1400 });
  const wide = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth
  }));
  assert.equal(wide.sw, wide.cw);

  const tagged = await context.newPage();
  await tagged.goto(pathToFileURL(PAGE).href + "?utm_source=tiktok", { waitUntil: "load" });
  await tagged.evaluate(() => {
    ["purpose", "who", "method", "noncard"].forEach((name) => {
      const want = { purpose: "business", who: "contractor", method: "noncard", noncard: "least" }[name];
      const nodes = document.getElementsByName(name);
      for (let i = 0; i < nodes.length; i++) nodes[i].checked = nodes[i].value === want;
    });
  });
  await tagged.click("#go");
  const kept = await tagged.evaluate(() => {
    const url = new URL(document.getElementById("kit-result").href);
    return {
      source: url.searchParams.get("utm_source"),
      content: url.searchParams.get("utm_content")
    };
  });
  assert.equal(kept.source, "tiktok");
  assert.equal(kept.content, "1099-result-nec");
  assert.deepEqual(errors.filter((item) => item.indexOf("Failed to fetch") === -1), []);
  await browser.close();
});
