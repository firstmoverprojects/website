"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.resolve(__dirname, "..");
var pagePath = path.join(root, "tools", "amazon-coi-check", "index.html");
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

function load(documentStub) {
  var match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("no page script");
  var sandbox = {
    console: console,
    document: documentStub || { getElementById: function () { return null; } },
    navigator: {},
    window: null
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox, { filename: "tools/amazon-coi-check/index.html" });
  return sandbox;
}

var ctx = load();
var checkCOI = ctx.checkCOI;
var FMP = ctx.FMP_COI;

function status(result, id) {
  return result.byId[id] ? result.byId[id].status : "missing";
}

console.log("T1 sample COI");
var t1 = checkCOI(FMP.SAMPLE, "", false, "", "2026-10-26");
assertEq(status(t1, "C1"), "fix", "T1 C1 Fix (certificate holder)");
assertEq(status(t1, "C2"), "ok", "T1 C2 OK");
assertEq(status(t1, "C3"), "fix", "T1 C3 Fix (500,000)");
assertEq(t1.byId.C3.amount, 500000, "T1 C3 amount 500000");
assertEq(status(t1, "C4"), "fix", "T1 C4 Fix (25,000)");
assertEq(t1.byId.C4.amount, 25000, "T1 C4 amount 25000");
assertEq(status(t1, "C5"), "check", "T1 C5 Check by hand (claims-made)");
assert(t1.byId.C1.detail.indexOf("Certificate Holder alone is not the same") !== -1, "T1 C1 fix wording");
assert(t1.fixList.indexOf("Amazon COI pre-check (firstmoverprojects.com/tools/amazon-coi-check/), checked October 26, 2026:") === 0, "T1 fix list header");
assert(t1.fixList.indexOf("Amazon's Business Insurance verification decides whether a certificate is accepted. This list is not insurance advice.") !== -1, "T1 fix list closing line");

console.log("T2 clean fictional COI");
var clean = [
  "Insured: Sample Goods LLC",
  "Insurer: Example Mutual Insurance Co.",
  "Commercial general liability",
  "Coverage form: occurrence",
  "Additional insured: Amazon.com Services LLC and its affiliates and assignees",
  "Each occurrence $1,000,000",
  "General aggregate $2,000,000",
  "Deductible $5,000",
  "30 days notice of cancellation"
].join("\n");
var t2 = checkCOI(clean, "Sample Goods LLC", false, "2026-12-01", "2026-10-26");
["C1", "C2", "C3", "C4", "C5", "C7"].forEach(function (id) {
  assertEq(status(t2, id), "ok", "T2 " + id + " OK");
});
assertEq(status(t2, "C6"), "check", "T2 C6 Check by hand");
assert(t2.byId.C6.detail.indexOf("Ask your broker to confirm in writing there is no sunset clause") !== -1, "T2 C6 wording");
assertEq(t2.byId.C2.amount, 1000000, "T2 per-occurrence 1000000");
assertEq(t2.byId.C3.amount, 2000000, "T2 aggregate 2000000");
assertEq(t2.byId.C4.amount, 5000, "T2 deductible 5000");

console.log("T3 amount parsing and deductible boundary");
var t3m = checkCOI("Each occurrence $1M. General aggregate $1M. Deductible $10,000.", "", false, "", "2026-10-26");
assertEq(t3m.byId.C2.amount, 1000000, "T3 $1M parses as 1000000");
assertEq(t3m.byId.C3.amount, 1000000, "T3 aggregate $1M parses as 1000000");
assertEq(status(t3m, "C4"), "ok", "T3 $10,000 deductible is OK");
assertEq(t3m.byId.C4.amount, 10000, "T3 deductible amount 10000");
var t3mil = checkCOI("per occurrence 1 million. aggregate 1 million. deductible $10,001.", "", false, "", "2026-10-26");
assertEq(t3mil.byId.C2.amount, 1000000, "T3 1 million parses as 1000000");
assertEq(t3mil.byId.C3.amount, 1000000, "T3 aggregate 1 million parses as 1000000");
assertEq(status(t3mil, "C4"), "fix", "T3 $10,001 deductible is Fix");
assertEq(t3mil.byId.C4.amount, 10001, "T3 deductible amount 10001");
var lowAgg = checkCOI("Each occurrence $1,000,000\nGeneral aggregate $2,000,000\nProducts-Comp/Op Agg $500,000", "", false, "", "2026-10-26");
assertEq(status(lowAgg, "C2"), "ok", "T3 products-comp occurrence stays OK");
assertEq(status(lowAgg, "C3"), "fix", "T3 low products aggregate is Fix");
assertEq(lowAgg.byId.C3.amount, 500000, "T3 low products aggregate amount");

