// Site-wide check for the First Mover Projects weekly signup.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const HEADING = "Get the First Mover Projects Weekly Update";
const BUTTON = "Sign up for the weekly FMP email (1-click)";
const LINEUP = [
  "free 60-second browser checks",
  "ready-to-use kits",
  "compliance deadlines",
  "cozy browser puzzle games",
  "books"
];

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

function sectionAt(html, at) {
  const start = html.lastIndexOf("<section", at);
  const end = html.indexOf("</section>", at);
  assert.ok(start !== -1 && end !== -1, "signup section is not closed");
  return html.slice(start, end + "</section>".length);
}

function linkedCss(html, filePath) {
  let css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join("\n");
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/rel="stylesheet"/i.test(tag)) continue;
    const href = /href="([^"]+)"/i.exec(tag);
    if (!href || /^https?:/i.test(href[1])) continue;
    const abs = path.resolve(path.dirname(filePath), href[1]);
    if (existsSync(abs)) css += "\n" + readFileSync(abs, "utf8");
  }
  return css;
}

test("every #signup section is the full FMP weekly update with a green pill button", () => {
  const pages = walk(ROOT, []).filter((file) => /<section\b[^>]*class="signup"[^>]*id="signup"/.test(readFileSync(file, "utf8")));
  const rels = pages.map((file) => path.relative(ROOT, file)).sort();
  assert.ok(rels.includes("deadlines/index.html"), rels.join(", "));
  assert.ok(rels.includes("tools/index.html"), rels.join(", "));
  assert.ok(rels.includes("index.html"), rels.join(", "));
  assert.ok(rels.filter((rel) => rel.startsWith("deadlines/") && !rel.includes("finder")).length >= 10, rels.join(", "));

  for (const file of pages) {
    const rel = path.relative(ROOT, file);
    const html = readFileSync(file, "utf8");
    let from = 0;
    let count = 0;
    while (true) {
      const at = html.indexOf('id="signup"', from);
      if (at === -1) break;
      count += 1;
      const section = sectionAt(html, at);
      assert.match(section, /<section\b[^>]*class="[^"]*\bsignup\b/, rel);
      assert.ok(section.includes(`<h2 id="signup-h">${HEADING}</h2>`), rel);
      assert.ok(section.includes(`>${BUTTON}</a>`), rel);
      const anchor = section.match(/<a\b[^>]*>[^<]*<\/a>/);
      assert.ok(anchor, rel + " missing signup anchor");
      assert.match(anchor[0], /class="signup-cta"/, rel);
      assert.equal(/\b(?:btn primary|btn--primary|primary)\b/.test(anchor[0]), false, rel + " signup button is still a blue primary button");
      assert.match(anchor[0], /target="_blank"/, rel);
      assert.match(anchor[0], /rel="noopener"/, rel);
      for (const phrase of LINEUP) assert.ok(section.includes(phrase), rel + " missing " + phrase);
      assert.equal(/Deadlines This Week|weekly deadline email/i.test(section), false, rel);
      const css = linkedCss(html, file);
      assert.match(css, /#signup a\.signup-cta\s*\{[^}]*background:\s*linear-gradient\(135deg,\s*#22c55e\s*0%,\s*#4ade80\s*100%\)/s, rel);
      assert.match(css, /#signup a\.signup-cta\s*\{[^}]*color:\s*#02060f/s, rel);
      assert.match(css, /#signup a\.signup-cta\s*\{[^}]*border-radius:\s*999px/s, rel);
      assert.match(css, /font-weight:\s*800/, rel);
      from = at + 'id="signup"'.length;
    }
    assert.equal(count, 1, rel);
  }
});
