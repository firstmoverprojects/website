// Static copy must not treat Nov 9, 2026 as still upcoming.
// Pages owned by PR 130 are excluded so this branch does not overlap that diff.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FILES = [
  "deadlines/fire-to-iris-transition-checklist.html",
  "deadlines/iris-tcc-application-how-long.html",
  "deadlines/file-1099-nec-2027-iris.html",
  "deadlines/finder/index.html",
  "deadlines/index.html",
  "deadlines/feed.xml",
  "deadlines/deadlines.ics",
  "tools/index.html",
  "llms.txt"
];
const GUARDED = [
  "deadlines/fire-to-iris-transition-checklist.html",
  "deadlines/iris-tcc-application-how-long.html",
  "deadlines/file-1099-nec-2027-iris.html"
];
const FORBIDDEN = [
  "Next: Nov 9, 2026",
  "by November 9, 2026",
  "is the last day to make changes",
  "is the last day to change",
  "TCC changes Nov 9",
  "IR TCC changes Nov 9",
  "before the November 9",
  "before Nov 9",
  "Before Nov 9",
  "before Nov. 9",
  "make any changes by November 9",
  "Change an existing IR Application for TCC by November 9",
  "can update their applications through",
  "can update those applications through",
  "they become read-only",
  "applications become read-only",
  'class="up"><strong>Nov 9, 2026</strong>',
  "November 9, 2026 for changes to an existing",
  "Nov 9 TCC change cutoff",
  "through Nov. 9, 2026, after which",
  "Nov 9: IRS FIRE: last day to change",
  "SUMMARY:IRS FIRE: last day to change",
  "DESCRIPTION:IRS FIRE: last day to change",
  "Before Nov 9: your FIRE account",
  "Key dates from the IRS FIRE page (Nov. 1, Nov. 9, Nov. 19 at 3 p.m. ET, Jan. 1, 2027) with a Done? box for each."
];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

test("unguarded copy does not treat Nov 9, 2026 as still upcoming", () => {
  for (const rel of FILES) {
    const html = read(rel);
    for (const phrase of FORBIDDEN) {
      assert.equal(html.includes(phrase), false, rel + " still says: " + phrase);
    }
  }
  for (const rel of GUARDED) {
    const html = read(rel);
    assert.match(html, /data-passed-end="nov9" data-passed-base="Nov 9, 2026">Nov 9, 2026</);
    assert.match(html, /Nov 9, 2026 was the last day to make changes to existing IR Applications for TCCs; those applications are now read-only\./);
  }
  assert.match(read("deadlines/file-1099-nec-2027-iris.html"), /Checked Nov 9, 2026\./);
  const finder = read("deadlines/finder/index.html");
  assert.match(finder, /Nov\. 9, 2026 was the last day to make changes to FIRE IR Applications for TCC; those applications are now read-only and retained for historical reference\./);
  const data = JSON.parse(finder.match(/<script type="application\/json" id="finder-data">([\s\S]*?)<\/script>/)[1]);
  const fire = data.items.find((item) => item.id === "irs-fire");
  assert.equal(fire.key_dates[1].text, "Nov 9, 2026 was the last day to make changes to IR Applications for TCCs; those applications are now read-only.");
  assert.equal(fire.key_dates[2].text, "Last day to file information returns through FIRE.");
  assert.equal(fire.prompt_text.includes("before the November 19 last FIRE filing day"), true);
  assert.match(read("deadlines/feed.xml"), /Nov 9, 2026 was the last day to change FIRE IR Applications for TCC/);
  assert.match(read("llms.txt"), /Nov 9, 2026 was the last day to make changes to FIRE IR Applications for TCC and those applications are now read-only/);
});

test("robots.txt disallows /event/ and keeps the existing groups", () => {
  const robots = read("robots.txt");
  for (const line of [
    "User-agent: *",
    "Allow: /",
    "User-agent: Googlebot",
    "User-agent: Google-InspectionTool",
    "User-agent: GSCWizard-Bot",
    "Sitemap: https://firstmoverprojects.com/sitemap.xml"
  ]) {
    assert.equal(robots.includes(line), true, line);
  }
  assert.equal(robots.split("\n").filter((line) => line === "Disallow: /event/").length, 4);
});

test("visitor price labels say per month", () => {
  const html = read("tools/grok-bot-team-check/index.html");
  assert.equal(html.includes("$0/mo"), false);
  assert.equal(html.includes('"/mo'), false);
  assert.equal(html.includes("+ \"/mo"), false);
  assert.match(html, /\$0 per month/);
  assert.match(html, /hrs\/mo/);
});
