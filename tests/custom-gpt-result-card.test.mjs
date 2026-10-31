// Custom GPT checker: one plain result, then one Gumroad button, then thanks and share.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const REL = "tools/custom-gpt-retirement-checker/index.html";
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
  const end = html.indexOf("window.__checkerLead=leadFor;", start);
  assert.notEqual(end, -1);
  const body = html.slice(start, end);
  return vm.runInNewContext(body + "\nleadFor;", {}, { filename: "leadFor.js" });
}

test("the answer block leads with one result, one kit button, thanks, and a share line", () => {
  const results = element(html, "results");
  const card = element(results, "result-cta");
  const order = ["result-problem", "result-deadline", "kit-result", "thanks", "share-line", "summary", "out"];
  let at = -1;
  for (const id of order) {
    const next = results.indexOf(id === "thanks" || id === "share-line" ? `class="${id}"` : `id="${id}"`);
    assert.ok(next > at, id);
    at = next;
  }
  assert.equal((results.match(/gumroad\.com/g) || []).length, 1);
  assert.equal((results.match(/<a\b/g) || []).length, 2);
  assert.equal(/follow-bar|email-cap|btn-buy-now|btn-email|sibforms/.test(results), false);
  assert.match(card, /Thank you for your time\./);
  assert.match(card, /Share it with someone it could help\./);
  assert.match(card, /Dec 11, 2026/);
  const href = card.match(/id="kit-result"[^>]*href="([^"]+)"/)[1].replace(/&amp;/g, "&");
  const url = new URL(href);
  assert.equal(url.pathname, "/l/iqnssc");
  assert.equal(url.searchParams.get("wanted"), "true");
  assert.equal(url.searchParams.get("utm_source"), "site");
  assert.equal(url.searchParams.get("utm_medium"), "site");
  assert.equal(url.searchParams.get("utm_campaign"), "custom-gpt-retirement-checker");
  assert.equal(url.searchParams.get("utm_content"), "result-cta");
  assert.equal(card.split('id="kit-result"').length - 1, 1);
  assert.match(html, /not affiliated with, endorsed or sponsored by OpenAI/);
  assert.equal(/document\.cookie/.test(html), false);
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(scripts, ["https://gc.zgo.at/count.js"]);
});

test("the result names the date that applies to the answer", () => {
  const leadFor = leadForFromPage();
  const user = leadFor(false, false, false);
  assert.match(user.problem, /only use this GPT/);
  assert.match(user.deadline, /Dec 11, 2026/);
  assert.match(user.problem + user.deadline, /do not need to migrate/);

  const creator = leadFor(true, false, false);
  assert.match(creator.problem, /Dec 11, 2026/);
  assert.match(creator.deadline, /inaccessible/);
  assert.match(creator.deadline, /do not carry over/);

  const actions = leadFor(true, false, true);
  assert.match(actions.deadline, /Custom actions on it do not transfer/);
  assert.match(actions.deadline, /Dec 11, 2026/);

  const enterprise = leadFor(true, true, true);
  assert.match(enterprise.problem, /Enterprise/);
  assert.match(enterprise.deadline, /Dec 11, 2026/);
  assert.match(enterprise.deadline, /Feb 11, 2027/);
  assert.match(enterprise.deadline, /Oct 26, 2026/);
  assert.match(enterprise.deadline, /FedRAMP/);
  assert.match(enterprise.deadline, /deferral alone does not preserve eligibility/);
});
