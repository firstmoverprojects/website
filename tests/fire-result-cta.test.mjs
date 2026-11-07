// Outcome-specific result CTA on the FIRE to IRIS check.
// Headless run:
//   npm install --prefix /tmp/issue07-pw playwright-core
//   PLAYWRIGHT_CORE=/tmp/issue07-pw/node_modules/playwright-core/index.mjs FIRE_CTA_SHOTS=/opt/cursor/artifacts node --test tests/fire-result-cta.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PAGE = path.join(ROOT, "tools/fire-to-iris-check/index.html");
const html = readFileSync(PAGE, "utf8");
const QUESTION = "Will you file our tax year 2026 information returns through IRIS?";
const REFUND = "Refunds: within 30 days if a file is corrupt or materially not as described.";
const DISCLAIMER = "General guidance, not legal, tax or IT advice.";
const BUTTON = "Get the $9 checklist (PDF in a ZIP)";
const QUIET = "Optional: $9 checklist (PDF in a ZIP)";
const LEADS = {
  A: "The checklist is for people who file their own 1099s. If your provider files for you, you don't need it. Copy the question below and send it to them instead: \"" + QUESTION + "\"",
  B: "Because you file yourself and don't have an IRIS TCC yet, this is the step that matters most. The checklist walks through the IRIS Application for TCC and your FIRE account steps on 3 pages, with the IRS dates and links at the top.",
  C: "Because you need to change an existing IR TCC application, do that before Nov 9, 2026, when those applications become read-only. The checklist puts that step, the IRIS TCC steps and the other IRS dates on one printable list.",
  D: "Because you still plan to file on FIRE, the last day is Nov 19, 2026, at 3 p.m. Eastern Time. The checklist lists the IRS dates and links, your FIRE account steps and 2027 prep on 3 pages.",
  E: "You still have a step to finish. The checklist puts the IRS dates, IRIS TCC steps and a 1099-NEC add-on in one printable list.",
  F: "You look on track from what you checked. Most people in your spot don't need to buy anything. If you'd like 2027 prep and the IRS dates on one printable list, the checklist is optional."
};
const PROBLEMS = {
  A: "A provider may file your 1099 forms. Ask them to confirm they will file through IRIS after Jan 1, 2027.",
  B: "You still need a new IRS filing code before the old system closes on Nov 19, 2026, at 3 p.m. Eastern Time.",
  C: "You need to change an existing IR Application for TCC by Nov 9, 2026, before those applications become read-only.",
  D: "You still plan to file on FIRE. Test files stop on Nov 1, 2026. The last day to file on the old system is Nov 19, 2026, at 3 p.m. Eastern Time.",
  E: "You still have a step to finish before the old IRS system closes on Nov 19, 2026, at 3 p.m. Eastern Time.",
  F: "Nothing urgent was flagged from the boxes you checked. On Jan 1, 2027, the new system is the only way to file."
};

test("result copy stays on the spec sentences and keeps the house lines", () => {
  assert.equal(html.includes("\u2014"), false);
  assert.equal(html.includes("\u2013"), false);
  assert.equal(html.includes("&mdash;"), false);
  assert.equal(html.includes(QUESTION), true);
  for (const key of ["B", "C", "D", "E", "F"]) assert.equal(html.includes(LEADS[key]), true, key);
  assert.equal(html.includes("Thanks for your time. If this isn't right for you, please share it with someone it could help."), true);
  assert.equal(html.split(DISCLAIMER).length - 1 >= 3, true);
  assert.match(html, /id="kit-refund">Refunds: within 30 days if a file is corrupt or materially not as described\./);
  assert.match(html, /data-goatcounter-click="cta\/fire-result-need-tcc"/);
  assert.match(html, /utm_content=fire-result-need-tcc/);
});

const DELIVERY = "One 3-page PDF checklist in a ZIP, with the IRS dates and links, your FIRE account steps, the IRIS Application for TCC, 2027 prep, and a 1099-NEC add-on.";

