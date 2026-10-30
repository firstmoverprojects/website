// Central Time countdown for the FIRE test-file cutoff and the Amazon COI deadline.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SOURCE = readFileSync(path.join(ROOT, "assets/deadline-count.js"), "utf8");

function load() {
  const nodes = [];
  const sandbox = {
    Intl,
    document: { querySelectorAll: () => nodes },
    window: null
  };
  sandbox.window = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: "deadline-count.js" });
  return { api: sandbox.fmpDeadlineCount, nodes };
}

test("America/Chicago civil dates, including the November 2026 fallback", () => {
  const { api } = load();
  assert.equal(api.chicagoYmd(new Date("2026-10-29T15:00:00Z")), "2026-10-29");
  assert.equal(api.chicagoYmd(new Date("2026-11-01T04:30:00Z")), "2026-10-31");
  assert.equal(api.chicagoYmd(new Date("2026-11-01T05:00:00Z")), "2026-11-01");
  assert.equal(api.chicagoYmd(new Date("2026-11-02T05:30:00Z")), "2026-11-01");
  assert.equal(api.chicagoYmd(new Date("2026-11-02T06:00:00Z")), "2026-11-02");
  assert.equal(api.daysUntil("2026-11-01", new Date("2026-10-29T15:00:00Z")), 3);
  assert.equal(api.daysUntil("2026-11-02", new Date("2026-10-29T15:00:00Z")), 4);
  assert.equal(api.daysUntil("2026-11-01", new Date("2026-11-01T05:30:00Z")), 0);
  assert.equal(api.daysUntil("2026-11-01", new Date("2026-11-02T05:30:00Z")), 0);
  assert.equal(api.daysUntil("2026-11-01", new Date("2026-11-02T06:00:00Z")), -1);
  assert.equal(api.daysUntil("2026-11-02", new Date("2026-11-02T06:00:00Z")), 0);
  assert.equal(api.daysUntil("2026-11-02", new Date("2026-11-03T06:00:00Z")), -1);
});

test("the line is a plain count and is empty after the date", () => {
  const { api } = load();
  const label = "Nov 1, 2026 IRS FIRE test-file cutoff";
  assert.equal(api.line(3, label), "3 days left until the Nov 1, 2026 IRS FIRE test-file cutoff (Central Time).");
  assert.equal(api.line(1, label), "1 day left until the Nov 1, 2026 IRS FIRE test-file cutoff (Central Time).");
  assert.equal(api.line(0, label), "Today is the Nov 1, 2026 IRS FIRE test-file cutoff (Central Time).");
  assert.equal(api.line(-1, label), "");
});

test("render shows the line before the date and hides it after", () => {
  const { api, nodes } = load();
  const el = {
    hidden: true,
    textContent: "",
    getAttribute(name) {
      if (name === "data-deadline") return "2026-11-01";
      if (name === "data-deadline-label") return "Nov 1, 2026 IRS FIRE test-file cutoff";
      return null;
    }
  };
  nodes.push(el);
  api.render(new Date("2026-10-29T15:00:00Z"));
  assert.equal(el.hidden, false);
  assert.equal(el.textContent, "3 days left until the Nov 1, 2026 IRS FIRE test-file cutoff (Central Time).");
  api.render(new Date("2026-11-02T06:00:00Z"));
  assert.equal(el.hidden, true);
  assert.equal(el.textContent, "");

  const amazon = {
    hidden: true,
    textContent: "",
    getAttribute(name) {
      if (name === "data-deadline") return "2026-11-02";
      if (name === "data-deadline-label") return "Nov 2, 2026 Amazon COI deadline";
      return null;
    }
  };
  nodes.push(amazon);
  api.render(new Date("2026-11-02T18:00:00Z"));
  assert.equal(el.hidden, true);
  assert.equal(amazon.hidden, false);
  assert.match(amazon.textContent, /^Today is the Nov 2, 2026 Amazon COI deadline/);
});

test("both tool pages mark the real deadline and start hidden", () => {
  const fire = readFileSync(path.join(ROOT, "tools/fire-to-iris-check/index.html"), "utf8");
  const amazon = readFileSync(path.join(ROOT, "tools/amazon-coi-check/index.html"), "utf8");
  assert.equal(fire.split('data-deadline="2026-11-01"').length - 1, 3);
  assert.equal(amazon.split('data-deadline="2026-11-02"').length - 1, 3);
  assert.equal(fire.includes('data-deadline-label="Nov 1, 2026 IRS FIRE test-file cutoff"'), true);
  assert.equal(amazon.includes('data-deadline-label="Nov 2, 2026 Amazon COI deadline"'), true);
  assert.match(fire, /\.deadline-count\{[^}]*color:#1b1f24/);
  assert.match(fire, /\.deadline-count\{[^}]*background:#fff/);
  assert.match(amazon, /\.deadline-count\{[^}]*color:#1b1f24/);
  const fireCounts = fire.match(/<p class="deadline-count"[^>]*>/g);
  const amazonCounts = amazon.match(/<p class="deadline-count"[^>]*>/g);
  for (const tag of [...fireCounts, ...amazonCounts]) assert.match(tag, /\shidden(?:\s|>)/);
});
