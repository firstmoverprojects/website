// Deadline landing page for the FIRE retirement. The next date, the kit
// offer, and the FAQ stay aligned with the free check and the IRS pages.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PAGE = "deadlines/irs-fire-retirement-nov-19.html";
const html = readFileSync(path.join(ROOT, PAGE), "utf8");
const tool = readFileSync(path.join(ROOT, "tools/fire-to-iris-check/index.html"), "utf8");
const STATIC = "Next IRS date: Nov 9, 2026, the last day to change your IR Application for TCC (after that it is read-only). Last day to file on FIRE: Nov 19, 2026, 3 p.m. ET. ";
const NOV19_LINE = "Last day to file on FIRE: Nov 19, 2026, 3 p.m. ET. ";
const CLOSED = "FIRE is closed. IRIS is the only IRS e-file system for information returns from Jan 1, 2027.";
const PRODUCT = "https://firstmoverprojects.gumroad.com/l/fire-to-iris-switch-checklist";
const FOOTER = "First Mover Projects, PO Box 98, Firth, NE 68358. firstmoverprojects@gmail.com. General guidance, not legal, tax or IT advice. Check the IRS's own pages for your case. Not affiliated with any vendor named on this page. Names are used only to describe compatibility.";

function hero() {
  const start = html.indexOf('<section class="hero"');
  const end = html.indexOf("</section>", start);
  return html.slice(start, end);
}

