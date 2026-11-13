/**
 * Regenerate assets/previews/fire-to-iris-kit-preview-1280x720.{png,webp}
 * Same Playwright screenshot path as scripts/render-etsy-photo-audit-kit-preview.mjs.
 * Copy is the 3-page PDF only: no Nov 9 or Nov 19 "before" lines, no Nov 19 badge,
 * no CSV header map, Publication 5717, 45 calendar days, no em dashes.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.join(root, "scripts/fire-to-iris-kit-preview-1280x720.html");
const pngOut = path.join(root, "assets/previews/fire-to-iris-kit-preview-1280x720.png");
const webpOut = path.join(root, "assets/previews/fire-to-iris-kit-preview-1280x720.webp");

function assertWebp(filePath) {
  const head = readFileSync(filePath).subarray(0, 12);
  const riff = head.toString("ascii", 0, 4);
  const webp = head.toString("ascii", 8, 12);
  if (riff !== "RIFF" || webp !== "WEBP") {
    throw new Error(`${filePath} is not a WebP (got ${riff}/${webp})`);
  }
}

const html = readFileSync(htmlPath, "utf8");
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
await page.screenshot({ path: pngOut, type: "png", fullPage: false });
await browser.close();

let webpOk = false;
try {
  execFileSync("ffmpeg", ["-y", "-i", pngOut, "-c:v", "libwebp", "-quality", "88", webpOut], { stdio: "pipe" });
  webpOk = true;
} catch {
  /* try cwebp */
}
if (!webpOk) {
  try {
    execFileSync("cwebp", ["-q", "88", pngOut, "-o", webpOut], { stdio: "pipe" });
    webpOk = true;
  } catch (err) {
    throw new Error("WebP encode failed (ffmpeg and cwebp): " + (err && err.message ? err.message : err));
  }
}
assertWebp(webpOut);
console.log("Wrote", pngOut);
console.log("Wrote", webpOut);
