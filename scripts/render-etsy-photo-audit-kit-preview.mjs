/**
 * Regenerate assets/previews/etsy-photo-audit-kit-preview-1280x720.{png,webp}
 * Layout matches the existing Etsy kit marketing composite; panel copy tracks PDF v1.1.1.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.join(root, "scripts/etsy-photo-audit-kit-preview-1280x720.html");
const pngOut = path.join(root, "assets/previews/etsy-photo-audit-kit-preview-1280x720.png");
const webpOut = path.join(root, "assets/previews/etsy-photo-audit-kit-preview-1280x720.webp");

const html = readFileSync(htmlPath, "utf8");

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.setContent(html, { waitUntil: "load" });
await page.screenshot({ path: pngOut, type: "png", fullPage: false });
await browser.close();

try {
  execFileSync("ffmpeg", ["-y", "-i", pngOut, "-quality", "88", webpOut], { stdio: "pipe" });
} catch {
  writeFileSync(webpOut, readFileSync(pngOut));
}

console.log("Wrote", pngOut);
console.log("Wrote", webpOut);
