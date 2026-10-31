"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.resolve(__dirname, "..");
var pagePath = path.join(root, "tools", "ct-paid-sick-leave-check", "index.html");
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

var QUESTION = "Does this apply to me on Jan 1, 2027?";
var DISCLAIMER = "General guidance, not legal, tax or IT advice. Check with CT DOL.";
var CHECKED = "Checked October 30, 2026.";
var BREVO = "https://05279842.sibforms.com/serve/MUIFAOl30i4SqBWIywYgwCK-R-JtXw9dFx8m5j-td4xmrSh6dXO-1ysXwauPn74aUR1704Woip5d-zVEij--7PVs3Ny9ANkpwvsp6zi8LQaPXra8EtECZfFOjzPBw1houYxtyGNprdB_IAejV4AHahfUP0AeeMyIpgcAFFaxNlyGv9PQhVHeo9NHrVFBHvcyJyn7qSpur2L10Tzt8A==";

assert(html.indexOf(QUESTION) !== -1, "question text is on the page");
assert(html.indexOf(DISCLAIMER) !== -1, "not legal advice line");
assert(html.indexOf(CHECKED) !== -1, "checked date line");
assert(html.indexOf('name="robots" content="noindex, follow"') !== -1, "unlisted noindex");
assert(html.indexOf('<input type="hidden" name="SIGNUP_SOURCE" value="ct-psl">') !== -1, "hidden SIGNUP_SOURCE is ct-psl");
assert(html.split('<input type="hidden" name="SIGNUP_SOURCE" value="ct-psl">').length - 1 === 1, "one SIGNUP_SOURCE input");
assert(html.indexOf('id="sib-form"') !== -1, "embedded Brevo form");
assert(html.indexOf('action="' + BREVO + '"') !== -1, "form posts to the existing Brevo action");
assert(html.indexOf("form-action https://05279842.sibforms.com") !== -1, "CSP allows the Brevo form action");
assert(html.indexOf("\u2014") === -1, "no em dash");
assert(html.indexOf("\u2013") === -1, "no en dash");
assert(html.indexOf("&mdash;") === -1, "no em dash entity");
assert(html.indexOf("&#8212;") === -1, "no numeric em dash");
assert(!/<a\b[^>]*gumroad\.com/i.test(html), "no Gumroad link");
assert(html.indexOf("id=\"paid-link\"") === -1, "no paid footer link");
assert(html.indexOf("id=\"fmp-share\"") === -1, "no share widget");

var visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
assert(visible.indexOf("$") === -1, "no price mark outside scripts");
assert(visible.toLowerCase().indexOf("gumroad") === -1, "no gumroad wording outside scripts");
assert(visible.toLowerCase().indexOf("buy") === -1, "no buy wording outside scripts");
assert(!/\$\d/.test(visible), "no dollar amount outside scripts");

var sources = [
  "https://portal.ct.gov/dol/divisions/legal/connecticut-leave-programs/paid-sick-leave-faqs",
  "https://portal.ct.gov/dol/knowledge-base/articles/wage-and-workplace-standards/paid-sick-leave",
  "https://cga.ct.gov/2024/ACT/PA/PDF/2024PA-00008-R00HB-05005-PA.PDF"
];
sources.forEach(function (url) {
  assert(html.indexOf(url) !== -1, "cites " + url);
});

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
  assert(body.indexOf("ct-paid-sick-leave-check") === -1, "not listed in " + rel);
});

var scriptMatch = html.match(/<script id="ct-psl-script">([\s\S]*?)<\/script>/);
assert(!!scriptMatch, "calculator script present");

