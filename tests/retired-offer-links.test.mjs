// Buyer links must not point at offers that were retired or unpublished.
// Gumroad still answers some of these URLs; they are not current products.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

// wymols: After-Hours Web Capture Kit, Roofing Edition, retired late October 2026.
// No current Gumroad permalink replaces that capture kit (the $79 roofing eval
// pack is a different product). fetwsm and the Maryland FAMLI kit are unpublished.
const RETIRED_SLUGS = ["wymols", "fetwsm", "maryland-famli-payroll-notice-kit", "yvlau"];

const SKIP_DIRS = new Set([".git", "node_modules", "tests", "scripts", "offer-page-screenshots", "test-results", "playwright-report"]);
const SCAN_EXT = new Set([".html", ".js", ".mjs", ".json", ".xml", ".txt", ".css", ".ics", ".md"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (SCAN_EXT.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

test("retired and unpublished Gumroad offer links stay off the site", () => {
  const hits = [];
  for (const file of walk(ROOT)) {
    const text = readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);
    for (const slug of RETIRED_SLUGS) {
      const needle = `/l/${slug}`;
      let from = 0;
      while (true) {
        const at = text.indexOf(needle, from);
        if (at === -1) break;
        const line = text.slice(0, at).split("\n").length;
        hits.push(`${rel}:${line} contains ${needle}`);
        from = at + needle.length;
      }
    }
  }
  assert.deepEqual(hits, []);
});
