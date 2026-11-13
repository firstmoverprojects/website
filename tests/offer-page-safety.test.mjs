// Safety check for the three live offer pages. The pages are static HTML.
//   npm ci
//   npx playwright install chromium
//   npm run test:offers
// Screenshots go to offer-page-screenshots/ (OFFER_SCREENSHOT_DIR overrides).
// Playwright's Chromium is the browser. CHROME_PATH overrides the binary.
// External hosts are blocked, so the check does not contact Gumroad or Brevo.
import assert from "node:assert/strict";
import { createServer, get as httpGet } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const HOST = "firstmoverprojects.com";
const SHOP = "firstmoverprojects.gumroad.com";
const VIEWPORT = { width: 390, height: 844 };

// Landing buy button. On Etsy, #kit-result is inside hidden #results until the
// visitor runs the check, so the button on first paint is #gtin-checkout.
// The result button and the weekly email form are checked after Load example.
const OFFERS = [
  {
    id: "fire",
    name: "FIRE $9 kit page",
    route: "/tools/fire-to-iris-check/",
    file: "tools/fire-to-iris-check/index.html",
    slug: "fire-to-iris-switch-checklist",
    cta: "#kit-top"
  },
  {
    id: "amazon",
    name: "Amazon COI checker",
    route: "/tools/amazon-coi-check/",
    file: "tools/amazon-coi-check/index.html",
    slug: "amazon-1m-insurance-readiness-kit",
    cta: "#kit-top"
  },
  {
    id: "etsy",
    name: "Etsy photo checker",
    route: "/tools/etsy-photo-audit-check/",
    file: "tools/etsy-photo-audit-check/index.html",
    slug: "lnfgc",
    cta: "#kit-top",
    emailForm: true
  }
];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".ics": "text/calendar; charset=utf-8"
};

const report = { load: {}, emailForm: null, mobile: {} };

let server;
let baseUrl;
let browser;

function screenshotDir() {
  return process.env.OFFER_SCREENSHOT_DIR
    ? path.resolve(process.env.OFFER_SCREENSHOT_DIR)
    : path.join(ROOT, "offer-page-screenshots");
}

function writeReport() {
  const dir = screenshotDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "summary.json"), JSON.stringify(report, null, 2));
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function readOffer(offer) {
  return readFileSync(path.join(ROOT, offer.file), "utf8");
}

function resolveSitePath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.split("/").includes("..")) return null;
  const rel = decoded.replace(/^\/+/, "");
  const candidates = [];
  if (rel === "" || rel.endsWith("/")) candidates.push(path.join(rel, "index.html"));
  else {
    candidates.push(rel);
    if (!path.extname(rel)) {
      candidates.push(`${rel}.html`);
      candidates.push(path.join(rel, "index.html"));
    }
  }
  for (const candidate of candidates) {
    const abs = path.resolve(ROOT, candidate);
    if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) continue;
    if (existsSync(abs) && statSync(abs).isFile()) return abs;
  }
  return null;
}

