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

test("each outcome sets its own checklist offer on the existing $9 product", () => {
  const cases = [
    ["business", "contractor", "noncard", "least", "nec", "1099-result-nec", false, false],
    ["business", "attorney", "noncard", "least", "nec", "1099-result-nec", false, false],
    ["business", "contractor", "card", "none", "k", "1099-result-k-only", true, true],
    ["business", "contractor", "card", "unsure", "k", "1099-result-k-only", true, true],
    ["business", "contractor", "mixed", "least", "mixed", "1099-result-split", false, false],
    ["business", "attorney", "card", "least", "mixed", "1099-result-split", false, false],
    ["personal", "contractor", "noncard", "least", "none", "1099-result-none", true, true],
    ["business", "employee", "noncard", "least", "none", "1099-result-none", true, true],
    ["business", "corporation", "noncard", "least", "none", "1099-result-none", true, true],
    ["business", "contractor", "noncard", "under", "none", "1099-result-none", true, true],
    ["business", "contractor", "mixed", "under", "none", "1099-result-none", true, true],
    ["", "contractor", "noncard", "least", "unsure", "1099-result-warn", false, false],
    ["unsure", "contractor", "noncard", "least", "unsure", "1099-result-warn", false, false],
    ["business", "unsure", "noncard", "least", "unsure", "1099-result-warn", false, false],
    ["business", "contractor", "unsure", "least", "unsure", "1099-result-warn", false, false],
    ["business", "contractor", "noncard", "unsure", "unsure", "1099-result-warn", false, false],
    ["business", "contractor", "noncard", "none", "unsure", "1099-result-warn", false, false],
    ["business", "contractor", "mixed", "none", "unsure", "1099-result-warn", false, false]
  ];
  for (const row of cases) {
    const result = decide(row[0], row[1], row[2], row[3]);
    const offer = api.offerFor(result.id);
    assert.equal(result.id, row[4], row.join("|"));
    assert.equal(offer.utm, row[5], result.id);
    assert.equal(offer.quiet, row[6], result.id);
    assert.equal(offer.nofit, row[7], result.id);
    assert.equal(html.includes(offer.lead), true, offer.lead);
    if (offer.nofit) assert.match(offer.lead, /You likely do not need to buy a checklist for this payment/);
    else assert.match(offer.lead, /the checklist puts the IRIS steps and a 1099-NEC add-on on one printable list\./i);
  }
  assert.match(api.offerFor("k").lead, /Keep your card and payment-app records/);
  assert.match(api.offerFor("k").lead, /\$2,000 or more/);
  const withheldHead = "If you withheld federal income tax, the amount is not the limit: Form 1099-NEC is still required; see the backup-withholding step above.";
  assert.equal(api.offerFor("none").lead.includes(withheldHead), true);
  assert.ok(api.offerFor("none").lead.indexOf(withheldHead) < api.offerFor("none").lead.indexOf("Watch the $2,000 threshold"));
  assert.match(api.offerFor("none").lead, /Watch the \$2,000 threshold/);
  assert.match(api.offerFor("none").lead, /keep notes on who you paid and how/);
  assert.match(api.offerFor("unsure").lead, /^Because you said/);
  assert.match(html, /utm_content=1099-result-nec/);
  assert.match(html, /id="kit-offer"/);
  assert.match(html, /id="result-irs">Not affiliated with or endorsed by the IRS\./);
  assert.match(html, /id="kit-refund">Refunds: within 30 days if a file is corrupt or materially not as described\./);
  assert.equal(html.includes("Not affiliated with the IRS."), false);
  const slugs = [...html.matchAll(/firstmoverprojects\.gumroad\.com\/l\/([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
  assert.ok(slugs.length >= 4);
  for (const slug of slugs) assert.equal(slug, "fire-to-iris-switch-checklist");
});

test("a no-fit none result keeps the backup withholding exception in the visible lead", () => {
  const head = "If you withheld federal income tax, the amount is not the limit: Form 1099-NEC is still required; see the backup-withholding step above.";
  const step = "If you withheld any federal income tax under the backup withholding rules, file Form 1099-NEC for that person no matter the amount. The instructions say to report that withholding in box 4.";
  const offer = api.offerFor("none");
  assert.equal(offer.utm, "1099-result-none");
  assert.equal(offer.quiet, true);
  assert.equal(offer.nofit, true);
  assert.equal(offer.lead, "You likely do not need to buy a checklist for this payment. " + head + " Watch the $2,000 threshold on cash, check, bank transfer, and ACH payments, and keep notes on who you paid and how.");
  const paths = [
    ["personal", "contractor", "noncard", "under"],
    ["business", "employee", "noncard", "least"],
    ["business", "corporation", "noncard", "least"],
    ["business", "contractor", "noncard", "under"],
    ["business", "contractor", "mixed", "under"],
    ["business", "contractor", "card", "under"]
  ];
  for (const row of paths) {
    const result = decide(row[0], row[1], row[2], row[3]);
    const label = row.join("|");
    assert.equal(result.id, "none", label);
    assert.equal(result.headline, "Likely no 1099 needed", label);
    assert.equal(result.steps.includes(step), true, label);
    assert.equal(api.offerFor(result.id), offer, label);
  }
  assert.equal(api.offerFor("nec").lead.includes(head), false);
  assert.equal(api.offerFor("mixed").lead.includes(head), false);
  assert.equal(api.offerFor("unsure").lead.includes(head), false);
  assert.equal(api.offerFor("k").nofit, true);
  assert.equal(api.offerFor("k").quiet, true);
  assert.equal(api.offerFor("k").lead.includes(head), false);
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
    "https://www.irs.gov/businesses/small-businesses-self-employed/employment-tax-due-dates",
    "https://www.irs.gov/pub/irs-drop/rp-26-35.pdf"
  ];
  for (const url of sources) assert.equal(html.includes(url), true, url);
  assert.equal(html.includes("https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2027-taxpayers-continue-to-benefit-from-the-working-families-tax-cuts"), false);
  assert.match(html, /Checked November 5, 2026/);
  assert.match(html, /Checked November 9, 2026/);
  assert.match(html, /For payments made in 2026, the reporting threshold is \$2,000/);
  assert.equal(html.includes("For payments made after 2026, Publication 1099 says the amount is adjusted for inflation."), false);
  assert.equal(html.includes("Publication 1099 says the amount will be adjusted for inflation beginning in calendar year 2027."), false);
  assert.equal(html.includes("For payments made after 2026, see Publication 1099 for the inflation-adjusted amount."), false);
  const revProc = '<a href="https://www.irs.gov/pub/irs-drop/rp-26-35.pdf" rel="noopener noreferrer">Rev. Proc. 2026-35 section 3.52</a>';
  assert.equal(html.includes("For payments made in calendar year 2027, " + revProc + " sets the section 6041(a) reporting threshold at $2,100. Payments made in 2026 stay $2,000. Form 1099-NEC and most Form 1099-MISC boxes that share that threshold use $2,100; royalties ($10), Form 1099-K, and backup withholding are separate."), true);
  assert.equal(html.includes("For payments made in calendar year 2027, the section 6041(a) amount is $2,100 (" + revProc + "). See also Publication 1099 / the Guide to Information Returns."), true);
  assert.equal(html.includes("General guidance, not legal or tax advice."), false);
  assert.equal(html.includes("General guidance, not legal, tax or IT advice."), true);
  assert.equal(html.includes("Not affiliated with the IRS."), false);
  assert.equal(html.includes("Not affiliated with or endorsed by the IRS."), true);
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
