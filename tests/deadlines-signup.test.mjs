import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const HREF = "https://05279842.sibforms.com/serve/MUIFAOl30i4SqBWIywYgwCK-R-JtXw9dFx8m5j-td4xmrSh6dXO-1ysXwauPn74aUR1704Woip5d-zVEij--7PVs3Ny9ANkpwvsp6zi8LQaPXra8EtECZfFOjzPBw1houYxtyGNprdB_IAejV4AHahfUP0AeeMyIpgcAFFaxNlyGv9PQhVHeo9NHrVFBHvcyJyn7qSpur2L10Tzt8A==";
const MARKERS = [
  '<section class="signup" id="signup" aria-labelledby="signup-h">',
  '<h2 id="signup-h">Get the First Mover Projects Weekly Update</h2>',
  `href="${HREF}"`,
  'class="signup-cta"',
  'target="_blank" rel="noopener"',
  ">Sign up for the weekly FMP email (1-click)</a>",
  "One short weekly email covering our newest free 60-second browser checks, ready-to-use kits, small-business tech &amp; compliance deadlines, and cozy browser puzzle games. Double opt-in; unsubscribe anytime. See our",
  "</section>"
];

test("every top-level deadlines page has the full FMP signup and a green pill button", () => {
  const dir = path.join(ROOT, "deadlines");
  const files = readdirSync(dir).filter((name) => name.endsWith(".html")).sort();
  assert.ok(files.includes("index.html"));
  assert.equal(files.length, 15);
  for (const name of files) {
    const html = readFileSync(path.join(dir, name), "utf8");
    assert.equal(html.toLowerCase().includes("free weekly email"), false, name);
    assert.equal(html.includes("Deadlines This Week"), false, name);
    assert.equal(html.includes("weekly deadline email"), false, name);
    for (const marker of MARKERS) {
      assert.equal(html.includes(marker), true, name + " missing " + marker.slice(0, 80));
    }
    assert.equal(html.split('id="signup"').length - 1, 1, name);
    assert.ok(html.indexOf('id="signup"') < html.indexOf("</main>"), name);
    const section = html.slice(html.indexOf('<section class="signup"'), html.indexOf("</section>", html.indexOf('id="signup"')) + "</section>".length);
    assert.equal(/class="[^"]*\b(?:primary|btn--primary)\b/.test(section), false, name + " signup still uses a blue button class");
  }
});
