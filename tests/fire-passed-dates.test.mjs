// Nov 1 and Nov 9, 2026 pass at 23:59:59 Eastern Time, written as UTC.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const html = readFileSync(path.join(ROOT, "tools/fire-to-iris-check/index.html"), "utf8");

function load(nodes) {
  const match = html.match(/<script id="fmp-passed-dates">([\s\S]*?)<\/script>/);
  assert.ok(match, "fmp-passed-dates script");
  const sandbox = {
    document: {
      readyState: "complete",
      querySelectorAll(sel) {
        assert.equal(sel, "[data-passed-end]");
        return nodes || [];
      },
      addEventListener() {}
    },
    Date,
    Object,
    String
  };
  sandbox.window = sandbox;
  vm.runInNewContext(match[1], sandbox, { filename: "fmp-passed-dates.js" });
  return sandbox.FMP_PASSED_DATES;
}

function node(key, base, text) {
  return {
    textContent: text,
    getAttribute(name) {
      if (name === "data-passed-end") return key;
      if (name === "data-passed-base") return base;
      return null;
    }
  };
}

const NOV1 = Date.UTC(2026, 10, 2, 4, 59, 59);
const NOV9 = Date.UTC(2026, 10, 10, 4, 59, 59);

test("Nov 1 and Nov 9 end at 23:59:59 Eastern, written as UTC", () => {
  const api = load();
  assert.equal(api.ENDS.nov1, NOV1);
  assert.equal(api.ENDS.nov9, NOV9);
  assert.equal(new Date(NOV1).toISOString(), "2026-11-02T04:59:59.000Z");
  assert.equal(new Date(NOV9).toISOString(), "2026-11-10T04:59:59.000Z");
});

test("Nov 1 is not passed before 23:59:59 ET, and is passed on and after it", () => {
  const api = load();
  assert.equal(api.passed(new Date(NOV1 - 1000), api.ENDS.nov1), false);
  assert.equal(api.passed(new Date("2026-11-01T04:59:59Z"), api.ENDS.nov1), false);
  assert.equal(api.passed(new Date(NOV1), api.ENDS.nov1), true);
  assert.equal(api.passed(new Date(NOV1 + 1000), api.ENDS.nov1), true);
  assert.equal(api.passed(new Date("2026-11-02T15:00:00Z"), api.ENDS.nov1), true);
});

test("Nov 9 is not passed before 23:59:59 ET, and is passed on and after it", () => {
  const api = load();
  assert.equal(api.passed(new Date(NOV9 - 1000), api.ENDS.nov9), false);
  assert.equal(api.passed(new Date("2026-11-09T15:00:00Z"), api.ENDS.nov9), false);
  assert.equal(api.passed(new Date(NOV9), api.ENDS.nov9), true);
  assert.equal(api.passed(new Date(NOV9 + 1000), api.ENDS.nov9), true);
  assert.equal(api.passed(new Date("2026-11-10T05:00:00Z"), api.ENDS.nov9), true);
});

test("mark writes (passed) from the base label and can remove it", () => {
  const nov1 = node("nov1", "Nov 1, 2026", "Nov 1, 2026 (passed)");
  const nov9 = node("nov9", "Nov 9, 2026", "Nov 9, 2026");
  const line1 = node("nov1", "Test files stop on Nov 1, 2026.", "Test files stop on Nov 1, 2026 (passed).");
  const line9 = node("nov9", "Changes to an old IRS application stop on Nov 9, 2026.", "Changes to an old IRS application stop on Nov 9, 2026.");
  const api = load([nov1, nov9, line1, line9]);
  api.mark(new Date(NOV1 - 1000));
  assert.equal(nov1.textContent, "Nov 1, 2026");
  assert.equal(line1.textContent, "Test files stop on Nov 1, 2026.");
  assert.equal(nov9.textContent, "Nov 9, 2026");
  api.mark(new Date(NOV1));
  assert.equal(nov1.textContent, "Nov 1, 2026 (passed)");
  assert.equal(line1.textContent, "Test files stop on Nov 1, 2026 (passed).");
  assert.equal(nov9.textContent, "Nov 9, 2026");
  api.mark(new Date(NOV9 - 1000));
  assert.equal(nov1.textContent, "Nov 1, 2026 (passed)");
  assert.equal(nov9.textContent, "Nov 9, 2026");
  assert.equal(line9.textContent, "Changes to an old IRS application stop on Nov 9, 2026.");
  api.mark(new Date(NOV9));
  assert.equal(nov9.textContent, "Nov 9, 2026 (passed)");
  assert.equal(line9.textContent, "Changes to an old IRS application stop on Nov 9, 2026 (passed).");
  api.mark(new Date(NOV9 + 1000));
  assert.equal(nov9.textContent, "Nov 9, 2026 (passed)");
});

test("static HTML marks Nov 1 and Nov 9 as passed", () => {
  assert.match(html, /data-passed-end="nov1" data-passed-base="Nov 1, 2026">Nov 1, 2026 \(passed\)/);
  assert.match(html, /data-passed-end="nov9" data-passed-base="Nov 9, 2026">Nov 9, 2026 \(passed\)/);
  assert.match(html, /data-passed-base="Test files stop on Nov 1, 2026\.">Test files stop on Nov 1, 2026 \(passed\)\./);
  assert.match(html, /data-passed-base="Changes to an old IRS application stop on Nov 9, 2026\.">Changes to an old IRS application stop on Nov 9, 2026 \(passed\)\./);
  assert.equal(html.includes("Nov 9, 2026 (passed)"), true);
  assert.match(html, /Last day to file test information returns through the FIRE Trading Partner Test System\./);
  assert.match(html, /Last day to make changes to the Information Returns \(IR\) Applications for Transmitter Control Codes \(TCC\)\./);
});
