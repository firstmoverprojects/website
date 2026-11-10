// Outcome-specific result CTA on the Amazon $1M COI check.
// Headless run:
//   npm install --prefix /tmp/issue07-pw playwright-core
//   PLAYWRIGHT_CORE=/tmp/issue07-pw/node_modules/playwright-core/index.mjs AMAZON_CTA_SHOTS=/opt/cursor/artifacts/amazon-coi-result-cta node --test tests/amazon-result-cta.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PAGE = path.join(ROOT, "tools/amazon-coi-check/index.html");
const html = readFileSync(PAGE, "utf8");
const REFUND = "Refunds: within 30 days if a file is corrupt or materially not as described.";
const THANKS = "Thanks for your time. If this isn't right for you, please share it with someone it could help.";
const DISCLAIMER = "General guidance, not legal, tax or IT advice.";
const BUTTON = "Get the $29 kit with broker email";
const QUIET = "Optional: $29 kit with broker email";
const KIT_CONTENTS = "a spreadsheet that compares what you type from your certificate with Amazon's quoted terms, a policy-terms checklist that quotes Amazon word for word, and a copy-paste broker email";
const DELETE_STEP = "Check Amazon's category list and the notice in Account Health before buying anything. This page cannot see your account.";
const CATEGORY_CHECK = "Check Amazon's category list and your Account Health page. This page can't see your account.";
const CHOOSE_ANSWERS = "Choose Yes, No, or Not sure for each question.";
const SALES_RULE = "Amazon's existing rule already applies: insurance within 30 days after exceeding USD 10,000 in gross proceeds in one month.";
const AIA_RULE = "Amazon's page says Mainland China sellers must get the policy through the Amazon Insurance Accelerator (AIA) program unless Amazon agrees otherwise in writing. From Nov 2, Amazon says it will reject newly submitted policies not obtained through AIA.";
const AMAZON_DECIDES = "Amazon decides. Check Amazon's own help pages.";
const GUMROAD_KIT = "https://firstmoverprojects.gumroad.com/l/amazon-1m-insurance-readiness-kit";
const BEYOND_HEADING = "What the $29 kit adds beyond a free check";
const BEYOND_INTRO = "The free check lists mismatches in the certificate text you paste. It stays in your browser. The $29 kit is a downloadable ZIP you keep.";
const BEYOND_BULLETS = [
  "That download is a 12-file ZIP: a policy-terms checklist that quotes Amazon word for word, a COI pre-submission checker, a category screen, a broker email, and an Excel workbook.",
  "A copy-paste broker email that asks for the exact certificate wording. The free check gives you a fix list, not that email.",
  "The workbook puts each field you type next to Amazon's quoted term, including the additional insured wording and the legal-entity name with the single-member LLC trade-name exception, with a column for your broker's answer."
];
const BEYOND_NOTE = "The kit is an organizing tool, not insurance.";
const DEADLINE_PAGE = path.join(ROOT, "deadlines/amazon-insurance-nov-2.html");
const LEADS = {
  none: "Because you answered no to enhanced-safety categories, no to USD 10,000 in gross proceeds in any one month, and no to a business based in Mainland China, neither rule appears to apply based on those answers. Check your Account Health notice before buying anything.",
  category: "Because you said no, your Amazon.com products do not fall in a category with enhanced safety listing requirements. Check Amazon's category list and your Account Health notice before buying anything.",
  unsure: "Because you are not sure whether any of your Amazon.com products fall in a category with enhanced safety listing requirements, check Amazon's category list and your Account Health page. This page can't see your account.",
  blank: "Because you have not chosen Yes, No, or Not sure for whether any of your Amazon.com products fall in a category with enhanced safety listing requirements, choose Yes, No, or Not sure for each question. This page cannot see your Seller Central account.",
  fix: "Because you have a certificate with items to fix before you upload it to Amazon, the kit has " + KIT_CONTENTS + ".",
  check: "Because you still have lines on your certificate to check by hand before you upload it to Amazon, the kit has " + KIT_CONTENTS + ".",
  ontrack: "Because the seven key terms on your certificate look right, the kit is optional. It is " + KIT_CONTENTS + "."
};
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