test("body, FAQ, badges, schema, alt text, and the sticky name the ZIP download", () => {
  assert.equal(html.split(DELIVERY).length - 1, 3);
  assert.match(html, /<p class="kit-note" data-fire-kit="1">One 3-page PDF checklist in a ZIP\. Refunds: within 30 days if a file is corrupt or materially not as described\.<\/p>/);
  assert.equal(html.split("INSTANT DOWNLOAD · ONE 3-PAGE PDF IN A ZIP · CHECKLIST + 1099-NEC ADD-ON · $9").length - 1, 2);
  assert.equal(html.split('alt="See What\'s Inside the $9 FIRE to IRIS Switch Checklist: one 3-page PDF checklist in a ZIP, with the IRS dates, your FIRE account, the IRIS Application for TCC, and a 1099-NEC add-on"').length - 1, 2);
  assert.equal(html.split("One 3-page PDF checklist in a ZIP. What is changing, in plain words.").length - 1, 2);
  assert.equal(html.includes("The $9 checklist is one 3-page PDF in a ZIP."), true);
  assert.match(html, /id="kit-sticky-label"[^>]*>\$9 FIRE to IRIS checklist \(PDF in a ZIP\)</);
  assert.equal(html.includes(BUTTON), true);
  assert.equal(html.includes(QUIET), true);
  assert.equal(html.includes(">Get the $9 checklist (PDF in a ZIP)<"), true);
  for (const phrase of ["One PDF", "ONE PDF", "one PDF", "instant PDF", "(PDF, instant download)", "One 3-page PDF with", "is one PDF"]) {
    assert.equal(html.includes(phrase), false, phrase);
  }
  html.split("\n").forEach((line, index) => {
    if (!/PDF/i.test(line)) return;
    assert.match(line, /ZIP/, "line " + (index + 1) + " names a PDF without ZIP");
  });
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((block) => JSON.parse(block[1]));
  const faq = blocks.find((item) => item["@type"] === "FAQPage");
  const product = blocks.find((item) => item["@type"] === "Product");
  assert.equal(faq.dateModified, "2026-11-07");
  const kitAnswer = faq.mainEntity.find((item) => item.name === "What is in the $9 checklist?");
  assert.equal(kitAnswer.acceptedAnswer.text, DELIVERY + " " + REFUND);
  assert.equal(product.description, DELIVERY);
  assert.equal(product.offers.price, 9);
  const visibleFaq = html.slice(html.indexOf('id="faq"'), html.indexOf("</section>", html.indexOf('id="faq"')));
  assert.equal(visibleFaq.includes(kitAnswer.acceptedAnswer.text), true);
  assert.equal(html.includes(REFUND), true);
  assert.equal(html.includes("If you want every step on 3 pages, the $9 checklist is optional."), true);
  assert.equal(html.includes("every step on one page"), false);
  assert.equal(html.includes("on one page set"), false);
  assert.equal(html.includes("on 3 pages."), true);
  assert.equal(html.includes("submit them by Nov. 1, 2026"), false);
  assert.equal(html.includes("Nov. 1, 2026 was the last day to file test information returns through the FIRE Trading Partner Test System."), true);
  assert.equal(html.includes("Nov. 1, 2026: Last day to file test information returns through the FIRE Trading Partner Test System."), true);
  assert.equal(html.includes("Submit any remaining live FIRE information returns by Nov. 19, 2026, at 3 p.m. ET."), true);
  assert.equal(html.split("Not affiliated with or endorsed by the IRS.").length - 1, 2);
  assert.equal(html.includes("Not affiliated with the IRS."), false);
});

