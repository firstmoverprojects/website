// Outcome-specific result CTA on the Etsy real-photo check.
// Headless run:
//   npm install --prefix /tmp/issue07-pw playwright-core
//   PLAYWRIGHT_CORE=/tmp/issue07-pw/node_modules/playwright-core/index.mjs ETSY_CTA_SHOTS=/opt/cursor/artifacts node --test tests/etsy-photo-result-cta.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PAGE = path.join(ROOT, "tools/etsy-photo-audit-check/index.html");
const html = readFileSync(PAGE, "utf8");
const DISCLAIMER = "General guidance, not legal, tax or IT advice.";
const REFUND = "Refunds: within 30 days if a file is corrupt or materially not as described.";
const THANKS = "Thanks for your time. If this isn't right for you, please share it with someone it could help.";
const BUTTON = "Get my photo-fix checklist (PDF + CSV in a ZIP)";
const QUIET = "Optional: photo-fix checklist (PDF + CSV in a ZIP, $9)";
const AFTER = "Opens Gumroad. ZIP download after you pay (3-page PDF + CSV sheet). Close the tab anytime with no purchase.";
const PRICE_NOTE = "The $9 kit is a separate file on Gumroad. This page does not send your listings there.";
const DEADLINE = "Etsy posted this rule on Oct 22, 2026. They did not name a last day. Etsy says it plans to begin proactively enforcing the photo rule in early 2027, with notice first. If the photos are wrong and a buyer opens a case now, you may have to give a refund.";
const LEADS = {
  empty: "Because you have not checked a listing row, paste up to 10 listing rows, or fill in one listing with the toggles.",
  mockup: "Because you marked a first photo as a mockup or a computer picture, add at least one unedited photo of the real item on a real background. The checklist lists which photos to take for each kind of item, plus a sheet with one row per listing.",
  disclosure: "Because you marked a production partner as not disclosed on the listing, add the production-partner disclosure before you rely on the listing.",
  fix: "Because you have something to fix on your listing, the checklist lists which photos to take for each kind of item, plus a sheet with one row per listing.",
  ontrack: "Because you checked rows and these checks did not find a problem, the checklist is optional. It lists which photos to take for each kind of item, plus a sheet with one row per listing."
};
const PROBLEMS = {
  empty: "No listing rows were checked.",
  mockup: "You marked a first photo as a mockup or a computer picture.",
  disclosure: "You marked a production partner as not disclosed on the listing.",
  fix: "This check found something to fix on your listing.",
  ontrack: "These checks did not find a problem on the rows you entered."
};

