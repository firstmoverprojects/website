// Deadline reminder box on the FIRE, Amazon COI, and EU product ID results.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ACTION = "https://05279842.sibforms.com/serve/MUIFAOl30i4SqBWIywYgwCK-R-JtXw9dFx8m5j-td4xmrSh6dXO-1ysXwauPn74aUR1704Woip5d-zVEij--7PVs3Ny9ANkpwvsp6zi8LQaPXra8EtECZfFOjzPBw1houYxtyGNprdB_IAejV4AHahfUP0AeeMyIpgcAFFaxNlyGv9PQhVHeo9NHrVFBHvcyJyn7qSpur2L10Tzt8A==";
const TRACKERS = ["googletagmanager.com", "google-analytics.com", "facebook.net", "doubleclick.net", "hotjar.com", "segment.com", "sibautomation.com", "brevo.com"];
const PAGES = [
  {
    rel: "tools/fire-to-iris-check/index.html",
    source: "fire-to-iris",
    event: "signup/fire-to-iris-check",
    region: "signup"
  },
  {
    rel: "tools/amazon-coi-check/index.html",
    source: "amazon-coi",
    event: "signup/amazon-coi-check",
    region: "deadline-reminder"
  },
  {
    rel: "tools/eu-product-id-check/index.html",
    source: "eu-product-id",
    event: "signup/eu-product-id-check",
    region: "deadline-reminder"
  }
];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function element(source, id) {
  const at = source.indexOf(`id="${id}"`);
  assert.notEqual(at, -1, id);
  const start = source.lastIndexOf("<", at);
  const gt = source.indexOf(">", start);
  const tag = source.slice(start + 1, gt).split(/\s/)[0];
  const open = "<" + tag;
  const close = `</${tag}>`;
  let depth = 1;
  let i = gt + 1;
  while (depth) {
    const nxtOpen = source.indexOf(open, i);
    const nxtClose = source.indexOf(close, i);
    assert.notEqual(nxtClose, -1, tag);
    const after = nxtOpen === -1 ? "" : source.slice(nxtOpen + open.length, nxtOpen + open.length + 1);
    if (nxtOpen !== -1 && nxtOpen < nxtClose && (after === " " || after === ">" || after === "/")) {
      depth += 1;
      i = nxtOpen + open.length;
    } else {
      depth -= 1;
      i = nxtClose + close.length;
    }
  }
  return source.slice(start, i);
}

function eventScript(html) {
  const match = html.match(/<script id="deadline-reminder-events">([\s\S]*?)<\/script>/);
  assert.ok(match, "missing reminder event script");
  return match[1];
}