test("result copy stays on the page facts and keeps the house lines", () => {
  assert.equal(html.includes("\u2014"), false);
  assert.equal(html.includes("\u2013"), false);
  assert.equal(html.includes("&mdash;"), false);
  const product = html.slice(html.indexOf('id="product-jsonld"'), html.indexOf("</script>", html.indexOf('id="product-jsonld"')));
  assert.equal(product.includes(KIT_CONTENTS), true);
  for (const key of ["none", "category", "unsure", "blank", "fix"]) assert.equal(html.includes(LEADS[key]), true, key);
  assert.equal(html.includes("Because you still have lines on your certificate to check by hand before you upload it to Amazon, the kit has "), true);
  assert.equal(html.includes("Because the seven key terms on your certificate look right, the kit is optional. It is "), true);
  assert.equal(html.includes("look right for Amazon's rule in effect since Nov 2, 2026."), true);
  const beyondAt = html.indexOf('id="kit-beyond"');
  const beyond = html.slice(html.indexOf(">", beyondAt) + 1, html.indexOf("</div>", beyondAt));
  const outsideBeyond = html.slice(0, beyondAt) + html.slice(html.indexOf("</div>", beyondAt));
  assert.equal(beyond.includes(BEYOND_HEADING), true);
  assert.equal(beyond.includes(BEYOND_INTRO), true);
  for (const bullet of BEYOND_BULLETS) assert.equal(beyond.includes(bullet), true, bullet);
  assert.equal(beyond.includes(BEYOND_NOTE), true);
  assert.equal(beyond.split("12-file").length - 1, 1);
  assert.equal(beyond.split("Excel workbook").length - 1, 1);
  assert.equal(outsideBeyond.includes("What the $29 kit adds beyond a free check"), false);
  const beyondLinks = [...beyond.matchAll(/<a\b[^>]*href="([^"]+)"/gi)].map((match) => match[1].replace(/&amp;/g, "&"));
  assert.equal(beyondLinks.length, 1);
  assert.equal(beyondLinks[0].startsWith(GUMROAD_KIT), true, beyondLinks[0]);
  assert.equal(new URL(beyondLinks[0]).pathname, "/l/amazon-1m-insurance-readiness-kit");
  assert.equal(LEADS.fix.includes("before Nov 2"), false);
  assert.equal(LEADS.check.includes("before Nov 2"), false);
  assert.equal(LEADS.ontrack.includes("before Nov 2"), false);
  assert.equal(html.includes(THANKS), true);
  assert.equal(html.includes("Thank you for your time."), false);
  assert.equal(html.includes("Share it with someone it could help."), false);
  assert.equal(html.split(DISCLAIMER).length - 1 >= 3, true);
  assert.match(html, /id="kit-refund">Refunds: within 30 days if a file is corrupt or materially not as described\./);
  assert.match(html, /data-goatcounter-click="cta\/amazon-coi-result-fix"/);
  assert.match(html, /utm_content=amazon-coi-result-fix/);
  assert.equal(html.includes("utm_content=coi-check-result"), false);
  assert.equal(html.includes("old discontinued or inactive ASIN"), false);
  assert.equal(html.includes("sellers around $1,500"), false);
  assert.equal(html.includes("This is not insurance and First Mover Projects is not an insurance broker or agent."), true);
  assert.equal(html.includes("Who it is not for:"), true);
  assert.equal(html.includes("Get the 12-file ZIP on Gumroad - $29"), true);
  assert.equal(html.includes("checked Nov 10, 2026"), true);
  assert.equal(html.includes('<p class="kit-note"><strong>' + REFUND + '</strong> The kit cannot guarantee Amazon acceptance.</p>'), true);
  assert.equal(html.replaceAll("Check the official sources for your case.", "").match(/official/gi), null);
  assert.equal(html.includes("before Nov 2, 2026"), false);
  assert.equal(html.includes("before November 2, 2026"), false);
});

