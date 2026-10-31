"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.resolve(__dirname, "..");
var pagePath = path.join(root, "tools", "nj-contractor-check", "index.html");
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

var DISCLAIMER = "This is general information about N.J.A.C. 12:11, not legal advice. Whether someone is an employee depends on the facts. Talk to an employment lawyer or the NJ Department of Labor before you decide.";
var AFFILIATION = "Not affiliated with or endorsed by the State of New Jersey.";
var THANKS = "Thanks for your time. If this isn't right for you, please share it with someone it could help.";
var NOTICE = "https://www.nj.gov/labor/assets/PDFs/Legal%20Notices/Rule%20Adoptions/NJAC_12_11_(notice_of_adoption)_FILED.pdf";
var RELEASE = "https://www.nj.gov/labor/lwdhome/press/2026/20260505_ABC.shtml";
var BREVO = "https://05279842.sibforms.com/serve/MUIFAOl30i4SqBWIywYgwCK-R-JtXw9dFx8m5j-td4xmrSh6dXO-1ysXwauPn74aUR1704Woip5d-zVEij--7PVs3Ny9ANkpwvsp6zi8LQaPXra8EtECZfFOjzPBw1houYxtyGNprdB_IAejV4AHahfUP0AeeMyIpgcAFFaxNlyGv9PQhVHeo9NHrVFBHvcyJyn7qSpur2L10Tzt8A==";

