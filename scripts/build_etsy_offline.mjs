#!/usr/bin/env node
// Build the offline profit-per-listing file for the $19 download.
// No new dependencies. The output stays under scripts/, which Jekyll does not publish.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pageDir = path.join(root, "tools/etsy-profit-per-listing");
const feesText = readFileSync(path.join(pageDir, "fees.json"), "utf8");
const feesPretty = JSON.stringify(JSON.parse(feesText), null, 2);
const feeBlock = `<script id="fee-defaults" type="application/json">\n${feesPretty}\n</script>`;

let html = readFileSync(path.join(pageDir, "index.html"), "utf8");
if (!html.includes('id="fee-defaults"')) {
  throw new Error("index.html is missing the fee-defaults script");
}
html = html.replace(/<script id="fee-defaults" type="application\/json">[\s\S]*?<\/script>/, feeBlock);
writeFileSync(path.join(pageDir, "index.html"), html);

const embedded = JSON.parse(/<script id="fee-defaults" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1]);
if (JSON.stringify(embedded) !== JSON.stringify(JSON.parse(feesText))) {
  throw new Error("fee-defaults does not match fees.json");
}

const papa = readFileSync(path.join(pageDir, "papaparse.js"), "utf8");
const profit = readFileSync(path.join(pageDir, "profit.js"), "utf8").replace(/^export /gm, "");
const app = readFileSync(path.join(pageDir, "app.js"), "utf8").replace(
  /import\s*\{[^}]+\}\s*from\s*"\.\/profit\.js";\s*/,
  ""
);

const inline = `<script>\n${papa}\n</script>\n<script type="module">\nwindow.FMP_ETSY_OFFLINE = true;\n${profit}\n${app}\n</script>`;
let offline = html.replace(
  /<script src="papaparse\.js"><\/script>\s*<script type="module" src="app\.js"><\/script>/,
  () => inline
);
offline = offline.replace(
  "script-src 'self' 'unsafe-inline'",
  "script-src 'unsafe-inline'"
);

const outDir = path.join(root, "scripts/dist");
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "etsy-profit-per-listing.html");
writeFileSync(outFile, offline);
if (!offline.includes("window.FMP_ETSY_OFFLINE = true")) {
  throw new Error("offline file did not set FMP_ETSY_OFFLINE");
}
if (offline.includes('src="papaparse.js"') || /<script[^>]+src="https?:/i.test(offline)) {
  throw new Error("offline file still points at an external script");
}
console.log(path.relative(root, outFile));