test("all six outcomes set the lead, offer, and gumroad click", async () => {
  const mod = process.env.PLAYWRIGHT_CORE || "playwright-core";
  const { chromium } = await import(mod);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1400 },
    permissions: ["clipboard-read", "clipboard-write"]
  });
  const page = await context.newPage();
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
      const style = getComputedStyle(link);
      const url = new URL(link.href);
      return {
        lead: document.getElementById("result-kit-lead").textContent,
        problem: document.getElementById("result-problem").textContent,
        linkVisible: !!(link.offsetWidth || link.offsetHeight || link.getClientRects().length),
        refundVisible: !!(refund.offsetWidth || refund.offsetHeight || refund.getClientRects().length),
        boxVisible: !!(box.offsetWidth || box.offsetHeight || box.getClientRects().length),
        disclaimer: disclaimer.textContent,
        disclaimerVisible: !!(disclaimer.offsetWidth || disclaimer.offsetHeight || disclaimer.getClientRects().length),
        linkText: link.textContent,
        className: link.className,
        bg: style.backgroundColor,
        color: style.color,
        deco: style.textDecorationLine,
        question: document.getElementById("provider-question").textContent,
        refund: refund.textContent,
        content: url.searchParams.get("utm_content"),
        source: url.searchParams.get("utm_source"),
        medium: url.searchParams.get("utm_medium"),
        campaign: url.searchParams.get("utm_campaign"),
        wanted: url.searchParams.get("wanted"),
        click: link.getAttribute("data-goatcounter-click"),
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
  assert.equal(state.lead, LEADS.A);
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
    assert.equal(state.lead, LEADS[item.key], item.key);
    assert.equal(state.boxVisible, false, item.key);
    assert.equal(state.linkVisible, true, item.key);
    assert.equal(state.refundVisible, true, item.key);
    assert.equal(state.refund, REFUND, item.key);
    assert.equal(state.disclaimer, DISCLAIMER, item.key);
    assert.equal(state.disclaimerVisible, true, item.key);
    assert.equal(state.content, item.content, item.key);
    assert.equal(state.source, "site", item.key);
    assert.equal(state.medium, "site", item.key);
    assert.equal(state.campaign, "fire-to-iris-check", item.key);
    assert.equal(state.wanted, "true", item.key);
    assert.equal(state.click, "cta/" + item.content, item.key);
    assert.ok(state.steps >= 1 && state.steps <= 3, item.key);
    if (item.quiet) {
      assert.equal(state.linkText, QUIET, item.key);
      assert.equal(state.className, "paid-quiet", item.key);
      assert.equal(state.bg, "rgba(0, 0, 0, 0)", item.key);
      assert.equal(state.color, "rgb(0, 85, 255)", item.key);
      assert.equal(state.deco, "underline", item.key);
    } else {
      assert.equal(state.linkText, BUTTON, item.key);
      assert.equal(state.className, "btn", item.key);
      assert.equal(state.bg, "rgb(0, 85, 255)", item.key);
      assert.equal(state.color, "rgb(255, 255, 255)", item.key);
    }
    const tracked = await page.evaluate(() => {
      window.__gc = [];
      window.goatcounter = window.goatcounter || {};
      window.goatcounter.count = (payload) => { window.__gc.push(payload); };
      document.getElementById("kit-result").click();
      return window.__gc.map((row) => row.path);
    });
    assert.equal(tracked.includes("gumroad-click/fire-to-iris-switch-checklist"), true, item.key + " " + tracked.join(","));
    await shot(item.file);
    if (item.key === "B") {
      await setBoxes({ self: true, iris: false, ir: true, open: true, csv: "" });
      const earlier = await offerState();
      assert.equal(earlier.lead, LEADS.B);
      assert.equal(earlier.content, "fire-result-need-tcc");
      assert.equal(earlier.linkText, BUTTON);
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
  await tagged.goto(pathToFileURL(PAGE).href + "?utm_source=tiktok", { waitUntil: "load" });
  await tagged.click("#go");
  const kept = await tagged.evaluate(() => {
    const url = new URL(document.getElementById("kit-result").href);
    return {
      source: url.searchParams.get("utm_source"),
      content: url.searchParams.get("utm_content")
    };
  });
  assert.equal(kept.source, "tiktok");
  assert.equal(kept.content, "fire-result-need-tcc");

  await browser.close();
});
