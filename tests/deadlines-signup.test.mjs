import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const HREF = "https://05279842.sibforms.com/serve/MUIFAOl30i4SqBWIywYgwCK-R-JtXw9dFx8m5j-td4xmrSh6dXO-1ysXwauPn74aUR1704Woip5d-zVEij--7PVs3Ny9ANkpwvsp6zi8LQaPXra8EtECZfFOjzPBw1houYxtyGNprdB_IAejV4AHahfUP0AeeMyIpgcAFFaxNlyGv9PQhVHeo9NHrVFBHvcyJyn7qSpur2L10Tzt8A==";
const MARKERS = [
  '<section class="signup" id="signup" aria-labelledby="signup-h">',
  '<h2 id="signup-h">Get &quot;Deadlines This Week&quot;</h2>',
  `href="${HREF}"`,
  'target="_blank" rel="noopener"',
  ">Sign up for the weekly deadline email</a> (opens Brevo's sign-up page).</p>",
  '<p>Weekly deadline email. Double opt-in; unsubscribe anytime. See our <a href="https://firstmoverprojects.com/privacy.html">Privacy Policy</a>.</p>',
  "</section>"
];

test("every top-level deadlines page has the Brevo signup link and no free-weekly phrasing", () => {
  const dir = path.join(ROOT, "deadlines");
  const files = readdirSync(dir).filter((name) => name.endsWith(".html")).sort();
  assert.ok(files.includes("index.html"));
  assert.equal(files.length, 10);
  for (const name of files) {
    const html = readFileSync(path.join(dir, name), "utf8");
    assert.equal(html.toLowerCase().includes("free weekly email"), false, name);
    for (const marker of MARKERS) {
      assert.equal(html.includes(marker), true, name + " missing " + marker.slice(0, 70));
    }
    assert.equal(html.split('id="signup"').length - 1, 1, name);
    assert.ok(html.indexOf('id="signup"') < html.indexOf("</main>"), name);
  }
});