test("all outcomes set the lead, offer, and gumroad click", async () => {
  const mod = process.env.PLAYWRIGHT_CORE || "playwright-core";
  const { chromium } = await import(mod);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });
  const shots = process.env.AMAZON_CTA_SHOTS;
  if (shots) mkdirSync(shots, { recursive: true });

  async function openAt(width) {
    const context = await browser.newContext({
      viewport: { width, height: 2400 },
      permissions: ["clipboard-read", "clipboard-write"]
    });
    const page = await context.newPage();
    await page.goto(pathToFileURL(PAGE).href, { waitUntil: "load" });
    await page.evaluate(() => {
      document.addEventListener("click", (ev) => {
        const node = ev.target && ev.target.closest ? ev.target.closest("a") : null;
        if (!node) return;
        const href = node.getAttribute("href") || "";
        if (href.indexOf("firstmoverprojects.gumroad.com/l/") !== -1) ev.preventDefault();
      }, true);
    });
    return { context, page };
  }

  async function setAnswers(page, answers) {
    await page.evaluate((state) => {
      ["q1", "q2", "q3"].forEach((name) => {
        document.querySelectorAll('input[name="' + name + '"]').forEach((node) => {
          node.checked = node.value === state[name];
        });
      });
    }, answers);
  }

  async function runSample(page, answers) {
    await setAnswers(page, answers);
    await page.click("#sample");
  }

  async function runClean(page) {
    await setAnswers(page, { q1: "yes", q2: "no", q3: "no" });
    await page.evaluate((text) => {
      document.getElementById("coi").value = text;
      document.getElementById("entity").value = "Sample Goods LLC";
      document.getElementById("expiry").value = "2027-01-01";
    }, CLEAN);
    await page.click("#go");
  }

  async function runOnTrack(page) {
    await setAnswers(page, { q1: "yes", q2: "no", q3: "no" });
    await page.evaluate((text) => {
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
  }

  async function offerState(page) {
    return page.evaluate(() => {
      function visible(node) {
        if (!node) return false;
        return !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length);
      }
      const link = document.getElementById("kit-result");
      const refund = document.getElementById("kit-refund");
      const box = document.getElementById("nofit-next");
      const disclaimer = document.querySelector("#result-cta .disclaimer");
      const sticky = document.getElementById("kit-sticky");
      const style = getComputedStyle(link);
      const url = new URL(link.href);
      return {
        lead: document.getElementById("result-kit-lead").textContent,
        problem: document.getElementById("result-problem").textContent,
        linkVisible: visible(link),
        refundVisible: visible(refund),
        boxVisible: visible(box),
        stickyVisible: visible(sticky),
        disclaimer: disclaimer.textContent,
        disclaimerVisible: visible(disclaimer),
        deadline: document.getElementById("result-deadline").textContent,
        card: document.getElementById("result-cta").textContent,
        thanks: document.querySelector("#result-cta .thanks").textContent,
        footerThanks: document.body.innerText.includes("Thanks for your time. If this isn't right for you, please share it with someone it could help."),
        linkText: link.textContent,
        className: link.className,
        bg: style.backgroundColor,
        color: style.color,
        deco: style.textDecorationLine,
        nextText: document.getElementById("nofit-next-text").textContent,
        refund: refund.textContent,
        content: url.searchParams.get("utm_content"),
        source: url.searchParams.get("utm_source"),
        medium: url.searchParams.get("utm_medium"),
        campaign: url.searchParams.get("utm_campaign"),
        wanted: url.searchParams.get("wanted"),
        click: link.getAttribute("data-goatcounter-click"),
        steps: document.querySelectorAll("#next-steps li").length,
        beyondVisible: visible(document.getElementById("kit-beyond")),
        beyondHeading: document.querySelector("#kit-beyond h3").textContent,
        beyondIntro: document.querySelector("#kit-beyond p").textContent,
        beyondItems: Array.from(document.querySelectorAll("#kit-beyond li"), (node) => node.textContent),
        beyondNote: document.querySelectorAll("#kit-beyond p")[1].textContent,
        beyondLinks: Array.from(document.querySelectorAll("#kit-beyond a"), (node) => node.href),
        boxTop: box.getBoundingClientRect().top,
        linkTop: link.getBoundingClientRect().top,
        refundTop: refund.getBoundingClientRect().top,
        disclaimerTop: disclaimer.getBoundingClientRect().top,
        thanksTop: document.querySelector("#result-cta .thanks").getBoundingClientRect().top
      };
    });
  }

  async function shot(page, name) {
    if (!shots) return;
    await page.evaluate(() => {
      document.getElementById("result-problem").scrollIntoView({ block: "start" });
    });
    const clip = await page.evaluate(() => {
      const start = document.getElementById("result-problem").getBoundingClientRect();
      const end = document.querySelector("#result-cta .thanks").getBoundingClientRect();
      const x = Math.max(0, Math.floor(start.left - 8));
      const y = Math.max(0, Math.floor(start.top - 8));
      return {
        x,
        y,
        width: Math.max(1, Math.min(window.innerWidth - x, Math.ceil(Math.max(start.width, end.width) + 16))),
        height: Math.max(1, Math.min(window.innerHeight - y, Math.ceil(end.bottom - start.top + 16)))
      };
    });
    await page.screenshot({ path: path.join(shots, name), clip });
  }

  async function assertNoHScroll(page, label) {
    const box = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth
    }));
    assert.equal(box.sw, box.cw, label + " " + JSON.stringify(box));
  }

  const cases = [
    {
      key: "none",
      file: "amazon-coi-none",
      nofit: true,
      next: DELETE_STEP,
      run: (page) => runSample(page, { q1: "no", q2: "no", q3: "no" }),
      problem: /3 items to fix before you upload it to Amazon\./,
      deadline: "Amazon's extra rule has been in effect since Nov 2, 2026. Sellers in higher-safety categories need $1 million of coverage for each incident, and $1 million in total, even if sales are low."
    },
    {
      key: "category",
      file: "amazon-coi-category-no",
      nofit: true,
      next: DELETE_STEP + "\n" + SALES_RULE + "\n" + AMAZON_DECIDES,
      run: (page) => runSample(page, { q1: "no", q2: "yes", q3: "no" }),
      problem: /3 items to fix before you upload it to Amazon\./,
      deadline: "Amazon's existing rule already applies: insurance within 30 days after exceeding USD 10,000 in gross proceeds in one month."
    },
    {
      key: "unsure",
      file: "amazon-coi-unsure",
      nofit: true,
      next: CATEGORY_CHECK,
      run: (page) => runSample(page, { q1: "unsure", q2: "no", q3: "no" }),
      problem: /3 items to fix before you upload it to Amazon\./,
      deadline: "Amazon's extra rule has been in effect since Nov 2, 2026. Sellers in higher-safety categories need $1 million of coverage for each incident, and $1 million in total, even if sales are low."
    },
    {
      key: "blank",
      file: "amazon-coi-blank",
      nofit: true,
      next: CHOOSE_ANSWERS + "\n" + CATEGORY_CHECK,
      run: (page) => runSample(page, { q1: "", q2: "", q3: "" }),
      problem: /3 items to fix before you upload it to Amazon\./,
      deadline: "Amazon's extra rule has been in effect since Nov 2, 2026. Sellers in higher-safety categories need $1 million of coverage for each incident, and $1 million in total, even if sales are low."
    },
    {
      key: "fix",
      file: "amazon-coi-fix",
      nofit: false,
      quiet: false,
      content: "amazon-coi-result-fix",
      run: (page) => runSample(page, { q1: "yes", q2: "no", q3: "no" }),
      problem: /3 items to fix before you upload it to Amazon\./,
      deadline: "From Nov 2, 2026, Amazon's page says you need USD 1 million coverage for those products regardless of sales."
    },
    {
      key: "check",
      file: "amazon-coi-check",
      nofit: false,
      quiet: false,
      content: "amazon-coi-result-check",
      run: (page) => runClean(page),
      problem: "Some lines on your certificate still need a check by hand before you upload it to Amazon.",
      deadline: "From Nov 2, 2026, Amazon's page says you need USD 1 million coverage for those products regardless of sales."
    },
    {
      key: "ontrack",
      file: "amazon-coi-ontrack",
      nofit: false,
      quiet: true,
      content: "amazon-coi-result-ontrack",
      run: (page) => runOnTrack(page),
      problem: "The seven key terms on your certificate look right for Amazon's rule in effect since Nov 2, 2026.",
      deadline: "From Nov 2, 2026, Amazon's page says you need USD 1 million coverage for those products regardless of sales."
    }
  ];

  for (const width of [1280, 390]) {
    const { context, page } = await openAt(width);
    for (const item of cases) {
      await item.run(page);
      const state = await offerState(page);
      const label = width + " " + item.key;
      assert.equal(state.lead, LEADS[item.key], label);
      if (item.key === "ontrack") assert.equal(state.lead.startsWith("Because the "), true, label);
      else assert.equal(state.lead.startsWith("Because you "), true, label);
      assert.equal(state.deadline, item.deadline, label);
      assert.equal(state.beyondHeading, BEYOND_HEADING, label);
      assert.equal(state.beyondIntro, BEYOND_INTRO, label);
      assert.deepEqual(state.beyondItems, BEYOND_BULLETS, label);
      assert.equal(state.beyondNote, BEYOND_NOTE, label);
      assert.equal(state.beyondVisible, !item.nofit, label);
      assert.equal(state.beyondLinks.length, 1, label + " " + state.beyondLinks.join(","));
      for (const href of state.beyondLinks) {
        const kitUrl = new URL(href);
        assert.equal(kitUrl.protocol, "https:", label);
        assert.equal(kitUrl.hostname, "firstmoverprojects.gumroad.com", label);
        assert.equal(kitUrl.pathname, "/l/amazon-1m-insurance-readiness-kit", label);
      }
      assert.equal(state.card.includes("before Nov 2"), false, label);
      if (item.problem instanceof RegExp) assert.match(state.problem, item.problem, label);
      else assert.equal(state.problem, item.problem, label);
      assert.equal(state.disclaimer, DISCLAIMER, label);
      assert.equal(state.disclaimerVisible, true, label);
      assert.equal(state.thanks, THANKS, label);
      assert.equal(state.footerThanks, true, label);
      assert.ok(state.disclaimerTop < state.thanksTop, label);
      assert.ok(state.steps >= 1 && state.steps <= 3, label + " steps " + state.steps);
      if (item.nofit) {
        assert.equal(state.boxVisible, true, label);
        assert.equal(state.nextText, item.next, label);
        assert.equal(state.linkVisible, false, label);
        assert.equal(state.refundVisible, false, label);
        assert.equal(state.stickyVisible, false, label);
        assert.ok(state.boxTop < state.disclaimerTop, label);
      } else {
        assert.equal(state.boxVisible, false, label);
        assert.equal(state.linkVisible, true, label);
        assert.equal(state.refundVisible, true, label);
        assert.equal(state.refund, REFUND, label);
        assert.equal(state.content, item.content, label);
        assert.equal(state.source, "site", label);
        assert.equal(state.medium, "site", label);
        assert.equal(state.campaign, "amazon-coi-check", label);
        assert.equal(state.wanted, "true", label);
        assert.equal(state.click, "cta/" + item.content, label);
        assert.ok(state.linkTop < state.refundTop, label);
        assert.ok(state.refundTop < state.disclaimerTop, label);
        if (item.quiet) {
          assert.equal(state.linkText, QUIET, label);
          assert.equal(state.className, "paid-quiet", label);
          assert.equal(state.bg, "rgba(0, 0, 0, 0)", label);
          assert.equal(state.color, "rgb(0, 85, 255)", label);
          assert.equal(state.deco, "underline", label);
          assert.equal(state.stickyVisible, false, label);
        } else {
          assert.equal(state.linkText, BUTTON, label);
          assert.equal(state.className, "btn", label);
          assert.equal(state.bg, "rgb(0, 85, 255)", label);
          assert.equal(state.color, "rgb(255, 255, 255)", label);
          assert.equal(state.stickyVisible, width < 768, label);
        }
        const tracked = await page.evaluate(() => {
          window.__gc = [];
          window.goatcounter = window.goatcounter || {};
          window.goatcounter.count = (payload) => { window.__gc.push(payload); };
          document.getElementById("kit-result").click();
          return window.__gc.map((row) => row.path);
        });
        assert.equal(tracked.includes("gumroad-click/amazon-1m-insurance-readiness-kit"), true, label + " " + tracked.join(","));
      }
      await assertNoHScroll(page, label);
      await shot(page, item.file + "-" + width + ".png");
    }

    await runSample(page, { q1: "no", q2: "no", q3: "yes" });
    const aia = await offerState(page);
    assert.equal(aia.lead, LEADS.category, width + " aia");
    assert.equal(aia.nextText, DELETE_STEP + "\n" + AIA_RULE + "\n" + AMAZON_DECIDES, width + " aia");
    assert.equal(aia.linkVisible, false, width + " aia");
    assert.equal(aia.refundVisible, false, width + " aia");
    assert.equal(aia.disclaimerVisible, true, width + " aia");
    await assertNoHScroll(page, width + " aia");
    await shot(page, "amazon-coi-category-aia-" + width + ".png");

    if (width === 1280) {
      await runSample(page, { q1: "yes", q2: "no", q3: "yes" });
      const chinaFit = await offerState(page);
      assert.equal(chinaFit.lead, LEADS.fix);
      assert.equal(chinaFit.linkVisible, true);
      assert.equal(chinaFit.content, "amazon-coi-result-fix");
      assert.match(await page.innerText("#next-steps"), /Amazon Insurance Accelerator/);

      await page.evaluate(() => {
        window.__gc = [];
        window.goatcounter = window.goatcounter || {};
        window.goatcounter.count = (payload) => { window.__gc.push(payload); };
      });
      await runSample(page, { q1: "no", q2: "no", q3: "no" });
      await page.click("#copy-nofit");
      await page.waitForFunction(() => document.getElementById("nofit-copy-state").textContent === "Copied.");
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), DELETE_STEP);
      const copyPaths = await page.evaluate(() => window.__gc.map((row) => row.path));
      assert.equal(copyPaths.some((item) => String(item).includes("gumroad-click")), false, copyPaths.join(","));
    }
    await context.close();
  }

  const taggedContext = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
  const tagged = await taggedContext.newPage();
  await tagged.goto(pathToFileURL(PAGE).href + "?utm_source=tiktok", { waitUntil: "load" });
  await tagged.locator('input[name="q1"][value="yes"]').check();
  await tagged.click("#sample");
  const kept = await tagged.evaluate(() => {
    const url = new URL(document.getElementById("kit-result").href);
    return {
      source: url.searchParams.get("utm_source"),
      content: url.searchParams.get("utm_content")
    };
  });
  assert.equal(kept.source, "tiktok");
  assert.equal(kept.content, "amazon-coi-result-fix");
  await taggedContext.close();
  await browser.close();
});

