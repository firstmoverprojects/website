#!/usr/bin/env node
// Replace the inline GoatCounter click helper on every tracking page.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNIPPET = readFileSync(path.join(ROOT, "scripts/goatcounter-click-helper.snippet.js"), "utf8").trimEnd();
const OLD_COUNT = '<script data-goatcounter="https://firstmoverprojects.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>';
const NEW_COUNT = '<script data-goatcounter="https://firstmoverprojects.goatcounter.com/count" data-goatcounter-settings="{&quot;no_events&quot;:true}" async src="https://gc.zgo.at/count.js"></script>';

function toolPages() {
  return readdirSync(path.join(ROOT, "tools"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `tools/${entry.name}/index.html`)
    .filter((rel) => existsSync(path.join(ROOT, rel)));
}

function trackingPages() {
  const deadlines = readdirSync(path.join(ROOT, "deadlines"))
    .filter((name) => name.endsWith(".html"))
    .map((name) => `deadlines/${name}`);
  return [
    ...toolPages(),
    "tools/index.html",
    "index.html",
    "deadlines/finder/index.html",
    ...deadlines
  ];
}

function replaceHelper(html, rel) {
  const marker = html.indexOf("function trackGumroadClick");
  if (marker === -1) return { html, changed: false };
  const start = html.lastIndexOf("<script>", marker);
  const end = html.indexOf("</script>", marker);
  if (start === -1 || end === -1) throw new Error(`${rel}: could not locate helper script bounds`);
  const next = html.slice(0, start) + "<script>\n" + SNIPPET + "\n</script>" + html.slice(end + "</script>".length);
  const withCount = next.includes(OLD_COUNT)
    ? next.replace(OLD_COUNT, NEW_COUNT)
    : next.replace(
        /<script data-goatcounter="https:\/\/firstmoverprojects\.goatcounter\.com\/count"[^>]*src="https:\/\/gc\.zgo\.at\/count\.js"><\/script>/,
        NEW_COUNT
      );
  return { html: withCount, changed: withCount !== html };
}

let updated = 0;
for (const rel of trackingPages()) {
  const file = path.join(ROOT, rel);
  const html = readFileSync(file, "utf8");
  if (!html.includes("function trackGumroadClick")) continue;
  const { html: out, changed } = replaceHelper(html, rel);
  if (changed) {
    writeFileSync(file, out);
    updated += 1;
    console.log("updated", rel);
  }
}
console.log("files updated:", updated);
