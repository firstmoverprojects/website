// LaunchFree upvote pills and the client-side GTIN / fee break-even helper.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PILL = "Listed on The Runway (LaunchFree.io) — Upvote This Free Tool";
const LISTINGS = {
  "tools/loom-seat-audit-calculator/index.html":
    "https://launchfree.io/listings/loom-seat-audit-and-creator-lite-migration-calculator.html",
  "tools/amazon-coi-check/index.html":
    "https://launchfree.io/listings/amazon-nov-2-coi-pre-check.html",
  "tools/fire-to-iris-check/index.html":
    "https://launchfree.io/listings/irs-fire-to-iris-readiness-and-1099-csv-header-check.html",
  "tools/after-hours-gap-check/index.html":
    "https://launchfree.io/listings/after-hours-lead-capture-side-by-side-scorecard.html",
  "tools/etsy-photo-audit-check/index.html":
    "https://launchfree.io/listings/etsy-real-photo-and-listing-audit-check.html",
  "tools/custom-gpt-retirement-checker/index.html":
    "https://launchfree.io/listings/custom-gpt-retirement-checker.html"
};
const COMMERCE = {
  "tools/amazon-coi-check/index.html":
    "https://firstmoverprojects.gumroad.com/l/amazon-1m-insurance-readiness-kit?wanted=true&utm_source=firstmoverprojects&utm_medium=amazon-coi-check&utm_campaign=amazon-1m-insurance-readiness-kit&utm_content=gtin-helper",
  "tools/etsy-photo-audit-check/index.html":
    "https://firstmoverprojects.gumroad.com/l/lnfgc?wanted=true&utm_source=firstmoverprojects&utm_medium=etsy-photo-check&utm_campaign=lnfgc&utm_content=gtin-helper"
};
const BANNED = [/C\.?\s*J\.?\s*Crispin/i, /CurioFinch/i];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function gtinSource(html) {
  const start = html.indexOf("/* FMP_GTIN */");
  assert.notEqual(start, -1);
  const end = html.indexOf("</script>", start);
  assert.notEqual(end, -1);
  return html.slice(start, end);
}

function loadGtin(html) {
  const sandbox = {};
  sandbox.window = sandbox;
  vm.runInNewContext(gtinSource(html), sandbox, { filename: "gtin.js" });
  assert.equal(typeof sandbox.FMP_GTIN.quote, "function");
  return sandbox.FMP_GTIN;
}

function section(html, id) {
  const at = html.indexOf(`id="${id}"`);
  assert.notEqual(at, -1, id);
  const start = html.lastIndexOf("<section", at);
  const end = html.indexOf("</section>", at);
  assert.ok(start !== -1 && end !== -1);
  return html.slice(start, end + "</section>".length);
}

