"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.resolve(__dirname, "..");
var pagePath = path.join(root, "tools", "sba-7a-buyer-calculator", "index.html");
var html = fs.readFileSync(pagePath, "utf8");
var failed = 0;
var passed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.log("FAIL " + msg);
  } else {
    passed++;
    console.log("PASS " + msg);
  }
}

function assertEq(actual, expected, msg) {
  assert(actual === expected, msg + " (got " + JSON.stringify(actual) + ")");
}

var DISCLAIMER = "General information about SBA SOP 50 10 8.1, not financial or lending advice. Not affiliated with or endorsed by the U.S. Small Business Administration.";
var LENDER = "Your lender decides. Ask them to confirm.";
var THANKS = "Thanks for your time. If this isn't right for you, please share it with someone it could help.";
var SOP_PAGE = "https://legacy.sba.gov/document/sop-50-10-lender-development-company-loan-programs";
var NOTICE = "https://legacy.sba.gov/sites/default/files/2026-08/SBA%20Information%20Notice%205000-880695%20-%20Issuance%20of%20SOP%2050%2010%208.1.pdf";
var BREVO = "https://05279842.sibforms.com/serve/MUIFAOl30i4SqBWIywYgwCK-R-JtXw9dFx8m5j-td4xmrSh6dXO-1ysXwauPn74aUR1704Woip5d-zVEij--7PVs3Ny9ANkpwvsp6zi8LQaPXra8EtECZfFOjzPBw1houYxtyGNprdB_IAejV4AHahfUP0AeeMyIpgcAFFaxNlyGv9PQhVHeo9NHrVFBHvcyJyn7qSpur2L10Tzt8A==";
var DSC_QUOTE = "The Debt Service Coverage (DSC) ratio must be satisfied using either the last fiscal year-end or an average of the last two fiscal year-end statements on either a historical or adjusted basis based on the transaction type: Initial Acquisition: 1.25:1 / Business Expansion: 1.15:1 / Owner Buyout: 1.25:1 / ESOP and Cooperative: 1.25:1";

