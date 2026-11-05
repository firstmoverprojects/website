// 1099-NEC or 1099-K checker. Thresholds are the IRS figures cited on the page.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const REL = "tools/1099-nec-or-1099-k-check/index.html";
const html = readFileSync(path.join(ROOT, REL), "utf8");

function loadApi() {
  const marker = html.indexOf("var HEADLINES");
  const start = html.lastIndexOf("<script>", marker);
  const end = html.indexOf("</script>", marker);
  const sandbox = {
    document: {
      getElementById() { return null; },
      getElementsByName() { return []; },
      addEventListener() {}
    },
    window: {}
  };
  sandbox.window = sandbox;
  vm.runInNewContext(html.slice(start + "<script>".length, end), sandbox, { filename: REL });
  return sandbox.FMP_1099;
}

const api = loadApi();
const H = api.HEADLINES;

function decide(purpose, who, method, noncard) {
  return api.decide({ purpose, who, method, noncard });
}

test("the four answer headlines match the page copy", () => {
  assert.equal(H.nec, "1099-NEC is likely yours to file");
  assert.equal(H.k, "The card company or payment app reports it on 1099-K, so you likely don't file a 1099-NEC for those payments");
  assert.equal(H.mixed, "Mixed: file 1099-NEC only for the non-card portion");
  assert.equal(H.none, "Likely no 1099 needed");
  for (const line of Object.values(H)) assert.equal(html.includes(line), true, line);
});

test("business non-card services of $2,000 or more are Form 1099-NEC", () => {
  const result = decide("business", "contractor", "noncard", "least");
  assert.equal(result.id, "nec");
  assert.equal(result.headline, H.nec);
  assert.match(result.steps.join(" "), /at least \$2,000/);
  assert.match(result.steps.join(" "), /January 31/);
  assert.match(result.steps.join(" "), /IRIS/);
  assert.match(result.steps.join(" "), /11:59 p\.m\./);
  assert.equal(result.steps.includes(api.FILE_STEPS[0]), true);
});

test("attorney fees paid by check use the same Form 1099-NEC path and name the $600 gross-proceeds rule", () => {
  const result = decide("business", "attorney", "noncard", "least");
  assert.equal(result.id, "nec");
  assert.match(result.steps.join(" "), /\$600 or more go in box 10 of Form 1099-MISC/);
});

test("card and payment-app goods-and-services payments stay on Form 1099-K", () => {
  const result = decide("business", "contractor", "card", "none");
  assert.equal(result.id, "k");
  assert.equal(result.headline, H.k);
  const text = result.steps.join(" ");
  assert.match(text, /not subject to reporting on Form 1099-NEC/);
  assert.match(text, /\$20,000/);
  assert.match(text, /exceeds 200/);
  assert.match(text, /\$0\.01/);
  assert.match(text, /de minimis threshold is disregarded/);
  assert.equal(text.includes("1099-NEC is likely yours to file"), false);
});

test("a mix files Form 1099-NEC only for a non-card portion of $2,000 or more", () => {
  const result = decide("business", "contractor", "mixed", "least");
  assert.equal(result.id, "mixed");
  assert.equal(result.headline, H.mixed);
  const text = result.steps.join(" ");
  assert.match(text, /only for the cash, check, bank transfer, and ACH portion/);
  assert.match(text, /January 31/);
  assert.match(text, /IRIS/);
});

test("a card total plus a non-card total of $2,000 or more is the mixed answer", () => {
  const result = decide("business", "attorney", "card", "least");
  assert.equal(result.id, "mixed");
  assert.match(result.steps.join(" "), /box 10 of Form 1099-MISC/);
});

test("likely no 1099 for personal, wages, corporations, and non-card totals under $2,000", () => {
  assert.equal(decide("personal", "contractor", "noncard", "least").id, "none");
  assert.equal(decide("business", "employee", "noncard", "least").id, "none");
  assert.equal(decide("business", "corporation", "noncard", "least").id, "none");
  assert.equal(decide("business", "contractor", "noncard", "under").id, "none");
  const splitUnder = decide("business", "contractor", "mixed", "under");
  assert.equal(splitUnder.id, "none");
  assert.match(splitUnder.steps.join(" "), /Form 1099-K/);
  assert.match(decide("business", "employee", "card", "none").steps.join(" "), /Form W-2/);
  const under = decide("business", "contractor", "noncard", "under");
  assert.match(under.steps.join(" "), /under \$2,000/);
  assert.match(under.steps.join(" "), /before 2026, the IRS page says the reporting threshold was \$600/);
  assert.equal(under.steps.join(" ").includes("the 2026 threshold is $600"), false);
});

test("missing or contradictory answers do not pick a form", () => {
  assert.equal(decide("", "contractor", "noncard", "least").id, "unsure");
  assert.equal(decide("unsure", "contractor", "noncard", "least").id, "unsure");
  assert.equal(decide("business", "contractor", "noncard", "unsure").id, "unsure");
  assert.equal(decide("business", "contractor", "noncard", "none").id, "unsure");
  assert.equal(decide("business", "contractor", "mixed", "none").id, "unsure");
});

test("the page cites the IRS sources, the check date, and stays in the sitemap and tools index", () => {
  const sources = [
    "https://www.irs.gov/instructions/i1099mec",
    "https://www.irs.gov/publications/p1099",
    "https://www.irs.gov/businesses/small-businesses-self-employed/am-i-required-to-file-a-form-1099-or-other-information-return",
    "https://www.irs.gov/instructions/i1099k",
    "https://www.irs.gov/businesses/understanding-your-form-1099-k",
    "https://www.irs.gov/newsroom/form-1099-k-faqs-general-information",
    "https://www.irs.gov/filing/e-file-information-returns-with-iris",
    "https://www.irs.gov/businesses/small-businesses-self-employed/employment-tax-due-dates"
  ];
  for (const url of sources) assert.equal(html.includes(url), true, url);
  assert.match(html, /Checked November 5, 2026/);
  assert.match(html, /For payments made in 2026, the reporting threshold is \$2,000/);
  assert.match(html, /General guidance, not legal or tax advice\./);
  assert.match(html, /General guidance, not legal, tax or IT advice\./);
  assert.match(html, /"@type": "FAQPage"/);
  assert.match(html, /"@type": "WebApplication"/);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
  const faq = blocks.find((item) => item["@type"] === "FAQPage");
  const visible = html.slice(html.indexOf('id="faq-h"'), html.indexOf('id="src-h"') === -1 ? html.length : html.indexOf("Related:"));
  const questions = [...html.slice(html.indexOf('id="faq-h"')).matchAll(/<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)];
  assert.equal(questions.length, faq.mainEntity.length);
  faq.mainEntity.forEach((item, i) => {
    assert.equal(item.name, questions[i][1]);
    assert.equal(item.acceptedAnswer.text, questions[i][2]);
  });
  assert.equal(blocks.some((item) => item["@type"] === "WebApplication"), true);
  const questionsHtml = html.slice(html.indexOf('id="questions"'), html.indexOf('id="results"'));
  assert.match(questionsHtml, /<fieldset/);
  assert.equal((questionsHtml.match(/<legend>/g) || []).length, 4);
  const sitemap = readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  const index = readFileSync(path.join(ROOT, "tools/index.html"), "utf8");
  assert.match(sitemap, /<loc>https:\/\/firstmoverprojects\.com\/tools\/1099-nec-or-1099-k-check\/<\/loc>/);
  assert.match(index, /href="\/tools\/1099-nec-or-1099-k-check\/"/);
  assert.equal(visible.includes("<h3>"), true);
});
