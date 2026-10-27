// Browser checks for the three Issue 07 tools.
// Install once if playwright-core is not on the module path:
//   npm install --prefix /tmp/issue07-pw playwright-core
//   PLAYWRIGHT_CORE=/tmp/issue07-pw/node_modules/playwright-core/index.mjs node --test tests/issue07-tools.test.mjs
// CHROME_PATH overrides the system Chrome binary (default /usr/bin/google-chrome).
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
let chromium;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' https://gc.zgo.at; connect-src https://firstmoverprojects.goatcounter.com; img-src 'self' data: https://firstmoverprojects.goatcounter.com; form-action 'none'; base-uri 'none'";
const FOOTER = [
  "General guidance, not legal, tax or IT advice.",
  "Not affiliated with Etsy, Inc., Atlassian/Loom, or any third-party platform."
];
const BANNED = ["XMLHttpRequest", "localStorage", "sessionStorage", "indexedDB"];
const PAGES = {
  etsy: "tools/etsy-photo-audit-check/index.html",
  after: "tools/after-hours-gap-check/index.html",
  loom: "tools/loom-seat-audit-calculator/index.html"
};
const GUMROAD = {
  etsy: "https://firstmoverprojects.gumroad.com/l/lnfgc?wanted=true&utm_source=firstmoverprojects&utm_medium=etsy-photo-check&utm_campaign=lnfgc&utm_content=footer",
  etsyResult: "https://firstmoverprojects.gumroad.com/l/lnfgc?wanted=true&utm_source=firstmoverprojects&utm_medium=etsy-photo-check&utm_campaign=lnfgc&utm_content=result-card",
  hvac: "https://firstmoverprojects.gumroad.com/l/afwbvt?wanted=true&utm_source=firstmoverprojects&utm_medium=after-hours-gap-check&utm_campaign=afwbvt&utm_content=trade-pill",
  intake: "https://firstmoverprojects.gumroad.com/l/fretzy?wanted=true&utm_source=firstmoverprojects&utm_medium=after-hours-gap-check&utm_campaign=fretzy&utm_content=trade-pill",
  roofing: "https://firstmoverprojects.gumroad.com/l/wymols?wanted=true&utm_source=firstmoverprojects&utm_medium=after-hours-gap-check&utm_campaign=wymols&utm_content=trade-pill",
  plumbing: "https://firstmoverprojects.gumroad.com/l/unjou?wanted=true&utm_source=firstmoverprojects&utm_medium=after-hours-gap-check&utm_campaign=unjou&utm_content=trade-pill",
  electrical: "https://firstmoverprojects.gumroad.com/l/lykya?wanted=true&utm_source=firstmoverprojects&utm_medium=after-hours-gap-check&utm_campaign=lykya&utm_content=trade-pill",
  garage: "https://firstmoverprojects.gumroad.com/l/cybqmi?wanted=true&utm_source=firstmoverprojects&utm_medium=after-hours-gap-check&utm_campaign=cybqmi&utm_content=trade-pill",
  water: "https://firstmoverprojects.gumroad.com/l/ykxxot?wanted=true&utm_source=firstmoverprojects&utm_medium=after-hours-gap-check&utm_campaign=ykxxot&utm_content=trade-pill",
  loom: "https://firstmoverprojects.gumroad.com/l/fguyxn?wanted=true&utm_source=firstmoverprojects&utm_medium=loom-seat-audit-calculator&utm_campaign=fguyxn&utm_content=bottom-cta"
};

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function toolNetwork(urls) {
  return urls.filter((url) => !/^https:\/\/(?:gc\.zgo\.at|firstmoverprojects\.goatcounter\.com)(?:[/?#]|$)/.test(url));
}

function usd(n) {
  const neg = n < 0;
  const cents = Math.round(Math.abs(n) * 100);
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  let s = String(whole);
  let out = "";
  while (s.length > 3) {
    out = "," + s.slice(-3) + out;
    s = s.slice(0, -3);
  }
  return (neg ? "-$" : "$") + s + out + "." + String(frac).padStart(2, "0");
}

let browser;

before(async () => {
  const mod = process.env.PLAYWRIGHT_CORE || "playwright-core";
  ({ chromium } = await import(mod));
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--no-first-run",
      "--disable-sync",
      "--disable-extensions"
    ]
  });
});

