// Drives every interactive page under /tools/ from a local static server.
// Expected figures come from the rules printed on each page and from that
// page's own arithmetic. The clock is America/Chicago on 2026-11-10 12:00.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  assertLive,
  assertQuietLoad,
  DEFAULT_FROZEN,
  lines,
  openPage,
  pick,
  startBrowser,
  startServer
} from "./harness.mjs";

let origin;
let server;
let browser;
let context;

before(async () => {
  ({ server, origin } = await startServer());
  ({ browser, context } = await startBrowser());
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function check(pagePath, fn, frozenIso) {
  const opened = await openPage(context, origin, pagePath, frozenIso);
  try {
    await fn(opened.page);
    assertQuietLoad(opened, pagePath);
  } finally {
    await opened.page.close();
  }
}

const FIRE_BEFORE_CUTOFF = DEFAULT_FROZEN;
const FIRE_AFTER_CUTOFF = "2026-11-19T21:00:00.000Z";

async function fireEra(page) {
  const title = await page.title();
  return /filing ended/i.test(title) ? "post140" : "pre140";
}

const FIRE_NEXT_IRS_CLOSED = {
  pre140: /FIRE is closed\. IRIS is the only IRS e-file system for information returns from Jan 1, 2027\./,
  post140:
    /FIRE filing ended Nov 19, 2026 at 3 p\.m\. ET\. The IRS says you can e-file information returns for tax year 2022 and later, and corrections, in IRIS\./
};

const FIRE_NEXT_IRS_COUNTDOWN = /Last day to file on FIRE: Nov 19, 2026, 3 p\.m\. ET\./;

const FIRE_RESULT = {
  pre140: {
    provider: /A provider may file your 1099 forms/,
    needTcc:
      /You still need a new IRS filing code before the old system closes on Nov 19, 2026, at 3 p\.m\. Eastern Time/,
    nov9: /Nov 9, 2026 has passed/,
    open2026:
      /last day to file on the old system is Nov 19, 2026, at 3 p\.m\. Eastern Time/,
    nothing: /Nothing urgent was flagged from the boxes you checked/
  },
  post140: {
    provider: /A provider may file your 1099 forms/,
    needTcc:
      /You still need a separate IRIS Application for TCC\. FIRE filing ended Nov 19, 2026 at 3 p\.m\. ET\./,
    nov9: /Nov 9, 2026 has passed/,
    open2026:
      /FIRE filing ended Nov 19, 2026 at 3 p\.m\. ET\. The IRS says you can e-file information returns for tax year 2022 and later, and corrections, in IRIS\./,
    nothing: /Nothing urgent was flagged from the boxes you checked/
  }
};

async function fireBranchChecks(page, era) {
  const expect = FIRE_RESULT[era];
  await assertLive(page, "#results");
  await page.locator("#c-self").uncheck();
  await page.locator("#go").click();
  assert.match(await page.locator("#result-problem").innerText(), expect.provider);

  await page.locator("#c-self").check();
  await page.locator("#go").click();
  assert.match(await page.locator("#result-problem").innerText(), expect.needTcc);

  await page.locator("#c-iris-tcc").check();
  await page.locator("#c-ir-changes").check();
  await page.locator("#go").click();
  assert.match(await page.locator("#result-problem").innerText(), expect.nov9);

  await page.locator("#c-ir-changes").uncheck();
  await page.locator("#c-open-2026").check();
  await page.locator("#go").click();
  assert.match(await page.locator("#result-problem").innerText(), expect.open2026);

  await page.locator("#c-open-2026").uncheck();
  await page.locator("#go").click();
  assert.match(await page.locator("#result-problem").innerText(), expect.nothing);
}

const CLEAN_COI = [
  "Insured: Sample Goods LLC",
  "Insurer: Example Mutual Insurance Co.",
  "Commercial general liability",
  "Coverage form: occurrence",
  "Additional insured: Amazon.com Services LLC and its affiliates and assignees",
  "Each occurrence $1,000,000",
  "General aggregate $2,000,000",
  "Deductible $5,000",
  "30 days notice of cancellation"
].join("\n");

const LOOM_EXAMPLE = [
  "email,name,role,videos_30d,videos_90d,recorded_minutes",
  "pat@example.com,Pat Example,Admin,12,40,80",
  "lee@example.com,Lee Example,Creator,0,0,0",
  "cara@example.com,Cara Example,Creator,0,3,20",
  "dan@example.com,Dan Example,Creator,2,4,3",
  "eve@example.com,Eve Example,Viewer,0,0,0"
].join("\n");

test("tools hub loads without a third-party call or a console error", async () => {
  await check("/tools/", async (page) => {
    assert.equal(await page.locator("h1").innerText(), "Tools");
    const hrefs = await page.locator("a[href^='/tools/']").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
    for (const href of [
      "/tools/eu-product-id-check/",
      "/tools/amazon-coi-check/",
      "/tools/loom-seat-audit-calculator/",
      "/tools/1099-nec-or-1099-k-check/",
      "/tools/fire-to-iris-check/"
    ]) {
      assert.ok(hrefs.includes(href), "missing hub link " + href);
    }
  });
});

test("SAM.gov renewal counts 365 days and ten weekdays", async () => {
  await check("/tools/sam-renewal-check/", async (page) => {
    await assertLive(page, "#sam-result");
    await page.locator("#sam-anchor").fill("2026-01-15");
    await page.locator("#sam-submit").fill("2026-10-30");
    await pick(page, "clause", "yes");
    await pick(page, "offer", "yes");
    await page.locator("#sam-go").click();
    const items = await lines(page, "#sam-lines li");
    assert.match(items[0], /every 365 days to keep it active/);
    assert.match(items[0], /Counting 365 days after January 15, 2026 lands on January 15, 2027/);
    assert.match(items.join("\n"), /Ten federal business days after October 30, 2026 lands on November 16, 2026/);
    assert.match(items.join("\n"), /OPM list for 2026 through 2027/);
    assert.match(items.join("\n"), /through final payment/);
    assert.match(items.join("\n"), /when submitting an offer or quotation and at time of award/);
  });
});

test("SBA 7(a) sample is at 1.25:1 with a $100,000 equity gap", async () => {
  await check("/tools/sba-7a-buyer-calculator/", async (page) => {
    await assertLive(page, "#sba-result");
    await page.locator("#sba-sample").click();
    const text = (await lines(page, "#sba-lines li")).join("\n");
    assert.match(text, /at the 1\.25:1 ratio on this page's exact cent math/);
    assert.match(text, /purchase price is above the business valuation by \$100,000\.00/);
    assert.match(text, /paragraph C\.1\.b says that difference must be made up by equity/);
    assert.match(text, /limited sources entered equal half of the required equity injection/);
    assert.match(text, /under \$3 million/);
  });
});

test("SBA 7(a) expansion at $3 million is under 1.15:1 by $15,000", async () => {
  await check("/tools/sba-7a-buyer-calculator/", async (page) => {
    await page.locator("#sba-type").selectOption("business-expansion");
    await page.locator("#sba-cash").fill("100000");
    await page.locator("#sba-debt").fill("100000");
    await page.locator("#sba-price").fill("3000000");
    await page.locator("#sba-valuation").fill("3000000");
    await page.locator("#sba-equity").fill("300000");
    await page.locator("#sba-limited").fill("100000");
    await page.locator("#sba-go").click();
    const text = (await lines(page, "#sba-lines li")).join("\n");
    assert.match(text, /under the 1\.15:1 ratio/);
    assert.match(text, /cash still needed to reach 1\.15:1, rounded up to the cent, is \$15,000\.00/);
    assert.match(text, /purchase price is not above the business valuation/);
    assert.match(text, /quality of earnings report is required/);
    assert.match(text, /\$3 million or more/);
  });
});

test("SBA surety prior-approval fee is 26 percent and $7.29 per thousand", async () => {
  await check("/tools/sba-surety-fee-check/", async (page) => {
    await assertLive(page, "#sbg-result");
    await pick(page, "program", "prior-approval");
    await pick(page, "bond", "other");
    await pick(page, "manufacturing", "no");
    await pick(page, "when", "on-or-after");
    await page.locator("#sbg-premium").fill("1000");
    await page.locator("#sbg-contract").fill("100000");
    await page.locator("#sbg-go").click();
    const text = (await lines(page, "#sbg-lines li")).join("\n");
    assert.match(text, /November 30, 2026/);
    assert.match(text, /surety fee 26 percent of the bond premium/);
    assert.match(text, /\$7\.29 per thousand/);
    assert.match(text, /surety fee on premium \$1,000\.00, rounded half up to the cent, is \$260\.00/);
    assert.match(text, /contract amount \$100,000\.00.*is \$729\.00/);
  });
});

test("SBA surety manufacturing exception stays at 20 percent and $6.00", async () => {
  await check("/tools/sba-surety-fee-check/", async (page) => {
    await pick(page, "program", "prior-approval");
    await pick(page, "bond", "other");
    await pick(page, "manufacturing", "yes");
    await pick(page, "when", "on-or-after");
    await page.locator("#sbg-premium").fill("1000");
    await page.locator("#sbg-contract").fill("150000");
    await page.locator("#sbg-go").click();
    const text = (await lines(page, "#sbg-lines li")).join("\n");
    assert.match(text, /NAICS 31, 32, 33 exception/);
    assert.match(text, /20 percent of the bond premium/);
    assert.match(text, /\$6\.00 per thousand/);
    assert.match(text, /is \$200\.00/);
    assert.match(text, /is \$900\.00/);
  });
});

test("SBA surety bid bond has no dollar fee", async () => {
  await check("/tools/sba-surety-fee-check/", async (page) => {
    await pick(page, "program", "prior-approval");
    await pick(page, "bond", "bid");
    await pick(page, "manufacturing", "no");
    await pick(page, "when", "on-or-after");
    await page.locator("#sbg-go").click();
    const text = (await lines(page, "#sbg-lines li")).join("\n");
    assert.match(text, /leaves a bid bond without a dollar fee/);
    assert.doesNotMatch(text, /\$260\.00|\$729\.00/);
  });
});

test("Texas franchise report keeps Friday May 15, 2026 and moves Saturday May 15, 2027", async () => {
  await check("/tools/tx-franchise-report-check/", async (page) => {
    await assertLive(page, "#tx-result");
    async function answer(year) {
      await pick(page, "year", year);
      await pick(page, "entity", "llc");
      await pick(page, "revenue", "at-or-below");
      await pick(page, "veteran", "no");
      await pick(page, "passive", "no");
      await pick(page, "reit", "no");
      await pick(page, "zeroReceipts", "no");
      await pick(page, "combined", "no");
      await page.locator("#tx-go").click();
      return (await lines(page, "#tx-points li")).join("\n");
    }
    const y2026 = await answer("2026");
    assert.match(y2026, /May 15, 2026 is a Friday/);
    assert.match(y2026, /weekend move leaves May 15, 2026 in place/);
    assert.match(y2026, /\$2,650,000/);
    assert.match(y2026, /Form 05-102/);
    const y2027 = await answer("2027");
    assert.match(y2027, /May 15, 2027 is a Saturday/);
    assert.match(y2027, /next weekday is May 17, 2027/);
  });
});

test("Texas forfeiture countdown is 80 Chicago days before January 29, 2027", async () => {
  await check("/tools/tx-franchise-forfeiture-check/", async (page) => {
    await assertLive(page, "#results");
    await pick(page, "sos", "no");
    await pick(page, "revenue", "at-or-below");
    await pick(page, "gap", "info");
    await pick(page, "nonprofit", "no");
    await page.locator("#tx-go").click();
    assert.equal(await page.locator("#tx-headline").innerText(), "Make the franchise tax account current before January 29, 2027.");
    const text = (await lines(page, "#tx-points li")).join("\n");
    assert.match(text, /80 days remain before January 29, 2027, counted on the America\/Chicago calendar/);
    assert.match(text, /the filing fee is \$75/);
  });
});

test("Texas nonprofit reinstatement states no filing fee", async () => {
  await check("/tools/tx-franchise-forfeiture-check/", async (page) => {
    await pick(page, "sos", "yes");
    await pick(page, "revenue", "above");
    await pick(page, "gap", "report");
    await pick(page, "nonprofit", "yes");
    await page.locator("#tx-go").click();
    const text = await page.locator("#results").innerText();
    assert.match(text, /no fee for filing the reinstatement of a nonprofit corporation/);
    assert.doesNotMatch(text, /the filing fee is \$75/);
  });
});

test("Windows Server 2016 standard edition has 63 days until January 12, 2027", async () => {
  await check("/tools/windows-server-2016-check/", async (page) => {
    await assertLive(page, "#results");
    await pick(page, "run", "yes");
    await pick(page, "edition", "standard");
    await pick(page, "rwa", "no");
    await pick(page, "count", "1");
    await page.locator("#ws-go").click();
    assert.equal(
      await page.locator("#ws-days").innerText(),
      "Days left until Jan 12, 2027 (America/Chicago): 63."
    );
    const plain = await page.locator("#ws-plain").innerText();
    assert.match(plain, /Path to look at: upgrade in place/);
    assert.match(plain, /extended support end date for Windows Server 2016 as 2027-01-12/);
    assert.equal(await page.locator("#ws-kit").isVisible(), true);
  });
});

test("Windows Server 2016 Essentials adds the Remote Web Access end date", async () => {
  await check("/tools/windows-server-2016-check/", async (page) => {
    await pick(page, "run", "yes");
    await pick(page, "edition", "essentials");
    await pick(page, "rwa", "no");
    await pick(page, "count", "1");
    await page.locator("#ws-go").click();
    const plain = await page.locator("#ws-plain").innerText();
    assert.match(plain, /Path to look at: migrate to a newer server/);
    assert.match(plain, /Remote Web Access and remotewebaccess\.com ends Jan 12, 2027/);
  });
});

test("Georgia later-year filing on December 31 is before the next window", async () => {
  await check("/tools/ga-annual-registration-check/", async (page) => {
    await assertLive(page, "#ga-result");
    await page.locator("#ga-year").selectOption("2027");
    await pick(page, "entity", "llc");
    await pick(page, "filing", "later");
    await pick(page, "multiYear", "no");
    await page.locator("#ga-fileon").fill("2026-12-31");
    await page.locator("#ga-go").click();
    const text = (await lines(page, "#ga-points li")).join("\n");
    assert.match(text, /window for calendar year 2027 on that page is January 1, 2027 through April 1, 2027/);
    assert.match(text, /December 31, 2026 is before January 1, 2027/);
    assert.match(text, /filings made prior to January 1 will not be applied to the next annual registration period/);
  });
});

test("Georgia domestic corporation uses the 90-day rule before October 1", async () => {
  await check("/tools/ga-annual-registration-check/", async (page) => {
    await page.locator("#ga-year").selectOption("2026");
    await pick(page, "entity", "domestic-corporation");
    await pick(page, "filing", "first");
    await pick(page, "multiYear", "no");
    await page.locator("#ga-articles").fill("2026-09-01");
    await page.locator("#ga-fileon").fill("2026-12-01");
    await page.locator("#ga-go").click();
    const text = (await lines(page, "#ga-points li")).join("\n");
    assert.match(text, /Ninety days after that date is November 30, 2026/);
    assert.match(text, /December 1, 2026 is after November 30, 2026/);
    assert.match(text, /October 1 itself is not "subsequent to October 1"|subsequent to October 1/);
  });
});

test("Connecticut paid sick leave: zero employees is no, 30 hours accrue 1, 5000 hours cap at 40", async () => {
  await check("/tools/ct-paid-sick-leave-check/", async (page) => {
    await assertLive(page, "#results");
    await page.locator("#employees").fill("0");
    await page.locator("#hours").fill("0");
    await page.locator("#go").click();
    assert.equal(await page.locator("#out-answer").innerText(), "No");
    assert.equal(await page.locator("#out-hours").innerText(), "0");
    assert.match(await page.locator("#out-note").innerText(), /under 1/);

    await page.locator("#employees").fill("1");
    await page.locator("#hours").fill("30");
    await page.locator("#go").click();
    assert.equal(await page.locator("#out-answer").innerText(), "Yes");
    assert.equal(await page.locator("#out-hours").innerText(), "1");

    await page.locator("#employees").fill("25");
    await page.locator("#hours").fill("5000");
    await page.locator("#go").click();
    assert.equal(await page.locator("#out-answer").innerText(), "Yes");
    assert.equal(await page.locator("#out-hours").innerText(), "40");
    assert.match(await page.locator("#out-note").innerText(), /Capped at 40/);

    await page.locator("#employees").fill("1.2");
    await page.locator("#hours").fill("30");
    await page.locator("#go").click();
    assert.match(await page.locator("#out-error").innerText(), /whole number of employees/);
  });
});

test("Custom GPT checker follows the Dec 11 and Enterprise dates", async () => {
  await check("/tools/custom-gpt-retirement-checker/", async (page) => {
    await assertLive(page, "#results");
    await page.locator("#go").click();
    assert.equal(
      await page.locator("#result-problem").innerText(),
      "If you only use this GPT, you do not need to migrate it."
    );
    assert.match(await page.locator("#result-deadline").innerText(), /Dec 11, 2026/);
    assert.match(await page.locator("#out li").first().innerText(), /If you only use someone else's GPT/);

    await page.locator("#c-created").check();
    await page.locator("#go").click();
    assert.equal(
      await page.locator("#result-problem").innerText(),
      "You created this custom GPT. It is scheduled to retire on Dec 11, 2026."
    );

    await page.locator("#c-ent").check();
    await page.locator("#go").click();
    assert.equal(
      await page.locator("#result-problem").innerText(),
      "This Enterprise GPT's retirement date depends on the workspace."
    );
    const deadline = await page.locator("#result-deadline").innerText();
    assert.match(deadline, /Feb 11, 2027/);
    assert.match(deadline, /Oct 26, 2026/);
    assert.match(deadline, /deferral alone does not preserve eligibility/);
  });
});

test("after-hours gap math uses weekly inquiries, close rates, and ticket value", async () => {
  await check("/tools/after-hours-gap-check/", async (page) => {
    await assertLive(page, "#results");
    await page.locator("#trade").selectOption("roofing");
    await page.locator("#q-path").selectOption("voicemail");
    for (const id of ["q-emergency", "q-address", "q-gate", "q-photo", "q-reply"]) {
      await page.locator("#" + id).selectOption("no");
    }
    await page.locator("#weekly").fill("10");
    await page.locator("#ticket").fill("250");
    await page.locator("#rate-fast").fill("40");
    await page.locator("#rate-slow").fill("15");
    await page.locator("#go").click();
    assert.match(await page.locator("#math-current").innerText(), /\$1,625\.00/);
    assert.match(await page.locator("#math-instant").innerText(), /\$4,333\.33/);
    assert.match(await page.locator("#math-annual").innerText(), /\$32,500\.00/);
    assert.equal(await page.locator('#current-list [data-gap="yes"]').count(), 6);

    await page.locator("#weekly").fill("-1");
    await page.locator("#go").click();
    assert.match(
      await page.locator("#errors").innerText(),
      /weekly after-hours inquiries as a number from 0 to 1,000,000,000/
    );
  });
});

test("Etsy photo audit flags a mockup first photo and a clean real-photo row", async () => {
  await check("/tools/etsy-photo-audit-check/", async (page) => {
    await assertLive(page, "#results");
    await page.locator("#inp").fill("FAKE wall print,1,mockup,missing,missing");
    await page.locator("#go").click();
    assert.match(
      await page.locator("#result-problem").innerText(),
      /first photo as a mockup or a computer picture/
    );
    assert.match(await page.locator("#result-deadline").innerText(), /Oct 22, 2026/);

    await page.locator("#inp").fill("FAKE blue mug,5,real,linked,not-needed");
    await page.locator("#go").click();
    assert.match(
      await page.locator("#result-problem").innerText(),
      /did not find a problem on the rows you entered/
    );

    await page.locator("#inp").fill("FAKE gift gift gift coaster,5,real,linked,missing");
    await page.locator("#go").click();
    assert.match(await page.locator("#result-problem").innerText(), /production partner as not disclosed/);
  });
});

test("EU product identifiers flag 4 of 6 example rows and price the handling fee", async () => {
  await check("/tools/eu-product-id-check/", async (page) => {
    await assertLive(page, "#results");
    await assertLive(page, "#fee-out");
    await page.locator("#example").click();
    assert.equal(
      await page.locator("#result-problem").innerText(),
      "4 of 6 rows need a fix before November 1, 2026."
    );
    const table = await page.locator("#tbody").innerText();
    assert.match(table, /Needs a fix/);
    assert.match(table, /96385075/);

    await page.locator("#fee-n").fill("3");
    await page.locator("#fee-low").check();
    const fee = await page.locator("#fee-out").innerText();
    assert.match(fee, /€2 × 3 = €6 handling fee/);
    assert.match(fee, /€3 × 3 = €9 temporary customs duty/);
    assert.match(fee, /€15 estimate before VAT/);

    await page.locator("#fee-low").uncheck();
    const high = await page.locator("#fee-out").innerText();
    assert.match(high, /€6 estimate before VAT/);
    assert.match(high, /No temporary €3 duty/);
  });
});

test("EWS decoder matches Microsoft's Null, True-empty, and False rows", async () => {
  await check("/tools/ews-setting-decoder/", async (page) => {
    await page.locator("#ex").click();
    assert.match(
      await page.locator("#verdict").innerText(),
      /True with an empty allow list: blocks EWS apps once enforcement reaches you/
    );
    const items = (await lines(page, "#out li")).join("\n");
    assert.match(items, /Plan every app that still uses EWS onto Microsoft Graph \(or retire it\) before Apr 1, 2027: 142 days from today/);

    await page.locator("#inp").fill("EwsEnabled : $null");
    await page.locator("#go").click();
    assert.equal(
      await page.locator("#verdict").innerText(),
      "Empty (Null): in line for Microsoft's switch-off, which blocks all EWS"
    );

    await page.locator("#inp").fill("EwsEnabled : False");
    await page.locator("#go").click();
    assert.equal(await page.locator("#verdict").innerText(), "False: all EWS is blocked in your tenant now");

    await page.locator("#inp").fill("Organization : Example");
    await page.locator("#go").click();
    assert.equal(await page.locator("#verdict").innerText(), "No EwsEnabled line found");
  });
});

test("Amazon COI sample has three fixes and a $10,000 deductible is still inside the cap", async () => {
  await check("/tools/amazon-coi-check/", async (page) => {
    await assertLive(page, "#results");
    await page.locator("#sample").click();
    assert.equal(
      await page.locator("#result-problem").innerText(),
      "Your certificate has 3 items to fix before you upload it to Amazon."
    );
    const table = await page.locator("#tbody").innerText();
    assert.match(table, /Certificate Holder alone is not the same/);
    assert.match(table, /\$25,000|25,000/);

    await page.locator("#coi").fill(CLEAN_COI);
    await page.locator("#entity").fill("Sample Goods LLC");
    await page.locator("#expiry").fill("2026-12-01");
    await page.locator("#go").click();
    assert.equal(await page.locator("#n-fix").innerText(), "0");
    assert.match(await page.locator("#tbody").innerText(), /Looks right/);
    assert.match(await page.locator("#fixlist").innerText(), /no sunset clause/);

    await page.locator("#coi").fill("Each occurrence $1,000,000\nGeneral aggregate $2,000,000\nDeductible $10,000");
    await page.locator("#go").click();
    assert.match(await page.locator("#tbody").innerText(), /Looks right/);

    await page.locator("#coi").fill("Each occurrence $1,000,000\nGeneral aggregate $2,000,000\nDeductible $10,001");
    await page.locator("#go").click();
    const over = await page.locator("#tbody").innerText();
    assert.match(over, /Fix/);
    assert.match(over, /10,001|\$10,001/);
  });
});

test("Grok routine calculator applies its per-routine formulas to the solo preset", async () => {
  await check("/tools/grok-bot-team-check/", async (page) => {
    await assertLive(page, "#results");
    await page.locator("#preset-solo").click();
    assert.equal(await page.locator("#out-hrs-wk").innerText(), "5.2 hrs/wk");
    assert.equal(
      await page.locator("#out-hrs-mo").innerText(),
      "~22.4 hrs/month across 10 selected routines"
    );
    assert.equal(await page.locator("#out-total-mo").innerText(), "$1,255 per month");
    const top = await page.locator("#top3-cards").innerText();
    assert.match(top, /Spam-Call & Morning Inbox Triage/);
    assert.match(top, /\$288 per month est\./);
  });
});

test("Loom seat audit classifies the example rows and the count boxes", async () => {
  await check("/tools/loom-seat-audit-calculator/", async (page) => {
    await assertLive(page, "#results");
    await page.locator("#rate").fill("15");
    await page.locator("#period").selectOption("monthly");
    await page.locator("#example").click();
    const table = await page.locator("#reclass-body").innerText();
    assert.match(table, /Keep Creator[\s\S]*1|1/);
    assert.match(await page.locator("#formula").innerText(), /1 \+ 2 = 3/);
    assert.match(await page.locator("#savings").innerText(), /\$540\.00/);
    const checklist = await page.locator("#checklist").innerText();
    assert.match(checklist, /Archive & Export: 1/);
    assert.match(checklist, /Move to Free Creator Lite\/Viewer: 2/);
    assert.match(checklist, /Keep Creator: 1/);
    assert.match(checklist, /Already Creator Lite or Viewer: 1/);

    await page.locator("#clear").click();
    await page.locator("#total").fill("20");
    await page.locator("#z30").fill("8");
    await page.locator("#z90").fill("3");
    await page.locator("#viewers").fill("2");
    await page.locator("#rate").fill("18");
    await page.locator("#period").selectOption("annual");
    await page.locator("#go").click();
    assert.match(await page.locator("#checklist").innerText(), /Keep Creator: 10/);
    assert.match(await page.locator("#checklist").innerText(), /Move to Free Creator Lite\/Viewer: 7/);
    assert.match(await page.locator("#checklist").innerText(), /Archive & Export: 3/);
    assert.match(await page.locator("#savings").innerText(), /\$180\.00/);

    await page.locator("#z90").fill("10");
    await page.locator("#go").click();
    assert.match(
      await page.locator("#errors").innerText(),
      /0 videos in 90 days cannot exceed users with 0 videos in 30 days/
    );
  });
});

test("missed-lead samples end with STOP and the copy control reports Copied", async () => {
  await check("/tools/missed-lead-text-samples/", async (page) => {
    for (const id of ["sample-missed", "sample-form", "sample-noshow"]) {
      const text = await page.locator("#" + id).inputValue();
      assert.match(text, /Reply STOP to opt out\.$/);
    }
    await page.locator('[data-copy="sample-missed"]').click();
    await page.waitForFunction(() => document.querySelector("#sample-missed-state").textContent.length > 0);
    assert.equal(await page.locator("#sample-missed-state").innerText(), "Copied.");
  });
});

test("Missouri zero-return check follows the December 30, 2026 rule", async () => {
  await check("/tools/mo-zero-return-check/", async (page) => {
    await assertLive(page, "#mo-result");
    await pick(page, "account", "yes");
    await pick(page, "sales", "no");
    await pick(page, "seasonal", "no");
    await page.locator("#mo-go").click();
    assert.equal(await page.locator("#mo-headline").innerText(), "File a $0 return each period.");
    assert.match(await page.locator("#mo-detail").innerText(), /Starting December 30, 2026/);

    await pick(page, "sales", "yes");
    await page.locator("#mo-go").click();
    assert.equal(await page.locator("#mo-headline").innerText(), "File the return and report the sales.");

    await pick(page, "account", "no");
    await pick(page, "sales", "no");
    await page.locator("#mo-go").click();
    assert.equal(await page.locator("#mo-headline").innerText(), "This does not apply.");
  });
});

test("New Jersey contractor check lists the paper facts that are not enough alone", async () => {
  await check("/tools/nj-contractor-check/", async (page) => {
    await assertLive(page, "#nj-result");
    for (const name of ["prongA", "prongB", "prongC", "customers"]) {
      await pick(page, name, "not-yet");
    }
    for (const name of ["llcOnly", "insuranceOnly", "licenseOnly", "form1099"]) {
      await pick(page, name, "yes");
    }
    await page.locator("#nj-go").click();
    const text = (await lines(page, "#nj-points li")).join("\n");
    assert.match(text, /Point to review:/);
    assert.match(text, /not alone sufficient to meet Prong C/);
    assert.match(text, /A 1099 alone does not prove contractor status/);
    assert.doesNotMatch(text, /you are a contractor|this person is an employee/i);
  });
});

test("Detroit business-tax check names November 12, 2026 at 7:00 a.m.", async () => {
  await check("/tools/detroit-business-tax-check/", async (page) => {
    await assertLive(page, "#detroit-result");
    await pick(page, "business", "no");
    await pick(page, "withholding", "no");
    await page.locator("#detroit-go").click();
    assert.equal(await page.locator("#detroit-headline").innerText(), "This does not apply.");

    await pick(page, "business", "yes");
    await pick(page, "withholding", "yes");
    await page.locator("#detroit-go").click();
    assert.equal(
      await page.locator("#detroit-headline").innerText(),
      "Use the new platform, and pay withholding electronically."
    );
    assert.match(await page.locator("#detroit-detail").innerText(), /November 12, 2026 at 7:00 a\.m\./);
  });
});

// Consistent answers only. Card-only combined with a non-card dollar amount
// contradicts the answer key on the page, and the checker does not say "Pick one"
// the way it does for cash-only plus "none." Those pairs are left out of this
// assertion because the page is already in another open pull request.
test("1099-NEC or 1099-K follows the 2026 $2,000 and card-payment rules", async () => {
  await check("/tools/1099-nec-or-1099-k-check/", async (page) => {
    await assertLive(page, "#results");
    async function run(purpose, who, method, noncard) {
      await pick(page, "purpose", purpose);
      await pick(page, "who", who);
      await pick(page, "method", method);
      await pick(page, "noncard", noncard);
      await page.locator("#go").click();
      return page.locator("#result-problem").innerText();
    }
    assert.equal(
      await run("business", "contractor", "noncard", "least"),
      "1099-NEC is likely yours to file"
    );
    assert.match((await lines(page, "#next-steps li")).join("\n"), /at least \$2,000/);
    assert.equal(
      await run("business", "contractor", "card", "none"),
      "The card company or payment app reports it on 1099-K, so you likely don't file a 1099-NEC for those payments"
    );
    assert.equal(
      await run("business", "contractor", "mixed", "least"),
      "Mixed: file 1099-NEC only for the non-card portion"
    );
    assert.equal(await run("personal", "contractor", "noncard", "least"), "Likely no 1099 needed");
    assert.equal(await run("business", "corporation", "noncard", "least"), "Likely no 1099 needed");
    assert.equal(await run("business", "contractor", "noncard", "under"), "Likely no 1099 needed");
    const under = (await lines(page, "#next-steps li")).join("\n");
    assert.match(under, /\$600/);
    assert.match(under, /\$2,000/);
  });
});

test("Deadline Watch marks past dates and keeps Detroit's November 12 opening", async () => {
  await check("/tools/deadline-watch/", async (page) => {
    await page.waitForFunction(() => document.querySelector("#federal-list article"));
    const passedEstimate = page.locator("#federal-list article", { hasText: "Form 1040-ES final 2025 estimated tax" });
    assert.match(await passedEstimate.innerText(), /Passed/);
    assert.match(await passedEstimate.innerText(), /January 15, 2026/);
    const nec2026 = page.locator("#federal-list article", { hasText: "Form 1099-NEC for 2026 nonemployee compensation" });
    assert.match(await nec2026.innerText(), /February 1, 2027/);
    assert.doesNotMatch(await nec2026.innerText(), /Passed/);

    await page.locator('input[name="employees"][value="yes"]').check();
    await page.waitForFunction(() => document.body.innerText.includes("Form 941 for the third quarter of 2026"));
    const form941 = page.locator("#federal-list article", { hasText: "Form 941 for the third quarter of 2026" });
    assert.match(await form941.innerText(), /Passed/);
    assert.match(await form941.innerText(), /November 2, 2026/);

    await page.locator("#state").selectOption("MI");
    await page.waitForFunction(() => document.querySelector("#state-list article"));
    const detroit = page.locator("#state-list article", { hasText: "Detroit business taxes move to eServices" });
    const detroitText = await detroit.innerText();
    assert.match(detroitText, /November 12, 2026/);
    assert.doesNotMatch(detroitText, /Passed/);
    assert.match(await page.locator("#summary").innerText(), /on your list/);
  });
});

test("FIRE to IRIS check before Nov 19 cutoff uses the countdown copy and keeps kit offers", async () => {
  await check(
    "/tools/fire-to-iris-check/",
    async (page) => {
      const era = await fireEra(page);
      assert.match(await page.locator("#next-irs").innerText(), FIRE_NEXT_IRS_COUNTDOWN);
      assert.equal(await page.locator("#kit-top").isVisible(), true);
      await fireBranchChecks(page, era);
    },
    FIRE_BEFORE_CUTOFF
  );
});

test("FIRE to IRIS check after Nov 19 cutoff uses post-cutoff copy and hides kit offers", async () => {
  await check(
    "/tools/fire-to-iris-check/",
    async (page) => {
      const era = await fireEra(page);
      assert.match(await page.locator("#next-irs").innerText(), FIRE_NEXT_IRS_CLOSED[era]);
      assert.equal(await page.locator("#kit-top").isHidden(), true);
      await fireBranchChecks(page, era);
    },
    FIRE_AFTER_CUTOFF
  );
});
