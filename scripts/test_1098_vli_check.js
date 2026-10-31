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
assert(html.indexOf('<input type="hidden" name="SIGNUP_SOURCE" value="1098-vli">') !== -1, "hidden SIGNUP_SOURCE default is 1098-vli");
assert(html.split('<input type="hidden" name="SIGNUP_SOURCE" value="1098-vli">').length - 1 === 1, "one hidden SIGNUP_SOURCE input");
assert(html.indexOf('id="sib-form"') !== -1, "embedded Brevo form");
var checkForm = html.slice(html.indexOf('<form id="vli-check"'), html.indexOf("</form>", html.indexOf('<form id="vli-check"')));
assert(checkForm.indexOf("SIGNUP_SOURCE") === -1, "loan check form has no SIGNUP_SOURCE");
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

var removedLines = require("child_process").execFileSync("git", ["diff", "--unified=0", "origin/main", "--", "deadlines/1098-vli-check/index.html"], { encoding: "utf8" })
  .split("\n")
  .filter(function (line) { return line.startsWith("-") && !line.startsWith("---"); });
assert(removedLines.length === 1 && removedLines[0].indexOf(".site-footer {") !== -1, "no other page content removed");

function finish() {
  if (failed) {
    console.log(failed + " failed, " + passed + " passed");
    process.exit(1);
  }
  console.log(passed + " passed");
}