var FORBIDDEN = [
  { re: /you qualify/i, name: "you qualify" },
  { re: /\bqualify\b/i, name: "qualify" },
  { re: /\bapproved\b/i, name: "approved" },
  { re: /you are a contractor/i, name: "you are a contractor" },
  { re: /you're a contractor/i, name: "you're a contractor" },
  { re: /\bcompliant\b/i, name: "compliant" },
  { re: /\beligible\b/i, name: "eligible" },
  { re: /\u2014/g, name: "em dash" },
  { re: /\u2013/g, name: "en dash" },
  { re: /&mdash;|&#8212;|&#x2014;/i, name: "em dash entity" },
  { re: /\u2026/g, name: "ellipsis character" }
];

function forbiddenHit(text) {
  var i, found;
  for (i = 0; i < FORBIDDEN.length; i++) {
    FORBIDDEN[i].re.lastIndex = 0;
    if (FORBIDDEN[i].re.test(text)) {
      found = FORBIDDEN[i].name;
      FORBIDDEN[i].re.lastIndex = 0;
      return found;
    }
  }
  return "";
}

function dollars(amount) {
  return Math.round(amount * 100);
}

function load() {
  var match = html.match(/<script id="sba-7a-calculator">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("no sba-7a-calculator script");
  var sandbox = {
    console: console,
    document: { getElementById: function () { return null; } },
    window: null,
    Math: Math,
    Number: Number,
    String: String,
    Object: Object
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox, { filename: "tools/sba-7a-buyer-calculator/index.html" });
  return sandbox.FMP_SBA;
}

var api = load();

console.log("page facts");
assertEq(api.LABEL, "Estimate", "result label");
assertEq(api.DISCLAIMER, DISCLAIMER, "script disclaimer");
assertEq(api.LENDER, LENDER, "script lender line");
assert(html.indexOf(DISCLAIMER) !== -1, "disclaimer is on the page");
assert(html.indexOf(LENDER) !== -1, "lender line is on the page");
assert(html.indexOf(THANKS) !== -1, "thanks line");
assert(html.indexOf("<footer>") !== -1 && html.indexOf(THANKS) > html.indexOf("<footer>"), "thanks line is in the footer");
assert(html.indexOf(DSC_QUOTE) !== -1, "DSC quote is on the page");
assert(html.indexOf("the difference must be made up by equity") !== -1, "equity gap quote");
assert(html.indexOf("may provide no more than half of the required Equity Injection") !== -1, "half cap quote");
assert(html.indexOf('name="robots" content="noindex"') !== -1, "meta robots noindex");
assert(html.indexOf("noindex, follow") === -1, "robots is noindex only");
assert(html.indexOf('<input type="hidden" name="SIGNUP_SOURCE" value="sba-8-1">') !== -1, "hidden SIGNUP_SOURCE is sba-8-1");
assert(html.split('<input type="hidden" name="SIGNUP_SOURCE" value="sba-8-1">').length - 1 === 1, "one SIGNUP_SOURCE input");
assert(html.indexOf('action="' + BREVO + '"') !== -1, "form posts to the existing Brevo action");
assert(html.indexOf(SOP_PAGE) !== -1, "links the SOP page");
assert(html.indexOf(NOTICE) !== -1, "links Information Notice 5000-880695");
assert(html.indexOf("October 1, 2026") !== -1, "effective date for loan numbers");
assert(html.indexOf('class="topline">A free web check') !== -1, "top line says what the page is");
assert(html.indexOf("font-size:16px") !== -1, "16px inputs");
assert(html.indexOf("min-height:44px") !== -1, "44px targets");
assert(html.indexOf("goatcounter") === -1, "no goatcounter");
assert(html.indexOf("gc.zgo.at") === -1, "no goatcounter script host");
assertEq(forbiddenHit(html), "", "page HTML has no forbidden phrase");
assert(!/\bbuy\b/i.test(html), "no buy wording");
assert(html.toLowerCase().indexOf("gumroad") === -1, "no gumroad");
assert(html.indexOf("$19") === -1 && html.indexOf("$29") === -1, "no paid kit price");
assert(!/\bkit\b/i.test(html), "no kit wording");

var main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
var firstP = main.match(/<p[^>]*>([\s\S]*?)<\/p>/);
assert(!!firstP && firstP[1].indexOf("A free web check") === 0, "first paragraph starts with A free web check");

[
  "sitemap.xml",
  "tools/index.html",
  "index.html",
  "deadlines/index.html",
  "deadlines/feed.xml",
  "deadlines/deadlines.ics",
  "deadlines/finder/index.html",
  "deadlines/finder/finder.js"
].forEach(function (rel) {
  var body = fs.readFileSync(path.join(root, rel), "utf8");
  assert(body.indexOf("sba-7a-buyer-calculator") === -1, "not listed in " + rel);
});

console.log("money parsing");
assertEq(api.parseCents("125000").cents, 12500000, "whole dollars");
assertEq(api.parseCents("$1,250.00").cents, 125000, "dollar sign and commas");
assertEq(api.parseCents(" 100.5 ").cents, 10050, "one decimal is tenths");
assertEq(api.parseCents("0").cents, 0, "zero");
assertEq(api.parseCents("0.01").cents, 1, "one cent");
assertEq(api.parseCents("").ok, false, "blank is rejected");
assertEq(api.parseCents("-1").ok, false, "negative is rejected");
assertEq(api.parseCents("12.345").ok, false, "three decimals are rejected");
assertEq(api.parseCents("1e5").ok, false, "scientific notation is rejected");
assertEq(api.parseCents("100.").ok, false, "trailing dot is rejected");
assertEq(api.formatDollars(0), "$0.00", "format zero");
assertEq(api.formatDollars(5), "$0.05", "format one digit cents");
assertEq(api.formatDollars(12500000), "$125,000.00", "format thousands");

console.log("coverage ratios");
assertEq(api.TYPES["initial-acquisition"].ratio, "1.25:1", "initial acquisition ratio");
assertEq(api.TYPES["business-expansion"].ratio, "1.15:1", "business expansion ratio");
assertEq(api.TYPES["owner-buyout"].ratio, "1.25:1", "owner buyout ratio");
assertEq(api.TYPES["esop-cooperative"].ratio, "1.25:1", "ESOP and cooperative ratio");

var at125 = api.coverageEstimate("initial-acquisition", dollars(125000), dollars(100000));
assertEq(at125.atTarget, true, "125000 over 100000 is 1.25:1");
assertEq(at125.under, false, "exact 1.25 is not under");
assertEq(at125.shortfall, 0, "exact 1.25 needs no more cash");
assertEq(at125.maxDebt, dollars(100000), "125000 supports 100000 of debt service at 1.25");

var under125 = api.coverageEstimate("owner-buyout", dollars(125000) - 1, dollars(100000));
assertEq(under125.under, true, "one cent under 1.25 is under");
assertEq(under125.shortfall, 1, "one cent short of 1.25");

var at115 = api.coverageEstimate("business-expansion", dollars(115000), dollars(100000));
assertEq(at115.atTarget, true, "115000 over 100000 is 1.15:1");
var under115 = api.coverageEstimate("business-expansion", dollars(100000), dollars(100000));
assertEq(under115.under, true, "1.00 is under 1.15");
assertEq(under115.shortfall, dollars(15000), "100000 needs 15000 more to reach 1.15");
assertEq(api.coverageEstimate("esop-cooperative", dollars(125000), dollars(100000)).atTarget, true, "ESOP uses 1.25:1");

var tiny = api.coverageEstimate("business-expansion", 4, 3);
assertEq(tiny.under, false, "4 cents over 3 cents is above 1.15");
assertEq(api.coverageEstimate("business-expansion", 3, 3).under, true, "3 cents over 3 cents is under 1.15");
assertEq(api.coverageEstimate("business-expansion", 1, 1).shortfall, 1, "1 cent of debt needs 2 cents of numerator at 1.15");
assertEq(api.coverageEstimate("initial-acquisition", 0, 1).ok, true, "zero numerator is a valid estimate");
assertEq(api.coverageEstimate("initial-acquisition", 100, 0).ok, false, "zero debt service is rejected");

console.log("equity gap and limited sources");
assertEq(api.equityGapEstimate(dollars(500000), dollars(400000)).gap, dollars(100000), "price above valuation is equity");
assertEq(api.equityGapEstimate(dollars(400000), dollars(500000)).gap, 0, "price below valuation has no equity gap");
assertEq(api.equityGapEstimate(dollars(400000), dollars(400000)).above, false, "equal price and valuation is not above");

var half = api.limitedSourcesEstimate(dollars(100000), dollars(50000));
assertEq(half.atHalf, true, "50000 is half of 100000");
assertEq(half.above, false, "exactly half is not over the cap");
var overHalf = api.limitedSourcesEstimate(dollars(100000), dollars(50001));
assertEq(overHalf.above, true, "50001 is over half of 100000");
assertEq(overHalf.over, dollars(1), "over by one dollar");
var odd = api.limitedSourcesEstimate(1001, 501);
assertEq(odd.half, 500, "half of 1001 cents, in whole cents, is 500");
assertEq(odd.above, true, "501 cents is more than half of 1001");
assertEq(odd.over, 1, "odd required equity is over by one cent");
assertEq(api.limitedSourcesEstimate(0, 0).above, false, "zero limited sources on zero equity is not over");
assertEq(api.limitedSourcesEstimate(0, 1).above, true, "any limited source is over half of zero");

var mean = api.arithmeticMeanCents(100, 201);
assertEq(mean.cents, 151, "half cent rounds up");
assertEq(api.arithmeticMeanCents(1, 2).cents, 2, "1 and 2 average to 2 cents");
assertEq(api.arithmeticMeanCents(2, 2).cents, 2, "equal amounts stay put");

console.log("worked estimates");
function sample(extra) {
  var input = {
    type: "initial-acquisition",
    basis: "last",
    cash: dollars(125000),
    debt: dollars(100000),
    price: dollars(500000),
    valuation: dollars(400000),
    requiredEquity: dollars(50000),
    limited: dollars(25000)
  };
  var key;
  for (key in extra) input[key] = extra[key];
  return api.buildEstimate(input);
}

var deal = sample({});
assertEq(deal.ok, true, "sample deal estimates");
assertEq(deal.label, "Estimate", "sample label is estimate");
assertEq(deal.lender, LENDER, "lender line is verbatim");
assertEq(deal.disclaimer, DISCLAIMER, "disclaimer is verbatim");
assertEq(deal.coverage.atTarget, true, "sample coverage is at 1.25:1");
assertEq(deal.equity.gap, dollars(100000), "sample equity gap");
assertEq(deal.limited.atHalf, true, "sample limited sources are half");
deal.lines.forEach(function (line, index) {
  assert(line.indexOf("Estimate:") === 0, "line " + index + " is labeled estimate");
});
assertEq(forbiddenHit(deal.lines.join("\n")), "", "sample lines have no forbidden phrase");

var expansion = sample({
  type: "business-expansion",
  cash: dollars(100000),
  debt: dollars(100000),
  price: dollars(3000000),
  valuation: dollars(3000000),
  requiredEquity: dollars(100000),
  limited: dollars(60000)
});
assertEq(expansion.coverage.under, true, "expansion at 1.00 is under 1.15");
assertEq(expansion.coverage.shortfall, dollars(15000), "expansion shortfall");
assert(expansion.lines.join("\n").indexOf("1.15:1") !== -1, "expansion result names 1.15:1");
assert(expansion.lines.join("\n").indexOf("quality of earnings report is required") !== -1, "$3 million acquisition or expansion names the report");
assertEq(expansion.limited.over, dollars(10000), "60000 limited sources are 10000 over half of 100000");
assertEq(forbiddenHit(expansion.lines.join("\n")), "", "expansion lines have no forbidden phrase");

var buyout = sample({
  type: "owner-buyout",
  price: dollars(1000000),
  valuation: dollars(1000000)
});
assert(buyout.lines.join("\n").indexOf("1.25:1") !== -1, "owner buyout uses 1.25:1");
assert(buyout.lines.join("\n").indexOf("does not apply that line") !== -1, "buyout does not apply the $3 million report line");
assertEq(buyout.equity.gap, 0, "equal price and valuation has a zero equity gap");

var averaged = api.buildEstimate({
  type: "esop-cooperative",
  basis: "average",
  cash1: dollars(100000),
  cash2: dollars(150000),
  debt1: dollars(80000),
  debt2: dollars(80000),
  price: dollars(200000),
  valuation: dollars(250000),
  requiredEquity: 1001,
  limited: 500
});
assertEq(averaged.ok, true, "two-year average estimates");
assertEq(averaged.coverage.atTarget, false, "averaged ESOP is not forced to a target");
assert(averaged.lines[0].indexOf("Estimate: arithmetic mean") === 0, "average line is an estimate");
assert(averaged.lines.join("\n").indexOf("$125,000.00") !== -1, "mean of 100000 and 150000 is 125000");
assertEq(averaged.equity.gap, 0, "price under valuation has no gap");
assertEq(averaged.limited.above, false, "500 cents is not more than half of 1001");
assertEq(forbiddenHit(averaged.lines.join("\n")), "", "average lines have no forbidden phrase");

assertEq(api.buildEstimate({ type: "", basis: "last" }).ok, false, "missing type fails");
assertEq(api.buildEstimate({ type: "initial-acquisition", basis: "last", cash: dollars(1), debt: 0, price: 0, valuation: 0, requiredEquity: 0, limited: 0 }).ok, false, "zero debt service fails");
assertEq(api.buildEstimate(null).ok, false, "null input fails");

console.log("ratio properties");
var types = ["initial-acquisition", "business-expansion", "owner-buyout", "esop-cooperative"];
var propertyBreak = "";
var n;
var t;
for (t = 0; t < types.length; t++) {
  for (n = 0; n < 40; n++) {
    var cash = Math.floor(Math.random() * 5000000);
    var debt = 1 + Math.floor(Math.random() * 5000000);
    var row = api.coverageEstimate(types[t], cash, debt);
    if (!row.ok) propertyBreak = "ok";
    if (row.under && row.shortfall <= 0) propertyBreak = "shortfall";
    if (!row.under && row.shortfall !== 0) propertyBreak = "extra shortfall";
    var fixed = api.coverageEstimate(types[t], cash + row.shortfall, debt);
    if (fixed.under) propertyBreak = "still under";
    if (row.shortfall > 0) {
      var less = api.coverageEstimate(types[t], cash + row.shortfall - 1, debt);
      if (!less.under) propertyBreak = "shortfall too high";
    }
    if (row.maxDebt > 0) {
      var atMax = api.coverageEstimate(types[t], cash, row.maxDebt);
      var past = api.coverageEstimate(types[t], cash, row.maxDebt + 1);
      if (atMax.under || !past.under) propertyBreak = "max debt";
    }
  }
}
assertEq(propertyBreak, "", "shortfall and max debt match the ratio");

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