function startServer() {
  const httpServer = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const file = resolveSitePath(url.pathname);
    if (!file || (req.method !== "GET" && req.method !== "HEAD")) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("missing");
      return;
    }
    const body = readFileSync(file);
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file)] || "application/octet-stream",
      "content-length": body.length
    });
    res.end(req.method === "HEAD" ? undefined : body);
  });
  return new Promise((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => {
      const { port } = httpServer.address();
      resolve({ server: httpServer, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function statusOf(url) {
  return new Promise((resolve, reject) => {
    const request = httpGet(url, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    request.on("error", reject);
  });
}

function referencesIn(html) {
  const refs = [];
  const tags = html.replace(/<!--[\s\S]*?-->/g, "").match(/<[^>]+>/g) || [];
  for (const tag of tags) {
    const srcset = /\bsrcset\s*=\s*"([^"]*)"/i.exec(tag);
    if (srcset) {
      for (const part of srcset[1].split(",")) {
        const url = part.trim().split(/\s+/)[0];
        if (url) refs.push(decodeEntities(url));
      }
    }
    for (const match of tag.matchAll(/\b(?:href|src)\s*=\s*"([^"]*)"/gi)) {
      refs.push(decodeEntities(match[1]));
    }
  }
  return refs;
}

function classify(raw, route) {
  if (!raw || /^(?:mailto:|tel:|javascript:|data:)/i.test(raw)) return null;
  let url;
  try {
    url = new URL(raw, `https://${HOST}${route}`);
  } catch {
    return { kind: "broken", reason: "unparseable" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.hostname !== HOST) return { kind: "external" };
  return {
    kind: "internal",
    pathname: url.pathname,
    hash: decodeURIComponent(url.hash.replace(/^#/, ""))
  };
}

function idsIn(file) {
  const html = readFileSync(file, "utf8");
  const ids = new Set();
  for (const match of html.matchAll(/\sid=(?:"([^"]+)"|'([^']+)')/gi)) {
    ids.add(match[1] || match[2]);
  }
  return ids;
}

function buyLinks(html) {
  const links = [];
  const tags = html.replace(/<!--[\s\S]*?-->/g, "").match(/<a\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const href = /\bhref\s*=\s*"([^"]*)"/i.exec(tag);
    if (!href) continue;
    const raw = decodeEntities(href[1]);
    if (/gumroad\.com/i.test(raw)) links.push(raw);
  }
  return links;
}

function offerUrls(html) {
  const block = html.match(/<script type="application\/ld\+json" id="product-jsonld">([\s\S]*?)<\/script>/);
  if (!block) return [];
  const data = JSON.parse(block[1]);
  const products = data["@graph"] || [data];
  return products
    .map((product) => product.offers && product.offers.url)
    .filter((url) => typeof url === "string");
}

function buyProblem(raw, slug) {
  let url;
  try {
    url = new URL(raw, `https://${HOST}/`);
  } catch {
    return `${raw} is not a URL`;
  }
  if (url.protocol !== "https:") return `${raw} is not https`;
  if (url.hostname !== SHOP) return `${raw} is not ${SHOP}`;
  if (url.pathname !== `/l/${slug}`) return `${raw} is not /l/${slug}`;
  return "";
}

function formHtml(html) {
  const start = html.indexOf('id="deadline-reminder-form"');
  assert.notEqual(start, -1, "missing #deadline-reminder-form");
  const open = html.lastIndexOf("<form", start);
  const end = html.indexOf("</form>", start);
  assert.ok(open !== -1 && end !== -1, "Etsy reminder form is not closed");
  return html.slice(open, end + "</form>".length);
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (active && active !== document.body && active.blur) active.blur();
    const root = document.documentElement;
    const width = root.clientWidth;
    let offender = null;
    for (const el of document.body.querySelectorAll("*")) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 && rect.height < 1) continue;
      if (rect.right <= width + 1 && rect.left >= -1) continue;
      let clipped = false;
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        const overflow = getComputedStyle(parent).overflowX;
        if (overflow === "auto" || overflow === "scroll" || overflow === "hidden") {
          clipped = true;
          break;
        }
      }
      if (clipped) continue;
      if (!offender || rect.right > offender.right) {
        offender = {
          right: Math.round(rect.right),
          left: Math.round(rect.left),
          tag: el.tagName,
          id: el.id,
          cls: String(el.className).slice(0, 80)
        };
      }
    }
    const overflows = root.scrollWidth > width + 1;
    return { scrollWidth: root.scrollWidth, clientWidth: width, offender: overflows ? offender : null };
  });
}

function overflowProblem(measure, label) {
  if (measure.scrollWidth <= measure.clientWidth + 1) return "";
  return `${label}: scrollWidth ${measure.scrollWidth}, clientWidth ${measure.clientWidth}, ${JSON.stringify(measure.offender)}`;
}

async function readCta(page, selector, slug) {
  const cta = page.locator(selector);
  const before = await cta.boundingBox();
  const inFirstScreen = !!before
    && before.y < VIEWPORT.height
    && before.y + before.height > 0
    && before.x >= -1
    && before.x + before.width <= VIEWPORT.width + 1;
  await cta.scrollIntoViewIfNeeded();
  const visible = await cta.isVisible();
  const box = await cta.boundingBox();
  const href = await cta.getAttribute("href");
  const problems = [];
  if (!visible) problems.push(`${selector} is not visible`);
  if (!box || box.width < 8 || box.height < 8) problems.push(`${selector} has no box ${JSON.stringify(box)}`);
  else if (box.x < -1 || box.x + box.width > VIEWPORT.width + 1) {
    problems.push(`${selector} extends past 390px ${JSON.stringify(box)}`);
  }
  const buy = buyProblem(href || "", slug);
  if (buy) problems.push(`${selector} ${buy}`);
  return {
    problems,
    detail: {
      selector,
      href,
      inFirstScreen,
      firstScreenY: before ? Math.round(before.y) : null,
      box: box && { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) }
    }
  };
}

before(async () => {
  const started = await startServer();
  server = started.server;
  baseUrl = started.baseUrl;
  const mod = process.env.PLAYWRIGHT_CORE || "playwright";
  const { chromium } = await import(mod);
  const options = {
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  };
  if (process.env.CHROME_PATH) options.executablePath = process.env.CHROME_PATH;
  browser = await chromium.launch(options);
});

