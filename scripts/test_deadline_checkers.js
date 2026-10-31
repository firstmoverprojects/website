"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.resolve(__dirname, "..");
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

var THANKS = "Thanks for your time. If this isn't right for you, please share it with someone it could help.";
var BREVO = "https://05279842.sibforms.com/serve/MUIFAOl30i4SqBWIywYgwCK-R-JtXw9dFx8m5j-td4xmrSh6dXO-1ysXwauPn74aUR1704Woip5d-zVEij--7PVs3Ny9ANkpwvsp6zi8LQaPXra8EtECZfFOjzPBw1houYxtyGNprdB_IAejV4AHahfUP0AeeMyIpgcAFFaxNlyGv9PQhVHeo9NHrVFBHvcyJyn7qSpur2L10Tzt8A==";
var UNLISTED = [
  "sitemap.xml",
  "tools/index.html",
  "index.html",
  "deadlines/index.html",
  "deadlines/feed.xml",
  "deadlines/deadlines.ics",
  "deadlines/finder/index.html",
  "deadlines/finder/finder.js",
  "llms.txt"
];
var FORBIDDEN = [
  { re: /you qualify/i, name: "you qualify" },
  { re: /\bqualify\b/i, name: "qualify" },
  { re: /\bapproved\b/i, name: "approved" },
  { re: /you are a contractor/i, name: "you are a contractor" },
  { re: /you're a contractor/i, name: "you're a contractor" },
  { re: /you’re a contractor/i, name: "curly you're a contractor" },
  { re: /\bcompliant\b/i, name: "compliant" },
  { re: /\beligible\b/i, name: "eligible" },
  { re: /\u2014/g, name: "em dash" },
  { re: /\u2013/g, name: "en dash" },
  { re: /&mdash;|&#8212;|&#x2014;/i, name: "em dash entity" },
  { re: /\u2026/g, name: "ellipsis character" },
  { re: /\burgent\b/i, name: "urgent" },
  { re: /\bimmediately\b/i, name: "immediately" },
  { re: /act now/i, name: "act now" }
];

function forbiddenHit(text) {
  var i;
  for (i = 0; i < FORBIDDEN.length; i++) {
    FORBIDDEN[i].re.lastIndex = 0;
    if (FORBIDDEN[i].re.test(text)) {
      var name = FORBIDDEN[i].name;
      FORBIDDEN[i].re.lastIndex = 0;
      return name;
    }
  }
  return "";
}

function load(rel, scriptId, apiName) {
  var html = fs.readFileSync(path.join(root, rel), "utf8");
  var match = html.match(new RegExp("<script id=\"" + scriptId + "\">([\\s\\S]*?)<\\/script>"));
  if (!match) throw new Error("no script " + scriptId);
  var sandbox = {
    console: console,
    document: { getElementById: function () { return null; } },
    window: null,
    Math: Math,
    Number: Number,
    String: String,
    Object: Object,
    Date: Date,
    RegExp: RegExp,
    Array: Array
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox, { filename: rel });
  return { html: html, api: sandbox[apiName] };
}

function pageFacts(html, slug, source, urls) {
  console.log(slug);
  assert(html.indexOf(THANKS) !== -1, slug + " thanks line");
  assert(html.indexOf("<footer>") !== -1 && html.indexOf(THANKS) > html.indexOf("<footer>"), slug + " thanks is in the footer");
  assert(html.indexOf('name="robots" content="noindex"') !== -1, slug + " noindex");
  assert(html.indexOf("noindex, follow") === -1, slug + " robots is noindex only");
  var sourceTag = '<input type="hidden" name="SIGNUP_SOURCE" value="' + source + '">';
  assert(html.indexOf(sourceTag) !== -1, slug + " signup source");
  assert(html.split(sourceTag).length - 1 === 1, slug + " one SIGNUP_SOURCE");
  assert(html.indexOf('action="' + BREVO + '"') !== -1, slug + " Brevo action");
  assert(html.indexOf("form-action https://05279842.sibforms.com") !== -1, slug + " CSP form action");
  assert(html.indexOf("goatcounter") === -1, slug + " no goatcounter");
  assert(html.indexOf("gc.zgo.at") === -1, slug + " no goatcounter host");
  assert(html.toLowerCase().indexOf("gumroad") === -1, slug + " no gumroad");
  assert(html.indexOf("$19") === -1 && html.indexOf("$29") === -1, slug + " no kit price");
  assert(!/\bbuy\b/i.test(html), slug + " no buy wording");
  assert(!/\bkit\b/i.test(html), slug + " no kit wording");
  assert(html.indexOf('class="topline">A free web check') !== -1, slug + " top line");
  assert(html.indexOf("font-size:16px") !== -1, slug + " 16px inputs");
  assert(html.indexOf("min-height:44px") !== -1, slug + " 44px targets");
  assert(html.indexOf("@media (max-width:480px)") !== -1, slug + " narrow layout");
  assert(html.indexOf("Checked October 31, 2026.") !== -1, slug + " checked date");
  assertEq(forbiddenHit(html), "", slug + " page has no forbidden phrase");
  var main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
  var firstP = main.match(/<p[^>]*>([\s\S]*?)<\/p>/);
  assert(!!firstP && firstP[1].indexOf("A free web check") === 0, slug + " first paragraph starts with A free web check");
  urls.forEach(function (url) {
    assert(html.indexOf(url) !== -1, slug + " cites " + url);
  });
  UNLISTED.forEach(function (rel) {
    var body = fs.readFileSync(path.join(root, rel), "utf8");
    assert(body.indexOf(slug) === -1, slug + " not listed in " + rel);
  });
}

var mo = load("tools/mo-zero-return-check/index.html", "mo-zero-return-check", "FMP_MO");
pageFacts(mo.html, "mo-zero-return-check", "mo-zero", [
  "https://dor.mo.gov/resources/proposed-rules/documents/12_CSR_10-103_185_Proposed_Rule.pdf",
  "https://dor.mo.gov/faq/taxation/business/sales-tax-filing.html",
  "https://dor.mo.gov/resources/official-final-rules/documents/12_CSR_10-104_030_Filing_Requirements_as_Defined_in_Section_144,_RSMo.pdf",
  "https://www.sos.mo.gov/CMSImages/AdRules/moreg/2026/v51n14July15/v51n14.pdf",
  "https://www.sos.mo.gov/CMSImages/AdRules/moreg/2026/v51n19Oct1/v51n19.pdf"
]);
assert(mo.html.indexOf("December 30, 2026") !== -1, "Missouri names December 30, 2026");
assert(mo.html.indexOf("51 MoReg 879") !== -1, "Missouri names the proposal page");
assert(mo.html.indexOf("no (zero) (0) sales") !== -1, "Missouri quotes the posted zero-sales sentence");
assertEq(mo.api.LABEL, "Points to review", "Missouri label");

var dec = mo.api.dueDate("monthly", 2026, 12);
assertEq(mo.api.formatDate(dec.nominal), "January 31, 2027", "December period is due January 31");
assertEq(dec.moved, true, "January 31, 2027 is a weekend");
assertEq(mo.api.formatDate(dec.shifted), "February 1, 2027", "weekend moves to February 1, 2027");
var mar = mo.api.dueDate("monthly", 2026, 3);
assertEq(mo.api.formatDate(mar.nominal), "April 30, 2026", "March period is due April 30");
assertEq(mar.moved, false, "April 30, 2026 stays on a weekday");
assertEq(mo.api.formatDate(mo.api.dueDate("quarterly", 2026, null, 1).nominal), "April 30, 2026", "Q1 due April 30");
assertEq(mo.api.formatDate(mo.api.dueDate("quarterly", 2026, null, 4).shifted), "February 1, 2027", "Q4 2026 shifts off Sunday January 31");
assertEq(mo.api.formatDate(mo.api.dueDate("annual", 2026).shifted), "February 1, 2027", "2026 annual return shifts to February 1, 2027");

function moAnswers(extra) {
  var base = { sales: "yes", consumer: "no", vendor: "no", frequency: "monthly", year: 2026, month: 3, quarter: null };
  var key;
  for (key in extra) base[key] = extra[key];
  return mo.api.pointsToReview(base);
}
var moRow = moAnswers({});
assertEq(moRow.ok, true, "Missouri complete answers return points");
assert(moRow.items.join("\n").indexOf("Proposed section (1)") !== -1, "registered sales tax quotes proposed section 1");
assert(moRow.items.join("\n").indexOf("not registered for consumer's use tax") !== -1, "consumer no is stated");
assert(moRow.items.join("\n").indexOf("April 30, 2026") !== -1, "March 2026 due date is in the result");
assert(moRow.items.join("\n").indexOf("December 30, 2026") !== -1, "schedule date stays in the result");
assertEq(mo.api.pointsToReview(null).ok, false, "Missouri null is incomplete");
assertEq(moAnswers({ frequency: "monthly", month: null }).ok, false, "monthly without a month is incomplete");
var moUnsure = moAnswers({ frequency: "unsure", sales: "unsure", consumer: "unsure", vendor: "unsure" });
assertEq(moUnsure.ok, true, "unsure frequency still returns points");
assert(moUnsure.items.join("\n").indexOf("after a frequency and a period are marked") !== -1, "unsure frequency waits for a period");
assertEq(forbiddenHit(JSON.stringify(moRow) + JSON.stringify(moUnsure)), "", "Missouri results have no forbidden phrase");

var yn = ["yes", "no", "unsure"];
var freq = ["monthly", "quarterly", "annual", "unsure"];
var moHit = "";
var moCount = 0;
yn.forEach(function (sales) {
  yn.forEach(function (consumer) {
    yn.forEach(function (vendor) {
      freq.forEach(function (frequency) {
        moCount++;
        var row = mo.api.pointsToReview({
          sales: sales,
          consumer: consumer,
          vendor: vendor,
          frequency: frequency,
          year: 2027,
          month: 1,
          quarter: 2
        });
        if (!row.ok || row.label !== "Points to review") moHit = "label";
        var hit = forbiddenHit(row.items.join("\n"));
        if (hit) moHit = hit;
      });
    });
  });
});
assertEq(moCount, 108, "Missouri answer grid");
assertEq(moHit, "", "Missouri grid has no forbidden phrase");

var ga = load("tools/ga-annual-registration-check/index.html", "ga-annual-registration-check", "FMP_GA");
pageFacts(ga.html, "ga-annual-registration-check", "ga-ar", [
  "https://sos.ga.gov/how-to-guide/how-file-annual-registration",
  "https://sos.ga.gov/page/business-division-faq",
  "https://rules.sos.ga.gov/gac/590-7-4",
  "https://rules.sos.ga.gov/gac/590-7-22",
  "https://ecorp.sos.ga.gov/oneClickAR"
]);
assert(ga.html.indexOf("April 1") !== -1 && ga.html.indexOf("January 1") !== -1, "Georgia names both window dates");
assertEq(ga.api.isAfterOctober1(ga.api.parseISO("2026-10-01")), false, "October 1 is not subsequent to October 1");
assertEq(ga.api.isAfterOctober1(ga.api.parseISO("2026-10-02")), true, "October 2 is subsequent to October 1");
assertEq(ga.api.formatLong(ga.api.addDays(ga.api.parseISO("2026-09-01"), 90)), "November 30, 2026", "90 days after September 1, 2026");
assertEq(ga.api.formatLong(ga.api.addDays(ga.api.parseISO("2026-10-01"), 90)), "December 30, 2026", "90 days after October 1, 2026");
assertEq(ga.api.compareToWindow(ga.api.parseISO("2026-01-01"), 2026), "inside", "January 1 is inside");
assertEq(ga.api.compareToWindow(ga.api.parseISO("2026-04-01"), 2026), "inside", "April 1 is inside");
assertEq(ga.api.compareToWindow(ga.api.parseISO("2025-12-31"), 2026), "before", "December 31 is before the window");
assertEq(ga.api.compareToWindow(ga.api.parseISO("2026-04-02"), 2026), "after", "April 2 is after the window");

function gaAnswers(extra) {
  var base = { year: 2027, entity: "llc", filing: "later", multiYear: "no", articlesDate: "", formedYear: null, fileOn: "" };
  var key;
  for (key in extra) base[key] = extra[key];
  return ga.api.pointsToReview(base);
}
var gaLater = gaAnswers({ fileOn: "2026-12-31" });
assertEq(gaLater.ok, true, "Georgia later filing returns points");
assert(gaLater.items.join("\n").indexOf("January 1, 2027 through April 1, 2027") !== -1, "later year names the window");
assert(gaLater.items.join("\n").indexOf("will not be applied to the next annual registration period") !== -1, "a December filing is before January 1");
var gaFirst = gaAnswers({
  year: 2027,
  entity: "domestic-corporation",
  filing: "first",
  articlesDate: "2026-10-02",
  fileOn: "2027-04-01"
});
assert(gaFirst.items.join("\n").indexOf("January 1, 2027 through April 1, 2027") !== -1, "articles after October 1 use the next calendar year");
assert(gaFirst.items.join("\n").indexOf("falls in the January 1 through April 1 window for 2027") !== -1, "April 1 is inside the initial window");
var ga90 = gaAnswers({
  entity: "domestic-corporation",
  filing: "first",
  year: 2026,
  articlesDate: "2026-09-01",
  fileOn: "2026-12-01"
});
assert(ga90.items.join("\n").indexOf("November 30, 2026") !== -1, "September 1 articles use a 90-day count");
assert(ga90.items.join("\n").indexOf("after November 30, 2026") !== -1, "December 1 is after that 90-day date");
var gaLlc = gaAnswers({ entity: "llc", filing: "first", year: 2026, formedYear: 2025 });
assert(gaLlc.items.join("\n").indexOf("January 1, 2026 through April 1, 2026") !== -1, "LLC first window is the year after formation");
assertEq(ga.api.pointsToReview({ year: 2027, entity: "llc", filing: "later", multiYear: "no", articlesDate: "bad", formedYear: null, fileOn: "" }).ok, false, "a bad articles date is rejected when present");
assertEq(gaAnswers({ multiYear: "yes" }).items.join("\n").indexOf("3 calendar years") !== -1, true, "multi-year answer cites three calendar years");
assertEq(forbiddenHit(gaLater.items.join("\n") + gaFirst.items.join("\n") + ga90.items.join("\n")), "", "Georgia samples have no forbidden phrase");

var sbg = load("tools/sba-surety-fee-check/index.html", "sba-surety-fee-check", "FMP_SBG");
pageFacts(sbg.html, "sba-surety-fee-check", "sba-sbg", [
  "https://www.federalregister.gov/documents/2026/10/30/2026-22177/surety-bond-guarantee-program-fees"
]);
assert(sbg.html.indexOf("November 30, 2026") !== -1, "surety page names November 30, 2026");
assert(sbg.html.indexOf("2026-22177") !== -1, "surety page names the document number");
assert(sbg.html.indexOf("$7.29") !== -1 && sbg.html.indexOf("26 percent") !== -1, "surety page names the new rate");
assert(sbg.html.indexOf("$6.00") !== -1 && sbg.html.indexOf("20 percent") !== -1, "surety page names the remaining rate");
assertEq(sbg.api.parseCents("$1,000.00").cents, 100000, "premium parsing");
assertEq(sbg.api.parseCents("").empty, true, "blank money is empty");
assertEq(sbg.api.formatDollars(1094), "$10.94", "format half-up cents");

function sbgInput(extra) {
  var base = { program: "prior-approval", bond: "other", manufacturing: "no", when: "on-or-after", premium: 100000, contract: 10000000 };
  var key;
  for (key in extra) base[key] = extra[key];
  return sbg.api.buildEstimate(base);
}
var increased = sbgInput({});
assertEq(increased.ok, true, "increased rate estimates");
assertEq(increased.why, "increase", "prior approval after the date uses the increase");
assertEq(increased.surety, 26000, "26 percent of $1,000 is $260");
assertEq(increased.principal, 72900, "$7.29 times 100 thousands is $729");
assertEq(sbg.api.feeCents(25, 150000, { pct: 26, perM: 729 }).surety, 7, "half cent of 26 percent rounds up");
assertEq(sbg.api.feeCents(25, 150000, { pct: 26, perM: 729 }).principal, 1094, "half cent of $7.29 per thousand rounds up");
var mfg = sbgInput({ manufacturing: "yes", premium: 100000, contract: 150000 });
assertEq(mfg.why, "manufacturing", "NAICS manufacturing keeps the lower rate");
assertEq(mfg.surety, 20000, "20 percent of $1,000");
assertEq(mfg.principal, 900, "$6.00 per thousand on $1,500");
var preferred = sbgInput({ program: "preferred", when: "on-or-after" });
assertEq(preferred.why, "preferred", "preferred program keeps 20 percent and $6.00");
assertEq(preferred.surety, 20000, "preferred surety fee");
var before = sbgInput({ when: "before" });
assertEq(before.why, "before", "a date before November 30 uses the 2018 rate");
var bid = sbgInput({ bond: "bid" });
assertEq(bid.kind, "bid", "a bid bond has no dollar fee");
assert(bid.lines.join("\n").indexOf("other than a bid bond") !== -1, "bid bond cites the notice carve-out");
assertEq(bid.surety, undefined, "bid bond stores no surety cents");
var split = sbgInput({ manufacturing: "unsure" });
assertEq(split.kind, "split", "an unsure NAICS code lists both rates");
assert(split.lines.join("\n").indexOf("26 percent") !== -1 && split.lines.join("\n").indexOf("20 percent") !== -1, "split names both rates");
assertEq(sbgInput({ program: "prior-approval", bond: "other", manufacturing: "no", when: "on-or-after", premium: null, contract: null }).ok, false, "a single rate still needs amounts");
assertEq(forbiddenHit(increased.lines.join("\n") + bid.lines.join("\n") + split.lines.join("\n")), "", "surety lines have no forbidden phrase");

var programs = ["prior-approval", "preferred", "unsure"];
var bonds = ["other", "bid", "unsure"];
var yn3 = ["yes", "no", "unsure"];
var whens = ["before", "on-or-after", "unsure"];
var sbgHit = "";
var sbgCount = 0;
programs.forEach(function (program) {
  bonds.forEach(function (bond) {
    yn3.forEach(function (manufacturing) {
      whens.forEach(function (when) {
        sbgCount++;
        var row = sbg.api.buildEstimate({
          program: program,
          bond: bond,
          manufacturing: manufacturing,
          when: when,
          premium: 100000,
          contract: 250000
        });
        if (!row.ok || row.label !== "Estimate") sbgHit = "label";
        var hit = forbiddenHit(row.lines.join("\n") + row.disclaimer);
        if (hit) sbgHit = hit;
        if (row.kind === "rate" && (typeof row.surety !== "number" || typeof row.principal !== "number")) sbgHit = "money";
      });
    });
  });
});
assertEq(sbgCount, 81, "surety answer grid");
assertEq(sbgHit, "", "surety grid has no forbidden phrase");

var tx = load("tools/tx-franchise-report-check/index.html", "tx-franchise-report-check", "FMP_TX");
pageFacts(tx.html, "tx-franchise-report-check", "tx-franchise", [
  "https://comptroller.texas.gov/taxes/franchise/",
  "https://comptroller.texas.gov/taxes/franchise/forms/2026-franchise.php",
  "https://comptroller.texas.gov/taxes/tax-policy-news/2026-april.php",
  "https://comptroller.texas.gov/taxes/franchise/pir-oir-filing-req.php"
]);
assert(tx.html.indexOf("May 15") !== -1, "Texas names May 15");
assert(tx.html.indexOf("$2,650,000") !== -1, "Texas names the threshold");
assert(tx.html.indexOf("Form 05-102") !== -1 && tx.html.indexOf("Form 05-167") !== -1, "Texas names both information reports");
assert(tx.html.indexOf("Form 05-163") !== -1, "Texas names the discontinued no-tax-due report");
var may2026 = tx.api.may15(2026);
assertEq(may2026.moved, false, "May 15, 2026 is a weekday");
assertEq(may2026.weekday, "Friday", "May 15, 2026 is Friday");
var may2027 = tx.api.may15(2027);
assertEq(may2027.moved, true, "May 15, 2027 is a weekend");
assertEq(tx.api.formatDate(may2027.shifted), "May 17, 2027", "Saturday May 15, 2027 moves to Monday");

function txAnswers(extra) {
  var base = {
    year: "2026",
    entity: "llc",
    revenue: "at-or-below",
    veteran: "no",
    passive: "no",
    reit: "no",
    zeroReceipts: "no",
    combined: "no"
  };
  var key;
  for (key in extra) base[key] = extra[key];
  return tx.api.pointsToReview(base);
}
var txSmall = txAnswers({});
assertEq(txSmall.ok, true, "Texas small LLC returns points");
assert(txSmall.items.join("\n").indexOf("does not file a franchise tax report") !== -1, "at or below the threshold skips the franchise report");
assert(txSmall.items.join("\n").indexOf("Form 05-102") !== -1, "an LLC is a Form 05-102 entity");
var txVeteran = txAnswers({ veteran: "yes", revenue: "above-20m" });
assert(txVeteran.items.join("\n").indexOf("does not file a franchise tax report for that period") !== -1, "veteran path names the five-year report");
assert(txVeteran.items.join("\n").indexOf("Ownership Information Report for that period") !== -1, "veteran path names the information report");
var txPassive = txAnswers({ passive: "yes", entity: "other" });
assert(txPassive.items.join("\n").indexOf("passive-entity circle") !== -1, "passive path names the circle");
assert(txPassive.items.join("\n").indexOf("Form 05-167") !== -1, "another entity uses Form 05-167");
var txZero = txAnswers({ revenue: "above-to-20m", zeroReceipts: "yes", year: "2027" });
assert(txZero.items.join("\n").indexOf("May 17, 2027") !== -1, "2027 due date uses the weekend move");
assert(txZero.items.join("\n").indexOf("zero on the Texas gross receipts line") !== -1, "zero receipts above the threshold is its own path");
var txBoth = txAnswers({ veteran: "yes", passive: "yes" });
assert(txBoth.items.join("\n").indexOf("more than one Comptroller category") !== -1, "two special categories are both listed");
assertEq(tx.api.pointsToReview({ year: "2028" }).ok, false, "a year outside 2026 and 2027 is incomplete");
assertEq(forbiddenHit(txSmall.items.join("\n") + txVeteran.items.join("\n") + txZero.items.join("\n")), "", "Texas samples have no forbidden phrase");

var sam = load("tools/sam-renewal-check/index.html", "sam-renewal-check", "FMP_SAM");
pageFacts(sam.html, "sam-renewal-check", "sam-365", [
  "https://sam.gov/entity-registration",
  "https://sam.gov/sites/default/files/2024-11/entity-checklist.pdf",
  "https://www.ecfr.gov/current/title-48/chapter-1/subchapter-H/part-52/subpart-52.2/section-52.204-7",
  "https://www.acquisition.gov/far/52.204-13",
  "https://www.gsa.gov/small-business/find-opportunities/register-your-business"
]);
assert(sam.html.indexOf("365 days") !== -1, "SAM page names 365 days");
assertEq(sam.api.parseISO("2026-02-29"), null, "2026-02-29 is rejected");
assert(!!sam.api.parseISO("2024-02-29"), "2024-02-29 is accepted");
assertEq(sam.api.addDays(sam.api.parseISO("2024-01-01"), 365).iso, "2024-12-31", "365 days from a leap-year New Year");
assertEq(sam.api.addDays(sam.api.parseISO("2026-01-15"), 365).iso, "2027-01-15", "365 days from January 15, 2026");
assertEq(sam.api.addDays(sam.api.parseISO("2024-02-29"), 365).iso, "2025-02-28", "365 days from February 29, 2024");
assertEq(sam.api.addBusinessDays(sam.api.parseISO("2026-10-30"), 10).iso, "2026-11-13", "ten weekdays after Friday October 30, 2026");
var samRow = sam.api.buildEstimate({ anchor: "2026-01-15", submit: "2026-10-30", clause: "yes", offer: "yes" });
assertEq(samRow.ok, true, "SAM estimate returns");
assertEq(samRow.renew, "2027-01-15", "renewal date");
assertEq(samRow.active, "2026-11-13", "activation count");
assert(samRow.lines.join("\n").indexOf("every 365 days") !== -1, "result quotes the 365-day line");
assert(samRow.lines.join("\n").indexOf("FAR 52.204-7") !== -1, "offer yes quotes FAR 52.204-7");
assert(samRow.lines.join("\n").indexOf("through final payment") !== -1, "clause yes quotes FAR 52.204-13");
assert(samRow.lines.join("\n").indexOf("third party") !== -1, "result includes the GSA third-party line");
var samPlain = sam.api.buildEstimate({ anchor: "2026-03-01", submit: "", clause: "no", offer: "unsure" });
assertEq(samPlain.active, "", "blank submission skips the weekday count");
assert(samPlain.lines.join("\n").indexOf("Ten weekdays") === -1, "no weekday line without a submission date");
assertEq(sam.api.buildEstimate({ anchor: "2026-02-31", submit: "", clause: "no", offer: "no" }).ok, false, "an impossible date fails");
assertEq(sam.api.buildEstimate({ anchor: "2026-03-01", submit: "March 2", clause: "no", offer: "no" }).ok, false, "a bad submission date fails");
assertEq(forbiddenHit(samRow.lines.join("\n") + samPlain.lines.join("\n")), "", "SAM lines have no forbidden phrase");

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