test("result copy stays on the page facts and keeps the house lines", () => {
  for (const key of Object.keys(LEADS)) {
    assert.equal(html.includes(LEADS[key]), true, key);
    assert.equal(LEADS[key].includes("\u2014"), false, key);
    assert.equal(LEADS[key].includes("\u2013"), false, key);
    assert.equal(LEADS[key].startsWith("Because you "), true, key);
  }
  assert.equal(html.includes(THANKS), true);
  assert.equal(html.includes("Thank you for your time."), false);
  assert.equal(html.includes(DEADLINE), true);
  assert.equal(html.includes("\u2014"), false);
  assert.equal(html.split(REFUND).length - 1, 6);
  for (const id of ["gtin-checkout", "paid-link"]) {
    const at = html.indexOf(`id="${id}"`);
    const next = html.slice(at, html.indexOf("</p>", html.indexOf("</p>", at) + 4));
    assert.equal(next.includes(REFUND), true, id);
  }
  assert.equal(html.split('id="kit-after-click"').length - 1, 1);
  assert.equal(html.split(AFTER).length - 1, 1);
  assert.equal(html.includes(BUTTON), true);
  assert.equal(html.includes(QUIET), true);
  assert.equal(QUIET.includes("$9"), true);
  assert.equal(html.includes("Get the $9 photo checklist (PDF + CSV in a ZIP)"), true);
  assert.equal(html.includes("Optional: $9 photo checklist on Gumroad"), true);
  assert.equal(html.includes(PRICE_NOTE), true);
  assert.equal(html.includes("INSTANT DOWNLOAD · 3-PAGE PDF SHOT LIST + CSV LISTING AUDIT SHEET · $9"), true);
  assert.equal(/2[- ]page/i.test(html), false);
  assert.match(html, /id="kit-offer"[^>]*>[\s\S]*id="kit-result"[\s\S]*id="kit-after-click"[^>]*>Opens Gumroad\. ZIP download after you pay \(3-page PDF \+ CSV sheet\)\. Close the tab anytime with no purchase\.<\/span><span class="kit-refund" id="kit-refund">Refunds: within 30 days if a file is corrupt or materially not as described\.<\/span>/);
  assert.match(html, /id="result-kit-lead"/);
  assert.match(html, /data-goatcounter-click="cta\/etsy-photo-result-mockup"/);
  assert.match(html, /utm_content=etsy-photo-result-mockup/);
  assert.match(html, /href="https:\/\/firstmoverprojects\.gumroad\.com\/l\/lnfgc\?/);
  const card = html.slice(html.indexOf('id="result-cta"'), html.indexOf('<h2>Current Listing Risk'));
  const leadAt = card.indexOf('id="result-kit-lead"');
  const offerAt = card.indexOf('id="kit-offer"');
  const afterAt = card.indexOf('id="kit-after-click"');
  const refundAt = card.indexOf('id="kit-refund"');
  const disclaimerAt = card.indexOf('class="disclaimer"');
  const thanksAt = card.indexOf('class="thanks"');
  assert.ok(leadAt < offerAt && offerAt < afterAt && afterAt < refundAt && refundAt < disclaimerAt && disclaimerAt < thanksAt);
  assert.equal(card.split(DISCLAIMER).length - 1, 1);
  assert.equal(card.split(REFUND).length - 1, 1);
  assert.equal(card.split(AFTER).length - 1, 1);
});

test("photo-rule copy matches Etsy's Nov 2026 help text", () => {
  assert.equal(html.includes("Replace the mockup"), false);
  assert.equal(html.includes("the first shot is an unedited photo"), false);
  assert.equal(html.includes("That first-photo line does not say"), false);
  assert.match(html, /does not have to be the first photo/);
  assert.match(html, /You can crop or resize that photo, add a watermark, or change its file format, without AI tools\./);
  assert.match(html, /One unedited photo per listing is enough, even with variations\./);
  assert.match(html, /stock-photo mockup is allowed if the stock photo's owner has authorized it/);
  assert.match(html, /proactively enforcing the image requirements in early 2027/);
  assert.match(html, /help\.etsy\.com\/hc\/en-us\/articles\/44297885802647-/);
  assert.match(html, /<form id="deadline-reminder-form" aria-labelledby="deadline-reminder-h"/);
  assert.match(html, /privacy\.html#newsletter/);
  assert.equal(html.includes("The form sends only the email address you type"), false);
  for (const id of ["what", "who", "not-for", "you-get"]) assert.match(html, new RegExp(`<p id="${id}"><strong>`), id);
});

test("all five outcomes set the lead, offer, and gumroad click at 1280 and 390", async () => {
  const mod = process.env.PLAYWRIGHT_CORE || "playwright-core";
  const { chromium } = await import(mod);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 2000 }
  });
  const page = await context.newPage();
  const shots = process.env.ETSY_CTA_SHOTS;
  if (shots) mkdirSync(shots, { recursive: true });
  await page.goto(pathToFileURL(PAGE).href, { waitUntil: "load" });
  await page.evaluate(() => {
    document.addEventListener("click", (ev) => {
      const node = ev.target && ev.target.closest ? ev.target.closest("a") : null;
      if (!node) return;
      const href = node.getAttribute("href") || "";
      if (href.indexOf("firstmoverprojects.gumroad.com/l/") !== -1) ev.preventDefault();
    }, true);
  });

  async function runPaste(text) {
    await page.fill("#inp", text);
    await page.click("#go");
  }

  async function offerState() {
    return page.evaluate(() => {
      const link = document.getElementById("kit-result");
      const offer = document.getElementById("kit-offer");
      const refund = document.getElementById("kit-refund");
      const after = document.getElementById("kit-after-click");
      const lead = document.getElementById("result-kit-lead");
      const disclaimer = document.querySelector("#result-cta .disclaimer");
      const thanks = document.querySelector("#result-cta .thanks");
      const card = document.getElementById("result-cta");
      const style = getComputedStyle(link);
      const afterStyle = getComputedStyle(after);
      const url = new URL(link.href);
      const visible = (node) => !!(node && (node.offsetWidth || node.offsetHeight || node.getClientRects().length));
      const afterBox = after.getBoundingClientRect();
      const linkBox = link.getBoundingClientRect();
      return {
        lead: lead.textContent,
        problem: document.getElementById("result-problem").textContent,
        deadline: document.getElementById("result-deadline").textContent,
        linkVisible: visible(link),
        offerVisible: visible(offer),
        refund: refund.textContent,
        refundVisible: visible(refund),
        disclaimer: disclaimer.textContent,
        disclaimerVisible: visible(disclaimer),
        thanks: thanks.textContent,
        thanksVisible: visible(thanks),
        linkText: link.textContent,
        className: link.className,
        bg: style.backgroundColor,
        color: style.color,
        deco: style.textDecorationLine,
        display: style.display,
        linkH: linkBox.height,
        content: url.searchParams.get("utm_content"),
        source: url.searchParams.get("utm_source"),
        medium: url.searchParams.get("utm_medium"),
        campaign: url.searchParams.get("utm_campaign"),
        wanted: url.searchParams.get("wanted"),
        pathname: url.pathname,
        click: link.getAttribute("data-goatcounter-click"),
        steps: document.querySelectorAll("#next-steps li").length,
        leadBottom: lead.getBoundingClientRect().bottom,
        linkTop: linkBox.top,
        linkBottom: linkBox.bottom,
        afterText: after.textContent,
        afterVisible: visible(after),
        afterHidden: after.hidden,
        afterDisplay: afterStyle.display,
        afterCount: document.querySelectorAll("#kit-after-click").length,
        afterTop: afterBox.top,
        afterBottom: afterBox.bottom,
        afterRight: afterBox.right,
        afterFont: parseFloat(afterStyle.fontSize),
        cardText: card.innerText,
        offerText: offer.innerText,
        resultsText: document.getElementById("results").innerText,
        clientWidth: document.documentElement.clientWidth,
        refundTop: refund.getBoundingClientRect().top,
        disclaimerTop: disclaimer.getBoundingClientRect().top,
        thanksTop: thanks.getBoundingClientRect().top,
        footerAdvice: document.querySelector("footer").innerText.includes("General guidance, not legal, tax or IT advice."),
        footerQuiet: document.getElementById("paid-link").textContent,
        refundSpans: document.querySelectorAll("#result-cta .kit-refund").length,
        buyButtons: document.querySelectorAll("#result-cta a.btn").length
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
      const end = document.querySelector("#result-cta .thanks").getBoundingClientRect();
      const x = Math.max(0, Math.floor(start.left - 8));
      const y = Math.max(0, Math.floor(Math.min(start.top, end.top) - 8));
      const bottom = Math.max(start.bottom, end.bottom);
      return {
        x,
        y,
        width: Math.max(1, Math.min(window.innerWidth - x, Math.ceil(start.width + 16))),
        height: Math.max(1, Math.min(window.innerHeight - y, Math.ceil(bottom - y + 8)))
      };
    });
    await page.screenshot({ path: path.join(shots, name), clip });
  }

  async function assertNoHScroll(label) {
    const box = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth
    }));
    assert.equal(box.sw, box.cw, label + " " + JSON.stringify(box));
  }

  const cases = [
    {
      key: "empty",
      paste: "title,photos,primary,variations,disclosure",
      hide: true,
      file: "etsy-photo-empty"
    },
    {
      key: "mockup",
      paste: "FAKE wall print,1,mockup,missing,missing",
      hide: false,
      quiet: false,
      content: "etsy-photo-result-mockup",
      file: "etsy-photo-mockup"
    },
    {
      key: "disclosure",
      paste: "FAKE gift gift gift coaster,5,real,linked,missing",
      hide: true,
      file: "etsy-photo-disclosure"
    },
    {
      key: "fix",
      paste: "FAKE blue mug,5,real,missing,not-needed",
      hide: false,
      quiet: false,
      content: "etsy-photo-result-fix",
      file: "etsy-photo-fix"
    },
    {
      key: "ontrack",
      paste: "FAKE blue mug,5,real,linked,not-needed",
      hide: false,
      quiet: true,
      content: "etsy-photo-result-ontrack",
      file: "etsy-photo-ontrack"
    }
  ];

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 2000 });
    for (const item of cases) {
      await runPaste(item.paste);
      const state = await offerState();
      assert.equal(state.problem, PROBLEMS[item.key], width + " " + item.key);
      assert.equal(state.lead, LEADS[item.key], width + " " + item.key);
      assert.equal(state.deadline, DEADLINE, width + " " + item.key);
      assert.equal(state.disclaimer, DISCLAIMER, width + " " + item.key);
      assert.equal(state.disclaimerVisible, true, width + " " + item.key);
      assert.equal(state.thanks, THANKS, width + " " + item.key);
      assert.equal(state.thanksVisible, true, width + " " + item.key);
      assert.equal(state.footerAdvice, true, width + " " + item.key);
      assert.equal(state.refund, REFUND, width + " " + item.key);
      assert.equal(state.afterCount, 1, width + " " + item.key);
      assert.equal(state.afterText, AFTER, width + " " + item.key);
      assert.equal(state.footerQuiet, "Optional: $9 photo checklist on Gumroad", width + " " + item.key);
      assert.equal(state.resultsText.includes(PRICE_NOTE), true, width + " " + item.key);
      assert.ok(state.steps >= 2 && state.steps <= 3, width + " " + item.key + " steps " + state.steps);
      assert.ok(state.disclaimerTop < state.thanksTop, width + " " + item.key);
      if (item.hide) {
        assert.equal(state.linkVisible, false, width + " " + item.key);
        assert.equal(state.offerVisible, false, width + " " + item.key);
        assert.equal(state.refundVisible, false, width + " " + item.key);
        assert.equal(state.afterVisible, false, width + " " + item.key);
        assert.equal(state.afterHidden, true, width + " " + item.key);
        assert.equal(state.afterDisplay, "none", width + " " + item.key);
        assert.equal(state.cardText.includes(AFTER), false, width + " " + item.key);
        assert.ok(state.leadBottom <= state.disclaimerTop + 1, width + " " + item.key);
      } else {
        assert.equal(state.linkVisible, true, width + " " + item.key);
        assert.equal(state.offerVisible, true, width + " " + item.key);
        assert.equal(state.refundVisible, true, width + " " + item.key);
        assert.equal(state.afterVisible, true, width + " " + item.key);
        assert.equal(state.afterHidden, false, width + " " + item.key);
        assert.equal(state.afterDisplay, "block", width + " " + item.key);
        assert.equal(state.cardText.includes(AFTER), true, width + " " + item.key);
        assert.equal(state.offerText.includes(AFTER), true, width + " " + item.key);
        assert.ok(state.linkH >= 44, width + " " + item.key + " link " + state.linkH);
        assert.ok(state.afterFont >= 13, width + " " + item.key + " font " + state.afterFont);
        assert.ok(state.linkBottom <= state.afterTop + 1, width + " " + item.key + " overlap " + (state.afterTop - state.linkBottom));
        assert.ok(state.afterTop - state.linkBottom <= 24, width + " " + item.key + " gap " + (state.afterTop - state.linkBottom));
        assert.ok(state.afterBottom <= state.refundTop + 1, width + " " + item.key);
        assert.ok(state.afterRight <= state.clientWidth + 1, width + " " + item.key + " right " + state.afterRight);
        assert.ok(state.linkBottom <= state.refundTop + 1, width + " " + item.key);
        assert.equal(state.content, item.content, width + " " + item.key);
        assert.equal(state.source, "site", width + " " + item.key);
        assert.equal(state.medium, "offer_page", width + " " + item.key);
        assert.equal(state.campaign, "etsy-photo-audit-check", width + " " + item.key);
        assert.equal(state.wanted, "true", width + " " + item.key);
        assert.equal(state.pathname.endsWith("/l/lnfgc"), true, width + " " + item.key);
        assert.equal(state.click, "cta/" + item.content, width + " " + item.key);
        assert.ok(state.linkBottom <= state.disclaimerTop + 1, width + " " + item.key);
        if (item.quiet) {
          assert.equal(state.linkText, QUIET, width + " " + item.key);
          assert.equal(state.offerText.includes("$9"), true, width + " " + item.key);
          assert.equal(state.className, "paid-quiet", width + " " + item.key);
          assert.equal(state.buyButtons, 0, width + " " + item.key);
          assert.equal(state.bg, "rgba(0, 0, 0, 0)", width + " " + item.key);
          assert.equal(state.color, "rgb(0, 85, 255)", width + " " + item.key);
          assert.equal(state.deco, "underline", width + " " + item.key);
          assert.equal(state.display, "inline-block", width + " " + item.key);
        } else {
          assert.equal(state.linkText, BUTTON, width + " " + item.key);
          assert.equal(state.className, "btn", width + " " + item.key);
          assert.equal(state.buyButtons, 1, width + " " + item.key);
          assert.equal(state.bg, "rgb(0, 85, 255)", width + " " + item.key);
          assert.equal(state.color, "rgb(255, 255, 255)", width + " " + item.key);
        }
        const tracked = await page.evaluate(() => {
          window.__gc = [];
          window.goatcounter = window.goatcounter || {};
          window.goatcounter.count = (payload) => { window.__gc.push(payload); };
          document.getElementById("kit-result").click();
          return window.__gc.map((row) => row.path);
        });
        assert.equal(tracked.includes("gumroad-click/lnfgc"), true, width + " " + item.key + " " + tracked.join(","));
      }
      await assertNoHScroll(width + " " + item.key);
      await shot(item.file + "-" + width + ".png");
    }
  }

  await page.setViewportSize({ width: 1280, height: 2000 });
  await runPaste("FAKE wall print,1,mockup,missing,missing");
  let priority = await offerState();
  assert.equal(priority.problem, PROBLEMS.mockup);
  assert.equal(priority.content, "etsy-photo-result-mockup");
  assert.equal(priority.linkText, BUTTON);
  assert.equal(priority.afterVisible, true);
  assert.equal(priority.afterText, AFTER);
  assert.equal(priority.resultsText.includes(PRICE_NOTE), true);
  await runPaste("FAKE mug,1,real,linked,not-needed");
  priority = await offerState();
  assert.equal(priority.problem, PROBLEMS.ontrack);
  assert.equal(priority.linkText, QUIET);
  assert.equal(priority.offerText.includes("$9"), true);
  assert.equal(priority.afterVisible, true);
  assert.equal(priority.afterText, AFTER);
  assert.equal(priority.content, "etsy-photo-result-ontrack");

  const footer = await page.evaluate(() => {
    window.__gc = [];
    window.goatcounter.count = (payload) => { window.__gc.push(payload); };
    document.getElementById("paid-link").click();
    const url = new URL(document.getElementById("paid-link").href);
    return {
      paths: window.__gc.map((row) => row.path),
      content: url.searchParams.get("utm_content")
    };
  });
  assert.equal(footer.content, "footer");
  assert.equal(footer.paths.includes("gumroad-click/lnfgc"), true, footer.paths.join(","));

  const tagged = await context.newPage();
  await tagged.goto(pathToFileURL(PAGE).href + "?utm_source=tiktok", { waitUntil: "load" });
  await tagged.click("#go");
  const kept = await tagged.evaluate(() => {
    const url = new URL(document.getElementById("kit-result").href);
    return {
      source: url.searchParams.get("utm_source"),
      content: url.searchParams.get("utm_content"),
      text: document.getElementById("kit-result").textContent,
      lead: document.getElementById("result-kit-lead").textContent,
      after: document.getElementById("kit-after-click").textContent,
      afterHidden: document.getElementById("kit-after-click").hidden
    };
  });
  assert.equal(kept.source, "tiktok");
  assert.equal(kept.content, "etsy-photo-result-fix");
  assert.equal(kept.text, BUTTON);
  assert.equal(kept.lead, LEADS.fix);
  assert.equal(kept.after, AFTER);
  assert.equal(kept.afterHidden, false);

  await browser.close();
});
