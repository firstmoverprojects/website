// Follow bars on tool checkers and TikTok banners on the three hubs.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TIKTOK = "https://www.tiktok.com/@firstmoverprojects?utm_source=firstmoverprojects&utm_medium=tool_result&utm_campaign=follower_growth";
const HUB = "https://www.tiktok.com/@firstmoverprojects?utm_source=firstmoverprojects&utm_medium=hub_banner&utm_campaign=follower_growth";
const TIKTOK_LABEL = "Follow @firstmoverprojects on TikTok (Daily 60-Sec Checklists)";
const EMAIL_LABEL = "Get Free Email Deadline Reminders";
const HUB_LABEL = "Watch our 60-second live-drawing deadline checklists on TikTok (@firstmoverprojects) →";

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

function element(html, id) {
  const at = html.indexOf(`id="${id}"`);
  assert.notEqual(at, -1, id);
  const start = html.lastIndexOf("<", at);
  const gt = html.indexOf(">", start);
  const tag = html.slice(start + 1, gt).split(/\s/)[0];
  const open = "<" + tag;
  const close = `</${tag}>`;
  let depth = 1;
  let i = gt + 1;
  while (depth) {
    const nxtOpen = html.indexOf(open, i);
    const nxtClose = html.indexOf(close, i);
    assert.notEqual(nxtClose, -1, tag);
    const after = nxtOpen === -1 ? "" : html.slice(nxtOpen + open.length, nxtOpen + open.length + 1);
    if (nxtOpen !== -1 && nxtOpen < nxtClose && (after === " " || after === ">" || after === "/")) {
      depth += 1;
      i = nxtOpen + open.length;
    } else {
      depth -= 1;
      i = nxtClose + close.length;
    }
  }
  return html.slice(start, i);
}

test("every tool checker has a follow bar under the result kit button and the main card", () => {
  const pages = toolPages();
  assert.ok(pages.length >= 9, pages.join(","));
  for (const rel of pages) {
    const slug = rel.split("/")[1];
    const html = read(rel);
    const singleResultCta = rel === "tools/amazon-coi-check/index.html" || rel === "tools/etsy-photo-audit-check/index.html";
    const bars = html.match(/<div class="follow-bar"/g) || [];
    const copies = singleResultCta ? 1 : 2;
    assert.equal(bars.length, copies, rel);
    assert.equal(html.split(`data-tool-slug="${slug}"`).length - 1, copies, rel);
    assert.equal(html.split(TIKTOK_LABEL).length - 1, copies, rel);
    assert.equal(html.split(EMAIL_LABEL).length - 1, copies, rel);
    assert.ok(html.includes(TIKTOK.replace(/&/g, "&amp;")), rel);
    assert.match(html, /\.follow-tiktok\{[^}]*background:#0c1520/, rel);
    assert.match(html, /\.follow-tiktok\{[^}]*border:1px solid #00d8ff/, rel);
    assert.match(html, /\.follow-email\{[^}]*background:linear-gradient\(135deg,#22c55e 0%,#4ade80 100%\)/, rel);
    assert.match(html, /\.follow-email\{[^}]*color:#01060b !important/, rel);
    assert.match(html, /\.follow-bar\{[^}]*background:#01060b/, rel);
    const tags = [...html.matchAll(/<a\b[^>]*class="follow-tiktok"[^>]*>/g)].map((match) => match[0]);
    assert.equal(tags.length, copies, rel);
    for (const tag of tags) {
      assert.match(tag, /target="_blank"/, rel);
      assert.match(tag, /rel="noopener"/, rel);
      assert.equal(/noreferrer/i.test(tag), false, rel);
    }
    const resultId = html.includes('id="results"') ? "results" : "res";
    const result = element(html, resultId);
    const outside = html.replace(result, "");
    if (singleResultCta) {
      assert.equal(result.split('class="follow-bar"').length - 1, 0, rel + " result");
      assert.equal(/class="follow-email"/.test(result), false, rel + " result");
      assert.equal((result.match(/gumroad\.com/g) || []).length, 1, rel + " result");
    } else {
      assert.equal(result.split('class="follow-bar"').length - 1, 1, rel + " result");
      assert.match(result, /class="follow-email" href="#signup"/, rel);
    }
    assert.match(outside, /class="follow-email" href="\/deadlines\/#signup"/, rel);
    assert.equal(/C\.?\s*J\.?\s*Crispin|CurioFinch/i.test(html), false, rel);
  }
});

test("tools, deadlines, and games hubs show the TikTok banner beside email reminders", () => {
  const hubs = {
    "tools/index.html": "#signup",
    "deadlines/index.html": "#signup",
    "games/index.html": "/deadlines/#signup"
  };
  for (const [rel, email] of Object.entries(hubs)) {
    const html = read(rel);
    assert.equal(html.split(HUB_LABEL).length - 1, 1, rel);
    assert.ok(html.includes(HUB.replace(/&/g, "&amp;")), rel);
    const heroAt = html.indexOf('class="hero"');
    assert.notEqual(heroAt, -1, rel);
    const bannerAt = html.indexOf('class="tiktok-hub"');
    assert.ok(bannerAt > heroAt, rel);
    const tag = html.match(/<a\b[^>]*class="tiktok-hub-link"[^>]*>/)[0];
    assert.match(tag, /target="_blank"/, rel);
    assert.match(tag, /rel="noopener"/, rel);
    assert.match(html, new RegExp(`class="tiktok-hub-email" href="${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), rel);
    assert.match(html, /\.tiktok-hub-link\{[^}]*border:1px solid #00d8ff/, rel);
    assert.match(html, /\.tiktok-hub-email\{[^}]*#22c55e 0%,#4ade80 100%/, rel);
  }
});
