// Static and in-process checks for GoatCounter pageviews and Gumroad checkout clicks.
import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' https://gc.zgo.at; connect-src https://firstmoverprojects.goatcounter.com; img-src 'self' data: https://firstmoverprojects.goatcounter.com; form-action 'none'; base-uri 'none'";
const CT_PSL_CSP = CSP.replace("form-action 'none'", "form-action https://05279842.sibforms.com");
const SIB_FORM_CSP = new Set([
  "tools/ct-paid-sick-leave-check/index.html",
  "tools/fire-to-iris-check/index.html",
  "tools/amazon-coi-check/index.html",
  "tools/etsy-photo-audit-check/index.html",
  "tools/eu-product-id-check/index.html",
  "tools/1099-nec-or-1099-k-check/index.html",
  "tools/tx-franchise-forfeiture-check/index.html",
  "tools/windows-server-2016-check/index.html",
  "tools/missed-lead-text-samples/index.html"
]);
// Same quiet set as tests/follower-growth.test.mjs. Their own scripts require
// no GoatCounter host, so the public CSP and count.js must stay off the page.
const QUIET_TOOLS = new Set([
  "tools/deadline-watch/index.html",
  "tools/detroit-business-tax-check/index.html",
  "tools/ga-annual-registration-check/index.html",
  "tools/mo-zero-return-check/index.html",
  "tools/nj-contractor-check/index.html",
  "tools/sam-renewal-check/index.html",
  "tools/sba-7a-buyer-calculator/index.html",
  "tools/sba-surety-fee-check/index.html",
  "tools/tx-franchise-report-check/index.html"
]);
const COUNT = '<script data-goatcounter="https://firstmoverprojects.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>';
// PR 130 owns these pages. Their helpers still record "/event/..." so this branch does not edit them.
const PR130_PAGES = new Set([
  "tools/fire-to-iris-check/index.html",
  "deadlines/irs-fire-retirement-nov-19.html"
]);
const BANNED = ["XMLHttpRequest", "localStorage", "sessionStorage", "indexedDB"];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function toolPages() {
  return readdirSync(path.join(ROOT, "tools"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `tools/${entry.name}/index.html`)
    .filter((rel) => existsSync(path.join(ROOT, rel)))
    .sort();
}

function trackingPages() {
  const deadlines = readdirSync(path.join(ROOT, "deadlines"))
    .filter((name) => name.endsWith(".html"))
    .map((name) => `deadlines/${name}`);
  return [
    ...toolPages(),
    "tools/index.html",
    "index.html",
    "deadlines/finder/index.html",
    ...deadlines
  ].sort();
}

function withoutUtm(html) {
  return html.replace(/<script id="fmp-utm">[\s\S]*?<\/script>/g, "");
}

function withoutHelper(html) {
  const marker = html.indexOf("function trackGumroadClick");
  if (marker === -1) return html;
  const start = html.lastIndexOf("<script>", marker);
  const end = html.indexOf("</script>", marker);
  return html.slice(0, start) + html.slice(end + "</script>".length);
}

function helperBody(html) {
  const marker = html.indexOf("function trackGumroadClick");
  assert.notEqual(marker, -1, "missing Gumroad click helper");
  const start = html.lastIndexOf("<script>", marker);
  const end = html.indexOf("</script>", marker);
  assert.ok(start !== -1 && end !== -1);
  return html.slice(start + "<script>".length, end).split("\n").map((line) => line.trim()).filter(Boolean).join("\n");
}

function loadHelper(search) {
  const code = helperBody(read("tools/amazon-coi-check/index.html"));
  const counts = [];
  const listeners = {};
  const sandbox = {
    location: { search },
    document: {
      addEventListener(type, fn, capture) {
        listeners[capture ? "capture:" + type : type] = fn;
      }
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox, { filename: "goatcounter-helper.js" });
  sandbox.goatcounter = sandbox.goatcounter || {};
  sandbox.goatcounter.count = (payload) => counts.push(JSON.parse(JSON.stringify(payload)));
  return { counts, listeners, sandbox };
}

function click(listeners, href, type = "click", button = 0) {
  const anchor = {
    getAttribute(name) {
      return name === "href" ? href : null;
    }
  };
  listeners[type]({
    type,
    button,
    target: { closest: () => anchor }
  });
}

test("every individual tool page allows GoatCounter and sends an origin referrer", () => {
  const pages = toolPages();
  assert.ok(pages.length >= 9, pages.join(","));
  for (const rel of QUIET_TOOLS) assert.ok(pages.includes(rel), rel);
  for (const rel of pages) {
    const html = read(rel);
    if (QUIET_TOOLS.has(rel)) {
      assert.equal(html.includes("gc.zgo.at"), false, rel);
      assert.equal(/goatcounter/i.test(html), false, rel);
      assert.equal(html.includes("function trackGumroadClick"), false, rel);
      assert.match(html, /name="robots" content="noindex/, rel);
      if (rel === "tools/deadline-watch/index.html") {
        assert.equal(html.includes("Content-Security-Policy"), false, rel);
      } else {
        assert.match(html, /form-action https:\/\/05279842\.sibforms\.com/, rel);
        assert.equal(html.includes("https://gc.zgo.at"), false, rel);
      }
      continue;
    }
    const expectedCsp = SIB_FORM_CSP.has(rel) ? CT_PSL_CSP : CSP;
    assert.equal(html.includes(`content="${expectedCsp}"`), true, rel);
    assert.equal(html.includes('<meta name="referrer" content="strict-origin-when-cross-origin">'), true, rel);
    assert.equal(html.includes('content="no-referrer"'), false, rel);
    const surface = withoutUtm(html);
    for (const token of BANNED) assert.equal(surface.includes(token), false, rel + " " + token);
    const rest = withoutHelper(html);
    assert.equal(rest.includes("fetch("), false, rel + " fetch outside helper");
    assert.equal(rest.includes("sendBeacon"), false, rel + " sendBeacon outside helper");
  }
});

test("tracking pages load the test-exclude helper before count.js", () => {
  const canonical = helperBody(read("tools/amazon-coi-check/index.html"));
  assert.match(canonical, /window\.goatcounter = \{ path: function \(p\) \{ return "TEST-EXCLUDE" \+ p; \} \}/);
  assert.match(canonical, /gumroad-click\//);
  assert.equal(canonical.includes('"/event/tiktok-follow-click-"'), false);
  assert.match(canonical, /\["", "event", "tiktok-follow-click-"\]\.join\("\/"\)/);
  assert.match(canonical, /TEST-EXCLUDE-/);
  assert.match(canonical, /var gcCountUrl = "https:\/\/firstmoverprojects\.goatcounter\.com\/count\?p="/);
  assert.match(canonical, /fetch\(gcCountUrl, \{ keepalive: true, mode: "no-cors" \}\)/);
  assert.match(canonical, /navigator\.sendBeacon\(gcCountUrl\)/);
  for (const rel of trackingPages()) {
    const html = read(rel);
    if (QUIET_TOOLS.has(rel)) {
      assert.equal(html.includes("function trackGumroadClick"), false, rel);
      assert.equal(html.split('src="https://gc.zgo.at/count.js"').length - 1, 0, rel);
      continue;
    }
    if (PR130_PAGES.has(rel)) {
      const body = helperBody(html);
      assert.match(body, /"\/event\/tiktok-follow-click-"/, rel);
      assert.equal(body.replace('"/event/tiktok-follow-click-"', '"event/tiktok-follow-click-"'), canonical, rel);
    } else {
      assert.equal(helperBody(html), canonical, rel);
    }
    const helperAt = html.indexOf("function trackGumroadClick");
    const countAt = html.indexOf(COUNT);
    assert.ok(helperAt !== -1 && countAt !== -1 && helperAt < countAt, rel);
    assert.equal(html.split('src="https://gc.zgo.at/count.js"').length - 1, 1, rel);
  }
});

test("wanted=true Gumroad anchors keep an origin referrer", () => {
  const files = trackingPages();
  let anchors = 0;
  for (const rel of files) {
    const html = read(rel);
    const tags = html.match(/<a\b[^>]*>/gi) || [];
    for (const tag of tags) {
      const decoded = tag.replace(/&amp;/g, "&");
      if (!decoded.includes("https://firstmoverprojects.gumroad.com/l/") || !decoded.includes("wanted=true")) continue;
      anchors += 1;
      assert.equal(/noreferrer/i.test(tag), false, rel + " " + tag);
      assert.match(tag, /referrerpolicy="strict-origin-when-cross-origin"/, rel);
    }
  }
  assert.ok(anchors >= 40, String(anchors));
  const ab = read("deadlines/assets/ab-cta.js");
  assert.match(ab, /A\/B CTA test ended 2026-11-09, no result \(confounded: both arms identical after PR131\)\./);
  assert.equal(/data-ab-cta|Math\.random|goatcounter|ab-cta\//.test(ab), false);
  assert.equal(read("deadlines/index.html").includes("ab-cta.js"), false);
  const finder = read("deadlines/finder/finder.js");
  assert.match(finder, /a\.rel = "noopener"/);
  assert.match(finder, /a\.referrerPolicy = "strict-origin-when-cross-origin"/);
  assert.equal(finder.includes('a.rel = "noopener noreferrer"'), false);
  const eu = read("tools/eu-product-id-check/index.html");
  assert.equal(/paid\.rel\s*=/.test(eu), false);
  assert.equal(eu.includes("fetwsm"), false);
  assert.equal(/<a\b[^>]*gumroad\.com\/l\//.test(eu), false);
});

test("test visits prefix data-goatcounter-click and live visits do not", () => {
  const href = "https://firstmoverprojects.gumroad.com/l/lnfgc?wanted=true&utm_source=site&utm_medium=site&utm_campaign=etsy-photo-audit-check&utm_content=footer";
  const testVisit = loadHelper("?fmp_test=1&qa=qa-clicktrack-20261107-2035ct");
  assert.equal(typeof testVisit.listeners["capture:click"], "function");
  assert.equal(typeof testVisit.listeners["capture:auxclick"], "function");
  const anchor = {
    attrs: {
      href,
      "data-goatcounter-click": "cta/etsy-photo-result-mockup"
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    }
  };
  const ev = {
    type: "click",
    button: 0,
    target: {
      closest(sel) {
        return sel === "[data-goatcounter-click]" || sel === "a" ? anchor : null;
      }
    }
  };
  testVisit.listeners["capture:click"](ev);
  assert.equal(anchor.attrs["data-goatcounter-click"], "TEST-EXCLUDE/cta/etsy-photo-result-mockup");
  testVisit.listeners["capture:click"](ev);
  assert.equal(anchor.attrs["data-goatcounter-click"], "TEST-EXCLUDE/cta/etsy-photo-result-mockup");

  const footer = {
    attrs: { href },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    }
  };
  testVisit.listeners["capture:click"]({
    type: "click",
    button: 0,
    target: { closest: (sel) => (sel === "a" ? footer : null) }
  });
  assert.equal(footer.attrs["data-goatcounter-click"], undefined);
  testVisit.sandbox.fetch = () => Promise.resolve();
  testVisit.sandbox.navigator = { sendBeacon() { return true; } };
  testVisit.listeners.click({
    type: "click",
    button: 0,
    target: { closest: () => footer }
  });
  assert.equal(testVisit.counts.at(-1).path, "TEST-EXCLUDE/gumroad-click/lnfgc");

  const live = loadHelper("");
  assert.equal(live.listeners["capture:click"], undefined);
  const liveAnchor = {
    attrs: { href, "data-goatcounter-click": "cta/fire-check-top" },
    getAttribute(name) {
      return this.attrs[name] || null;
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    }
  };
  live.listeners.click({
    type: "click",
    button: 0,
    target: { closest: () => liveAnchor }
  });
  assert.equal(liveAnchor.attrs["data-goatcounter-click"], "cta/fire-check-top");
  assert.equal(live.counts[0].path, "gumroad-click/lnfgc");
});

test("checkout clicks record gumroad-click/slug and test visits stay under TEST-EXCLUDE", () => {
  const href = "https://firstmoverprojects.gumroad.com/l/amazon-1m-insurance-readiness-kit?wanted=true&utm_source=firstmoverprojects&utm_medium=amazon-coi-check&utm_campaign=amazon-1m-insurance-readiness-kit&utm_content=result-card";
  const live = loadHelper("");
  const fetches = [];
  const beacons = [];
  live.sandbox.fetch = (url, opts) => {
    fetches.push({ url, opts });
    return Promise.resolve();
  };
  live.sandbox.navigator = {
    sendBeacon(url) {
      beacons.push(url);
      return true;
    }
  };
  click(live.listeners, href);
  assert.equal(fetches.length, 1);
  assert.equal(fetches[0].opts.keepalive, true);
  assert.equal(fetches[0].opts.mode, "no-cors");
  assert.match(fetches[0].url, /^https:\/\/firstmoverprojects\.goatcounter\.com\/count\?/);
  assert.match(fetches[0].url, /p=gumroad-click%2Famazon-1m-insurance-readiness-kit/);
  assert.deepEqual(beacons, fetches.map((item) => item.url));
  assert.deepEqual(live.counts, [{
    path: "gumroad-click/amazon-1m-insurance-readiness-kit",
    title: "Gumroad checkout click: amazon-1m-insurance-readiness-kit",
    event: true
  }]);
  assert.equal(live.sandbox.goatcounter.path, undefined);

  for (const search of ["?fmp_test=1", "?utm_source=fmp_test_exclude", "?utm_campaign=kit&fmp_test=1"]) {
    const testVisit = loadHelper(search);
    assert.equal(testVisit.sandbox.goatcounter.path("/tools/amazon-coi-check/?fmp_test=1"), "TEST-EXCLUDE/tools/amazon-coi-check/?fmp_test=1");
    const fetches = [];
    const beacons = [];
    testVisit.sandbox.fetch = (url, opts) => {
      fetches.push({ url, opts });
      return Promise.resolve();
    };
    testVisit.sandbox.navigator = {
      sendBeacon(url) {
        beacons.push(url);
        return true;
      }
    };
    click(testVisit.listeners, href);
    assert.equal(testVisit.counts[0].path, "TEST-EXCLUDE/gumroad-click/amazon-1m-insurance-readiness-kit");
    assert.match(fetches[0].url, /p=TEST-EXCLUDE%2Fgumroad-click%2Famazon-1m-insurance-readiness-kit/);
    assert.equal(fetches[0].opts.keepalive, true);
    assert.equal(fetches[0].opts.mode, "no-cors");
    assert.equal(beacons[0], fetches[0].url);
  }

  const ignored = loadHelper("?fmp_test=12");
  assert.equal(ignored.sandbox.goatcounter.path, undefined);
  click(ignored.listeners, "https://firstmoverprojects.gumroad.com/l/lnfgc");
  click(ignored.listeners, "https://example.com/l/lnfgc?wanted=true");
  click(ignored.listeners, href, "auxclick", 2);
  click(ignored.listeners, href, "auxclick", 1);
  assert.deepEqual(ignored.counts.map((item) => item.path), ["gumroad-click/amazon-1m-insurance-readiness-kit"]);
});

function clickTikTok(listeners, slug, type = "click", button = 0) {
  const anchor = {
    target: "_blank",
    getAttribute(name) {
      if (name === "href") return "https://www.tiktok.com/@firstmoverprojects?utm_source=firstmoverprojects&utm_medium=tool_result&utm_campaign=follower_growth";
      if (name === "class") return "follow-tiktok";
      if (name === "data-tool-slug") return slug;
      if (name === "rel") return "noopener";
      return null;
    },
    setAttribute() {}
  };
  listeners[type]({
    type,
    button,
    target: { closest: () => anchor }
  });
}

test("TikTok follow clicks record event/tiktok-follow-click and test visits use TEST-EXCLUDE-", () => {
  const live = loadHelper("");
  const fetches = [];
  live.sandbox.fetch = (url, opts) => {
    fetches.push({ url, opts });
    return Promise.resolve();
  };
  live.sandbox.navigator = { sendBeacon(url) { return url; } };
  clickTikTok(live.listeners, "amazon-coi-check");
  assert.deepEqual(live.counts, [{
    path: "event/tiktok-follow-click-amazon-coi-check",
    title: "TikTok follow click: amazon-coi-check",
    event: true
  }]);
  assert.match(fetches[0].url, /p=event%2Ftiktok-follow-click-amazon-coi-check/);
  assert.equal(fetches[0].opts.keepalive, true);
  assert.equal(fetches[0].opts.mode, "no-cors");

  const testVisit = loadHelper("?fmp_test=1");
  const testFetches = [];
  testVisit.sandbox.fetch = (url, opts) => {
    testFetches.push({ url, opts });
    return Promise.resolve();
  };
  testVisit.sandbox.navigator = { sendBeacon() { return true; } };
  clickTikTok(testVisit.listeners, "etsy-photo-audit-check");
  assert.equal(testVisit.counts[0].path, "TEST-EXCLUDE-event/tiktok-follow-click-etsy-photo-audit-check");
  assert.match(testFetches[0].url, /p=TEST-EXCLUDE-event%2Ftiktok-follow-click-etsy-photo-audit-check/);

  const bad = loadHelper("");
  bad.sandbox.fetch = () => Promise.resolve();
  bad.sandbox.navigator = { sendBeacon() { return true; } };
  clickTikTok(bad.listeners, "../secret");
  assert.deepEqual(bad.counts, []);
});