function loadEvents(html, search, attrs) {
  const counts = [];
  const listeners = {};
  const source = { value: "default-source" };
  const eventPath = attrs && Object.prototype.hasOwnProperty.call(attrs, "eventPath") ? attrs.eventPath : "signup/fire-to-iris-check";
  const title = attrs && attrs.title ? attrs.title : "Deadline reminder signup: fire-to-iris-check";
  const form = {
    getAttribute(name) {
      if (name === "data-goatcounter-submit") return eventPath;
      if (name === "data-goatcounter-title") return title;
      return "";
    },
    querySelector(sel) {
      return sel === 'input[name="SIGNUP_SOURCE"]' ? source : null;
    },
    addEventListener(type, fn) {
      listeners[type] = fn;
    }
  };
  const sandbox = {
    document: {
      getElementById(id) {
        return id === "deadline-reminder-form" ? form : null;
      }
    },
    location: { search: search || "" }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(eventScript(html), sandbox, { filename: "deadline-reminder-events.js" });
  if (!attrs || attrs.goatcounter !== false) {
    sandbox.goatcounter = {
    count(payload) {
      counts.push(JSON.parse(JSON.stringify(payload)));
    }
    };
  }
  return { counts, listeners, source };
}

test("each tool result has one accessible reminder form on the existing list", () => {
  const scripts = PAGES.map((page) => eventScript(read(page.rel)));
  assert.equal(scripts[1], scripts[0]);
  assert.equal(scripts[2], scripts[0]);
  assert.equal(/fetch\(|sendBeacon|localStorage|sessionStorage|XMLHttpRequest|document\.cookie/.test(scripts[0]), false);

  for (const page of PAGES) {
    const html = read(page.rel);
    const results = element(html, "results");
    const card = element(results, "result-cta");
    const form = element(results, "deadline-reminder-form");
    assert.equal(card.includes("deadline-reminder-form"), false, page.rel);
    assert.equal(html.split('id="deadline-reminder-form"').length - 1, 1, page.rel);
    assert.equal(html.split('id="deadline-reminder-h"').length - 1, 1, page.rel);
    assert.equal(html.split('id="reminder-email"').length - 1, 1, page.rel);
    assert.match(results, new RegExp(`<section class="deadline-reminder" id="${page.region}" aria-labelledby="deadline-reminder-h">`));
    assert.match(results, /<h2 id="deadline-reminder-h">Get a reminder before this deadline<\/h2>/);
    assert.match(form, new RegExp(`method="POST" action="${ACTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(form, new RegExp(`data-goatcounter-submit="${page.event}"`));
    assert.match(form, new RegExp(`data-goatcounter-title="Deadline reminder signup: ${page.event.slice("signup/".length)}"`));
    assert.match(form, /<label for="reminder-email">Email address<\/label>/);
    assert.match(form, /type="email" id="reminder-email" name="EMAIL" autocomplete="email" inputmode="email"[^>]*required aria-describedby="reminder-note"/);
    assert.match(form, /<label class="sib-optin" for="reminder-opt-in">/);
    assert.match(form, /id="reminder-opt-in" name="OPT_IN" required/);
    assert.match(form, /<button type="submit"(?: id="deadline-reminder-submit")?>Get a reminder before this deadline<\/button>/);
    assert.match(form, /<span>Send me the weekly First Mover Projects email: deadline reminders, plus news about our kits, games and books\. We will email a confirmation first\. Unsubscribe any time with one click\. We do not sell or share your email\.<\/span>/);
    assert.match(form, /name="email_address_check" value="" class="input--hidden" tabindex="-1" autocomplete="off" aria-hidden="true"/);
    assert.match(form, new RegExp(`name="SIGNUP_SOURCE" value="${page.source}"`));
    assert.equal(/mailto:/i.test(form), false, page.rel);
    assert.equal(/<script\b[^>]*\bsrc=/i.test(form), false, page.rel);
    assert.match(html, /form-action https:\/\/05279842\.sibforms\.com/);
    assert.equal(html.includes("form-action 'none'"), false, page.rel);
    assert.match(html, /#deadline-reminder-form button\{[^}]*background:#0c4a6e;color:#fff/);
    assert.match(html, /\.deadline-reminder h2\{[^}]*color:#0c4a6e/);
    const httpsSrc = [...html.matchAll(/<script\b[^>]*\bsrc="(https?:[^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(httpsSrc, ["https://gc.zgo.at/count.js"], page.rel);
    for (const host of TRACKERS) assert.equal(html.includes(host), false, page.rel + " " + host);
    const kitClicks = [];
    for (const tag of html.match(/<a\b[^>]*>/g) || []) {
      const decoded = tag.replace(/&amp;/g, "&");
      if (!decoded.includes("https://firstmoverprojects.gumroad.com/l/")) continue;
      kitClicks.push(tag);
      assert.match(tag, /data-goatcounter-click="cta\/[a-z0-9-]+"/, page.rel + " " + tag);
    }
    assert.ok(kitClicks.length >= 3, page.rel + " kit buttons " + kitClicks.length);
    assert.match(html, /id="kit-result"[^>]*data-goatcounter-click="cta\/[a-z0-9-]+"/, page.rel);
    assert.match(html, /id="kit-result"[^>]*data-goatcounter-title="[^"]+"/, page.rel);
  }
});

test("a valid reminder submit records one GoatCounter event and keeps test visits out", () => {
  const html = read(PAGES[0].rel);
  const live = loadEvents(html, "");
  live.listeners.submit();
  assert.deepEqual(live.counts, [{
    path: "signup/fire-to-iris-check",
    title: "Deadline reminder signup: fire-to-iris-check",
    event: true
  }]);
  assert.equal(live.source.value, "default-source");

  for (const search of ["?fmp_test=1", "?utm_source=fmp_test_exclude", "?utm_campaign=kit&fmp_test=1"]) {
    const testVisit = loadEvents(html, search);
    testVisit.listeners.submit();
    assert.equal(testVisit.counts[0].path, "TEST-EXCLUDE/signup/fire-to-iris-check", search);
    assert.equal(testVisit.counts[0].event, true);
  }

  const ignored = loadEvents(html, "?fmp_test=12");
  ignored.listeners.submit();
  assert.equal(ignored.counts[0].path, "signup/fire-to-iris-check");

  const bad = loadEvents(html, "", { eventPath: "../signup/secret" });
  bad.listeners.submit();
  assert.deepEqual(bad.counts, []);

  const quiet = loadEvents(html, "", { goatcounter: false });
  assert.doesNotThrow(() => quiet.listeners.submit());
  assert.deepEqual(quiet.counts, []);
});

test("the FIRE reminder copy changes when the Nov 19 cutoff closes the kit", () => {
  const html = read("tools/fire-to-iris-check/index.html");
  const start = html.indexOf('<script id="fmp-fire-kit">');
  assert.notEqual(start, -1);
  const openEnd = html.indexOf(">", start);
  const close = html.indexOf("</script>", openEnd);
  const heading = { textContent: "Get a reminder before this deadline" };
  const button = { textContent: "Get a reminder before this deadline" };
  const sandbox = {
    document: {
      readyState: "loading",
      getElementById(id) {
        if (id === "deadline-reminder-h") return heading;
        if (id === "deadline-reminder-submit") return button;
        return null;
      },
      querySelectorAll() { return []; },
      addEventListener() {}
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(html.slice(openEnd + 1, close), sandbox, { filename: "fmp-fire-kit.js" });
  const api = sandbox.FMP_FIRE_KIT;
  api.hide(new Date("2026-11-19T19:59:59Z"));
  assert.equal(heading.textContent, "Get a reminder before this deadline");
  assert.equal(button.textContent, "Get a reminder before this deadline");
  api.hide(new Date("2026-11-19T20:00:00Z"));
  assert.equal(heading.textContent, "The FIRE deadline has passed. Get the weekly email for the next deadline");
  assert.equal(button.textContent, "Get the weekly deadline email");
});

test("SIGNUP_SOURCE from the page address replaces only a short safe token", () => {
  const html = read(PAGES[1].rel);
  const kept = loadEvents(html, "");
  assert.equal(kept.source.value, "default-source");

  const clean = loadEvents(html, "?SIGNUP_SOURCE=Amazon_COI.2026");
  assert.equal(clean.source.value, "amazoncoi2026");

  const clipped = loadEvents(html, "?SIGNUP_SOURCE=" + "a".repeat(80));
  assert.equal(clipped.source.value, "a".repeat(40));

  const empty = loadEvents(html, "?SIGNUP_SOURCE=!!!");
  assert.equal(empty.source.value, "default-source");
});