console.log("T4 additional insured wording");
var amp = checkCOI("Additional insured: Amazon.com Services LLC & its affiliates & assignees\nEach occurrence $1,000,000", "", false, "", "2026-10-26");
assertEq(status(amp, "C1"), "ok", "T4 & variant accepted");
var ampOne = checkCOI("Amazon.com Services LLC & its affiliates and assignees", "", false, "", "2026-10-26");
assertEq(status(ampOne, "C1"), "ok", "T4 single & variant accepted");
var quoted = checkCOI("\"Amazon.com Services LLC and its affiliates and assignees\"", "", false, "", "2026-10-26");
assertEq(status(quoted, "C1"), "ok", "T4 straight quotes accepted");
var curly = checkCOI("\u201CAmazon.com Services LLC and its affiliates and assignees\u201D", "", false, "", "2026-10-26");
assertEq(status(curly, "C1"), "ok", "T4 curly quotes accepted");
var comma = checkCOI("Amazon.com Services, LLC, and its affiliates and assignees", "", false, "", "2026-10-26");
assertEq(status(comma, "C1"), "ok", "T4 optional commas accepted");
var wrong = checkCOI("Additional insured: Amazon.com LLC\nEach occurrence $1,000,000", "", false, "", "2026-10-26");
assertEq(status(wrong, "C1"), "fix", "T4 Amazon.com LLC is not accepted");

console.log("T5 script text stays text");
function El(tag) {
  this.nodeType = 1;
  this.tagName = String(tag).toUpperCase();
  this.children = [];
  this.attributes = {};
  this.className = "";
  this.hidden = false;
  this._text = "";
  this.value = "";
  this.checked = false;
  this.id = "";
  this.parentNode = null;
  this.listeners = {};
}
El.prototype.appendChild = function (child) {
  child.parentNode = this;
  this.children.push(child);
  return child;
};
El.prototype.setAttribute = function (k, v) { this.attributes[k] = String(v); };
El.prototype.addEventListener = function (type, fn) { this.listeners[type] = fn; };
El.prototype.focus = function () {};
Object.defineProperty(El.prototype, "textContent", {
  get: function () {
    if (this.children.length) {
      return this.children.map(function (c) {
        return c.nodeType === 3 ? c.nodeValue : c.textContent;
      }).join("");
    }
    return this._text;
  },
  set: function (v) {
    this.children = [];
    this._text = v == null ? "" : String(v);
  }
});
Object.defineProperty(El.prototype, "innerHTML", {
  set: function (v) { throw new Error("innerHTML used: " + String(v).slice(0, 80)); },
  get: function () { throw new Error("innerHTML read"); }
});

function createDom(ids) {
  var nodes = {};
  var doc = {
    createElement: function (tag) { return new El(tag); },
    createTextNode: function (v) {
      return { nodeType: 3, nodeValue: String(v), textContent: String(v) };
    },
    getElementById: function (id) { return nodes[id] || null; },
    getElementsByName: function () { return []; },
    createRange: function () {
      return { selectNodeContents: function () {} };
    }
  };
  ids.forEach(function (id) {
    var el = new El("div");
    el.id = id;
    nodes[id] = el;
  });
  return { document: doc, nodes: nodes };
}

function walk(el, acc) {
  if (!el || el.nodeType === 3) {
    if (el && el.nodeValue) acc.texts.push(el.nodeValue);
    return;
  }
  acc.tags.push(el.tagName);
  if (el._text) acc.texts.push(el._text);
  (el.children || []).forEach(function (c) { walk(c, acc); });
}

var dom = createDom(["coi", "entity", "dba", "expiry", "tbody", "fixlist", "results", "copystate", "days", "scope-out", "cap", "go", "sample", "clear", "copy", "copy-prompt", "prompt-state", "n-ok", "n-fix", "n-check", "checked", "agent-prompt", "criteria"]);
var ctx5 = load(dom.document);
var payload = "<script>alert(1)</script>";
var coiPayload = "<img src=x onerror=alert(1)>";
dom.nodes.coi.value = "Each occurrence $1,000,000\n" + coiPayload;
dom.nodes.entity.value = payload;
var painted = ctx5.FMP_COI.run();
var acc = { tags: [], texts: [] };
walk(dom.nodes.tbody, acc);
walk(dom.nodes.fixlist, acc);
walk(dom.nodes.checked, acc);
var rendered = acc.texts.join("\n");
assert(acc.tags.indexOf("SCRIPT") === -1, "T5 no SCRIPT element created");
assert(acc.tags.indexOf("IMG") === -1, "T5 no IMG element created");
assert(rendered.indexOf(payload) !== -1, "T5 script payload rendered as text");
assert(rendered.indexOf(coiPayload) !== -1, "T5 certificate markup rendered as text");
assert(painted.fixList.indexOf(payload) !== -1, "T5 fix list keeps the script payload as text");
assert(painted.checkedText.indexOf(coiPayload) !== -1, "T5 checked text keeps the certificate markup");
assert(html.indexOf(".innerHTML") === -1, "T5 page script does not use innerHTML");
assert(html.indexOf("document.write") === -1, "T5 page does not use document.write");

