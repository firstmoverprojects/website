// Hub deadline chips: static labels for dates before Nov 4, 2026, and the
// client script that swaps a leftover "Upcoming" once that date is before
// the visitor's local today. A row may set data-cutoff to an ISO UTC instant
// so it flips at that time instead. The Nov 19 FIRE row uses 3:00 p.m.
// America/New_York, which is 20:00 UTC.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const hub = readFileSync(path.join(ROOT, "deadlines/index.html"), "utf8");
const script = readFileSync(path.join(ROOT, "deadlines/assets/deadline-status.js"), "utf8");

function load() {
  const sandbox = {
    document: {
      readyState: "complete",
      querySelectorAll() { return []; },
      addEventListener() {}
    },
    Date,
    String,
    Number
  };
  sandbox.window = sandbox;
  vm.runInNewContext(script, sandbox, { filename: "deadlines/assets/deadline-status.js" });
  return sandbox.FMP_DEADLINE_STATUS;
}

function chip(text, className) {
  return {
    textContent: text,
    className: className || "chip",
    getAttribute() { return null; }
  };
}

function row(attrs, statusChip, extra) {
  const chips = [statusChip].concat(extra || []);
  return {
    attrs,
    chips,
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    querySelector(sel) {
      if (sel === "[data-chip='status']") return statusChip;
      return null;
    },
    querySelectorAll() { return chips; }
  };
}

function root(rows) {
  return {
    querySelectorAll(sel) {
      assert.equal(sel, ".dated-item[data-date]");
      return rows;
    }
  };
}

function localDate(year, monthIndex, day) {
  return new Date(year, monthIndex, day, 15, 0, 0);
}

const AS_OF = localDate(2026, 10, 4);

test("static hub chips for dates before Nov 4, 2026 do not say Upcoming", () => {
  const main = hub.split("<tbody>")[1].split("</tbody>")[0];
  const rows = [...main.matchAll(/<tr class="dated-item"([^>]*)>([\s\S]*?)<\/tr>/g)];
  assert.equal(rows.length, 14);
  const labels = rows.map((match) => {
    const status = match[2].match(/data-chip="status">([^<]*)</);
    assert.ok(status, match[1]);
    return { attrs: match[1], label: status[1] };
  });
  assert.equal(labels.filter((item) => item.label === "Upcoming").length, 8);
  assert.deepEqual(labels.map((item) => item.label), [
    "Upcoming",
    "Took effect Nov 1",
    "Until Jan 31, 2027",
    "Took effect Nov 2",
    "Until Nov 10 if deposits were on time",
    "Took effect Nov 4",
    "Accounts close Nov 30",
    "Upcoming",
    "Upcoming",
    "Upcoming",
    "Upcoming",
    "Upcoming",
    "Upcoming",
    "Upcoming"
  ]);
  for (const item of labels) {
    const date = /data-date="([^"]+)"/.exec(item.attrs);
    assert.ok(date, item.attrs);
    const parsed = load().parseDate(date[1]);
    const beforeToday = parsed < new Date(2026, 10, 4);
    if (beforeToday) assert.notEqual(item.label, "Upcoming", date[1]);
  }
  assert.match(main, /<span class="chip chip--past">Passed Nov 2<\/span>/);
  assert.match(main, /<span class="chip chip--past">Deposits stopped Nov 3<\/span>/);
  assert.doesNotMatch(main, />Expired/);
  const passed = hub.split('id="past-h"')[1];
  assert.match(passed, /Expired\. Passed Oct 13/);
  assert.match(passed, /Expired\. Passed Oct 16/);
  const jsonLd = hub.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  assert.doesNotMatch(jsonLd, /Upcoming/);
  const sitemap = readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  assert.doesNotMatch(sitemap, /Upcoming/);
});

