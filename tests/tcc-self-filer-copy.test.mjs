// Self-filer narrowing for the remaining FIRE TCC lines, plus the calendar fold.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FINDER_NEW = "The IRS says current FIRE users who will e-file in IRIS themselves must complete a separate IRIS Application for TCC. If a payroll provider, accountant, or paid e-file service files for you, this may already be handled. Ask them.";
const FINDER_OLD = "The IRS says current FIRE users must complete a separate IRIS Application for TCC to file in IRIS. If a payroll provider or accountant files for you, this may already be handled. Ask them.";
const IRIS_NEW = "The FIRE page says current FIRE users who will e-file in IRIS themselves must complete a separate IRIS Application for TCC.";
const IRIS_OLD = "The FIRE page says current FIRE users must complete a separate IRIS Application for TCC.";
const PAREN_NEW = "(the IRS says current FIRE users who will e-file in IRIS themselves must complete a separate IRIS Application for TCC)";
const PAREN_OLD = "(the IRS says current FIRE users must complete a separate IRIS Application for TCC)";
const DESCRIPTION = "DESCRIPTION:Who: Businesses that file through FIRE\\nWhat to check: Check whether an IRIS Application for TCC is started " + PAREN_NEW + ".\\nOfficial source: https://www.irs.gov/e-file-providers/filing-information-returns-electronically-fire\\nDetails: https://firstmoverprojects.com/deadlines/irs-fire-retirement-nov-19.html\\nGeneral guidance\\, not legal\\, tax or IT advice. Dates from the official source\\; re-check it before you act.";
const DATES_BULLET = "Key dates from the IRS FIRE page (Nov. 9, Nov. 19 at 3 p.m. ET, Jan. 1, 2027) with a Done? box for each.";
const ACCOUNT_BULLET = "Your FIRE account (the Nov 9, 2026 change deadline has passed): TCCs, Responsible Official and contacts, a saved copy of your IR Application.";

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

test("the finder, IRIS TCC page, and feed use the self-filer TCC line", () => {
  const finder = read("deadlines/finder/index.html");
  assert.equal(count(finder, FINDER_NEW), 1);
  assert.equal(finder.includes(FINDER_OLD), false);
  assert.equal(finder.includes(PAREN_OLD), false);
  const data = JSON.parse(finder.match(/<script type="application\/json" id="finder-data">([\s\S]*?)<\/script>/)[1]);
  const fire = data.items.find((item) => item.id === "irs-fire");
  assert.equal(JSON.stringify(fire).includes("current FIRE users must complete"), false);
  assert.equal(fire.key_dates[1].text, "Last day to make changes to IR Applications for TCCs; those applications are now read-only.");

  const iris = read("deadlines/iris-tcc-application-how-long.html");
  assert.equal(count(iris, IRIS_NEW), 2);
  assert.equal(iris.includes(IRIS_OLD), false);
  const faq = [...iris.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)]
    .map((block) => JSON.parse(block[1]))
    .find((item) => item["@type"] === "FAQPage");
  const answer = faq.mainEntity.find((item) => item.name === "Does a FIRE TCC work as an IRIS TCC?");
  assert.equal(answer.acceptedAnswer.text.includes(IRIS_NEW), true);
  const visible = iris.slice(iris.indexOf('id="faq-h"'), iris.indexOf('id="src-h"'));
  assert.equal(visible.includes(IRIS_NEW), true);
  assert.equal(iris.includes(IRIS_NEW), true);

  const feed = read("deadlines/feed.xml");
  assert.equal(count(feed, PAREN_NEW), 1);
  assert.equal(feed.includes(PAREN_OLD), false);
  assert.equal(feed.includes("guid isPermaLink=\"false\">irs-fire-tcc-20261109@firstmoverprojects.com</guid>"), true);
});

test("the FIRE TCC calendar event is CRLF, folded to 75 octets, and names self-filers", () => {
  const bytes = readFileSync(path.join(ROOT, "deadlines/deadlines.ics"));
  const text = bytes.toString("utf8");
  assert.equal(text.endsWith("\r\n"), true);
  const stripped = text.replaceAll("\r\n", "");
  assert.equal(stripped.includes("\n"), false);
  assert.equal(stripped.includes("\r"), false);
  const physical = text.split("\r\n").slice(0, -1);
  for (let i = 0; i < physical.length; i += 1) {
    assert.ok(Buffer.byteLength(physical[i], "utf8") <= 75, "line " + (i + 1) + " is " + Buffer.byteLength(physical[i], "utf8") + " octets");
  }
  const logical = [];
  for (const line of physical) {
    if (line.startsWith(" ") || line.startsWith("\t")) logical[logical.length - 1] += line.slice(1);
    else logical.push(line);
  }
  const events = [];
  let current = null;
  for (const line of logical) {
    if (line === "BEGIN:VEVENT") current = [];
    else if (line === "END:VEVENT") {
      events.push(current);
      current = null;
    } else if (current) current.push(line);
  }
  assert.equal(logical.filter((line) => line === "BEGIN:VEVENT").length, events.length);
  assert.equal(logical.filter((line) => line === "BEGIN:VALARM").length, logical.filter((line) => line === "END:VALARM").length);
  const event = events.find((lines) => lines.includes("UID:irs-fire-tcc-20261109@firstmoverprojects.com"));
  assert.ok(event);
  assert.equal(events.filter((lines) => lines.includes("UID:irs-fire-tcc-20261109@firstmoverprojects.com")).length, 1);
  assert.equal(event.includes("DTSTAMP:20261110T134002Z"), true);
  assert.equal(event.includes("SEQUENCE:1"), true);
  assert.equal(event.includes("DTSTAMP:20261013T194913Z"), false);
  assert.equal(event.includes(DESCRIPTION), true);
  assert.equal(event.some((line) => line.includes(PAREN_OLD)), false);
  assert.equal(text.includes("DTSTAMP:20261013T194913Z"), true);
});

test("the FIRE kit content bullets end with a period", () => {
  const tool = read("tools/fire-to-iris-check/index.html");
  assert.equal(count(tool, DATES_BULLET), 2);
  assert.equal(count(tool, ACCOUNT_BULLET), 2);
  assert.equal(tool.includes("with a Done? box for each</li>"), false);
  assert.equal(tool.includes("a saved copy of your IR Application</li>"), false);
});
