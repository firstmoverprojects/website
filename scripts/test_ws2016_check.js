"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.resolve(__dirname, "..");
var pagePath = path.join(root, "tools", "windows-server-2016-check", "index.html");
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

function load() {
  var match = html.match(/<script id="ws2016-check">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("no ws2016-check script");
  var sandbox = {
    console: console,
    document: { getElementById: function () { return null; } },
    navigator: {},
    window: null,
    Intl: Intl,
    Date: Date,
    Math: Math,
    Number: Number,
    String: String,
    Object: Object
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox, { filename: "tools/windows-server-2016-check/index.html" });
  return sandbox.FMP_WS2016;
}

var api = load();
var ESSENTIALS = "Microsoft support for Remote Web Access and remotewebaccess.com ends Jan 12, 2027.";
var BANNED = [
  { re: /\bdies\b/i, name: "dies" },
  { re: /stops working/i, name: "stops working" },
  { re: /\u2014/g, name: "em dash" },
  { re: /\u2013/g, name: "en dash" },
  { re: /&mdash;|&#8212;|&#x2014;/i, name: "em dash entity" },
  { re: /\bsecure\b/i, name: "secure" },
  { re: /\bcompliant\b/i, name: "compliant" },
  { re: /\bprotected\b/i, name: "protected" },
  { re: /\bkit\b/i, name: "kit" },
  { re: /\bkits\b/i, name: "kits" },
  { re: /gumroad/i, name: "gumroad" },
  { re: /\$/g, name: "dollar" },
  { re: /\bbuy\b/i, name: "buy" },
  { re: /\bprice\b/i, name: "price" },
  { re: /\bpriced\b/i, name: "priced" }
];

function bannedHit(text) {
  var i, found;
  for (i = 0; i < BANNED.length; i++) {
    BANNED[i].re.lastIndex = 0;
    if (BANNED[i].re.test(text)) {
      found = BANNED[i].name;
      BANNED[i].re.lastIndex = 0;
      return found;
    }
  }
  return "";
}

function utcDays(ymd) {
  function utc(s) {
    var p = s.split("-");
    return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  return Math.round((utc("2027-01-12") - utc(ymd)) / 86400000);
}

function expectedPath(a) {
  if (a.run === "no") return "not-2016";
  if (a.run === "unsure") return "confirm";
  if (a.count === "6+") return "cloud";
  if (a.edition === "essentials" || a.rwa === "yes") return "migrate";
  if (a.count === "1") return "upgrade";
  return "migrate";
}

console.log("days left, America/Chicago");
var samples = [
  ["2026-10-30T17:00:00Z", "2026-10-30"],
  ["2026-10-31T16:00:00Z", "2026-10-31"],
  ["2026-11-01T04:30:00Z", "2026-10-31"],
  ["2026-11-01T05:30:00Z", "2026-11-01"],
  ["2027-01-11T18:00:00Z", "2027-01-11"],
  ["2027-01-12T05:30:00Z", "2027-01-11"],
  ["2027-01-12T06:30:00Z", "2027-01-12"],
  ["2027-01-12T18:00:00Z", "2027-01-12"],
  ["2027-01-13T05:30:00Z", "2027-01-12"],
  ["2027-01-13T06:30:00Z", "2027-01-13"],
  ["2027-01-20T18:00:00Z", "2027-01-20"]
];
samples.forEach(function (row) {
  var when = new Date(row[0]);
  var ymd = api.chicagoYmd(when);
  var days = api.daysLeft(when);
  assertEq(ymd, row[1], "Chicago date " + row[0]);
  assertEq(days, utcDays(row[1]), "days left on " + row[1] + " (" + row[0] + ")");
});
assertEq(api.daysLeft(new Date("2027-01-12T18:00:00Z")), 0, "on Jan 12, 2027 days left is 0");
assert(api.daysLeft(new Date("2027-01-13T18:00:00Z")) < 0, "after Jan 12, 2027 days left is negative");
assertEq(api.daysUntil("2027-01-12", new Date("2027-01-12T06:30:00Z")), 0, "daysUntil on the end date");
assertEq(api.daysUntil("2027-01-12", new Date("2027-01-13T06:30:00Z")), -1, "daysUntil the day after");

var onDay = api.buildResult(
  { run: "yes", edition: "standard", rwa: "no", count: "1" },
  new Date("2027-01-12T18:00:00Z")
);
assertEq(onDay.days, 0, "result days on Jan 12");
assert(onDay.text.indexOf("Days left until Jan 12, 2027 (America/Chicago): 0.") !== -1, "on-date line");
var after = api.buildResult(
  { run: "yes", edition: "standard", rwa: "no", count: "1" },
  new Date("2027-01-13T18:00:00Z")
);
assertEq(after.days, -1, "result days after Jan 12");
assert(after.text.indexOf("Days left until Jan 12, 2027 (America/Chicago): -1.") !== -1, "after-date line");
assert(after.text.indexOf("Jan 12, 2027 is in the past in America/Chicago.") !== -1, "past note");

console.log("every answer path");
var runs = ["yes", "no", "unsure"];
var editions = ["essentials", "standard", "datacenter", "unsure"];
var rwas = ["yes", "no", "unsure"];
var counts = ["1", "2-5", "6+", "unsure"];
var seen = { upgrade: 0, migrate: 0, cloud: 0, "not-2016": 0, confirm: 0 };
var combos = 0;
var fixedNow = new Date("2026-10-30T17:00:00Z");
runs.forEach(function (run) {
  editions.forEach(function (edition) {
    rwas.forEach(function (rwa) {
      counts.forEach(function (count) {
        combos++;
        var answers = { run: run, edition: edition, rwa: rwa, count: count };
        var result = api.buildResult(answers, fixedNow);
        var want = expectedPath(answers);
        var label = run + "/" + edition + "/" + rwa + "/" + count;
        assertEq(result.path, want, "path " + label);
        assertEq(result.complete, true, "complete " + label);
        assertEq(result.days, utcDays("2026-10-30"), "days " + label);
        assert(result.text.indexOf("Days left until Jan 12, 2027 (America/Chicago): " + result.days + ".") !== -1, "days line " + label);
        assert(result.text.indexOf(api.AFFILIATION) !== -1, "affiliation " + label);
        assert(result.text.indexOf(api.CHECKED) !== -1, "checked line " + label);
        var wantEssentials = edition === "essentials" || rwa === "yes";
        assertEq(result.essentials, wantEssentials, "essentials flag " + label);
        if (wantEssentials) {
          assert(result.text.indexOf(ESSENTIALS) !== -1, "essentials sentence " + label);
        } else {
          assert(result.text.indexOf(ESSENTIALS) === -1, "no essentials sentence " + label);
        }
        if (want === "upgrade") assert(result.text.indexOf("Path to look at: upgrade in place.") !== -1, "upgrade label " + label);
        if (want === "migrate") assert(result.text.indexOf("Path to look at: migrate to a newer server.") !== -1, "migrate label " + label);
        if (want === "cloud") assert(result.text.indexOf("Path to look at: move to cloud.") !== -1, "cloud label " + label);
        if (want === "not-2016") assert(result.text.indexOf("Path to look at: confirm which product you run.") !== -1, "not-2016 label " + label);
        if (want === "confirm") assert(result.text.indexOf("Path to look at: confirm the version first.") !== -1, "confirm label " + label);
        assertEq(bannedHit(result.text), "", "banned words " + label);
        seen[want]++;
      });
    });
  });
});
assertEq(combos, 144, "144 answer combinations");
assert(seen.upgrade > 0 && seen.migrate > 0 && seen.cloud > 0 && seen["not-2016"] > 0 && seen.confirm > 0, "each path occurs");
console.log("path counts " + JSON.stringify(seen));

var incomplete = api.buildResult({ run: "yes", edition: "standard", rwa: "no", count: "" }, fixedNow);
assertEq(incomplete.complete, false, "missing count is incomplete");
assertEq(incomplete.path, "", "missing count has no path");
assertEq(api.pathFor(null), "", "null answers have no path");

console.log("page facts and unlisted");
assert(html.indexOf('<meta name="robots" content="noindex">') !== -1, "meta robots noindex");
assert(html.indexOf(ESSENTIALS) !== -1, "page has the Essentials sentence");
assert(html.indexOf("Not affiliated with or endorsed by Microsoft.") !== -1, "affiliation line");
assert(html.indexOf("Checked October 30, 2026.") !== -1, "checked line");
assert(html.indexOf('name="SIGNUP_SOURCE" value="ws2016"') !== -1, "hidden SIGNUP_SOURCE=ws2016");
assert(html.split('<input type="hidden" name="SIGNUP_SOURCE" value="ws2016">').length - 1 === 1, "one hidden SIGNUP_SOURCE input");
assert(html.indexOf('id="sib-form"') !== -1, "Brevo form id");
assert(html.indexOf("https://05279842.sibforms.com/serve/") !== -1, "Brevo form action");
assert(html.indexOf("2027-01-12") !== -1, "release-info date on the page");
assert(html.indexOf("1/13/2027 6:59:59 AM") !== -1, "lifecycle timestamp on the page");
assert(html.indexOf("https://learn.microsoft.com/en-us/lifecycle/products/windows-server-2016") !== -1, "lifecycle URL");
assert(html.indexOf("https://learn.microsoft.com/en-us/windows-server/get-started/windows-server-release-info") !== -1, "release info URL");
assert(html.indexOf("https://support.microsoft.com/en-us/servicing/os/windows/docs/2026/09/windows-server-2016-essentials-end-support") !== -1, "Essentials URL");
assert(html.indexOf("https://learn.microsoft.com/en-us/windows-server/get-started/install-upgrade-migrate") !== -1, "upgrade plan URL");
assert(html.indexOf("https://learn.microsoft.com/en-us/windows-server/get-started/upgrade-in-place") !== -1, "in-place URL");
assert(html.indexOf("https://learn.microsoft.com/en-us/windows-server/get-started/upgrade-migrate-roles-features") !== -1, "migrate URL");
assert(html.indexOf("https://learn.microsoft.com/en-us/azure/migrate/migrate-services-overview") !== -1, "cloud URL");
assert(html.indexOf('name="viewport" content="width=device-width, initial-scale=1"') !== -1, "viewport");
assert(html.indexOf("@media (max-width:480px)") !== -1, "narrow layout");
assert(html.indexOf("min-height:44px") !== -1, "44px targets");
assertEq(bannedHit(html), "", "page HTML has no banned words");

var unlisted = [
  ["sitemap.xml", path.join(root, "sitemap.xml")],
  ["tools/index.html", path.join(root, "tools", "index.html")],
  ["deadlines/feed.xml", path.join(root, "deadlines", "feed.xml")],
  ["deadlines/deadlines.ics", path.join(root, "deadlines", "deadlines.ics")],
  ["deadlines/finder/index.html", path.join(root, "deadlines", "finder", "index.html")],
  ["index.html", path.join(root, "index.html")],
  ["deadlines/index.html", path.join(root, "deadlines", "index.html")]
];
unlisted.forEach(function (row) {
  var body = fs.readFileSync(row[1], "utf8");
  assert(body.indexOf("windows-server-2016-check") === -1, "not listed in " + row[0]);
  assert(body.indexOf("Windows Server 2016") === -1, "no Windows Server 2016 mention in " + row[0]);
});

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