test("the deadline page kit block quotes the same additions and one Gumroad link", () => {
  const deadline = readFileSync(DEADLINE_PAGE, "utf8");
  assert.equal(deadline.includes("\u2014"), false);
  assert.equal(deadline.includes("\u2013"), false);
  assert.equal(deadline.includes("&mdash;"), false);
  const at = deadline.indexOf('id="kit-beyond"');
  assert.notEqual(at, -1);
  const block = deadline.slice(deadline.indexOf(">", at) + 1, deadline.indexOf("</div>", at));
  assert.equal(block.includes(BEYOND_HEADING), true);
  assert.equal(block.includes(BEYOND_INTRO), true);
  for (const bullet of BEYOND_BULLETS) assert.equal(block.includes(bullet), true, bullet);
  assert.equal(block.includes(BEYOND_NOTE), true);
  const links = [...block.matchAll(/<a\b[^>]*href="([^"]+)"/gi)].map((match) => match[1].replace(/&amp;/g, "&"));
  assert.equal(links.length, 1);
  assert.equal(links[0].startsWith(GUMROAD_KIT + "?"), true, links[0]);
  const url = new URL(links[0]);
  assert.equal(url.hostname, "firstmoverprojects.gumroad.com");
  assert.equal(url.pathname, "/l/amazon-1m-insurance-readiness-kit");
  assert.equal(block.includes("Get the full kit, $29"), true);
  assert.equal(deadline.includes("<p><strong>" + REFUND + "</strong></p>"), true);
  assert.equal(deadline.includes('<p class="thanks">' + THANKS + "</p>"), true);
  assert.equal(deadline.replaceAll("Check the official sources for your case.", "").match(/official/gi), null);
  assert.equal(deadline.includes("before Nov 2, 2026"), false);
  assert.equal(deadline.includes("before November 2, 2026"), false);
});
