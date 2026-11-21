// Outcome-specific result CTA on the FIRE to IRIS check.
// Headless run:
//   npm install --prefix /tmp/issue07-pw playwright-core
//   PLAYWRIGHT_CORE=/tmp/issue07-pw/node_modules/playwright-core/index.mjs FIRE_CTA_SHOTS=/tmp/artifacts node --test tests/fire-result-cta.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { blockExternalOnPage, chromiumLaunchOptions, importChromium } from "./playwright-helpers.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PAGE = path.join(ROOT, "tools/fire-to-iris-check/index.html");
const html = readFileSync(PAGE, "utf8");
const QUESTION = "Will you file our tax year 2026 information returns through IRIS?";
const SHARE_TITLE = "IRS FIRE Replacement: File 1099s in IRIS (Free CSV Check)";
const SHARE_DESC = "The IRS FIRE system closed Nov 19, 2026. IRIS replaces it for 1099 e-filing. Free check: test your 1099 CSV headers before an IRIS upload. Nothing uploads.";
const LEAD = "The IRS FIRE system closed for filing on Nov 19, 2026 at 3 p.m. ET.";
const REFUND = "Refunds: within 30 days if a file is corrupt or materially not as described.";
const DISCLAIMER = "General guidance, not legal, tax or IT advice.";
const BUTTON = "Get the $9 checklist (PDF in a ZIP)";
const QUIET = "Optional: $9 checklist (PDF in a ZIP)";
const LEADS = {
  A: "The checklist is for people who file their own 1099s. If your provider files for you, you don't need it. Copy the question below and send it to them instead: \"" + QUESTION + "\"",
  B: "Because you file yourself and don't have an IRIS TCC yet, this is the step that matters most. The checklist walks through the IRIS Application for TCC and your FIRE account steps on 3 pages, with the IRS dates and links at the top.",
  C: "Because Nov 9, 2026 has passed, existing IR TCC applications are read-only. The checklist puts the IRIS TCC steps and the other IRS dates on one printable list.",
  D: "Because you still have returns or corrections to file, the checklist lists the IRS dates and links, your IRIS TCC steps and 2027 prep on 3 pages.",
  E: "You still have a step to finish. The checklist puts the IRS dates, IRIS TCC steps and a 1099-NEC add-on in one printable list.",
  F: "You look on track from what you checked. Most people in your spot don't need to buy anything. If you'd like 2027 prep and the IRS dates on one printable list, the checklist is optional."
};
const BEFORE_CUTOFF = "2026-11-19T19:59:59.000Z";
const AFTER_CUTOFF = "2026-11-19T20:05:00.000Z";
const FIRE_ENDED = "FIRE filing ended Nov 19, 2026 at 3 p.m. ET.";
const IRIS_GUIDANCE = "the IRS says you can e-file information returns for tax year 2022 and later, and corrections, in IRIS";

const PROBLEMS = {
  A: "A provider may file your 1099 forms. Ask them to confirm they will file through IRIS after Jan 1, 2027.",
  B: "You still need a separate IRIS Application for TCC. FIRE filing ended Nov 19, 2026 at 3 p.m. ET.",
  C: "Nov 9, 2026 has passed. Existing IR Applications for TCC are now read-only.",
  D: "FIRE filing ended Nov 19, 2026 at 3 p.m. ET. The IRS says you can e-file information returns for tax year 2022 and later, and corrections, in IRIS.",
  E: "You still have a step to finish. FIRE filing ended Nov 19, 2026 at 3 p.m. ET.",
  F: "Nothing urgent was flagged from the boxes you checked. After Jan 1, 2027, IRIS is the IRS e-file system for information returns (foreign filers without a U.S. TIN use IDES)."
};

