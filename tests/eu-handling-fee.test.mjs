// Free €2 Union handling fee estimate on the EU product ID page.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const html = readFileSync(path.join(ROOT, "tools/eu-product-id-check/index.html"), "utf8");
const deadline = readFileSync(path.join(ROOT, "deadlines/eu-product-identifiers-nov-1.html"), "utf8");

function element(source, id) {
  const at = source.indexOf(`id="${id}"`);
  assert.notEqual(at, -1, id);
  const start = source.lastIndexOf("<", at);
  const gt = source.indexOf(">", start);
  const tag = source.slice(start + 1, gt).split(/\s/)[0];
  const open = "<" + tag;
  const close = `</${tag}>`;
  let depth = 1;
  let i = gt + 1;
  while (depth) {
    const nxtOpen = source.indexOf(open, i);
    const nxtClose = source.indexOf(close, i);
    assert.notEqual(nxtClose, -1, tag);
    const after = nxtOpen === -1 ? "" : source.slice(nxtOpen + open.length, nxtOpen + open.length + 1);
    if (nxtOpen !== -1 && nxtOpen < nxtClose && (after === " " || after === ">" || after === "/")) {
      depth += 1;
      i = nxtOpen + open.length;
    } else {
      depth -= 1;
      i = nxtClose + close.length;
    }
  }
  return source.slice(start, i);
}

function feeEstimateFromPage() {
  const start = html.indexOf("function feeEstimate(");
  assert.notEqual(start, -1);
  const end = html.indexOf("function paint(", start);
  assert.notEqual(end, -1);
  return vm.runInNewContext(
    html.slice(start, end) + "\nfunction euros(n) { return '\\u20ac' + String(n); }\nfeeEstimate;",
    {},
    { filename: "feeEstimate.js" }
  );
}

test("the fee section states the free estimate, the buyer, and the kit limit", () => {
  const section = element(html, "eu-fee");
  assert.match(section, /<h2 id="eu-fee-h">New since Nov 1: the €2 EU handling fee<\/h2>/);
  assert.match(section, /This is a free estimate\./);
  assert.ok(html.indexOf('id="what"') < html.indexOf('id="eu-fee"'));
  assert.match(section, /sellers outside the EU who ship online orders to consumers in the EU/);
  assert.match(section, /business-to-business sales to a taxable person/);
  assert.match(section, /EU-based sellers shipping goods that are already in the EU/);
  assert.match(section, /The kit covers product identifiers; the fee math above is free\./);
  assert.match(section, /fix_list\.csv/);
  assert.match(section, /template\.xlsx/);
  assert.match(section, /code Y081/);
  assert.match(section, /generally final once access has been provided/);
  assert.match(section, /materially defective or not delivered as described/);
  assert.match(section, /30-day refund policy/);
  assert.match(section, /General guidance, not legal, tax or customs advice\./);
  assert.match(section, /Thanks for your time\. If this isn't right for you, please share it with someone it could help\./);
  assert.match(section, /shall be EUR 2 per item/);
  assert.match(section, /It shall apply from 1 November 2026/);
  assert.match(section, /per declaration line/);
  assert.match(section, /Estimate before VAT/);
  assert.match(section, /https:\/\/eur-lex\.europa\.eu\/legal-content\/EN\/TXT\/\?uri=CELEX:32026R2152/);
  assert.match(section, /https:\/\/taxation-customs\.ec\.europa\.eu\/document\/download\/053e5b4e-f0be-4f20-9a23-3e3b659a6676_en/);
  assert.match(section, /https:\/\/taxation-customs\.ec\.europa\.eu\/customs\/eu-customs-reform_en/);
  const href = section.match(/id="eu-fee-kit"[^>]*href="([^"]+)"/)[1].replace(/&amp;/g, "&");
  const url = new URL(href);
  assert.equal(url.origin + url.pathname, "https://firstmoverprojects.gumroad.com/l/fetwsm");
  assert.equal(url.searchParams.get("wanted"), "true");
  assert.equal(url.searchParams.get("utm_source"), "site");
  assert.equal(url.searchParams.get("utm_medium"), "site");
  assert.equal(url.searchParams.get("utm_campaign"), "tools");
  assert.equal(url.searchParams.get("utm_content"), "eu-fee");
  assert.match(section, /class="btn"/);
  assert.equal((html.match(/src="https:\/\/gc\.zgo\.at\/count\.js"/g) || []).length, 1);
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(scripts, ["https://gc.zgo.at/count.js"]);
});

test("the estimate is €2 per line, plus €3 only at EUR 150 or under, before VAT", () => {
  const feeEstimate = feeEstimateFromPage();
  const low = feeEstimate("3", true);
  assert.equal(low.ok, true);
  assert.equal(low.fee, 6);
  assert.equal(low.duty, 9);
  assert.equal(low.total, 15);
  assert.match(low.text, /€2 × 3 = €6 handling fee/);
  assert.match(low.text, /€3 × 3 = €9 temporary customs duty/);
  assert.match(low.text, /€15 estimate before VAT/);

  const high = feeEstimate("3", false);
  assert.equal(high.fee, 6);
  assert.equal(high.duty, 0);
  assert.equal(high.total, 6);
  assert.match(high.text, /€6 estimate before VAT/);
  assert.equal(/€9/.test(high.text), false);
  assert.match(high.text, /does not exceed EUR 150/);

  const one = feeEstimate("1", true);
  assert.equal(one.total, 5);
  assert.equal(feeEstimate("0", false).total, 0);

  for (const bad of ["", "  ", "2.5", "-1", "1e2", "1000000", "3 lines"]) {
    const result = feeEstimate(bad, true);
    assert.equal(result.ok, false, bad);
    assert.match(result.text, /whole number/);
  }
});

test("the EU deadline page points at the fee estimate in one line", () => {
  assert.match(
    deadline,
    /New since Nov 1: a free estimate of the €2 EU handling fee is on the <a href="\/tools\/eu-product-id-check\/#eu-fee">product ID check<\/a>\./
  );
  assert.equal((deadline.match(/#eu-fee/g) || []).length, 1);
});