console.log("T6 URLs, CSP, and house lines");
var urlRe = /https?:\/\/[^\s"'<>]+/g;
var found = {};
var um;
while ((um = urlRe.exec(html))) {
  var u = um[0].replace(/&amp;/g, "&").replace(/[),.;]+$/g, "");
  found[u] = true;
}
var allowed = [
  "https://firstmoverprojects.com/tools/amazon-coi-check/",
  "https://sellercentral.amazon.com/help/hub/reference/external/G200386300",
  "https://sellercentral.amazon.com/help/hub/reference/external/G4RUG6EAT2ZLVSRT",
  "https://sellercentral.amazon.com/seller-forums/discussions/t/287d5c33-8278-4802-ba69-2f58f7dda408",
  "https://firstmoverprojects.gumroad.com/l/amazon-1m-insurance-readiness-kit?utm_source=firstmoverprojects&utm_medium=amazon-coi-check&utm_campaign=7day-nov2&utm_content=result-card",
  "https://firstmoverprojects.gumroad.com/l/amazon-1m-insurance-readiness-kit?utm_source=firstmoverprojects&utm_medium=amazon-coi-check&utm_campaign=7day-nov2&utm_content=footer"
];
var foundList = Object.keys(found).sort();
var allowedSorted = allowed.slice().sort();
assertEq(foundList.join("\n"), allowedSorted.join("\n"), "T6 http(s) URLs are only the canonical, 3 Amazon sources, and Gumroad");
assert(html.indexOf("default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'none'; base-uri 'none'") !== -1, "T6 CSP meta present");
assert(html.indexOf('name="referrer" content="no-referrer"') !== -1, "T6 referrer meta present");
[
  "General guidance, not legal, tax or IT advice.",
  "This is not insurance advice. Talk to your insurance broker. Amazon's Business Insurance verification decides whether a certificate is accepted.",
  "Not affiliated with or endorsed by Amazon.",
  "Made by First Mover Projects with AI coding tools.",
  "Your certificate text stays in this browser tab. Nothing is uploaded or saved."
].forEach(function (line) {
  assert(html.indexOf(line) !== -1, "T6 house line: " + line);
});
["fetch(", "XMLHttpRequest", "localStorage", "sessionStorage", "indexedDB", "sendBeacon"].forEach(function (token) {
  assert(html.indexOf(token) === -1, "T6 no " + token);
});

console.log("Countdown and scope copy");
assertEq(FMP.daysText(new Date(2026, 9, 26)), "7 days until Nov 2, 2026", "Oct 26, 2026 is 7 days until Nov 2");
assertEq(FMP.daysText(new Date(2026, 10, 1)), "1 day until Nov 2, 2026", "Nov 1, 2026 is 1 day until Nov 2");
assertEq(FMP.daysText(new Date(2026, 10, 2)), "Amazon's Nov 2, 2026 change is now in effect.", "Nov 2, 2026 is in effect");
assertEq(FMP.daysText(new Date(2026, 10, 3)), "Amazon's Nov 2, 2026 change is now in effect.", "after Nov 2, 2026 is in effect");
var yes = FMP.scopeLines("yes", "no", "no");
assert(yes.some(function (l) { return l.text === "From Nov 2, 2026, Amazon's page says you need USD 1 million coverage for those products regardless of sales."; }), "Q1 yes result text");
var sales = FMP.scopeLines("no", "yes", "no");
assert(sales.some(function (l) { return l.text === "Amazon's existing rule already applies: insurance within 30 days after exceeding USD 10,000 in gross proceeds in one month."; }), "Q2 yes result text");
var china = FMP.scopeLines("no", "no", "yes");
assert(china.some(function (l) { return l.text === "Amazon's page says Mainland China sellers must get the policy through the Amazon Insurance Accelerator (AIA) program unless Amazon agrees otherwise in writing. From Nov 2, Amazon says it will reject newly submitted policies not obtained through AIA."; }), "Q3 yes result text");
var unsure = FMP.scopeLines("unsure", "no", "no");
assert(unsure.some(function (l) { return l.text === "Check Amazon's category list and your Account Health page. This page can't see your account."; }), "Q1 not sure result text");
var none = FMP.scopeLines("no", "no", "no");
assert(none.some(function (l) { return l.text === "Based on your answers, neither rule appears to apply right now, but Amazon may request insurance at any time ('or if otherwise requested by us')."; }), "all no result text");
assert(none[none.length - 1].text === "Amazon decides. Check Amazon's own help pages.", "scope always ends with Amazon decides");