function metaContent(source, attr, name) {
  const match = source.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`));
  assert.ok(match, name);
  return match[1];
}

function descriptionValues(nodes, out) {
  out = out || [];
  if (Array.isArray(nodes)) {
    for (const item of nodes) descriptionValues(item, out);
    return out;
  }
  if (!nodes || typeof nodes !== "object") return out;
  if (typeof nodes.description === "string") out.push(nodes.description);
  for (const value of Object.values(nodes)) descriptionValues(value, out);
  return out;
}

test("result copy stays on the spec sentences and keeps the house lines", () => {
  assert.equal(html.split(SHARE_TITLE).length - 1, 3);
  assert.equal(SHARE_TITLE.length <= 60, true, SHARE_TITLE.length);
  assert.equal(SHARE_DESC.length, 155);
  assert.equal(html.includes("FIRE filing ends Nov 19"), false);
  assert.equal(metaContent(html, "name", "description"), SHARE_DESC);
  assert.equal(metaContent(html, "property", "og:title"), SHARE_TITLE);
  assert.equal(metaContent(html, "property", "og:description"), SHARE_DESC);
  assert.equal(metaContent(html, "name", "twitter:title"), SHARE_TITLE);
  assert.equal(metaContent(html, "name", "twitter:description"), SHARE_DESC);
  assert.equal(html.includes("Optional $9 checklist."), false);
  for (const text of [SHARE_TITLE, SHARE_DESC]) {
    assert.equal(text.includes("$9"), false, text);
    assert.equal(/checklist/i.test(text), false, text);
    assert.equal(/FIRE closes/i.test(text), false, text);
    assert.equal(text.includes("\u2014"), false, text);
  }
  assert.equal(html.replaceAll(SHARE_TITLE, "").includes("\u2014"), false);
  assert.equal(html.includes("\u2013"), false);
  assert.equal(html.includes("&mdash;"), false);
  assert.equal(html.includes(QUESTION), true);
  for (const key of ["A", "B", "C", "D", "E", "F"]) assert.equal(html.includes(LEADS[key]), false, key);
  assert.equal(html.includes("Thanks for your time. If this isn't right for you, please share it with someone it could help."), true);
  assert.equal(html.split(DISCLAIMER).length - 1 >= 3, true);
  assert.equal(html.includes('id="kit-refund"'), false);
  assert.equal(html.includes('data-goatcounter-click="cta/fire-result-need-tcc"'), false);
  assert.equal(html.includes("utm_content=fire-result-need-tcc"), false);
  assert.equal(html.includes("gumroad.com/l/" + "fire-to-iris-switch-checklist"), false);
});

const DELIVERY = "One 3-page PDF checklist in a ZIP, with the IRS dates and links, your FIRE account steps, the IRIS Application for TCC, 2027 prep, and a 1099-NEC add-on.";

test("body, FAQ, badges, schema, and alt text no longer name the ZIP download", () => {
  assert.equal(html.split(DELIVERY).length - 1, 0);
  assert.equal(html.includes('data-fire-kit="1"'), false);
  assert.equal(html.split("INSTANT DOWNLOAD · ONE 3-PAGE PDF IN A ZIP · CHECKLIST + 1099-NEC ADD-ON · $9").length - 1, 0);
  assert.equal(html.split('alt="FIRE to IRIS Switch Checklist: 3-page printable PDF in a ZIP with the IRIS Application for TCC, Publication 5717 (up to 45 calendar days), and 2027 filing season steps"').length - 1, 0);
  assert.equal(html.split("One 3-page PDF checklist in a ZIP. What is changing, in plain words.").length - 1, 0);
  assert.equal(html.includes("The $9 checklist is one 3-page PDF in a ZIP."), false);
  assert.equal(html.includes('id="kit-sticky-label"'), false);
  assert.equal(html.includes(">Get the $9 checklist (PDF in a ZIP)<"), false);
  assert.equal(html.includes(">Optional: $9 checklist (PDF in a ZIP)<"), false);
  for (const phrase of ["One PDF", "ONE PDF", "one PDF", "instant PDF", "(PDF, instant download)", "One 3-page PDF with", "is one PDF"]) {
    assert.equal(html.includes(phrase), false, phrase);
  }
  html.split("\n").forEach((line, index) => {
    if (!/PDF/i.test(line)) return;
    assert.match(line, /ZIP/, "line " + (index + 1) + " names a PDF without ZIP");
  });
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((block) => JSON.parse(block[1]));
  const faq = blocks.find((item) => item["@type"] === "FAQPage");
  assert.equal(blocks.some((item) => item["@type"] === "Product" || item["@type"] === "Offer"), false);
  assert.equal(html.includes('id="product-jsonld"'), false);
  assert.equal(html.includes("priceValidUntil"), false);
  assert.equal(/"@type":\s*"Product"/.test(html), false);
  assert.equal(/"@type":\s*"Offer"/.test(html), false);
  assert.deepEqual(descriptionValues(blocks), []);
  assert.equal(faq.dateModified, "2026-11-21");
  assert.equal(faq.mainEntity.some((item) => item.name === "What is in the $9 checklist?"), false);
  const visibleFaq = html.slice(html.indexOf('id="faq"'), html.indexOf("</section>", html.indexOf('id="faq"')));
  const questions = [...visibleFaq.matchAll(/<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)];
  assert.equal(questions.length, faq.mainEntity.length);
  faq.mainEntity.forEach((item, i) => {
    assert.equal(item.name, questions[i][1]);
    assert.equal(item.acceptedAnswer.text, questions[i][2]);
    assert.equal(/\$9|\bchecklist\b|\bkit\b/i.test(item.name + " " + item.acceptedAnswer.text), false, item.name);
    assert.equal(/\bcloses\b/i.test(item.acceptedAnswer.text), false, item.name);
  });
  assert.equal(visibleFaq.includes(DELIVERY + " " + REFUND), false);
  assert.equal(visibleFaq.includes("What is in the $9 checklist"), false);
  assert.equal(html.includes(REFUND), false);
  assert.equal(html.includes("If you want every step on 3 pages, the $9 checklist is optional."), false);
  assert.equal(html.includes("every step on one page"), false);
  assert.equal(html.includes("on one page set"), false);
  assert.equal(html.includes("on 3 pages."), false);
  assert.equal(html.includes("submit them by Nov. 1, 2026"), false);
  assert.equal(html.includes("Nov. 1, 2026 was the last day to file test information returns through the FIRE Trading Partner Test System."), true);
  assert.equal(html.includes("Nov. 1, 2026: Last day to file test information returns through the FIRE Trading Partner Test System."), true);
  assert.equal(html.includes("Submit any remaining live FIRE information returns by Nov. 19, 2026, at 3 p.m. ET."), false);
  assert.equal(html.includes("Nov 19, 2026 at 3 p.m. ET was the last day to file information returns through FIRE."), false);
  assert.equal(html.split("Not affiliated with or endorsed by the IRS.").length - 1, 2);
  assert.equal(html.includes("Not affiliated with the IRS."), false);
});

test("all six outcomes set the lead, offer, and gumroad click", async () => {
  const chromium = await importChromium();
  const browser = await chromium.launch(chromiumLaunchOptions());
  try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1400 },
    permissions: ["clipboard-read", "clipboard-write"]
  });
  const page = await context.newPage();
  await page.clock.install({ time: new Date(BEFORE_CUTOFF) });
  await page.clock.setFixedTime(new Date(BEFORE_CUTOFF));
  await blockExternalOnPage(page);
  const shots = process.env.FIRE_CTA_SHOTS;
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

  async function setBoxes(flags) {
    await page.evaluate((state) => {
      document.getElementById("c-self").checked = state.self;
      document.getElementById("c-iris-tcc").checked = state.iris;
      document.getElementById("c-ir-changes").checked = state.ir;
      document.getElementById("c-open-2026").checked = state.open;
      document.getElementById("c-over100").checked = false;
      document.getElementById("inp").value = state.csv;
    }, flags);
    await page.click("#go");
  }

  async function offerState() {
    return page.evaluate(() => {
      const link = document.getElementById("kit-result");
      const refund = document.getElementById("kit-refund");
      const box = document.getElementById("provider-copy");
      const disclaimer = document.querySelector("#result-cta .disclaimer");
      const style = link ? getComputedStyle(link) : { backgroundColor: "", color: "", textDecorationLine: "" };
      const url = link ? new URL(link.href) : null;
      return {
        lead: (document.getElementById("result-kit-lead") || { textContent: "" }).textContent,
        problem: document.getElementById("result-problem").textContent,
        linkVisible: !!(link && (link.offsetWidth || link.offsetHeight || link.getClientRects().length)),
        refundVisible: !!(refund && (refund.offsetWidth || refund.offsetHeight || refund.getClientRects().length)),
        boxVisible: !!(box.offsetWidth || box.offsetHeight || box.getClientRects().length),
        disclaimer: disclaimer.textContent,
        disclaimerVisible: !!(disclaimer.offsetWidth || disclaimer.offsetHeight || disclaimer.getClientRects().length),
        linkText: link ? link.textContent : "",
        className: link ? link.className : "",
        bg: style.backgroundColor,
        color: style.color,
        deco: style.textDecorationLine,
        question: document.getElementById("provider-question").textContent,
        refund: refund ? refund.textContent : "",
        content: url ? url.searchParams.get("utm_content") : "",
        source: url ? url.searchParams.get("utm_source") : "",
        medium: url ? url.searchParams.get("utm_medium") : "",
        campaign: url ? url.searchParams.get("utm_campaign") : "",
        wanted: url ? url.searchParams.get("wanted") : "",
        click: link ? link.getAttribute("data-goatcounter-click") : "",
        steps: document.querySelectorAll("#next-steps li").length,
        boxTop: box.getBoundingClientRect().top,
        disclaimerTop: disclaimer.getBoundingClientRect().top
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
      const end = document.querySelector("#result-cta .disclaimer").getBoundingClientRect();
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

  await setBoxes({ self: false, iris: true, ir: true, open: true, csv: "" });
  let state = await offerState();
  assert.equal(state.problem, PROBLEMS.A);
  assert.equal(state.lead, "");
  assert.equal(state.boxVisible, true);
  assert.equal(state.question, QUESTION);
  assert.equal(state.linkVisible, false);
  assert.equal(state.refundVisible, false);
  assert.equal(state.disclaimer, DISCLAIMER);
  assert.equal(state.disclaimerVisible, true);
  assert.ok(state.boxTop < state.disclaimerTop);
  assert.ok(state.steps >= 1 && state.steps <= 3);
  await page.evaluate(() => {
    window.__gc = [];
    window.goatcounter = window.goatcounter || {};
    window.goatcounter.count = (payload) => { window.__gc.push(payload); };
  });
  await page.click("#copy-provider");
  await page.waitForFunction(() => document.getElementById("provider-copy-state").textContent === "Copied.");
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), QUESTION);
  const copyPaths = await page.evaluate(() => window.__gc.map((row) => row.path));
  assert.equal(copyPaths.some((item) => String(item).includes("gumroad-click")), false, copyPaths.join(","));
  await shot("fire-result-a-provider.png");

  const shown = [
    { key: "B", flags: { self: true, iris: false, ir: false, open: false, csv: "" }, content: "fire-result-need-tcc", quiet: false, file: "fire-result-b-need-tcc.png" },
    { key: "C", flags: { self: true, iris: true, ir: true, open: false, csv: "" }, content: "fire-result-nov9", quiet: false, file: "fire-result-c-nov9.png" },
    { key: "D", flags: { self: true, iris: true, ir: false, open: true, csv: "" }, content: "fire-result-still-fire", quiet: false, file: "fire-result-d-still-fire.png" },
    { key: "E", flags: { self: true, iris: true, ir: false, open: false, csv: "Vendor Name, Tax ID\nAmount" }, content: "fire-result-warn", quiet: false, file: "fire-result-e-warn.png" },
    { key: "F", flags: { self: true, iris: true, ir: false, open: false, csv: "" }, content: "fire-result-ontrack", quiet: true, file: "fire-result-f-ontrack.png" }
  ];
  for (const item of shown) {
    await setBoxes(item.flags);
    state = await offerState();
    assert.equal(state.problem, PROBLEMS[item.key], item.key);
    assert.equal(state.lead, "", item.key);
    assert.equal(state.boxVisible, false, item.key);
    assert.equal(state.linkVisible, false, item.key);
    assert.equal(state.refundVisible, false, item.key);
    assert.equal(await page.locator("#kit-result").count(), 0, item.key);
    assert.equal(await page.locator("a[href*='fire-to-iris-switch-checklist']").count(), 0, item.key);
    assert.equal(state.disclaimer, DISCLAIMER, item.key);
    assert.equal(state.disclaimerVisible, true, item.key);
    assert.ok(state.steps >= 1 && state.steps <= 3, item.key);
    await shot(item.file);
    if (item.key === "B") {
      await setBoxes({ self: true, iris: false, ir: true, open: true, csv: "" });
      const earlier = await offerState();
      assert.equal(earlier.lead, "");
      assert.equal(earlier.linkVisible, false);
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  for (const item of [
    { self: false, iris: false, ir: false, open: false, csv: "" },
    shown[4].flags
  ]) {
    await setBoxes(item);
    const box = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth
    }));
    assert.equal(box.sw, box.cw, JSON.stringify(box));
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
  await tagged.click("#go");
  assert.equal(await tagged.locator("#kit-result").count(), 0);
  assert.equal(await tagged.locator("a[href*='fire-to-iris-switch-checklist']").count(), 0);

  const closed = await context.newPage();
  await closed.clock.install({ time: new Date(AFTER_CUTOFF) });
  await closed.clock.setFixedTime(new Date(AFTER_CUTOFF));
  await blockExternalOnPage(closed);
  await closed.goto(pathToFileURL(PAGE).href, { waitUntil: "load" });
  const answer = await closed.locator("#aeo-answer").innerText();
  assert.equal(answer.includes(LEAD), true);
  assert.equal(answer.includes(IRIS_GUIDANCE), true);
  assert.equal(await closed.locator("#kit-top").isVisible(), false);
  assert.equal(await closed.locator("a[href*='gumroad.com']:visible").count(), 0);
  assert.equal(await closed.evaluate(() => window.FMP_FIRE_KIT_KEEP_SELLING), false);
  assert.equal(
    await closed.locator("#deadline-reminder-h").innerText(),
    "The FIRE deadline has passed. Get the weekly email for the next deadline"
  );
  async function closedBoxes(flags) {
    await closed.evaluate((state) => {
      document.getElementById("c-self").checked = state.self;
      document.getElementById("c-iris-tcc").checked = state.iris;
      document.getElementById("c-ir-changes").checked = state.ir;
      document.getElementById("c-open-2026").checked = state.open;
      document.getElementById("c-over100").checked = false;
      document.getElementById("inp").value = state.csv;
    }, flags);
    await closed.click("#go");
  }
  await closedBoxes({ self: false, iris: true, ir: true, open: true, csv: "" });
  let closedState = await closed.evaluate(() => {
    const link = document.getElementById("kit-result");
    const box = document.getElementById("provider-copy");
    function shown(el) {
      return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    }
    return {
      problem: document.getElementById("result-problem").textContent,
      lead: (document.getElementById("result-kit-lead") || { textContent: "" }).textContent,
      linkVisible: shown(link),
      refundVisible: shown(document.getElementById("kit-refund")),
      boxVisible: shown(box),
      question: document.getElementById("provider-question").textContent,
      gumroad: [...document.querySelectorAll("a[href*='gumroad.com']")].filter(shown).length
    };
  });
  assert.equal(closedState.problem, PROBLEMS.A);
  assert.equal(closedState.lead, "");
  assert.equal(closedState.boxVisible, true);
  assert.equal(closedState.question, QUESTION);
  assert.equal(closedState.linkVisible, false);
  assert.equal(closedState.refundVisible, false);
  assert.equal(closedState.gumroad, 0);
  for (const item of shown) {
    await closedBoxes(item.flags);
    closedState = await closed.evaluate(() => {
      const link = document.getElementById("kit-result");
      function shownEl(el) {
        return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
      }
      return {
        problem: document.getElementById("result-problem").textContent,
        lead: (document.getElementById("result-kit-lead") || { textContent: "" }).textContent,
        linkVisible: shownEl(link),
        refundVisible: shownEl(document.getElementById("kit-refund")),
        boxVisible: shownEl(document.getElementById("provider-copy")),
        gumroad: [...document.querySelectorAll("a[href*='gumroad.com']")].filter(shownEl).length
      };
    });
    assert.equal(closedState.problem, PROBLEMS[item.key], item.key);
    assert.equal(closedState.lead, "", item.key);
    assert.equal(closedState.boxVisible, false, item.key);
    assert.equal(closedState.linkVisible, false, item.key);
    assert.equal(closedState.refundVisible, false, item.key);
    assert.equal(closedState.gumroad, 0, item.key);
  }
  await closed.close();
  } finally {
    await browser.close();
  }
});