after(async () => {
  if (browser) await browser.close();
});

async function openPage(rel) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const hits = [];
  page.on("request", (req) => {
    if (/^https?:/i.test(req.url())) hits.push(req.url());
  });
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.goto(pathToFileURL(path.join(ROOT, rel)).href, { waitUntil: "load" });
  return { page, hits, errors };
}

async function assertNoHScroll(page) {
  const box = await page.evaluate(() => {
    let worst = null;
    document.querySelectorAll("body *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!worst || r.right > worst.right) {
        worst = { right: Math.round(r.right), left: Math.round(r.left), tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 80) };
      }
    });
    return {
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      bsw: document.body.scrollWidth,
      bcw: document.body.clientWidth,
      worst
    };
  });
  assert.equal(box.sw, box.cw, JSON.stringify(box));
  assert.equal(box.bsw, box.bcw, JSON.stringify(box));
}

test("static CSP, privacy, nav, and footer guards", () => {
  for (const rel of Object.values(PAGES)) {
    const html = read(rel);
    assert.match(html, new RegExp(`content="${CSP.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(html, /<meta name="referrer" content="strict-origin-when-cross-origin">/);
    assert.match(html, /href="\/tools\/"/);
    assert.match(html, /href="\/deadlines\/"/);
    for (const line of FOOTER) assert.ok(html.includes(line), rel + " missing footer line");
    for (const banned of BANNED) assert.equal(html.includes(banned), false, rel + " contains " + banned);
    const helperAt = html.indexOf("function trackGumroadClick");
    const helperStart = helperAt === -1 ? -1 : html.lastIndexOf("<script>", helperAt);
    const helperEnd = helperAt === -1 ? -1 : html.indexOf("</script>", helperAt);
    const outside = helperStart === -1 ? html : html.slice(0, helperStart) + html.slice(helperEnd + "</script>".length);
    assert.equal(outside.includes("fetch("), false, rel + " fetch outside helper");
    assert.equal(outside.includes("sendBeacon"), false, rel + " sendBeacon outside helper");
    assert.equal(/<form[\s>]/i.test(html), false, rel);
    const httpsSrc = [...html.matchAll(/\ssrc\s*=\s*["'](https?:[^"']+)["']/gi)].map((match) => match[1]);
    assert.deepEqual(httpsSrc, ["https://gc.zgo.at/count.js"], rel);
    assert.match(html, /data-goatcounter="https:\/\/firstmoverprojects\.goatcounter\.com\/count"/);
    assert.equal(/<link[^>]+stylesheet/i.test(html), false, rel);
    assert.equal(/@font-face/i.test(html), false, rel);
    assert.equal(/fonts\.google/i.test(html), false, rel);
    assert.equal(/url\(\s*["']?https?:/i.test(html), false, rel);
  }
  const etsy = read(PAGES.etsy);
  const after = read(PAGES.after);
  const loom = read(PAGES.loom);
  const encoded = (url) => url.replace(/&/g, "&amp;");
  assert.ok(etsy.includes(encoded(GUMROAD.etsy)));
  assert.ok(etsy.includes(encoded(GUMROAD.etsyResult)));
  for (const key of ["hvac", "intake", "roofing", "plumbing", "electrical", "garage", "water"]) {
    assert.ok(after.includes(encoded(GUMROAD[key])), key);
  }
  assert.ok(loom.includes(encoded(GUMROAD.loom)));
  assert.ok(etsy.includes("Current Listing Risk"));
  assert.ok(etsy.includes("Real-Photo Audit Fix Plan"));
  assert.ok(after.includes("Current After-Hours Profile"));
  assert.ok(after.includes("Instant-Capture Triage Profile"));
  assert.ok(after.includes("Calculated strictly from the numbers you entered above."));
  assert.ok(loom.includes("Keep Creator"));
  assert.ok(loom.includes("Move to Free Creator Lite/Viewer"));
  assert.ok(loom.includes("Archive &amp; Export") || loom.includes("Archive & Export"));
});

test("Etsy checks, redaction, cap, and 390px layout", async () => {
  const { page, hits, errors } = await openPage(PAGES.etsy);
  assert.deepEqual(errors, []);
  await assertNoHScroll(page);
  const paid = await page.getAttribute("#paid-link", "href");
  assert.equal(paid, GUMROAD.etsy);
  assert.equal(await page.getAttribute("#kit-result", "href"), GUMROAD.etsyResult);

  const redacted = await page.evaluate(() => {
    const samples = [
      "555-010-1999",
      "555.010.1999",
      "(555) 010-1999",
      "+1 555-010-1999",
      "+1-555-010-1999",
      "pat@secret.test",
      "123-45-6789",
      "SSN 123456789",
      "12-3456789",
      "EIN 123456789"
    ];
    return samples.map((sample) => window.FMP_ETSY.redact(sample));
  });
  for (const value of redacted) {
    assert.equal(/\d{3}-\d{2}-\d{4}/.test(value), false, value);
    assert.equal(/@/.test(value), false, value);
    assert.match(value, /\[redacted-(?:phone|email|ssn|ein)\]/);
  }

  const example = await page.evaluate(() => window.FMP_ETSY.auditPaste(window.FMP_ETSY.EXAMPLE));
  assert.equal(example.listings.length, 3);
  assert.equal(example.listings[0].needsFix, false);
  assert.equal(example.listings[1].flags.some((flag) => flag.code === "primary-mockup"), true);
  assert.equal(example.listings[1].flags.some((flag) => flag.code === "disclosure-missing"), true);
  assert.equal(example.listings[1].flags.some((flag) => flag.code === "variations-missing"), true);
  assert.equal(example.listings[1].flags.some((flag) => flag.code === "photos-one" && flag.fix === false), true);
  assert.equal(example.listings[2].flags.some((flag) => flag.code === "title-repeat"), true);
  const planCodes = example.listings[1].flags.filter((flag) => flag.fix).map((flag) => flag.code);
  assert.deepEqual(planCodes.slice(0, 3), ["primary-mockup", "disclosure-missing", "variations-missing"]);

  const stuffed = await page.evaluate(() => window.FMP_ETSY.classify({
    title: "mug mug mug blue",
    photos: "4",
    primary: "real",
    variations: "none",
    disclosure: "not-needed"
  }));
  assert.equal(stuffed.flags.some((flag) => flag.code === "title-repeat"), true);
  const stopped = await page.evaluate(() => window.FMP_ETSY.classify({
    title: "the the the blue mug",
    photos: "4",
    primary: "real",
    variations: "none",
    disclosure: "not-needed"
  }));
  assert.equal(stopped.flags.some((flag) => flag.code === "title-repeat"), false);
  const longTitle = "A".repeat(141);
  const long = await page.evaluate((title) => window.FMP_ETSY.classify({
    title,
    photos: "2",
    primary: "real",
    variations: "linked",
    disclosure: "present"
  }), longTitle);
  assert.equal(long.titleLength, 141);
  assert.equal(long.flags.some((flag) => flag.code === "title-long"), true);

  const capped = await page.evaluate(() => {
    const rows = ["title,photos,primary,variations,disclosure"];
    for (let i = 1; i <= 11; i++) rows.push("Item " + i + ",2,real,none,not-needed");
    return window.FMP_ETSY.auditPaste(rows.join("\n"));
  });
  assert.equal(capped.listings.length, 10);
  assert.match(capped.note, /first 10/);

  const quoted = await page.evaluate(() => window.FMP_ETSY.auditPaste(
    'title;photos;primary;variations;disclosure\n"FAKE mug, blue";6;real;linked;not-needed'
  ));
  assert.equal(quoted.listings.length, 1);
  assert.equal(quoted.listings[0].title, "FAKE mug, blue");
  assert.equal(quoted.listings[0].needsFix, false);

  const pii = "Call 555-010-1999 or pat@secret.test SSN 123-45-6789 EIN 12-3456789";
  await page.fill("#inp", pii + ",4,real,linked,not-needed");
  await page.click("#go");
  assert.equal(await page.getAttribute("#results", "hidden"), null);
  assert.equal(await page.locator("#result-cta").isVisible(), true);
  assert.match(await page.innerText("#result-problem"), /listing|photo|problem|checked/i);
  assert.equal(await page.locator("#result-cta a.btn").count(), 1);
  const shown = await page.innerText("#results");
  assert.equal(shown.includes("555-010-1999"), false);
  assert.equal(shown.includes("pat@secret.test"), false);
  assert.equal(shown.includes("123-45-6789"), false);
  assert.equal(shown.includes("12-3456789"), false);
  assert.match(shown, /\[redacted-phone\]/);
  assert.match(shown, /\[redacted-email\]/);
  assert.match(shown, /\[redacted-ssn\]/);
  assert.match(shown, /\[redacted-ein\]/);
  assert.match(await page.innerText("#agent-prompt"), /Do not invent/);
  await assertNoHScroll(page);

  await page.fill("#inp", "");
  await page.fill("#f-title", "FAKE oak stool");
  await page.fill("#f-photos", "1");
  await page.check('input[name="primary"][value="mockup"]');
  await page.check('input[name="variations"][value="missing"]');
  await page.check('input[name="disclosure"][value="missing"]');
  await page.click("#go");
  assert.equal(await page.getAttribute("#results", "data-mode"), "single");
  assert.equal(await page.locator('#pairs ol [data-code="primary-mockup"]').count(), 1);
  assert.equal(await page.locator('#pairs ol [data-code="disclosure-missing"]').count(), 1);
  assert.equal(await page.locator('#pairs ol [data-code="variations-missing"]').count(), 1);
  const wide = "Supercalifragilistic".repeat(20);
  await page.fill("#f-title", wide);
  await page.click("#go");
  await assertNoHScroll(page);
  assert.deepEqual(toolNetwork(hits), []);
  const resources = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
  assert.deepEqual(toolNetwork(resources.filter((name) => /^https?:/i.test(name))), []);
  await page.close();
});

test("After-hours profiles, arithmetic, trade kits, and 390px layout", async () => {
  const { page, hits, errors } = await openPage(PAGES.after);
  assert.deepEqual(errors, []);
  await assertNoHScroll(page);
  assert.equal(await page.getAttribute('#intake-wrap', "hidden"), null);
  assert.equal(await page.getAttribute('a[data-trade="hvac"]', "aria-current"), "true");

  const math = await page.evaluate(() => window.FMP_AFTER.compute({
    weekly: "10",
    ticket: "250",
    rateFast: "40",
    rateSlow: "15"
  }));
  assert.equal(math.ok, true);
  const monthly = 10 * 52 / 12;
  const current = monthly * 0.15 * 250;
  const instant = monthly * 0.40 * 250;
  assert.ok(Math.abs(math.current - current) < 1e-6);
  assert.ok(Math.abs(math.instant - instant) < 1e-6);
  assert.ok(Math.abs(math.diff - (instant - current)) < 1e-6);
  assert.ok(Math.abs(math.annual - (instant - current) * 12) < 1e-6);
  assert.equal(Math.round(current * 100), 162500);
  assert.equal(Math.round(instant * 100), 433333);
  assert.equal(Math.round((instant - current) * 12 * 100), 3250000);

  const bad = await page.evaluate(() => window.FMP_AFTER.compute({
    weekly: "-1",
    ticket: "abc",
    rateFast: "140",
    rateSlow: ""
  }));
  assert.equal(bad.ok, false);
  assert.equal(JSON.stringify(bad).includes("abc"), false);

  const negative = await page.evaluate(() => window.FMP_AFTER.compute({
    weekly: "10",
    ticket: "100",
    rateFast: "10",
    rateSlow: "20"
  }));
  assert.ok(negative.diff < 0);
  assert.ok(Math.abs(negative.annual - negative.diff * 12) < 1e-6);

  await page.selectOption("#trade", "roofing");
  await page.selectOption("#q-path", "voicemail");
  await page.selectOption("#q-emergency", "no");
  await page.selectOption("#q-address", "no");
  await page.selectOption("#q-gate", "no");
  await page.selectOption("#q-photo", "no");
  await page.selectOption("#q-reply", "no");
  await page.fill("#weekly", "10");
  await page.fill("#ticket", "$250");
  await page.fill("#rate-fast", "40");
  await page.fill("#rate-slow", "15");
  await page.click("#go");
  assert.match(await page.innerText("#math-basis"), /Calculated strictly from the numbers you entered above\./);
  assert.match(await page.innerText("#profile-current"), /voicemail/);
  assert.equal(await page.locator("#current-list [data-gap='yes']").count(), 6);
  assert.match(await page.innerText("#profile-instant"), /Active leak, storm damage, or an estimate/);
  assert.match(await page.innerText("#math-current"), new RegExp(usd(current).replace(/[$.]/g, "\\$&")));
  assert.match(await page.innerText("#math-instant"), /\$4,333\.33/);
  assert.match(await page.innerText("#math-annual"), /\$32,500\.00/);
  assert.equal(await page.getAttribute("#math-annual", "data-dollars"), String((instant - current) * 12));
  assert.equal(await page.getAttribute('a[data-trade="roofing"]', "aria-current"), "true");
  assert.equal(await page.getAttribute("#intake-wrap", "hidden"), "");
  const checklist = await page.innerText("#checklist");
  assert.match(checklist, /10-minute implementation checklist/);
  assert.match(checklist, /Roofing/);
  assert.equal(checklist.includes("555-010-1999"), false);
  await assertNoHScroll(page);

  await page.fill("#ticket", "pat@secret.test");
  await page.click("#go");
  const afterPii = await page.innerText("#results");
  assert.equal(afterPii.includes("pat@secret.test"), false);
  assert.equal(await page.getAttribute("#results", "data-math"), "no");

  await page.selectOption("#trade", "hvac");
  await page.selectOption("#q-path", "instant");
  await page.selectOption("#q-emergency", "yes");
  await page.selectOption("#q-address", "yes");
  await page.selectOption("#q-gate", "yes");
  await page.selectOption("#q-photo", "yes");
  await page.selectOption("#q-reply", "yes");
  await page.fill("#ticket", "250");
  await page.click("#go");
  assert.equal(await page.locator("#current-list [data-gap='yes']").count(), 0);
  assert.equal(await page.getAttribute("#intake-wrap", "hidden"), null);
  await assertNoHScroll(page);
  assert.deepEqual(toolNetwork(hits), []);
  await page.close();
});

test("Loom reclassification, savings, CSV redaction, and 390px layout", async () => {
  const { page, hits, errors } = await openPage(PAGES.loom);
  assert.deepEqual(errors, []);
  await assertNoHScroll(page);
  assert.equal(await page.getAttribute("#paid-link", "href"), GUMROAD.loom);

  const counts = await page.evaluate(() => window.FMP_LOOM.fromInputs({
    csv: "",
    total: "10",
    z30: "6",
    z90: "4",
    viewers: "1",
    rate: "15",
    period: "monthly"
  }));
  assert.equal(counts.ok, true);
  assert.equal(counts.classified.counts.keep, 3);
  assert.equal(counts.classified.counts.move, 3);
  assert.equal(counts.classified.counts.archive, 4);
  assert.equal(counts.rateInfo.savingsCents, 126000);
  assert.match(counts.checklist, /Calculated strictly from the numbers you entered above\./);

  const annual = await page.evaluate(() => window.FMP_LOOM.withRate(
    window.FMP_LOOM.auditCounts({ total: "10", z30: "6", z90: "4", viewers: "1" }),
    "180",
    "annual"
  ));
  assert.equal(annual.savingsCents, 126000);

  const overlap = await page.evaluate(() => window.FMP_LOOM.auditCounts({
    total: "10", z30: "4", z90: "5", viewers: "1"
  }));
  assert.equal(overlap.ok, false);
  const tooMany = await page.evaluate(() => window.FMP_LOOM.auditCounts({
    total: "10", z30: "8", z90: "1", viewers: "4"
  }));
  assert.equal(tooMany.ok, false);

  const csv = [
    "email,name,phone,notes,role,videos_30d,videos_90d,recorded_minutes",
    "person@secret.test,Jordan Lee,555-010-1999,EIN 12-3456789,Creator,0,0,0",
    "other@secret.test,\"Lee, Jordan\",(555) 010-2000,SSN 123-45-6789,Creator,4,9,40",
    "third@secret.test,Pat Example,555.010.2001,12-3456780,Creator Lite,0,0,0",
    "fourth@secret.test,Sam Example,+1 555-010-2002,none,Creator,2,4,5",
    "fifth@secret.test,Riley Example,555-010-2003,none,Creator,3,6,5.5"
  ].join("\n");
  const parsed = await page.evaluate((text) => window.FMP_LOOM.auditCsv(text), csv);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.counts.archive, 1);
  assert.equal(parsed.counts.free, 1);
  assert.equal(parsed.counts.move, 1);
  assert.equal(parsed.counts.keep, 2);
  const blob = JSON.stringify(parsed);
  for (const secret of ["person@secret.test", "other@secret.test", "Jordan Lee", "Lee, Jordan", "555-010-1999", "12-3456789", "123-45-6789", "(555) 010-2000", "Pat Example"]) {
    assert.equal(blob.includes(secret), false, secret);
  }

  await page.fill("#csv", csv);
  await page.fill("#total", "99");
  await page.fill("#rate", "15.50");
  await page.selectOption("#period", "monthly");
  await page.click("#go");
  assert.equal(await page.getAttribute("#results", "data-source"), "csv");
  assert.equal(await page.locator("td[data-bucket='archive']").innerText(), "1");
  assert.equal(await page.locator("td[data-bucket='move']").innerText(), "1");
  assert.equal(await page.locator("td[data-bucket='keep']").innerText(), "2");
  assert.equal(await page.locator("td[data-bucket='free']").innerText(), "1");
  assert.equal(await page.getAttribute("#savings", "data-annual-cents"), String((1 + 1) * Math.round(15.5 * 100) * 12));
  const shown = await page.innerText("#results");
  for (const secret of ["person@secret.test", "Jordan Lee", "Lee, Jordan", "555-010-1999", "12-3456789", "123-45-6789", "Pat Example", "Sam Example"]) {
    assert.equal(shown.includes(secret), false, secret);
  }
  assert.match(shown, /Calculated strictly from the numbers you entered above\./);
  assert.match(shown, /Pasted rows were used/);
  await assertNoHScroll(page);

  await page.fill("#csv", "");
  await page.fill("#total", "10");
  await page.fill("#z30", "6");
  await page.fill("#z90", "4");
  await page.fill("#viewers", "1");
  await page.fill("#rate", "15");
  await page.selectOption("#period", "monthly");
  await page.click("#go");
  assert.equal(await page.getAttribute("#results", "data-source"), "counts");
  assert.equal(await page.getAttribute("#savings", "data-keep"), "3");
  assert.equal(await page.getAttribute("#savings", "data-move"), "3");
  assert.equal(await page.getAttribute("#savings", "data-archive"), "4");
  assert.equal(await page.getAttribute("#savings", "data-annual-cents"), "126000");
  assert.match(await page.innerText("#savings"), /\$1,260\.00/);
  await assertNoHScroll(page);

  await page.fill("#z90", "9");
  await page.click("#go");
  assert.equal(await page.getAttribute("#results", "data-math"), "no");
  assert.equal(await page.locator("td[data-bucket='keep']").count(), 0);
  assert.deepEqual(toolNetwork(hits), []);
  await page.close();
});