console.log("Verbatim criteria");
var expectedQuotes = [
  "Under section 9 of the Amazon Services Business Solutions Agreement, you must obtain and maintain commercial liability insurance within 30 days after exceeding USD 10,000 in gross proceeds in sales in one month on Amazon.com, or if otherwise requested by us.",
  "Your commercial liability insurance policy must meet all of the following criteria, unless otherwise required by applicable law or regulation:",
  "The insurance policy type can be either commercial general, umbrella, or excess liability;",
  "The policy must be written on an \u201Coccurrence basis\u201D;",
  "If you cannot procure an \u201Coccurrence-based policy\u201D for certain product categories that are outlined in the Frequently asked questions, reach out to your insurer for a \u2018claims-made policy\u2019;",
  "The policy limit must be at least USD 1 million per occurrence and in aggregate, and cover liabilities caused by or occurring in conjunction with your business operations, including products, products/completed operations and bodily injury;",
  "The deductible for any policy(ies) must not be greater than $10,000. Any deductible amount must be listed on your Certificate of Insurance;",
  "The policy must cover all sales from products you have listed on the Amazon.com store;",
  "The policy must name \"Amazon.com Services LLC and its affiliates and assignees\" as additional insureds;",
  "The policy must not have any sunset clause;",
  "Except for single-member LLCs, your insured name must match the \u201Clegal entity\u201D name you provided to Amazon in your Account Info. For single member LLCs, where your legal entity name is different than the name you publicly use to identify your business (\u201Ctrade name,\u201D \u201Cdoing business as,\u201D or \u201CDBA\u201D), it is also acceptable for your insured name to match your trade name;",
  "Your insurance provider must have global claim handling capability and a financial rating of S&P A- and/or AM Best A- or better (if S&P or AM best is not valid or used in the country where you are required to obtain insurance, a local equivalent is allowed);",
  "The policy must be completed in its entirety and signed by an authorized representative of your insurance provider;",
  "Your insurance provider must give Amazon at least 30 days\u2019 notice of cancellation, modification, or non-renewal;",
  "The following additional requirements will apply effective November 2, 2026:",
  "If you sell products in categories with enhanced safety listing requirements, you must obtain an insurance policy with USD 1 million coverage per occurrence and in aggregate, regardless of your gross sales proceeds. Please refer to Product categories with enhanced safety listing requirements to learn which categories are subject to this requirement; and",
  "If you are a seller based in Mainland China, you are required to obtain your insurance policy through the Amazon Insurance Accelerator (AIA) program, unless otherwise agreed in writing by Amazon."
];
assertEq(FMP.QUOTES.length, expectedQuotes.length, "quote count");
expectedQuotes.forEach(function (q, i) {
  assertEq(FMP.QUOTES[i], q, "quote " + (i + 1) + " matches the verbatim line");
});
var quoteFiles = [
  path.join(root, "uploads", "G200386300.txt"),
  "/home/ubuntu/.cursor/projects/workspace/uploads/G200386300_ea5a.txt"
];
var quoteFile = quoteFiles.filter(function (p) { return fs.existsSync(p); })[0];
if (!quoteFile) {
  console.log("SKIP verbatim file check (G200386300 text not on disk)");
} else {
  var sourceText = fs.readFileSync(quoteFile, "utf8");
  expectedQuotes.forEach(function (q, i) {
    assert(sourceText.indexOf(q) !== -1, "quote " + (i + 1) + " is verbatim in the Amazon help text");
  });
}

var sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
assert(sitemap.indexOf("<loc>https://firstmoverprojects.com/tools/amazon-coi-check/</loc>") !== -1, "sitemap loc");
assert(sitemap.indexOf("<lastmod>2026-10-26</lastmod>") !== -1, "sitemap lastmod");
var deadline = fs.readFileSync(path.join(root, "deadlines", "amazon-insurance-nov-2.html"), "utf8");
assert(deadline.indexOf('<p>Free: <a href="/tools/amazon-coi-check/">paste your certificate text and check it against Amazon\'s criteria</a> (runs in your browser, nothing uploaded).</p>') !== -1, "deadline page free-tool line");

var dba = checkCOI("Insured: Trade Name Goods\nEach occurrence $1,000,000", "Sample Goods LLC", true, "", "2026-10-26");
var named = dba.extras.filter(function (e) { return e.id === "Named insured"; })[0];
assert(named.detail.indexOf("single-member LLC using a trade name/DBA") !== -1, "trade-name checkbox is mentioned");
assertEq(named.status, "check", "missing legal name is check by hand");

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
