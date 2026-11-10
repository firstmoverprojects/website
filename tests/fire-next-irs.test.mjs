// The line under the FIRE checklist button follows America/Chicago for Nov 9
// and 3 p.m. Eastern for Nov 19. Static HTML is the post-Nov-19 sentence.
// The apply() cases still feed the pre-Nov-9 sentence to prove that flip is unchanged.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const html = readFileSync(path.join(ROOT, "tools/fire-to-iris-check/index.html"), "utf8");
const STATIC = "Next IRS date: Nov 9, 2026, the last day to change your IR Application for TCC (after that it is read-only). Last day to file on FIRE: Nov 19, 2026, 3 p.m. ET. ";
const NOV19_LINE = "Last day to file on FIRE: Nov 19, 2026, 3 p.m. ET. ";
const CLOSED = "FIRE is closed. IRIS is the only IRS e-file system for information returns from Jan 1, 2027.";

function load() {
  const match = html.match(/<script id="fmp-next-irs">([\s\S]*?)<\/script>/);
  assert.ok(match, "fmp-next-irs script");
  const sandbox = { document: { getElementById() { return null; } }, Date, Intl, Object };
  sandbox.window = sandbox;
  vm.runInNewContext(match[1], sandbox, { filename: "fmp-next-irs.js" });
  return sandbox.FMP_NEXT_IRS;
}

function line(copyText) {
  const copy = { textContent: copyText };
  return {
    copy,
    textContent: "",
    querySelector(sel) {
      assert.equal(sel, "[data-next-irs-copy]");
      return copy;
    }
  };
}

test("static HTML states the Nov 19 filing day in the past tense and keeps the IRS link", () => {
  assert.match(html, /data-next-irs-copy="">Nov 19, 2026 at 3 p\.m\. ET was the last day to file information returns through FIRE\. IRIS is the only system after Jan\. 1, 2027\. Nov 9, 2026 was the last day to change IR Applications for TCC, and those applications are now read-only\. <\/span>Source: <a href="https:\/\/www\.irs\.gov\/e-file-providers\/filing-information-returns-electronically-fire"/);
  assert.equal(html.includes("Next IRS date: Nov 9, 2026"), false);
  const cards = html.slice(html.indexOf('aria-label="IRS FIRE and IRIS dates"'), html.indexOf('aria-labelledby="facts-h"'));
  const order = ["cd-nov9", "cd-nov19", "cd-jan1", "cd-nov1"].map((id) => cards.indexOf('id="' + id + '"'));
  assert.deepEqual(order, order.slice().sort((a, b) => a - b));
  assert.ok(order[0] >= 0);
  assert.match(cards, /id="cd-jan1"[\s\S]*IRIS-only e-filing[\s\S]*Jan 1, 2027/);
  assert.match(cards, /id="cd-nov1"[\s\S]*Nov 1, 2026 \(passed\)/);
  const top = html.match(/id="kit-top"[^>]*href="([^"]+)"/);
  const result = html.match(/id="kit-result"[^>]*href="([^"]+)"/);
  const sticky = html.match(/data-goatcounter-click="cta\/fire-check-sticky"[^>]*href="([^"]+)"/);
  assert.equal(top[1].includes("utm_content=fire-check-top"), true);
  assert.equal(result[1].includes("utm_content=fire-result-need-tcc"), true);
  assert.equal(sticky[1].includes("utm_content=fire-check-sticky"), true);
  assert.equal(top[1].includes("fire-to-iris-switch-checklist"), true);
});

test("Nov 9 stays through the Chicago day, then only Nov 19, then the closed line", () => {
  const api = load();
  assert.equal(api.chicagoYmd(new Date("2026-11-10T05:59:59Z")), "2026-11-09");
  assert.equal(api.chicagoYmd(new Date("2026-11-10T06:00:00Z")), "2026-11-10");
  assert.equal(new Date(api.NOV19).toISOString(), "2026-11-19T20:00:00.000Z");

  const during = line(STATIC);
  assert.equal(api.apply(during, new Date("2026-11-03T16:00:00Z")), "static");
  assert.equal(during.copy.textContent, STATIC);
  assert.equal(api.apply(during, new Date("2026-11-10T05:59:59Z")), "static");
  assert.equal(during.copy.textContent, STATIC);

  const after9 = line(STATIC);
  assert.equal(api.apply(after9, new Date("2026-11-10T06:00:00Z")), "nov19");
  assert.equal(after9.copy.textContent, NOV19_LINE);
  assert.equal(api.apply(after9, new Date("2026-11-19T19:59:59Z")), "nov19");
  assert.equal(after9.copy.textContent, NOV19_LINE);

  const closed = line(STATIC);
  assert.equal(api.apply(closed, new Date("2026-11-19T20:00:00Z")), "closed");
  assert.equal(closed.textContent, CLOSED);
  assert.equal(api.apply(closed, new Date("2027-01-01T06:00:00Z")), "closed");
  assert.equal(closed.textContent, CLOSED);
});
