// 1099-NEC or 1099-K check: every payment method and non-card amount pair, clicked in a real browser.
// Headless run:
//   PLAYWRIGHT_CORE=playwright-core node --test tests/nec-or-k-method-amount.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PAGE = path.join(ROOT, "tools/1099-nec-or-1099-k-check/index.html");
const NEC = "1099-NEC is likely yours to file";
const K = "The card company or payment app reports it on 1099-K, so you likely don't file a 1099-NEC for those payments";
const MIXED = "Mixed: file 1099-NEC only for the non-card portion";
const NONE = "Likely no 1099 needed";
const UNSURE = "This check needs a clearer answer before it can pick one result.";
const CARD_PICK_ONE = "You marked credit card, debit card, or payment app only, and also marked a cash, check, bank transfer, or ACH amount. Pick one.";

const EXPECTED = {
  noncard: { least: NEC, under: NONE, none: UNSURE, unsure: UNSURE },
  card: { least: UNSURE, under: UNSURE, none: K, unsure: K },
  mixed: { least: MIXED, under: NONE, none: UNSURE, unsure: UNSURE },
  unsure: { least: UNSURE, under: UNSURE, none: UNSURE, unsure: UNSURE }
};

test("each method and non-card amount pair renders one result in the browser", async () => {
  const mod = process.env.PLAYWRIGHT_CORE || "playwright-core";
  const { chromium } = await import(mod);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    await page.goto(pathToFileURL(PAGE).href, { waitUntil: "load" });

    await page.check('input[name="purpose"][value="business"]');
    for (const who of ["contractor", "attorney"]) {
      await page.check(`input[name="who"][value="${who}"]`);
      for (const [method, row] of Object.entries(EXPECTED)) {
        for (const [noncard, headline] of Object.entries(row)) {
          const label = `${who}|${method}|${noncard}`;
          await page.check(`input[name="method"][value="${method}"]`);
          await page.check(`input[name="noncard"][value="${noncard}"]`);
          await page.click("#go");
          const state = await page.evaluate(() => ({
            hidden: document.getElementById("results").hidden,
            problem: document.getElementById("result-problem").textContent,
            steps: [...document.querySelectorAll("#next-steps li")].map((li) => li.textContent)
          }));
          assert.equal(state.hidden, false, label);
          assert.equal(state.problem, headline, label);
          if (method === "card" && (noncard === "least" || noncard === "under")) {
            assert.deepEqual(state.steps, [CARD_PICK_ONE], label);
          }
          if (headline === UNSURE) {
            if (method !== "unsure") assert.equal(state.steps.join(" ").includes("Pick "), true, label);
            assert.equal(state.steps.join(" ").includes("January 31"), false, label);
          }
        }
      }
    }

    assert.deepEqual(errors.filter((item) => item.indexOf("Failed to fetch") === -1), []);
  } finally {
    await browser.close();
  }
});
