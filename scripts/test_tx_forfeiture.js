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

var FORBIDDEN = [
  { re: /\bqualify\b/i, name: "qualify" },
  { re: /\beligible\b/i, name: "eligible" },
  { re: /\bapproved\b/i, name: "approved" },
  { re: /\burgent\b/i, name: "urgent" },
  { re: /\bimmediately\b/i, name: "immediately" },
  { re: /act now/i, name: "act now" },
  { re: /\u2014/g, name: "em dash" },
  { re: /\u2013/g, name: "en dash" },
  { re: /&mdash;|&#8212;|&#x2014;/i, name: "em dash entity" },
  { re: /05-212/, name: "05-212" }
];

function forbiddenHit(text) {
  var i;
  for (i = 0; i < FORBIDDEN.length; i++) {
    FORBIDDEN[i].re.lastIndex = 0;
    if (FORBIDDEN[i].re.test(text)) return FORBIDDEN[i].name;
  }
  return "";
}

var page = fs.readFileSync(path.join(root, "deadlines/texas-franchise-tax-forfeiture-reinstatement.html"), "utf8");
var tool = fs.readFileSync(path.join(root, "tools/tx-franchise-forfeiture-check/index.html"), "utf8");
var sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
var hub = fs.readFileSync(path.join(root, "deadlines/index.html"), "utf8");
var toolsIndex = fs.readFileSync(path.join(root, "tools/index.html"), "utf8");

assert(page.indexOf('id="what-h">Got a franchise tax forfeiture? What to do') !== -1, "direct answer heading");
assert(page.indexOf("FAQPage") !== -1, "FAQPage JSON-LD");
assert(page.indexOf("General guidance, not legal, tax or IT advice.") !== -1, "disclaimer");
assert(page.indexOf("Coming soon: $9 revival checklist kit") !== -1, "coming soon kit");
assert(page.indexOf("https://comptroller.texas.gov/forms/05-391.pdf") !== -1, "05-391 pdf");
assert(page.indexOf("https://www.sos.state.tx.us/corp/instructions/801.shtml") !== -1, "Form 801 instructions");
assert(page.indexOf("$75") !== -1, "fee");
assert(page.indexOf("January 29, 2027") !== -1, "revival date");
assert(page.indexOf("noindex") === -1, "deadline page is indexable");
assert(page.indexOf("First Mover Projects does not file") !== -1, "does not file");
assert(page.indexOf("is not a filing service") !== -1, "not a filing service");
assert(page.indexOf('href="#signup"') !== -1, "kit button opens signup");
assert(!/<a\b[^>]*gumroad\.com\/l\//i.test(page), "deadline page has no gumroad product link");
assertEq(forbiddenHit(page), "", "deadline page wording");

assert(tool.indexOf('<p class="topline">A free web check') !== -1, "tool opens with a free web check");
assert(tool.indexOf('name="robots" content="noindex"') === -1, "tool is indexable");
assert(tool.indexOf("Coming soon: $9 revival checklist kit") !== -1, "tool coming soon");
assert(tool.indexOf("https://comptroller.texas.gov/forms/05-391.pdf") !== -1, "tool links 05-391");
assert(tool.indexOf("SIGNUP_SOURCE\" value=\"tx-forfeiture\"") !== -1, "signup source");
assert(!/<a\b[^>]*gumroad\.com\/l\//i.test(tool), "tool has no gumroad product link");
assertEq(forbiddenHit(tool), "", "tool wording");

assert(sitemap.indexOf("https://firstmoverprojects.com/deadlines/texas-franchise-tax-forfeiture-reinstatement.html") !== -1, "sitemap deadline");
assert(sitemap.indexOf("https://firstmoverprojects.com/tools/tx-franchise-forfeiture-check/") !== -1, "sitemap tool");
assert(hub.indexOf("texas-franchise-tax-forfeiture-reinstatement.html") !== -1, "hub deadline");
assert(hub.indexOf("/tools/tx-franchise-forfeiture-check/") !== -1, "hub tool");
assert(toolsIndex.indexOf("/tools/tx-franchise-forfeiture-check/") !== -1, "tools index");
assert(sitemap.indexOf("05-212") === -1 && hub.indexOf("05-212") === -1, "hub and sitemap omit 05-212");

var match = tool.match(/<script id="tx-forfeiture-check">([\s\S]*?)<\/script>/);
if (!match) throw new Error("missing checker script");
var sandbox = {
  console: console,
  document: { getElementById: function () { return null; }, addEventListener: function () {} },
  window: null,
  Math: Math,
  Number: Number,
  String: String,
  Object: Object,
  Date: Date,
  Intl: Intl
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox, { filename: "tx-forfeiture-check" });
var api = sandbox.FMP_TX_FORFEITURE;
assert(!!api && typeof api.buildForfeiture === "function", "checker api");

var now = new Date("2026-11-05T18:00:00Z");
assertEq(api.daysUntil("2027-01-29", now), 85, "85 days from Nov 5, 2026");

var current = api.buildForfeiture({ sos: "no", revenue: "at-or-below", gap: "info", nonprofit: "no" }, now);
assertEq(current.ok, true, "current account result");
assert(current.headline.indexOf("before January 29, 2027") !== -1, "current headline is the revival date");
assert(current.lines.join("\n").indexOf("no $50 penalty") !== -1, "information report has no $50 penalty");
assert(current.lines.join("\n").indexOf("Form 05-391") !== -1, "current result names 05-391 as the later step");
assert(current.lines.join("\n").indexOf("$75") !== -1, "current result names the later fee");

var reinstate = api.buildForfeiture({ sos: "yes", revenue: "above", gap: "report", nonprofit: "no" }, now);
assert(reinstate.headline.indexOf("Form 05-391") !== -1, "reinstatement headline names 05-391");
assert(reinstate.headline.indexOf("Form 801") !== -1, "reinstatement headline names Form 801");
assert(reinstate.lines.join("\n").indexOf("the filing fee is $75") !== -1, "reinstatement fee is $75");
assert(reinstate.lines.join("\n").indexOf("P.O. Box 13697") !== -1, "SOS mail address");
assert(reinstate.lines.join("\n").indexOf("P.O. Box 149348") !== -1, "Comptroller mail address");

var nonprofit = api.buildForfeiture({ sos: "yes", revenue: "at-or-below", gap: "info", nonprofit: "yes" }, now);
assert(nonprofit.lines.join("\n").indexOf("no fee for filing the reinstatement of a nonprofit corporation") !== -1, "nonprofit fee");
assert(nonprofit.lines.join("\n").indexOf("the filing fee is $75") === -1, "nonprofit result does not charge $75");

var unsure = api.buildForfeiture({ sos: "unsure", revenue: "unsure", gap: "unsure", nonprofit: "unsure" }, now);
assert(unsure.headline.indexOf("Look up") === 0, "unsure result starts with a lookup");
assertEq(api.buildForfeiture({ sos: "yes", revenue: "above", gap: "report", nonprofit: "" }, now).ok, false, "incomplete answers");

var onDay = api.buildForfeiture({ sos: "no", revenue: "above", gap: "payment", nonprofit: "no" }, new Date("2027-01-29T18:00:00Z"));
assertEq(onDay.days, 0, "January 29 is day zero");
assert(onDay.lines[0].indexOf("today") !== -1, "day-of line");
var after = api.buildForfeiture({ sos: "yes", revenue: "above", gap: "report", nonprofit: "no" }, new Date("2027-01-30T18:00:00Z"));
assertEq(after.days, -1, "January 30 is past");
assert(after.lines[0].indexOf("has passed") !== -1, "past line");
assertEq(forbiddenHit(current.lines.join("\n") + reinstate.lines.join("\n") + nonprofit.lines.join("\n") + unsure.lines.join("\n")), "", "result wording");

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
