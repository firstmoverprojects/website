// Brand Option 1 Vibrant Green for FMP primary CTAs.
// Homepage and tools hub share assets/styles-Bi5nM5kw.css.
// Deadlines, games, and deadline articles share deadlines/styles.css.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const GREEN = "linear-gradient(135deg, #22c55e 0%, #4ade80 100%)";
const GREEN_MIN = "linear-gradient(135deg,#22c55e 0%,#4ade80 100%)";

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

test("homepage and tools primary buttons use Brand Option 1", () => {
  const css = read("assets/styles-Bi5nM5kw.css");
  assert.match(css, /--teal:\s*#25d0d7/);
  assert.match(
    css,
    new RegExp(`\\.btn\\.primary\\{background:${GREEN_MIN.replace(/[()]/g, "\\$&")};color:#02060f;border-color:#22c55e\\}`)
  );
  assert.match(css, /\.btn\.primary:hover,\.btn\.primary:focus-visible\{background:#16a34a;color:#02060f\}/);
  assert.match(css, /\.btn:not\(\.primary\):not\(\.secondary\)\{color:#4ade80;border-color:#22c55e\}/);
  assert.equal(css.includes(".btn.primary{background:var(--teal)"), false);
  assert.match(css, /\.btn\.secondary\{color:var\(--white\)\}/);
});

test("deadlines and games primary buttons use Brand Option 1", () => {
  const css = read("deadlines/styles.css");
  assert.match(css, /--gradient-accent:\s*linear-gradient\(135deg,\s*#00d8ff 0%,\s*#007bff 48%,\s*#005cb9 100%\)/);
  assert.match(
    css,
    new RegExp(`\\.btn--primary\\s*\\{\\s*background:\\s*${GREEN.replace(/[()]/g, "\\$&")};\\s*color:\\s*#02060f;`)
  );
  assert.match(css, /\.btn--primary:hover\s*\{\s*background:\s*#16a34a;\s*color:\s*#02060f;\s*filter:\s*none;/);
  assert.equal(css.includes("data-ab-cta"), false);
  assert.equal(css.includes(".ab-cta"), false);
  assert.match(css, /\.steps li::before\s*\{[^}]*background:\s*var\(--gradient-accent\)/);
});

test("help-article primary button uses the same green", () => {
  const css = read("shopify-quickbooks-cleanup/styles.css");
  assert.match(
    css,
    new RegExp(`\\.btn--primary\\s*\\{\\s*background:\\s*${GREEN.replace(/[()]/g, "\\$&")};\\s*color:\\s*#02060f;`)
  );
});

test("audited CTA copy and the FIRE checklist link stay put", () => {
  const home = read("index.html");
  assert.match(home, /class="btn primary"[\s\S]{0,80}See upcoming deadlines/);
  assert.match(home, /#signup a\.signup-cta[\s\S]{0,400}linear-gradient\(135deg,\s*#22c55e\s*0%,\s*#4ade80\s*100%\)/);

  const tools = read("tools/index.html");
  for (const label of [
    "$9 Switch Checklist",
    "$39 Planner",
    "$29 COI Kit (1-Click Buy)",
    "Open free check"
  ]) {
    assert.ok(tools.includes(label), label);
  }
  assert.equal((tools.match(/fire-to-iris-switch-checklist/g) || []).length >= 2, true);

  const deadlines = read("deadlines/index.html");
  assert.ok(deadlines.includes("Get the $9 IRS filing checklist"));
  assert.ok(deadlines.includes("Get the $9 Etsy photo checklist"));
  assert.ok(deadlines.includes("fire-to-iris-switch-checklist"));
  assert.ok(deadlines.includes("Nov 19, 2026, at 3 p.m. Eastern Time"));

  const games = read("games/index.html");
  for (const label of [
    "Play Shutter Cats on itch.io",
    "Play Chalkfair on itch.io",
    "Play Dippenmoor on itch.io",
    "Play Bunkhollow on itch.io",
    "Play Quirebrook on itch.io"
  ]) {
    assert.ok(games.includes(`>${label}</a>`), label);
    assert.ok(games.includes('class="btn btn--primary"'), label);
  }
});