test("each live LaunchFree tool has one Runway upvote pill", () => {
  for (const [rel, href] of Object.entries(LISTINGS)) {
    const html = read(rel);
    assert.equal(html.split(PILL).length - 1, 1, rel);
    assert.equal(html.split(href).length - 1, 1, rel);
    assert.equal(html.split("https://launchfree.io/").length - 1, 1, rel);
    const tag = html.match(/<a\b[^>]*class="runway-pill"[^>]*>/)[0];
    assert.ok(tag.includes(`href="${href}"`), rel);
    assert.match(tag, /target="_blank"/, rel);
    assert.match(tag, /rel="noopener noreferrer"/, rel);
    assert.match(html, /a\.runway-pill\{[^}]*background:#01060b/, rel);
    assert.match(html, /a\.runway-pill\{[^}]*color:#f4f7fa !important/, rel);
    assert.match(html, /a\.runway-pill\{[^}]*border:1px solid #00d8ff/, rel);
    assert.match(html, /a\.runway-pill\{[^}]*border-radius:999px/, rel);
    for (const banned of BANNED) assert.equal(banned.test(html), false, rel);
  }
});

test("Amazon and Etsy helpers validate GTIN-12/13/14 and price the fee break-even", () => {
  const amazon = read("tools/amazon-coi-check/index.html");
  const etsy = read("tools/etsy-photo-audit-check/index.html");
  assert.equal(gtinSource(amazon), gtinSource(etsy));
  assert.equal(amazon.includes(".innerHTML"), false);
  assert.equal(amazon.includes("document.write"), false);
  assert.equal(gtinSource(amazon).includes("fetch("), false);
  assert.equal(gtinSource(amazon).includes("sendBeacon"), false);

  for (const [rel, checkout] of Object.entries(COMMERCE)) {
    const html = read(rel);
    const block = section(html, "gtin-fee");
    assert.match(block, /Quick GTIN \/ Barcode Check-Digit &amp; Break-Even Fee Calculator/);
    assert.match(block, /id="gtin-code"/);
    assert.match(block, /id="gtin-price"/);
    assert.match(block, /id="gtin-cost"/);
    assert.match(block, /id="gtin-fee-pct"/);
    assert.match(block, /id="gtin-fixed"/);
    assert.match(block, /id="gtin-go"/);
    assert.equal(/<form[\s>]/i.test(block), false, rel);
    assert.ok(block.includes(checkout.replace(/&/g, "&amp;")), rel);
    const checkoutTag = block.match(/<a\b[^>]*id="gtin-checkout"[^>]*>/)[0];
    assert.match(checkoutTag, /class="gtin-checkout"/);
    assert.match(checkoutTag, /target="_blank"/);
    assert.match(checkoutTag, /rel="noopener"/);
    assert.equal(/noreferrer/i.test(checkoutTag), false, rel);
    assert.match(checkoutTag, /referrerpolicy="strict-origin-when-cross-origin"/);
    assert.match(block, /href="\/deadlines\/#signup"/);
    assert.match(html, /a\.gtin-checkout\{[^}]*background:linear-gradient\(135deg,#22c55e 0%,#4ade80 100%\)/);
    assert.match(html, /a\.gtin-checkout\{[^}]*color:#01060b !important/);
    assert.match(html, /\.gtin-card\{[^}]*background:#01060b/);
    assert.match(html, /\.gtin-card\{[^}]*border:1px solid #00d8ff/);
  }

  const gtin = loadGtin(amazon);
  const upc = gtin.checkCode("036000291452");
  assert.equal(upc.state, "valid");
  assert.equal(upc.kind, "UPC-A (GTIN-12)");
  assert.equal(gtin.checkCode("0 36000-29145 2").state, "valid");
  const badUpc = gtin.checkCode("036000291453");
  assert.equal(badUpc.state, "invalid");
  assert.equal(badUpc.reason, "check");
  assert.equal(badUpc.expect, 2);
  assert.equal(badUpc.corrected, "036000291452");
  assert.equal(gtin.checkCode(badUpc.corrected).state, "valid");

  const ean = gtin.checkCode("5901234123457");
  assert.equal(ean.state, "valid");
  assert.equal(ean.kind, "EAN-13 (GTIN-13)");
  assert.match(gtin.quote({ code: "5901234123457" }).lines.codeLine, /is an EAN-13 \(GTIN-13\)/);
  assert.match(gtin.quote({ code: "036000291452" }).lines.codeLine, /is a UPC-A \(GTIN-12\)/);
  assert.match(gtin.quote({ code: "05901234123456" }).lines.codeLine, /A GTIN-14 should end in/);
  const gtin14 = gtin.checkCode("05901234123457");
  assert.equal(gtin14.state, "valid");
  assert.equal(gtin14.kind, "GTIN-14");
  assert.equal(gtin.checkCode("012345678905").kind, "UPC-A (GTIN-12)");
  assert.equal(gtin.checkCode("12345670").reason, "length");
  assert.equal(gtin.checkCode("03600029145A").reason, "chars");

  const even = gtin.quote({ code: "036000291452", price: "24.00", cost: "$8.50", percent: "15%", fixed: "" });
  assert.equal(even.code.state, "valid");
  assert.equal(even.money.feeCents, 360);
  assert.equal(even.money.netCents, 1190);
  assert.equal(even.money.breakEvenCents, 1000);
  assert.equal(even.money.clears, true);
  assert.match(even.lines.feeLine, /Fee on \$24\.00 at 15% plus \$0\.00 fixed is \$3\.60\./);
  assert.match(even.lines.netLine, /\$11\.90 remains/);
  assert.equal(even.lines.beLine, "Break-even sale price: $10.00.");
  assert.match(even.lines.note, /covers the unit cost and the fee/);

  const short = gtin.quote({ price: "9", cost: "8.50", percent: "15", fixed: "0" });
  assert.equal(short.money.clears, false);
  assert.equal(short.money.breakEvenCents, 1000);
  assert.match(short.lines.note, /below the break-even price/);

  const rounded = gtin.quote({ cost: "10.00", percent: "15.5", fixed: "0.30" });
  assert.equal(rounded.money.bps, 1550);
  assert.equal(rounded.money.fixedCents, 30);
  assert.equal(rounded.money.priceCents, null);
  assert.ok(rounded.money.breakEvenCents > 0);
  const be = rounded.money.breakEvenCents;
  const fee = Math.round(be * 1550 / 10000) + 30;
  assert.ok(be - 1000 - fee >= 0);
  assert.ok(be === 0 || (be - 1) - 1000 - (Math.round((be - 1) * 1550 / 10000) + 30) < 0);

  const fullFee = gtin.quote({ price: "20", cost: "5", percent: "100" });
  assert.equal(fullFee.money.breakEvenCents, null);
  assert.match(fullFee.lines.beLine, /no break-even sale price/);

  const empty = gtin.quote({});
  assert.equal(empty.code.state, "empty");
  assert.equal(empty.money.state, "skipped");
  assert.match(empty.lines.note, /Enter a barcode, a sale price, or both/);
  assert.match(gtin.quote({ price: "nope", cost: "1", percent: "15" }).lines.note, /sale price/);
});
