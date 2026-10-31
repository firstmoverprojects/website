"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.resolve(__dirname, "..");
var pagePath = path.join(root, "deadlines", "1098-vli-check", "index.html");
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

var EFILE = "If you file 10 or more information returns of any type in the year, you must e-file. For filing season 2027, IRS says IRIS is the only intake system.";
var PAPER = "If you file fewer than 10 information returns of any type in the year, you may file on paper. IRS paper due Mar 1, 2027.";
var ORIGINAL = "Did the vehicle's original use begin with the borrower (new, not previously used)?";
var BUTTON = "Join the free waitlist for the $29 kit";
var DATES = "Borrower statements due Jan 31, 2027. IRS e-file due Mar 31, 2027.";
var INFO = "Information only, from the IRS instructions for Form 1098-VLI. General guidance, not legal, tax or IT advice. Confirm with your tax professional.";
var AFFIL = "Not affiliated with or endorsed by the IRS.";
var THANKS = "Thank you for your time.";
var SHARE = "Share it with someone it could help.";
var BREVO = "https://05279842.sibforms.com/serve/MUIFAOl30i4SqBWIywYgwCK-R-JtXw9dFx8m5j-td4xmrSh6dXO-1ysXwauPn74aUR1704Woip5d-zVEij--7PVs3Ny9ANkpwvsp6zi8LQaPXra8EtECZfFOjzPBw1houYxtyGNprdB_IAejV4AHahfUP0AeeMyIpgcAFFaxNlyGv9PQhVHeo9NHrVFBHvcyJyn7qSpur2L10Tzt8A==";

assert(html.indexOf(EFILE) !== -1, "10-return e-file line");
assert(html.split(PAPER).length - 1 === 2, "paper line in the answer and the result");
assert(html.indexOf("TODO: These waitlist clicks are not tagged 1098-VLI.") !== -1, "Brevo tag TODO names the gap");
assert(html.indexOf("SIGNUP_SOURCE") !== -1, "TODO names the Brevo attribute Chief must create");
assert(html.indexOf(BREVO + "?") === -1, "Brevo URL has no query string");
assert(html.indexOf(BREVO + "&") === -1, "Brevo URL has no extra parameter");
assert(html.indexOf(ORIGINAL) !== -1, "original use question");
assert(html.indexOf(BUTTON) !== -1, "waitlist button text");
assert(html.indexOf(DATES) !== -1, "plain due-date line");
assert(html.indexOf(INFO) !== -1, "information-only line");
assert(html.indexOf(AFFIL) !== -1, "not affiliated or endorsed line");
assert(html.indexOf("Not affiliated with the IRS.") === -1, "short affiliation sentence removed");
assert(html.indexOf(THANKS) !== -1, "thanks line");
assert(html.indexOf(SHARE) !== -1, "share line");
assert(html.indexOf("https://www.irs.gov/instructions/i1098vli") !== -1, "instructions URL");
assert(html.indexOf("https://www.irs.gov/publications/p1099") !== -1, "publication 1099 URL");
assert(html.indexOf(BREVO) !== -1, "existing Brevo signup URL");
assert(html.indexOf('id="signup"') !== -1, "signup anchor");
assert(html.indexOf('name="robots" content="noindex, follow"') !== -1, "unlisted noindex");

assert(html.indexOf("Notice 2025-57") === -1, "no Notice 2025-57");
assert(html.indexOf("2025 relief") === -1, "no 2025 relief claim");
assert(html.indexOf("first full") === -1, "no first-full-season claim");
assert(html.indexOf("\u2014") === -1, "no em dash");
assert(html.indexOf("&mdash;") === -1, "no em dash entity");
assert(html.indexOf("&#8212;") === -1, "no numeric em dash");
assert(/rush|hurry|act now|last chance|don't miss|don’t miss/i.test(html) === false, "no urgency phrasing");

assert(html.indexOf('type="email"') === -1, "no email input");
assert(html.indexOf('type="file"') === -1, "no file input");
assert(html.indexOf("localStorage") === -1, "no localStorage");
assert(html.indexOf("sessionStorage") === -1, "no sessionStorage");
assert(/mailchimp|convertkit|klaviyo|buttondown|beehiiv/i.test(html) === false, "no new email service");
assert(html.indexOf("gumroad.com") === -1, "no kit checkout");

var footer = html.slice(html.indexOf('<footer class="site-footer">'), html.indexOf("</footer>"));
assert(footer.indexOf(AFFIL) !== -1, "affiliation is in the footer");
assert(footer.indexOf("Not affiliated with the IRS.") === -1, "short affiliation sentence not in footer");

var signup = html.slice(html.indexOf('id="signup"'), html.indexOf("</section>", html.indexOf('id="signup"')));
assert(signup.indexOf("Sign up for the weekly FMP email (1-click)") === -1, "no duplicate weekly signup link");
assert(signup.indexOf(BUTTON) !== -1, "waitlist button remains in signup");

var result = html.slice(html.indexOf('id="vli-result"'), html.indexOf("</section>", html.indexOf('id="vli-result"')));
assert(result.indexOf(DATES) !== -1, "dates near result");
assert(result.indexOf(EFILE) !== -1, "e-file line near result");
assert(result.indexOf(PAPER) !== -1, "paper line near result");
assert(result.indexOf(INFO) !== -1, "disclaimer near result");
assert(result.indexOf(AFFIL) !== -1, "affiliation near result");
assert(result.indexOf(THANKS) !== -1, "thanks near result");
assert(result.indexOf(SHARE) !== -1, "share near result");
assert(result.indexOf(BUTTON) !== -1, "waitlist button near result");

var indexHtml = fs.readFileSync(path.join(root, "deadlines", "index.html"), "utf8");
var sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
assert(indexHtml.indexOf("1098-vli-check") === -1, "not linked from deadlines index");
assert(sitemap.indexOf("1098-vli-check") === -1, "not in sitemap");

var scriptMatch = html.match(/<script id="vli-check-script">([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  assert(false, "check script present");
} else {
  var sandbox = { window: {}, document: { getElementById: function () { return null; }, addEventListener: function () {} } };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(scriptMatch[1], sandbox, { filename: "deadlines/1098-vli-check/index.html" });
  var classify = sandbox.classify1098Vli;
  assert(typeof classify === "function", "classify1098Vli exported");
  var yes = ["yes", "yes", "yes", "yes", "yes", "yes"];
  var no = ["yes", "yes", "no", "yes", "yes", "yes"];
  var gap = ["yes", "yes", "", "yes", "yes", "yes"];
  assertEq(classify(yes).complete, true, "all yes is complete");
  assertEq(classify(yes).match, true, "all yes matches");
  assertEq(classify(no).complete, true, "a no is complete");
  assertEq(classify(no).match, false, "a no does not match");
  assertEq(classify(gap).complete, false, "blank is incomplete");
  assertEq(classify(["yes"]).complete, false, "short list is incomplete");
}

if (failed) {
  console.log(failed + " failed, " + passed + " passed");
  process.exit(1);
}
console.log(passed + " passed");
