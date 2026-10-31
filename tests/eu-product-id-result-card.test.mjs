// EU product ID checker: one plain result, then one Gumroad button, then the thanks line.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const REL = "tools/eu-product-id-check/index.html";
const html = readFileSync(path.join(ROOT, REL), "utf8");

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

function leadForFromPage() {
  const start = html.indexOf("function leadFor(");
  assert.notEqual(start, -1);
  const end = html.indexOf("function render(", start);
  assert.notEqual(end, -1);
  return vm.runInNewContext(html.slice(start, end) + "\nleadFor;", {}, { filename: "leadFor.js" });
}

test("the page opens by saying what the checker is", () => {
  assert.match(
    html,
    /<h1>EU Nov 1 Product ID Quick Check<\/h1>\n<p id="what">This is a free checker that tells you /
  );
  const what = element(html, "what");
  assert.match(what, /November 1, 2026/);
  assert.match(what, /EUR 150/);
  assert.ok(html.indexOf('id="what"') < html.indexOf('id="who"'));
});

test("the answer block leads with one result, one kit button, and the thanks line", () => {
  const results = element(html, "results");
  const card = element(results, "result-cta");
  const order = ["result-problem", "next-steps", "result-deadline", "disclaimer", "kit-result", "thanks"];
  let at = -1;
  for (const id of order) {
    const next = id === "thanks" || id === "disclaimer"
      ? results.indexOf(`class="${id}"`)
      : results.indexOf(`id="${id}"`);
    assert.ok(next > at, id);
    at = next;
  }
  assert.equal((results.match(/gumroad\.com/g) || []).length, 1);
  assert.equal(/follow-bar|email-cap|btn-buy-now|btn-email|sibforms/.test(results), false);
  assert.match(card, /Thanks for your time\. If this isn't for you, share it with someone it could help\./);
  assert.match(card, /November 1, 2026/);
  assert.match(card, /EUR 150/);
  assert.match(card, /General guidance, not legal, tax or IT advice/);
  const href = card.match(/id="kit-result"[^>]*href="([^"]+)"/)[1].replace(/&amp;/g, "&");
  const url = new URL(href);
  assert.equal(url.pathname, "/l/fetwsm");
  assert.equal(url.searchParams.get("wanted"), "true");
  assert.equal(url.searchParams.get("utm_source"), "site");
  assert.equal(url.searchParams.get("utm_medium"), "site");
  assert.equal(url.searchParams.get("utm_campaign"), "eu-product-id-check");
  assert.equal(url.searchParams.get("utm_content"), "result-cta");
  assert.equal(card.split('id="kit-result"').length - 1, 1);
  assert.match(html, /Not affiliated with the European Commission or any customs authority/);
  assert.match(html, /General guidance, not legal, tax or IT advice/);
  assert.match(html, /id="faq"/);
  assert.match(html, /property="og:image"/);
  assert.match(html, /name="twitter:card"/);
  assert.equal(/document\.cookie/.test(html), false);
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(scripts, ["https://gc.zgo.at/count.js"]);
  assert.match(html, /#kit-result\{[^}]*min-height:48px/);
});

test("the result names the date, the rule, and the next step for that answer", () => {
  const leadFor = leadForFromPage();
  const fixes = leadFor({ processed: 6, needsFix: 4, y081: 2, capped: false, totalDataRows: 6 });
  assert.equal(fixes.problem, "4 of 6 rows need a fix before November 1, 2026.");
  assert.equal(fixes.steps.length, 3);
  assert.match(fixes.steps[0], /Needs a fix/);
  assert.match(fixes.steps[1], /2 rows have no barcode/);
  assert.match(fixes.steps[1], /Y081/);
  assert.match(fixes.steps[2], /customs declaration/);

  const one = leadFor({ processed: 6, needsFix: 1, y081: 0, capped: false, totalDataRows: 6 });
  assert.equal(one.problem, "1 of 6 rows needs a fix before November 1, 2026.");

  const clear = leadFor({ processed: 1, needsFix: 0, y081: 0, capped: false, totalDataRows: 1 });
  assert.match(clear.problem, /No problems found in these checks/);
  assert.match(clear.problem, /November 1, 2026/);
  assert.equal(clear.steps.length, 2);
  assert.match(clear.steps[0], /empty barcode is a note/);

  const empty = leadFor({ processed: 0, needsFix: 0, y081: 0, capped: false, totalDataRows: 0 });
  assert.match(empty.problem, /No rows were checked/);
  assert.match(empty.problem, /November 1, 2026/);
  assert.equal(empty.steps.length, 3);

  const capped = leadFor({ processed: 25, needsFix: 1, y081: 1, capped: true, totalDataRows: 40 });
  assert.equal(capped.steps.length, 3);
  assert.match(capped.steps.join(" "), /first 25 only/);
  assert.match(capped.steps.join(" "), /Y081/);
  assert.equal(/customs declaration/.test(capped.steps.join(" ")), false);
});