function runHeadless() {
  var http = require("http");
  var spawn = require("child_process").spawn;
  var port = 8791;
  var debugPort = 9334;
  var posts = [];

  function getJson(urlPath, method) {
    return new Promise(function (resolve, reject) {
      var req = http.request({ hostname: "127.0.0.1", port: debugPort, path: urlPath, method: method || "GET" }, function (res) {
        var body = "";
        res.on("data", function (chunk) { body += chunk; });
        res.on("end", function () {
          try { resolve(JSON.parse(body)); } catch (err) { reject(new Error(body.slice(0, 200))); }
        });
      });
      req.on("error", reject);
      req.end();
    });
  }

  function waitFor(fn, tries) {
    return fn().catch(function (err) {
      if (tries <= 0) throw err;
      return new Promise(function (resolve) { setTimeout(resolve, 200); }).then(function () { return waitFor(fn, tries - 1); });
    });
  }

  var server = http.createServer(function (req, res) {
    var urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    var file = path.normalize(path.join(root, urlPath));
    if (file.indexOf(root) !== 0) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, function (err, data) {
      if (err) {
        res.writeHead(404);
        res.end("missing");
        return;
      }
      var type = "application/octet-stream";
      if (file.endsWith(".html")) type = "text/html; charset=utf-8";
      else if (file.endsWith(".css")) type = "text/css";
      else if (file.endsWith(".js")) type = "text/javascript";
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
      res.end(data);
    });
  });

  return new Promise(function (resolve, reject) {
    server.listen(port, "127.0.0.1", resolve);
    server.on("error", reject);
  }).then(function () {
    var chrome = spawn("google-chrome", [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--remote-debugging-port=" + debugPort,
      "--user-data-dir=/tmp/chrome-vli-source-" + debugPort,
      "about:blank"
    ], { stdio: "ignore" });
    var target;
    var ws;
    var nextId = 0;
    var pending = new Map();
    function send(method, params, sessionId) {
      var msgId = ++nextId;
      return new Promise(function (resolve, reject) {
        pending.set(msgId, { resolve: resolve, reject: reject });
        var payload = { id: msgId, method: method, params: params || {} };
        if (sessionId) payload.sessionId = sessionId;
        ws.send(JSON.stringify(payload));
      });
    }
    return waitFor(function () { return getJson("/json/version"); }, 25).then(function () {
      return getJson("/json/new?" + encodeURIComponent("about:blank"), "PUT");
    }).then(function (created) {
      target = created;
      ws = new WebSocket(created.webSocketDebuggerUrl);
      ws.addEventListener("message", function (ev) {
        var msg = JSON.parse(ev.data);
        if (msg.method === "Network.requestWillBeSent") {
          var req = msg.params.request;
          if (req.method === "POST" || String(req.url).indexOf("sibforms.com") !== -1) posts.push(req.method + " " + req.url);
        }
        if (msg.id && pending.has(msg.id)) {
          var item = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) item.reject(new Error(JSON.stringify(msg.error)));
          else item.resolve(msg.result);
        }
      });
      return new Promise(function (resolve, reject) {
        ws.addEventListener("open", resolve);
        ws.addEventListener("error", reject);
      });
    }).then(function () {
      return send("Page.enable").then(function () { return send("Network.enable"); }).then(function () {
        return send("Page.addScriptToEvaluateOnNewDocument", {
          source: "document.addEventListener('submit', function (ev) { ev.preventDefault(); ev.stopImmediatePropagation(); window.__fmpSubmitBlocked = (window.__fmpSubmitBlocked || 0) + 1; }, true);"
        });
      });
    }).then(function () {
      function readPage(search) {
        var loaded = new Promise(function (resolve) {
          var timer = setTimeout(resolve, 3000);
          function onMsg(ev) {
            var msg = JSON.parse(ev.data);
            if (msg.method === "Page.loadEventFired") {
              clearTimeout(timer);
              ws.removeEventListener("message", onMsg);
              resolve();
            }
          }
          ws.addEventListener("message", onMsg);
        });
        return send("Page.navigate", { url: "http://127.0.0.1:" + port + "/deadlines/1098-vli-check/" + search }).then(function () {
          return loaded;
        }).then(function () {
          return send("Runtime.evaluate", {
            expression: "(function () {\n" +
              "  var form = document.getElementById('sib-form');\n" +
              "  var fd = new FormData(form);\n" +
              "  var pairs = [];\n" +
              "  fd.forEach(function (value, key) { pairs.push(key + '=' + value); });\n" +
              "  pairs.sort();\n" +
              "  var main = document.querySelector('main').cloneNode(true);\n" +
              "  var embedded = main.querySelector('#sib-form');\n" +
              "  if (embedded) embedded.remove();\n" +
              "  var src = main.querySelector('#signup-source-script');\n" +
              "  if (src) src.remove();\n" +
              "  var doc = document.documentElement;\n" +
              "  return {\n" +
              "    pairs: pairs,\n" +
              "    text: main.innerText.replace(/\\s+/g, ' ').trim(),\n" +
              "    submitted: window.__fmpSubmitBlocked || 0,\n" +
              "    scrollWidth: doc.scrollWidth,\n" +
              "    clientWidth: doc.clientWidth\n" +
              "  };\n" +
              "})()",
            returnByValue: true
          });
        }).then(function (result) {
          if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
          return result.result.value;
        });
      }
      return send("Emulation.setDeviceMetricsOverride", {
        width: 375,
        height: 812,
        deviceScaleFactor: 1,
        mobile: true
      }).then(function () { return readPage(""); }).then(function (baseline) {
        var longSource = new Array(51).join("a");
        return readPage("?SIGNUP_SOURCE=dealer-kit-2").then(function (custom) {
          return readPage("?SIGNUP_SOURCE=AbC_99!").then(function (stripped) {
            return readPage("?SIGNUP_SOURCE=" + longSource).then(function (limited) {
              return readPage("?SIGNUP_SOURCE=!!!").then(function (empty) {
                return { baseline: baseline, custom: custom, stripped: stripped, limited: limited, empty: empty };
              });
            });
          });
        });
      });
    }).then(function (out) {
      function sourceOf(page) {
        var hit = page.pairs.filter(function (pair) { return pair.indexOf("SIGNUP_SOURCE=") === 0; });
        assertEq(hit.length, 1, "FormData has one SIGNUP_SOURCE");
        return hit[0];
      }
      function withoutSource(page) {
        return page.pairs.filter(function (pair) { return pair.indexOf("SIGNUP_SOURCE=") !== 0; }).join("&");
      }
      assertEq(sourceOf(out.baseline), "SIGNUP_SOURCE=1098-vli", "default FormData SIGNUP_SOURCE");
      assertEq(sourceOf(out.custom), "SIGNUP_SOURCE=dealer-kit-2", "query FormData SIGNUP_SOURCE");
      assertEq(sourceOf(out.stripped), "SIGNUP_SOURCE=abc99", "sanitized FormData SIGNUP_SOURCE");
      assertEq(sourceOf(out.limited), "SIGNUP_SOURCE=" + new Array(41).join("a"), "SIGNUP_SOURCE capped at 40");
      assertEq(sourceOf(out.empty), "SIGNUP_SOURCE=1098-vli", "empty sanitize keeps 1098-vli");
      assertEq(withoutSource(out.custom), withoutSource(out.baseline), "other FormData fields unchanged");
      assertEq(withoutSource(out.stripped), withoutSource(out.baseline), "sanitize does not change other fields");
      assert(out.baseline.pairs.indexOf("EMAIL=") !== -1, "FormData still has EMAIL");
      assert(out.baseline.pairs.indexOf("locale=en") !== -1, "FormData still has locale");
      assert(out.baseline.pairs.indexOf("email_address_check=") !== -1, "FormData still has honeypot");
      assertEq(out.custom.text, out.baseline.text, "query param does not change other page text");
      assert(out.baseline.text.indexOf(PAPER) !== -1, "paper line still on the page");
      assertEq(out.baseline.submitted, 0, "form was not submitted");
      assertEq(out.custom.submitted, 0, "query load did not submit");
      assertEq(posts.length, 0, "no live Brevo request");
      assertEq(out.baseline.scrollWidth, out.baseline.clientWidth, "375px has no sideways scroll");
      console.log("FormData default: " + out.baseline.pairs.join("&"));
      console.log("FormData param: " + out.custom.pairs.join("&"));
      ws.close();
      chrome.kill();
      server.close();
    }).catch(function (err) {
      try { if (ws) ws.close(); } catch (e) {}
      try { chrome.kill(); } catch (e2) {}
      server.close();
      throw err;
    });
  });
}

runHeadless().then(finish).catch(function (err) {
  failed++;
  console.log("FAIL headless FormData (" + err.message + ")");
  finish();
});