after(async () => {
  writeReport();
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("each offer page loads, internal links resolve, and Gumroad buy links are https", async () => {
  const failures = [];
  for (const offer of OFFERS) {
    const html = readOffer(offer);
    const served = await statusOf(`${baseUrl}${offer.route}`);
    if (served !== 200) failures.push(`${offer.route} HTTP ${served}`);
    if (!/<meta name="viewport" content="[^"]*width=device-width[^"]*">/.test(html)) {
      failures.push(`${offer.file} is missing a device-width viewport`);
    }

    const broken = [];
    const seen = new Set();
    let internal = 0;
    for (const raw of referencesIn(html)) {
      const item = classify(raw, offer.route);
      if (!item || item.kind === "external") continue;
      if (item.kind === "broken") {
        broken.push(`${raw} (${item.reason})`);
        continue;
      }
      const key = `${item.pathname}#${item.hash}`;
      if (seen.has(key)) continue;
      seen.add(key);
      internal += 1;
      const file = resolveSitePath(item.pathname);
      if (!file) {
        broken.push(`${raw} -> missing ${item.pathname}`);
        continue;
      }
      const code = await statusOf(`${baseUrl}${item.pathname}`);
      if (code !== 200) broken.push(`${raw} -> HTTP ${code}`);
      if (item.hash && !idsIn(file).has(item.hash)) {
        broken.push(`${raw} -> #${item.hash} is not on ${path.relative(ROOT, file)}`);
      }
    }
    if (internal === 0) broken.push("no internal links");
    for (const item of broken) failures.push(`${offer.name}: ${item}`);

    const buys = buyLinks(html);
    if (buys.length === 0) failures.push(`${offer.name}: no Gumroad buy link`);
    for (const href of buys) {
      const problem = buyProblem(href, offer.slug);
      if (problem) failures.push(`${offer.name}: ${problem}`);
    }
    const structured = offerUrls(html);
    if (offer.id === "fire") {
      if (structured.length !== 0) failures.push(`${offer.name}: Product Offer must be absent`);
      if (html.includes('id="product-jsonld"') || html.includes("priceValidUntil") || /"@type":\s*"Product"/.test(html) || /"@type":\s*"Offer"/.test(html)) {
        failures.push(`${offer.name}: Product Offer JSON-LD is still present`);
      }
    } else if (structured.length === 0) {
      failures.push(`${offer.name}: no product offer URL`);
    }
    for (const href of structured) {
      const problem = buyProblem(href, offer.slug);
      if (problem) failures.push(`${offer.name} product: ${problem}`);
    }

    report.load[offer.id] = {
      name: offer.name,
      route: offer.route,
      http: served,
      internalLinks: internal,
      gumroadBuyLinks: buys.length
    };
  }
  writeReport();
  assert.deepEqual(failures, []);
});

test("the Etsy inline weekly email form fields are present", () => {
  const offer = OFFERS.find((item) => item.emailForm);
  const html = readOffer(offer);
  assert.equal((html.match(/<form\b/gi) || []).length, 1, "expected one form");
  const resultsAt = html.indexOf('id="results"');
  const formAt = html.indexOf('id="deadline-reminder-form"');
  assert.ok(resultsAt !== -1 && resultsAt < formAt, "form is not inside the result");
  const form = formHtml(html);
  assert.match(form, /\bmethod="POST"/);
  const action = /\baction="([^"]+)"/.exec(form);
  assert.ok(action, "form has no action");
  const actionUrl = new URL(decodeEntities(action[1]));
  assert.equal(actionUrl.protocol, "https:");
  assert.match(form, /<label for="reminder-email">Email address<\/label>/);
  assert.match(form, /<input\b[^>]*\btype="email"[^>]*\bid="reminder-email"[^>]*\bname="EMAIL"[^>]*\brequired\b/);
  assert.match(form, /<label class="sib-optin" for="reminder-opt-in">/);
  assert.match(form, /<input\b[^>]*\btype="checkbox"[^>]*\bid="reminder-opt-in"[^>]*\bname="OPT_IN"[^>]*\brequired\b/);
  assert.match(form, /\bname="email_address_check"/);
  assert.match(form, /\bname="locale"[^>]*\bvalue="en"/);
  assert.match(form, /\bname="SIGNUP_SOURCE"[^>]*\bvalue="etsy-photo-audit"/);
  assert.match(form, /<button type="submit">[^<]+<\/button>/);
  assert.equal(/<script\b/i.test(form), false, "form contains a script");
  report.emailForm = {
    fields: ["EMAIL", "OPT_IN", "email_address_check", "locale", "SIGNUP_SOURCE"],
    actionHost: actionUrl.host
  };
  writeReport();
});