test("detail pages and the finder use the same status wording", () => {
  const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
  assert.match(read("deadlines/eu-product-identifiers-nov-1.html"), /chip chip--past chip--expired">Took effect Nov 1</);
  assert.match(read("deadlines/amazon-insurance-nov-2.html"), /chip chip--past chip--expired">Took effect Nov 2</);
  assert.match(read("deadlines/ebay-payments-terms-nov-4.html"), /chip chip--past chip--expired">Took effect Nov 4</);
  assert.match(read("deadlines/amazon-holiday-returns-2026.html"), /<span class="chip">Until Jan 31, 2027<\/span>/);
  assert.match(read("deadlines/form-941-q3-due-nov-2.html"), /Until Nov 10 if deposits were on time/);
  assert.match(read("deadlines/form-941-q3-due-nov-2.html"), /Passed Nov 2/);
  assert.match(read("deadlines/zenbusiness-banking-closure.html"), /Accounts close Nov 30/);
  assert.match(read("deadlines/zenbusiness-banking-closure.html"), /Deposits stopped Nov 3/);
  const finder = read("deadlines/finder/index.html");
  for (const stale of ["Next: Nov 1, 2026", "Next: Nov 2, 2026", "Next: Nov 3, 2026", "Next: Nov 4, 2026"]) {
    assert.equal(finder.includes(stale), false, stale);
  }
  assert.match(finder, /Took effect Nov 1/);
  assert.match(finder, /Until Jan 31, 2027/);
  assert.match(finder, /Next: Nov 9, 2026/);
  assert.match(finder, /Next: Nov 10, 2026/);
  assert.match(finder, /Next: Nov 30, 2026/);
});

test("script leaves a date that is still today as Upcoming and relabels yesterday", () => {
  const api = load();
  const today = chip("Upcoming");
  const yesterday = chip("Upcoming");
  api.apply(root([
    row({ "data-date": "Nov 4, 2026", "data-past-label": "Took effect Nov 4" }, today),
    row({ "data-date": "Nov 3, 2026", "data-past-label": "Deposits stopped Nov 3" }, yesterday)
  ]), AS_OF);
  assert.equal(today.textContent, "Upcoming");
  assert.equal(today.className, "chip");
  assert.equal(yesterday.textContent, "Deposits stopped Nov 3");
  assert.equal(yesterday.className, "chip chip--past chip--expired");
});

test("script keeps an open window and expires it only after the end date", () => {
  const api = load();
  const returns = chip("Upcoming");
  const filing = chip("Upcoming");
  const rows = [
    row({
      "data-date": "Nov 1, 2026",
      "data-until": "Jan 31, 2027",
      "data-open-label": "Until Jan 31, 2027",
      "data-past-label": "Expired. Passed Jan 31"
    }, returns),
    row({
      "data-date": "Nov 2, 2026",
      "data-until": "Nov 10, 2026",
      "data-open-label": "Until Nov 10 if deposits were on time",
      "data-past-label": "Expired. Passed Nov 10"
    }, filing)
  ];
  api.apply(root(rows), AS_OF);
  assert.equal(returns.textContent, "Until Jan 31, 2027");
  assert.equal(returns.className, "chip");
  assert.equal(filing.textContent, "Until Nov 10 if deposits were on time");
  assert.equal(filing.className, "chip");
  assert.doesNotMatch(returns.textContent, /Expired/);
  assert.doesNotMatch(filing.textContent, /Expired/);

  api.apply(root(rows), localDate(2026, 10, 11));
  assert.equal(filing.textContent, "Expired. Passed Nov 10");
  assert.equal(filing.className, "chip chip--past chip--expired");
  assert.equal(returns.textContent, "Until Jan 31, 2027");

  api.apply(root(rows), localDate(2027, 1, 1));
  assert.equal(returns.textContent, "Expired. Passed Jan 31");
  assert.equal(returns.className, "chip chip--past chip--expired");
});

test("script uses Took effect for a rule and does not rewrite a chip that is already past", () => {
  const api = load();
  const famli = chip("Upcoming");
  const eu = chip("Took effect Nov 1", "chip chip--past chip--expired");
  const passedNote = chip("Passed Nov 2", "chip chip--past");
  api.apply(root([
    row({ "data-date": "Jan 1, 2027", "data-past-label": "Took effect Jan 1" }, famli),
    row({ "data-date": "Nov 1, 2026", "data-past-label": "Took effect Nov 1" }, eu),
    row({ "data-date": "Nov 2, 2026" }, passedNote)
  ]), localDate(2027, 0, 2));
  assert.equal(famli.textContent, "Took effect Jan 1");
  assert.equal(famli.className, "chip chip--past chip--expired");
  assert.equal(eu.textContent, "Took effect Nov 1");
  assert.equal(eu.className, "chip chip--past chip--expired");
  assert.equal(passedNote.textContent, "Passed Nov 2");
  assert.equal(passedNote.className, "chip chip--past");
});

test("a future Upcoming row becomes Expired. Passed once its date is before today", () => {
  const api = load();
  const fire = chip("Upcoming");
  api.apply(root([row({ "data-date": "Nov 19, 2026" }, fire)]), localDate(2026, 10, 18));
  assert.equal(fire.textContent, "Upcoming");
  api.apply(root([row({ "data-date": "Nov 19, 2026" }, fire)]), localDate(2026, 10, 20));
  assert.equal(fire.textContent, "Expired. Passed Nov 19");
  assert.equal(fire.className, "chip chip--past chip--expired");
});

const FIRE_CUTOFF = "2026-11-19T20:00:00Z";

test("parseCutoff accepts an ISO UTC instant and rejects local or date-only values", () => {
  const api = load();
  assert.equal(api.parseCutoff(FIRE_CUTOFF), Date.UTC(2026, 10, 19, 20, 0, 0));
  assert.equal(api.parseCutoff("2026-11-19T20:00:00.000Z"), Date.UTC(2026, 10, 19, 20, 0, 0));
  assert.equal(api.parseCutoff(" 2026-11-19T20:00:00Z "), Date.UTC(2026, 10, 19, 20, 0, 0));
  for (const bad of ["", "2026-11-19", "2026-11-19T20:00:00", "2026-11-19T15:00:00-05:00", "2026-11-31T20:00:00Z", "Nov 19, 2026"]) {
    assert.equal(api.parseCutoff(bad), null, bad);
  }
});

test("the Nov 19 FIRE row flips at 20:00 UTC, not at local midnight", () => {
  const api = load();
  const attrs = { "data-date": "Nov 19, 2026", "data-cutoff": FIRE_CUTOFF };
  const before = chip("Upcoming");
  api.apply(root([row(attrs, before)]), new Date("2026-11-19T19:59:59.000Z"));
  assert.equal(before.textContent, "Upcoming");
  assert.equal(before.className, "chip");

  const at = chip("Upcoming");
  api.apply(root([row(attrs, at)]), new Date("2026-11-19T20:00:00.000Z"));
  assert.equal(at.textContent, "Expired. Passed Nov 19");
  assert.equal(at.className, "chip chip--past chip--expired");

  const after = chip("Upcoming");
  api.apply(root([row(attrs, after)]), new Date("2026-11-20T05:00:00.000Z"));
  assert.equal(after.textContent, "Expired. Passed Nov 19");

  // A local calendar day after Nov 19 stays Upcoming while the cutoff is still ahead.
  const held = chip("Upcoming");
  api.apply(root([row({ "data-date": "Nov 19, 2026", "data-cutoff": "2026-11-25T00:00:00Z" }, held)]), localDate(2026, 10, 20));
  assert.equal(held.textContent, "Upcoming");
  assert.equal(held.className, "chip");

  const already = chip("Took effect Nov 19", "chip chip--past chip--expired");
  api.apply(root([row(attrs, already)]), new Date("2026-11-19T20:00:00.000Z"));
  assert.equal(already.textContent, "Took effect Nov 19");
  assert.equal(already.className, "chip chip--past chip--expired");
});

test("an unreadable cutoff falls back to the local date", () => {
  const api = load();
  const passed = chip("Upcoming");
  api.apply(root([row({ "data-date": "Nov 19, 2026", "data-cutoff": "3 p.m. ET" }, passed)]), localDate(2026, 10, 20));
  assert.equal(passed.textContent, "Expired. Passed Nov 19");
  const today = chip("Upcoming");
  api.apply(root([row({ "data-date": "Nov 19, 2026", "data-cutoff": "not-a-time" }, today)]), localDate(2026, 10, 19));
  assert.equal(today.textContent, "Upcoming");
});

test("the FIRE page date line uses the same cutoff when data-date includes the time", () => {
  const api = load();
  const attrs = {
    "data-date": "Nov 19, 2026, 3 p.m. ET",
    "data-cutoff": FIRE_CUTOFF,
    "data-past-label": "Expired. Passed Nov 19"
  };
  assert.equal(api.parseDate(attrs["data-date"]), null);
  const line = chip("Upcoming");
  api.apply(root([row(attrs, line)]), new Date("2026-11-19T19:59:59.000Z"));
  assert.equal(line.textContent, "Upcoming");
  api.apply(root([row(attrs, line)]), new Date("2026-11-19T20:00:00.000Z"));
  assert.equal(line.textContent, "Expired. Passed Nov 19");
  assert.equal(line.className, "chip chip--past chip--expired");
});

test("the hub and the FIRE deadline page set the Nov 19 cutoff", () => {
  const page = readFileSync(path.join(ROOT, "deadlines/irs-fire-retirement-nov-19.html"), "utf8");
  assert.equal(hub.split('data-cutoff="').length - 1, 1);
  assert.match(hub, new RegExp(`<tr class="dated-item" data-date="Nov 19, 2026" data-cutoff="${FIRE_CUTOFF}">[\\s\\S]*?irs-fire-retirement-nov-19\\.html`));
  assert.match(page, new RegExp(`<li class="dated-item" data-date="Nov 19, 2026, 3 p\\.m\\. ET" data-cutoff="${FIRE_CUTOFF}" data-past-label="Expired\\. Passed Nov 19"><p class="when">Nov 19, 2026, 3 p\\.m\\. ET<br /><span class="chip" data-chip="status">Upcoming</span></p>`));
  assert.match(page, /<script src="\/deadlines\/assets\/deadline-status\.js"><\/script>/);
  assert.equal(page.split('data-cutoff="').length - 1, 1);
});