var sandbox = {
  console: console,
  document: { getElementById: function () { return null; } },
  window: null
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(scriptMatch[1], sandbox, { filename: "tools/ct-paid-sick-leave-check/index.html" });

var checkCtPsl = sandbox.checkCtPsl;
var employerCovered = sandbox.employerCovered;
var accruedHours = sandbox.accruedHours;
var canUsePaidSickLeave = sandbox.canUsePaidSickLeave;

function cover(employees, year) {
  var row = employerCovered(employees, year);
  assert(row.ok, "coverage ok for " + employees + " in " + year);
  return row.covered;
}

console.log("headcount thresholds");
assertEq(cover(0, 2025), false, "2025: 0 employees is under 25");
assertEq(cover(0, 2026), false, "2026: 0 employees is under 11");
assertEq(cover(0, 2027), false, "2027: 0 employees is under 1");
assertEq(cover(1, 2025), false, "2025: 1 employee is under 25");
assertEq(cover(1, 2026), false, "2026: 1 employee is under 11");
assertEq(cover(1, 2027), true, "2027: 1 employee meets 1 or more");
assertEq(cover(10, 2026), false, "2026: 10 employees is under 11");
assertEq(cover(11, 2026), true, "2026: 11 employees meets 11 or more");
assertEq(cover(24, 2025), false, "2025: 24 employees is under 25");
assertEq(cover(25, 2025), true, "2025: 25 employees meets 25 or more");
assertEq(cover(26, 2025), true, "2025: 26 employees meets 25 or more");
assertEq(cover(25, 2026), true, "2026: 25 employees meets 11 or more");
assertEq(cover(26, 2026), true, "2026: 26 employees meets 11 or more");
assertEq(cover(25, 2027), true, "2027: 25 employees meets 1 or more");
assertEq(cover(26, 2027), true, "2027: 26 employees meets 1 or more");
assertEq(employerCovered(25, 2025).minimum, 25, "2025 minimum is 25");
assertEq(employerCovered(11, 2026).minimum, 11, "2026 minimum is 11");
assertEq(employerCovered(1, 2027).minimum, 1, "2027 minimum is 1");
assertEq(employerCovered("01", 2027).covered, true, "leading zero still counts as 1");
assertEq(employerCovered("1.5", 2027).ok, false, "fractional headcount is not a count");
assertEq(employerCovered(-1, 2027).ok, false, "negative headcount is rejected");

console.log("January 1, 2027 yes/no and accrual");
var zero = checkCtPsl(0, 0);
assertEq(zero.ok, true, "0 employees and 0 hours is a complete check");
assertEq(zero.question, QUESTION, "question wording");
assertEq(zero.answer, "No", "0 employees on Jan 1, 2027 is No");
assertEq(zero.applies, false, "0 employees does not apply");
assertEq(zero.accruedHours, 0, "0 hours accrue 0");

var one = checkCtPsl(1, 30);
assertEq(one.answer, "Yes", "1 employee on Jan 1, 2027 is Yes");
assertEq(one.accruedHours, 1, "30 hours accrue 1");

var twentyFive = checkCtPsl(25, 90);
assertEq(twentyFive.answer, "Yes", "25 employees on Jan 1, 2027 is Yes");
assertEq(twentyFive.accruedHours, 3, "90 hours accrue 3");

var twentySix = checkCtPsl("26", "5000");
assertEq(twentySix.answer, "Yes", "26 employees on Jan 1, 2027 is Yes");
assertEq(twentySix.accruedHours, 40, "5000 hours cap at 40");
assertEq(twentySix.capped, true, "5000 hours is capped");

assertEq(checkCtPsl("", 30).ok, false, "blank employees is incomplete");
assertEq(checkCtPsl(1, "").answer, "", "blank hours has no yes/no");
assertEq(checkCtPsl("1.2", 30).ok, false, "1.2 employees is incomplete");

console.log("accrual cap");
assertEq(accruedHours(0).hours, 0, "0 hours");
assertEq(accruedHours(29).hours, 0, "29 hours accrue 0");
assertEq(accruedHours("29.9").hours, 0, "29.9 hours accrue 0");
assertEq(accruedHours(30).hours, 1, "30 hours accrue 1");
assertEq(accruedHours(59).hours, 1, "59 hours accrue 1");
assertEq(accruedHours(60).hours, 2, "60 hours accrue 2");
assertEq(accruedHours(1199).hours, 39, "1199 hours accrue 39");
assertEq(accruedHours(1199).capped, false, "1199 is under the cap");
assertEq(accruedHours(1200).hours, 40, "1200 hours accrue 40");
assertEq(accruedHours(1200).capped, true, "1200 hits the cap");
assertEq(accruedHours(1201).hours, 40, "1201 hours stay at 40");
assertEq(accruedHours(99999).hours, 40, "a large total stays at 40");
assertEq(accruedHours(-1).ok, false, "negative hours rejected");
assertEq(checkCtPsl(0, 1200).answer, "No", "0 employees stays No even when hours cap");
assertEq(checkCtPsl(0, 1200).accruedHours, 40, "0 employees still reports the capped hours");

console.log("120th calendar day");
assertEq(canUsePaidSickLeave(0).usable, false, "day 0 is not yet usable");
assertEq(canUsePaidSickLeave(119).usable, false, "day 119 is not yet the 120th calendar day");
assertEq(canUsePaidSickLeave(119).ok, true, "day 119 is a real day count");
assertEq(canUsePaidSickLeave("119").usable, false, "string day 119 is not usable");
assertEq(canUsePaidSickLeave(120).usable, true, "day 120 is usable");
assertEq(canUsePaidSickLeave("120").usable, true, "string day 120 is usable");
assertEq(canUsePaidSickLeave(121).usable, true, "day 121 stays usable");
assertEq(canUsePaidSickLeave(119.5).ok, false, "a fractional day is not a calendar day");
assertEq(canUsePaidSickLeave(-1).ok, false, "a negative day is rejected");

var faqBlocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
assert(!!faqBlocks, "FAQ JSON present");
var faq = JSON.parse(faqBlocks[1]);
var faqHtml = html.slice(html.indexOf('id="faq"'), html.indexOf("</section>", html.indexOf('id="faq"')));
var pairs = [];
var pairRe = /<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g;
var pair;
while ((pair = pairRe.exec(faqHtml))) pairs.push(pair);
assertEq(pairs.length, faq.mainEntity.length, "FAQ count matches visible questions");
faq.mainEntity.forEach(function (item, i) {
  assertEq(item.name, pairs[i][1], "FAQ question " + i + " matches");
  assertEq(item.acceptedAnswer.text, pairs[i][2], "FAQ answer " + i + " matches");
});

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