var FORBIDDEN = [
  { re: /you qualify/i, name: "you qualify" },
  { re: /\bapproved\b/i, name: "approved" },
  { re: /you are a contractor/i, name: "you are a contractor" },
  { re: /you're a contractor/i, name: "you're a contractor" },
  { re: /you’re a contractor/i, name: "curly you're a contractor" },
  { re: /you aren't a contractor/i, name: "you aren't a contractor" },
  { re: /you aren’t a contractor/i, name: "curly you aren't a contractor" },
  { re: /you are not a contractor/i, name: "you are not a contractor" },
  { re: /you're compliant/i, name: "you're compliant" },
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

function load() {
  var match = html.match(/<script id="nj-contractor-check">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("no nj-contractor-check script");
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
  vm.runInContext(match[1], sandbox, { filename: "tools/nj-contractor-check/index.html" });
  return sandbox.FMP_NJ;
}

var api = load();

console.log("page facts");
assertEq(api.LABEL, "Points to review", "result label");
assertEq(api.DISCLAIMER, DISCLAIMER, "script disclaimer");
assertEq(api.AFFILIATION, AFFILIATION, "script affiliation");
assert(html.indexOf(DISCLAIMER) !== -1, "disclaimer is on the page, next to the result");
assert(html.indexOf(AFFILIATION) !== -1, "affiliation line");
assert(html.indexOf(THANKS) !== -1, "thanks line in the footer");
assert(html.indexOf("<footer>") !== -1 && html.indexOf(THANKS) > html.indexOf("<footer>"), "thanks line is in the footer");
assert(html.indexOf('name="robots" content="noindex"') !== -1, "meta robots noindex");
assert(html.indexOf("noindex, follow") === -1, "robots is noindex only");
assert(html.indexOf('<input type="hidden" name="SIGNUP_SOURCE" value="nj-abc">') !== -1, "hidden SIGNUP_SOURCE is nj-abc");
assert(html.split('<input type="hidden" name="SIGNUP_SOURCE" value="nj-abc">').length - 1 === 1, "one SIGNUP_SOURCE input");
assert(html.indexOf('id="sib-form"') !== -1, "embedded Brevo form");
assert(html.indexOf('action="' + BREVO + '"') !== -1, "form posts to the existing Brevo action");
assert(html.indexOf("form-action https://05279842.sibforms.com") !== -1, "CSP allows the Brevo form action");
assert(html.indexOf("goatcounter") === -1, "no goatcounter");
assert(html.indexOf("gc.zgo.at") === -1, "no goatcounter script host");
assert(html.indexOf(NOTICE) !== -1, "links the notice of adoption");
assert(html.indexOf(RELEASE) !== -1, "links the NJDOL release");
assert(html.indexOf("N.J.S.A. 43:21-19(i)(6)") !== -1, "cites the ABC statute");
assert(html.indexOf("12:11-1.3") !== -1, "cites section 12:11-1.3");
assert(html.indexOf("12:11-1.4") !== -1, "cites section 12:11-1.4");
assert(html.indexOf("12:11-1.5") !== -1, "cites section 12:11-1.5");
assert(html.indexOf("12:11-1.6") !== -1, "cites section 12:11-1.6");
assert(html.indexOf("12:11-1.5(f)") !== -1, "cites section 12:11-1.5(f)");
assert(html.indexOf("12:11-1.5(g)") !== -1, "cites section 12:11-1.5(g)");
assert(html.indexOf("October 1, 2026") !== -1, "operative date");
assert(html.indexOf("not alone sufficient to meet Prong C") !== -1, "registration is not alone sufficient");
assert(html.indexOf("An LLC alone does not prove contractor status.") !== -1, "LLC alone does not prove contractor status");
assert(html.indexOf("The contractor's own insurance alone does not prove contractor status.") !== -1, "insurance alone does not prove contractor status");
assert(html.indexOf("A 1099 alone does not prove contractor status.") !== -1, "1099 alone does not prove contractor status");
assert(html.indexOf('class="topline">A free web check') !== -1, "top line says what the page is");
assert(html.indexOf('name="viewport" content="width=device-width, initial-scale=1"') !== -1, "viewport");
assert(html.indexOf("font-size:16px") !== -1, "16px inputs");
assert(html.indexOf("min-height:44px") !== -1, "44px targets");
assert(html.indexOf("@media (max-width:480px)") !== -1, "narrow layout");
assertEq(forbiddenHit(html), "", "page HTML has no forbidden phrase");
assert(html.indexOf("Jarvis") === -1, "no personal name from the adoption notice");
assert(html.indexOf("Duane") === -1, "no law-firm name");
assert(html.toLowerCase().indexOf("gumroad") === -1, "no gumroad");
assert(html.indexOf("$19") === -1 && html.indexOf("$29") === -1, "no paid kit price");
assert(!/\bbuy\b/i.test(html), "no buy wording");
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
  assert(body.indexOf("nj-contractor-check") === -1, "not listed in " + rel);
});

console.log("points to review");
var base = {
  prongA: "reviewed",
  prongB: "reviewed",
  prongC: "reviewed",
  customers: "reviewed",
  llcOnly: "no",
  insuranceOnly: "no",
  licenseOnly: "no",
  form1099: "no"
};
var clean = api.pointsToReview(base);
assertEq(clean.ok, true, "complete answers return points");
assertEq(clean.label, "Points to review", "label stays points to review");
assertEq(clean.disclaimer, DISCLAIMER, "result carries the disclaimer");
assert(clean.items.length >= 8, "each cited section produces a point");
clean.items.forEach(function (item, index) {
  assert(item.indexOf("Point to review:") === 0, "item " + index + " starts with Point to review");
});
assert(clean.items.join("\n").indexOf("12:11-1.3") !== -1, "result cites 1.3");
assert(clean.items.join("\n").indexOf("12:11-1.4") !== -1, "result cites 1.4");
assert(clean.items.join("\n").indexOf("12:11-1.5") !== -1, "result cites 1.5");
assert(clean.items.join("\n").indexOf("12:11-1.6") !== -1, "result cites 1.6");
assertEq(forbiddenHit(JSON.stringify(clean)), "", "clean result has no forbidden phrase");

var relied = api.pointsToReview({
  prongA: "not-yet",
  prongB: "unsure",
  prongC: "not-yet",
  customers: "unsure",
  llcOnly: "yes",
  insuranceOnly: "yes",
  licenseOnly: "yes",
  form1099: "yes"
});
var reliedText = relied.items.join("\n");
assert(reliedText.indexOf("not alone sufficient to meet Prong C") !== -1, "LLC yes still says not alone sufficient");
assert(reliedText.indexOf("workers' comp insurance is not alone sufficient") !== -1, "insurance yes cites 1.5(g)");
assert(reliedText.indexOf("professional license alone is not sufficient") !== -1, "license yes cites the adoption discussion");
assert(reliedText.indexOf("A 1099 alone does not prove contractor status.") !== -1, "1099 yes does not prove contractor status");
assert(reliedText.indexOf("1.5(e)") !== -1, "deleted free-to-work provision stays in the result");
assertEq(forbiddenHit(reliedText), "", "relied-on-papers result has no forbidden phrase");

assertEq(api.pointsToReview(null).ok, false, "null answers are incomplete");
assertEq(api.pointsToReview({}).label, "Points to review", "incomplete still uses the points label");
var missing = Object.assign({}, base);
delete missing.form1099;
assertEq(api.pointsToReview(missing).ok, false, "a missing answer is incomplete");
var bad = Object.assign({}, base, { prongA: "yes" });
assertEq(api.pointsToReview(bad).ok, false, "a bad prong value is incomplete");

var prongValues = ["reviewed", "not-yet", "unsure"];
var ynValues = ["yes", "no", "unsure"];
var comboCount = 0;
var comboForbidden = "";
prongValues.forEach(function (a) {
  prongValues.forEach(function (b) {
    prongValues.forEach(function (c) {
      prongValues.forEach(function (customers) {
        ynValues.forEach(function (llc) {
          ynValues.forEach(function (ins) {
            ynValues.forEach(function (lic) {
              ynValues.forEach(function (form) {
                comboCount++;
                var row = api.pointsToReview({
                  prongA: a,
                  prongB: b,
                  prongC: c,
                  customers: customers,
                  llcOnly: llc,
                  insuranceOnly: ins,
                  licenseOnly: lic,
                  form1099: form
                });
                if (!row.ok || row.label !== "Points to review") comboForbidden = "label";
                var hit = forbiddenHit(row.items.join("\n") + row.disclaimer + row.affiliation);
                if (hit) comboForbidden = hit;
              });
            });
          });
        });
      });
    });
  });
});
assertEq(comboCount, 6561, "every answer combination is checked");
assertEq(comboForbidden, "", "no combination uses a forbidden phrase");

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
