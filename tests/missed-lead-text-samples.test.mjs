// Free missed-lead sample page: three texts, interest form, no purchase path.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const REL = "tools/missed-lead-text-samples/index.html";
const ACTION = "https://05279842.sibforms.com/serve/MUIFAOl30i4SqBWIywYgwCK-R-JtXw9dFx8m5j-td4xmrSh6dXO-1ysXwauPn74aUR1704Woip5d-zVEij--7PVs3Ny9ANkpwvsp6zi8LQaPXra8EtECZfFOjzPBw1houYxtyGNprdB_IAejV4AHahfUP0AeeMyIpgcAFFaxNlyGv9PQhVHeo9NHrVFBHvcyJyn7qSpur2L10Tzt8A==";
const SAMPLES = [
  "Hi, this is [Your name] at [Business]. Sorry we missed your call just now. What can we help with? You can text here or we'll call back by [time]. Reply STOP to opt out.",
  "Hi [Name], this is [Your name] at [Business]. Thanks for your request on our site. When is a good time for a quick call? Reply STOP to opt out.",
  "Hi [Name], this is [Business]. We had you down for [time] today and wanted to make sure you're OK. Want to reschedule? Reply STOP to opt out."
];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function visible(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
}

test("the sample page is public, copyable, and has no purchase path", () => {
  const html = read(REL);
  const shown = visible(html);
  assert.match(html, /<h1>Free sample follow-up texts for local service businesses \(missed call, web form, no-show\)<\/h1>/);
  assert.match(shown, /Who it fits:/);
  assert.match(shown, /contractors, HVAC, plumbers, med spas, and salons/);
  assert.match(shown, /What it is not:/);
  assert.match(shown, /legal advice, software, or a promise of results/);
  for (const sample of SAMPLES) assert.ok(shown.includes(sample), sample.slice(0, 40));
  assert.equal(shown.split("Every text ends with Reply STOP to opt out.").length - 1, 3);
  assert.match(shown, /Only text people who gave you permission to text them\. Honor STOP\. General guidance, not legal, tax or IT advice\./);
  assert.match(shown, /<h2 id="signup-h">Want all 38\?<\/h2>/);
  assert.match(shown, /Join the list and we'll email you when the full pack \(38 texts across 5 situations, plus the consent note\) is ready\./);
  assert.match(shown, /Double opt-in\. Unsubscribe any time\. We do not sell or share your email\./);
  assert.match(html, new RegExp(`method="POST" action="${ACTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(html, /data-goatcounter-submit="signup\/missed-lead-text-samples"/);
  assert.match(html, /name="OPT_IN" required/);
  assert.match(html, /name="SIGNUP_SOURCE" value="missed-lead-text-samples"/);
  assert.match(shown, /Thanks for your time\. If this isn't right for you, please share it with someone it could help\./);
  assert.match(shown, /General guidance, not legal, tax or IT advice\./);
  assert.match(shown, /Not affiliated with or endorsed by CTIA, Harvard Business Review, or Gumroad\./);
  assert.equal(html.includes('content="noindex'), false);
  assert.equal(/<a\b[^>]*gumroad\.com\/l\//i.test(shown), false);
  assert.equal(/wanted=true/i.test(shown), false);
  assert.equal(/\$\d/.test(shown), false);
  assert.equal(/\b(?:buy|checkout)\b/i.test(shown), false);
  assert.equal(/[—–]/.test(html), false);
  assert.equal(/\b(?:official|approved)\b/i.test(shown), false);
  assert.match(html, /data-goatcounter="https:\/\/firstmoverprojects\.goatcounter\.com\/count"/);

  const index = read("tools/index.html");
  assert.match(index, /href="\/tools\/missed-lead-text-samples\/">Open free samples<\/a>/);
  const cardStart = index.indexOf("Free sample follow-up texts (missed call, web form, no-show)");
  assert.notEqual(cardStart, -1);
  const card = index.slice(cardStart, index.indexOf("</article>", cardStart));
  assert.equal(/\$\d|\b(?:buy|checkout)\b|gumroad|wanted=true/i.test(card), false);

  const sitemap = read("sitemap.xml");
  assert.match(sitemap, /<loc>https:\/\/firstmoverprojects\.com\/tools\/missed-lead-text-samples\/<\/loc>/);
});