test("a 390px render has no horizontal overflow and shows the primary CTA", { timeout: 120000 }, async () => {
  const dir = screenshotDir();
  mkdirSync(dir, { recursive: true });
  const problems = [];
  const context = await browser.newContext({
    viewport: VIEWPORT,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "America/Chicago"
  });
  try {
    for (const offer of OFFERS) {
      const page = await context.newPage();
      const thirdParty = [];
      try {
        await page.route("**/*", (route) => {
          const url = route.request().url();
          if (url.startsWith(baseUrl)) return route.continue();
          thirdParty.push(url);
          return route.abort();
        });
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(String(error)));
        const response = await page.goto(`${baseUrl}${offer.route}`, { waitUntil: "load" });
        if (!response || response.status() !== 200) problems.push(`${offer.name} loaded HTTP ${response && response.status()}`);
        await page.evaluate(async () => {
          document.querySelectorAll("img[loading='lazy']").forEach((img) => {
            img.loading = "eager";
          });
          await Promise.all([...document.images].map((img) => (img.complete ? null : img.decode().catch(() => {}))));
        });

        const landing = await measureOverflow(page);
        const landingProblem = overflowProblem(landing, `${offer.name} at 390px`);
        if (landingProblem) problems.push(landingProblem);
        await page.screenshot({ path: path.join(dir, `${offer.id}-390.png`), fullPage: true });
        const cta = await readCta(page, offer.cta, offer.slug);
        for (const problem of cta.problems) problems.push(`${offer.name}: ${problem}`);
        await page.screenshot({ path: path.join(dir, `${offer.id}-390-cta.png`) });

        const visual = {
          viewport: VIEWPORT,
          landing,
          primaryCta: cta.detail,
          thirdPartyBlocked: thirdParty.length,
          pageErrors
        };

        if (offer.emailForm) {
          const fields = await page.locator("#deadline-reminder-form").evaluate((form) => {
            const read = (selector) => {
              const el = form.querySelector(selector);
              if (!el) return null;
              return { name: el.getAttribute("name"), type: el.getAttribute("type"), required: el.required };
            };
            const submit = form.querySelector("button[type='submit']");
            return {
              action: form.getAttribute("action") || "",
              method: (form.getAttribute("method") || "").toUpperCase(),
              email: read("#reminder-email"),
              optIn: read("#reminder-opt-in"),
              honeypot: read('[name="email_address_check"]'),
              locale: read('[name="locale"]'),
              source: read('[name="SIGNUP_SOURCE"]'),
              submit: submit ? submit.textContent.trim() : ""
            };
          });
          if (fields.method !== "POST") problems.push("Etsy form method is not POST");
          if (!fields.action.startsWith("https://")) problems.push(`Etsy form action is not https: ${fields.action}`);
          if (!fields.email || fields.email.name !== "EMAIL" || fields.email.type !== "email" || !fields.email.required) {
            problems.push(`Etsy EMAIL field ${JSON.stringify(fields.email)}`);
          }
          if (!fields.optIn || fields.optIn.name !== "OPT_IN" || !fields.optIn.required) {
            problems.push(`Etsy OPT_IN field ${JSON.stringify(fields.optIn)}`);
          }
          if (!fields.honeypot) problems.push("Etsy honeypot is missing after scripts");
          if (!fields.locale) problems.push("Etsy locale field is missing after scripts");
          const sourceValue = await page.locator("#deadline-reminder-form [name='SIGNUP_SOURCE']").inputValue();
          if (sourceValue !== "etsy-photo-audit") problems.push(`Etsy SIGNUP_SOURCE is ${sourceValue}`);
          if (!fields.submit) problems.push("Etsy submit button is empty");

          await page.locator("#example").click();
          await page.locator("#results").waitFor({ state: "visible" });
          await page.locator("#reminder-email").waitFor({ state: "visible" });
          await page.locator("#reminder-opt-in").waitFor({ state: "visible" });
          await page.locator("#deadline-reminder-form button[type='submit']").waitFor({ state: "visible" });
          const resultCta = await readCta(page, "#kit-result", offer.slug);
          for (const problem of resultCta.problems) problems.push(`Etsy result: ${problem}`);
          const opened = await measureOverflow(page);
          const openedProblem = overflowProblem(opened, "Etsy photo checker with the weekly email form open");
          if (openedProblem) problems.push(openedProblem);
          await page.screenshot({ path: path.join(dir, "etsy-390-with-result.png"), fullPage: true });
          await page.locator("#deadline-reminder-form").scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(dir, "etsy-390-weekly-email-form.png") });
          visual.result = { overflow: opened, resultCta: resultCta.detail };
          const submitted = thirdParty.filter((url) => /sibforms\.com|brevo\.com|gumroad\.com/i.test(url));
          if (submitted.length) problems.push(`contacted ${submitted.join(", ")}`);
        }

        for (const error of pageErrors) problems.push(`${offer.name} page error: ${error}`);
        report.mobile[offer.id] = visual;
      } catch (error) {
        problems.push(`${offer.name}: ${error && error.message ? error.message : error}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
    report.mobileProblems = problems;
    writeReport();
  }
  assert.deepEqual(problems, []);
});