function load(id) {
  const match = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`));
  assert.ok(match, id);
  const sandbox = {
    document: {
      readyState: "complete",
      getElementById() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {}
    },
    Date,
    Intl,
    Object,
    String
  };
  sandbox.window = sandbox;
  vm.runInNewContext(match[1], sandbox, { filename: id + ".js" });
  return sandbox;
}

test("the hero answers first, then shows the next IRS date beside the checklist", () => {
  const top = hero();
  const answerAt = top.indexOf('class="answer-first"');
  const buyAt = top.indexOf('id="kit-top"');
  const nextAt = top.indexOf('id="next-irs"');
  assert.ok(answerAt !== -1 && answerAt < buyAt && buyAt < nextAt);
  assert.match(top, /This page lists the IRS FIRE retirement dates and what to do next\./);
  assert.match(top, /run the free check and finish any IR Application for TCC changes before the next date/);
  assert.match(top, /data-next-irs-copy="">Next IRS date: Nov 9, 2026, the last day to change your IR Application for TCC \(after that it is read-only\)\. Last day to file on FIRE: Nov 19, 2026, 3 p\.m\. ET\. <\/span>/);
  assert.match(top, /Refunds: within 30 days if a file is corrupt or materially not as described\./);
  assert.match(top, /One PDF, 3 pages/);
  assert.equal(/Nov(?:ember)? 1\b/.test(top), false);
  assert.equal(top.includes("(passed)"), false);
  const free = top.indexOf('href="/tools/fire-to-iris-check/"');
  assert.ok(free !== -1 && free < buyAt);
});

test("passed Nov 1 is marked passed and is not the first date", () => {
  const dates = html.slice(html.indexOf('id="dates-h"'), html.indexOf('id="sum-h"'));
  const order = ["Nov 9, 2026", "Nov 19, 2026, 3 p.m. ET", "Jan 1, 2027", 'data-status="passed"'].map((token) => dates.indexOf(token));
  assert.deepEqual(order, order.slice().sort((a, b) => a - b));
  assert.match(dates, /data-passed-end="nov1" data-passed-base="Nov 1, 2026">Nov 1, 2026 \(passed\)/);
  assert.match(dates, /data-passed-end="nov9" data-passed-base="Nov 9, 2026">Nov 9, 2026</);
  assert.equal(dates.includes("Nov 9, 2026 (passed)"), false);
  assert.match(dates, /That date has passed\./);
});

test("checklist links reuse the tool page product, price, labels, and click names", () => {
  const toolTop = tool.match(/id="kit-top"[^>]*>/);
  assert.ok(toolTop);
  assert.match(toolTop[0], /utm_content=fire-check-top/);
  assert.match(html, /id="kit-top"[^>]*data-goatcounter-click="cta\/fire-check-top"[^>]*href="https:\/\/firstmoverprojects\.gumroad\.com\/l\/fire-to-iris-switch-checklist\?wanted=true&amp;utm_source=site&amp;utm_medium=site&amp;utm_campaign=irs-fire-retirement-nov-19&amp;utm_content=fire-check-top"/);
  assert.match(html, /id="kit-result"[^>]*data-goatcounter-click="cta\/fire-check-result"[^>]*utm_content=fire-check-result"/);
  assert.match(html, /data-goatcounter-click="cta\/fire-check-sticky"[^>]*utm_content=fire-check-sticky"/);
  assert.match(html, />See the \$9 FIRE to IRIS checklist</);
  assert.match(html, />Get the \$9 checklist \(PDF, instant download\)</);
  assert.match(html, />Get the checklist</);
  assert.equal(html.includes("FIRE→IRIS"), false);
  assert.equal(html.split(PRODUCT).length - 1, 3);
  const hrefs = [...html.matchAll(/https:\/\/firstmoverprojects\.gumroad\.com\/l\/[^"']+/g)].map((match) => match[0].replace(/&amp;/g, "&"));
  assert.equal(hrefs.length, 3);
  for (const href of hrefs) {
    const url = new URL(href);
    assert.equal(url.origin + url.pathname, PRODUCT);
    assert.equal(url.searchParams.get("wanted"), "true");
    assert.equal(url.searchParams.get("utm_source"), "site");
    assert.equal(url.searchParams.get("utm_medium"), "site");
    assert.equal(url.searchParams.get("utm_campaign"), "irs-fire-retirement-nov-19");
  }
});

test("the kit is described as one 3-page PDF and the house lines stay", () => {
  assert.match(html, /One 3-page PDF with the IRS dates and links, your FIRE account steps, the IRIS Application for TCC, 2027 prep, and a 1099-NEC add-on\./);
  assert.equal(html.includes(FOOTER), true);
  assert.equal(html.includes("Deadlines for small businesses, in plain English, with source links."), true);
  assert.equal(html.includes("General guidance, not legal, tax or IT advice. Check the IRS's own pages and ask your tax professional for your situation. Not affiliated with the IRS. Names are used only to describe compatibility."), true);
  assert.equal(html.includes("\u2014"), false);
  assert.equal(html.includes("\u2013"), false);
  assert.equal(html.includes("&mdash;"), false);
  assert.equal(/\bofficial\b/i.test(html), false);
  assert.equal(html.includes("setInterval"), false);
  assert.equal(html.includes("deadline-count"), false);
  assert.equal(/days left/i.test(html), false);
  assert.equal(html.includes('id="fmp-deadline"'), false);
});

test("FAQPage JSON matches the visible questions and answers", () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)];
  const data = blocks.map((block) => JSON.parse(block[1])).find((item) => item["@type"] === "FAQPage");
  assert.ok(data);
  assert.equal(data.dateModified, "2026-11-04");
  const faq = html.slice(html.indexOf('id="faq-h"'), html.indexOf('id="src-h"'));
  const questions = [...faq.matchAll(/<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)];
  assert.equal(questions.length, data.mainEntity.length);
  data.mainEntity.forEach((item, i) => {
    assert.equal(item["@type"], "Question");
    assert.equal(item.acceptedAnswer["@type"], "Answer");
    assert.equal(item.name, questions[i][1]);
    assert.equal(item.acceptedAnswer.text, questions[i][2]);
  });
});

test("the next-date line drops a passed date and the passed marks follow Eastern time", () => {
  const next = load("fmp-next-irs").FMP_NEXT_IRS;
  const passed = load("fmp-passed-dates").FMP_PASSED_DATES;
  assert.equal(next.apply({ textContent: STATIC, querySelector() { return { textContent: STATIC }; } }, new Date("2026-11-04T16:00:00Z")), "static");
  const after9 = { textContent: "" };
  const node = {
    textContent: "",
    querySelector(sel) {
      assert.equal(sel, "[data-next-irs-copy]");
      return after9;
    }
  };
  assert.equal(next.apply(node, new Date("2026-11-10T06:00:00Z")), "nov19");
  assert.equal(after9.textContent, NOV19_LINE);
  const closed = { textContent: STATIC, querySelector() { return null; } };
  assert.equal(next.apply(closed, new Date("2026-11-19T20:00:00Z")), "closed");
  assert.equal(closed.textContent, CLOSED);
  assert.equal(passed.passed(new Date("2026-11-04T16:00:00Z"), passed.ENDS.nov1), true);
  assert.equal(passed.passed(new Date("2026-11-04T16:00:00Z"), passed.ENDS.nov9), false);
  assert.equal(passed.withPassed("Nov 9, 2026", false), "Nov 9, 2026");
  assert.equal(passed.withPassed("Nov 9, 2026", true), "Nov 9, 2026 (passed)");
});
