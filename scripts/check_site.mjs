#!/usr/bin/env node
// Static checks for the published site. Reads files from this checkout only:
// no network, no browser, no secrets. Run from the repo root:
//
//   npm ci --ignore-scripts && node scripts/check_site.mjs
//   node scripts/check_site.mjs links sitemap   # run a subset
//
// Checks: links, images, html, jsonld, meta, sitemap, house-lines, feed, denylist.
// Issues listed in scripts/site_checks_known_issues.json are reported as
// warnings instead of failures (use it only for files you are not allowed to edit yet).

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://firstmoverprojects.com";
const HOSTS = new Set(["firstmoverprojects.com", "www.firstmoverprojects.com"]);
const KNOWN_ISSUES_FILE = "scripts/site_checks_known_issues.json";
const DENYLIST_FILE = "scripts/site_denylist.txt";
const ALL_CHECKS = ["links", "images", "html", "jsonld", "meta", "sitemap", "house-lines", "feed", "denylist"];
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const TEXT_SCAN_EXT = /\.(html?|css|js|mjs|json|xml|txt|md|ics|webmanifest)$/i;
const DENYLIST_SKIP_PREFIX = ["tests/", "node_modules/", "offer-page-screenshots/", "playwright-report/", "test-results/"];
const IN_ACTIONS = process.env.GITHUB_ACTIONS === "true";

// Jekyll (GitHub Pages) does not publish these.
const UNPUBLISHED_DIRS = new Set(["node_modules", "vendor", "offer-page-screenshots", "test-results", "playwright-report"]);

function readJekyllExcludes() {
  const config = path.join(ROOT, "_config.yml");
  if (!existsSync(config)) return [];
  const match = /^exclude:\s*\[([^\]]*)\]/m.exec(readFileSync(config, "utf8"));
  return match ? match[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean) : [];
}
const JEKYLL_EXCLUDES = readJekyllExcludes();

function isPublished(rel) {
  const parts = rel.split("/");
  if (parts.some((p) => p.startsWith(".") || p.startsWith("_") || UNPUBLISHED_DIRS.has(p))) return false;
  return !JEKYLL_EXCLUDES.some((ex) => rel === ex || rel.startsWith(ex + "/"));
}

function walk(dir = ROOT, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).split(path.sep).join("/");
    if (!isPublished(rel)) continue;
    if (entry.isDirectory()) walk(full, out);
    else out.push(rel);
  }
  return out;
}

const FILES = walk().sort();
const FILE_SET = new Set(FILES);
const HTML_FILES = FILES.filter((f) => f.endsWith(".html"));
const cache = new Map();
const read = (rel) => {
  if (!cache.has(rel)) cache.set(rel, readFileSync(path.join(ROOT, rel), "utf8"));
  return cache.get(rel);
};

// ---------- reporting ----------

const issues = [];
const notes = [];
function fail(check, file, line, message) {
  issues.push({ check, file, line, message });
}
function note(check, file, line, message) {
  notes.push({ check, file, line, message });
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

// ---------- HTML helpers (regex based; pages are hand-written static HTML) ----------

const blank = (s) => s.replace(/[^\n]/g, " ");

// Same length as the input, so offsets still map to the right line.
function stripNonMarkup(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (_, a, b, c) => a + blank(b) + c)
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, a, b, c) => a + blank(b) + c)
    .replace(/(<template\b[^>]*>)([\s\S]*?)(<\/template>)/gi, (_, a, b, c) => a + blank(b) + c);
}

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function parseAttrs(src) {
  const attrs = {};
  for (const m of src.matchAll(/([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

function tags(markup) {
  const out = [];
  for (const m of markup.matchAll(/<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
    out.push({ name: m[1].toLowerCase(), attrs: parseAttrs(m[2]), index: m.index });
  }
  return out;
}

const pageCache = new Map();
function page(rel) {
  if (pageCache.has(rel)) return pageCache.get(rel);
  const html = read(rel);
  const markup = stripNonMarkup(html);
  const t = tags(markup);
  const metas = t.filter((x) => x.name === "meta");
  const robots = metas
    .filter((x) => /^(robots|googlebot)$/i.test(x.attrs.name || ""))
    .map((x) => (x.attrs.content || "").toLowerCase())
    .join(",");
  const ids = new Set(t.flatMap((x) => [x.attrs.id, x.name === "a" ? x.attrs.name : undefined]).filter(Boolean));
  const p = { rel, html, markup, tags: t, metas, ids, noindex: /\bnoindex\b/.test(robots) };
  pageCache.set(rel, p);
  return p;
}

function visibleText(markup) {
  return decodeEntities(markup.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ");
}

// URL path a file is served at, in the form used by canonicals and the sitemap.
function prettyUrl(rel) {
  return ORIGIN + "/" + rel.replace(/(^|\/)index\.html$/, "$1");
}

// ---------- URL resolution ----------

// Returns null for links this script does not check (external, mailto:, etc.).
function resolveLink(fromRel, raw) {
  const value = raw.trim();
  if (value === "" || /^(mailto|tel|sms|javascript|data|blob|about):/i.test(value)) return null;
  let url;
  try {
    url = new URL(value, ORIGIN + "/" + fromRel);
  } catch {
    return { error: "is not a valid URL" };
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  if (!HOSTS.has(url.hostname)) return null;
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return { error: "has a bad percent-encoding" };
  }
  return { pathname, fragment: decodeURIComponent(url.hash.slice(1)) };
}

// Mirrors how GitHub Pages maps a request path to a file.
function fileForPath(pathname) {
  const rel = pathname.replace(/^\/+/, "");
  const candidates = rel === "" || rel.endsWith("/") ? [rel + "index.html"] : [rel, rel + "/index.html", rel + ".html"];
  return candidates.find((c) => FILE_SET.has(c)) ?? null;
}

function checkUrl(check, fromRel, line, raw, what, { fragments = true } = {}) {
  const target = resolveLink(fromRel, raw);
  if (!target) return null;
  if (target.error) {
    fail(check, fromRel, line, `${what} "${raw}" ${target.error}`);
    return null;
  }
  const file = fileForPath(target.pathname);
  if (!file) {
    fail(check, fromRel, line, `${what} "${raw}" points to ${target.pathname}, which is not a published file`);
    return null;
  }
  if (fragments && target.fragment && file.endsWith(".html") && !target.fragment.startsWith(":~:")) {
    if (!page(file).ids.has(target.fragment)) {
      fail(check, fromRel, line, `${what} "${raw}" points to #${target.fragment}, but ${file} has no element with that id`);
    }
  }
  return file;
}

// ---------- check: images ----------

function detectImageFormat(buf) {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 6) {
    const head = buf.toString("ascii", 0, 6);
    if (head === "GIF87a" || head === "GIF89a") return "gif";
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

const EXT_FOR_FORMAT = {
  png: new Set(["png"]),
  jpeg: new Set(["jpg", "jpeg"]),
  gif: new Set(["gif"]),
  webp: new Set(["webp"]),
};

function checkImages() {
  for (const rel of FILES) {
    const ext = path.extname(rel).slice(1).toLowerCase();
    if (!IMAGE_EXT.has(ext)) continue;
    const buf = readFileSync(path.join(ROOT, rel));
    const format = detectImageFormat(buf);
    if (!format) {
      fail("images", rel, 1, `could not detect image format from file header (extension .${ext})`);
      continue;
    }
    const allowed = EXT_FOR_FORMAT[format];
    if (!allowed?.has(ext)) {
      fail(
        "images",
        rel,
        1,
        `extension .${ext} does not match file contents (${format === "jpeg" ? "JPEG" : format.toUpperCase()}); rename the file or fix the reference`,
      );
    }
  }
}

// ---------- check: denylist ----------

function loadDenylistPatterns() {
  const rel = DENYLIST_FILE;
  if (!FILE_SET.has(rel) && !existsSync(path.join(ROOT, rel))) {
    fail("denylist", rel, 1, "denylist file is missing");
    return [];
  }
  const patterns = [];
  const lines = read(rel).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const pattern = lines[i].trim();
    if (!pattern || pattern.startsWith("#")) continue;
    patterns.push({ pattern, denyLine: i + 1 });
  }
  return patterns;
}

function isDenylistTarget(rel) {
  if (DENYLIST_SKIP_PREFIX.some((prefix) => rel.startsWith(prefix))) return false;
  return TEXT_SCAN_EXT.test(rel);
}

function checkBadgeCase() {
  for (const rel of HTML_FILES) {
    const html = read(rel);
    for (const m of html.matchAll(/<span class="kit-conv-badge"[^>]*>([\s\S]*?)<\/span>/gi)) {
      const text = decodeEntities(m[1].replace(/<[^>]+>/g, " ")).trim();
      if (/[a-z]{2,}/.test(text)) {
        fail("denylist", rel, lineAt(html, m.index), `kit-conv-badge must not use lowercase words (got "${text}")`);
      }
    }
  }
}

function checkDenylist() {
  checkBadgeCase();
  const patterns = loadDenylistPatterns();
  if (!patterns.length) return;
  const scanFiles = FILES.filter(isDenylistTarget);
  for (const rel of scanFiles) {
    const text = read(rel);
    const lower = text.toLowerCase();
    for (const { pattern, denyLine } of patterns) {
      const needle = pattern.toLowerCase();
      let from = 0;
      while (true) {
        const at = lower.indexOf(needle, from);
        if (at === -1) break;
        fail("denylist", rel, lineAt(text, at), `matched denylist pattern "${pattern}" (${DENYLIST_FILE}:${denyLine})`);
        from = at + Math.max(needle.length, 1);
      }
    }
  }
}

// ---------- check: links ----------

const LINK_ATTRS = {
  a: ["href"],
  area: ["href"],
  link: ["href"],
  script: ["src"],
  img: ["src", "srcset"],
  source: ["src", "srcset"],
  iframe: ["src"],
  video: ["src", "poster"],
  audio: ["src"],
  track: ["src"],
  embed: ["src"],
  object: ["data"],
  input: ["src"],
  form: ["action"],
};
const META_URL_PROPS = /^(og:image|og:image:url|og:image:secure_url|og:url|og:audio|og:video|twitter:image|twitter:image:src)$/i;
const ABS_URL_RE = /https?:\/\/(?:www\.)?firstmoverprojects\.com(?:\/[^\s"'<>()\\\]`{}|^]*)?/g;

function cssUrls(css) {
  return [...css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/g)].map((m) => ({
    value: m[1] ?? m[2] ?? m[3],
    index: m.index,
  }));
}

function checkLinks() {
  for (const rel of HTML_FILES) {
    const p = page(rel);
    for (const tag of p.tags) {
      const line = lineAt(p.html, tag.index);
      for (const attr of LINK_ATTRS[tag.name] ?? []) {
        const value = tag.attrs[attr];
        if (value === undefined) continue;
        if (attr === "srcset") {
          for (const candidate of value.split(",")) {
            const src = candidate.trim().split(/\s+/)[0];
            if (src) checkUrl("links", rel, line, src, `<${tag.name} srcset>`);
          }
        } else {
          checkUrl("links", rel, line, value, `<${tag.name} ${attr}>`);
        }
      }
      if (tag.name === "meta") {
        const prop = tag.attrs.property || tag.attrs.name || "";
        if (META_URL_PROPS.test(prop) && tag.attrs.content) checkUrl("links", rel, line, tag.attrs.content, `<meta ${prop}>`);
        if (/^refresh$/i.test(tag.attrs["http-equiv"] || "")) {
          const target = /url\s*=\s*(.+)$/i.exec(tag.attrs.content || "");
          if (target) checkUrl("links", rel, line, target[1].replace(/^["']|["']$/g, ""), "<meta refresh>");
        }
      }
      if (tag.attrs.style) {
        for (const u of cssUrls(tag.attrs.style)) checkUrl("links", rel, line, u.value, "style url()");
      }
    }
    for (const m of p.html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
      const start = m.index + m[0].indexOf(m[1]);
      for (const u of cssUrls(m[1])) checkUrl("links", rel, lineAt(p.html, start + u.index), u.value, "<style> url()");
    }
    // Absolute links to this site inside inline scripts and JSON-LD.
    for (const m of p.html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
      const start = m.index + m[0].indexOf(m[1]);
      for (const u of m[1].matchAll(ABS_URL_RE)) {
        checkUrl("links", rel, lineAt(p.html, start + u.index), u[0].replace(/[.,;:]+$/, ""), "URL in <script>");
      }
    }
  }

  for (const rel of FILES.filter((f) => f.endsWith(".css"))) {
    const css = read(rel);
    for (const u of cssUrls(css)) checkUrl("links", rel, lineAt(css, u.index), u.value, "url()");
  }

  // Feeds, calendars, llms.txt, robots.txt and data files that name pages on this site.
  for (const rel of FILES.filter((f) => /\.(xml|txt|ics|json|webmanifest)$/.test(f) && f !== "package.json" && f !== "package-lock.json")) {
    for (const { text, line } of logicalLines(rel)) {
      for (const u of text.matchAll(ABS_URL_RE)) {
        checkUrl("links", rel, line, decodeEntities(u[0]).replace(/[.,;:]+$/, ""), "URL");
      }
    }
  }
}

// iCalendar folds long lines (RFC 5545 3.1): a line starting with a space or tab continues the previous one.
function logicalLines(rel) {
  const physical = read(rel).split(/\r?\n/);
  const out = [];
  physical.forEach((text, i) => {
    if (rel.endsWith(".ics") && /^[ \t]/.test(text) && out.length) out[out.length - 1].text += text.slice(1);
    else out.push({ text, line: i + 1 });
  });
  return out;
}

// ---------- check: html ----------

async function checkHtml() {
  let HtmlValidate, FileSystemConfigLoader;
  try {
    ({ HtmlValidate, FileSystemConfigLoader } = await import("html-validate"));
  } catch {
    fail("html", "package.json", 1, "html-validate is not installed. Run `npm ci --ignore-scripts` first.");
    return;
  }
  const validator = new HtmlValidate(new FileSystemConfigLoader());
  for (const rel of HTML_FILES) {
    const report = await validator.validateFile(path.join(ROOT, rel));
    for (const result of report.results) {
      for (const m of result.messages) {
        if (m.severity < 2) continue;
        fail("html", rel, m.line, `${m.message} [${m.ruleId}]`);
      }
    }
  }
}

// ---------- check: jsonld ----------

function checkJsonLd() {
  for (const rel of HTML_FILES) {
    const p = page(rel);
    for (const m of p.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const attrs = parseAttrs(m[1]);
      if ((attrs.type || "").toLowerCase() !== "application/ld+json") continue;
      const line = lineAt(p.html, m.index);
      if (p.markup.slice(m.index, m.index + 7) !== "<script") continue; // inside a comment
      let data;
      try {
        data = JSON.parse(m[2]);
      } catch (err) {
        fail("jsonld", rel, line, `JSON-LD block does not parse: ${err.message}`);
        continue;
      }
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if (!node || typeof node !== "object" || Array.isArray(node)) {
          fail("jsonld", rel, line, "JSON-LD block must be an object or an array of objects");
          continue;
        }
        const context = JSON.stringify(node["@context"] ?? "");
        if (!/schema\.org/.test(context)) fail("jsonld", rel, line, 'JSON-LD block has no "@context" for https://schema.org');
        const typed = Array.isArray(node["@graph"]) ? node["@graph"] : [node];
        for (const item of typed) {
          if (!item || typeof item !== "object" || !item["@type"]) fail("jsonld", rel, line, 'JSON-LD node has no "@type"');
        }
      }
    }
  }
}

// ---------- check: meta ----------

function headInfo(p) {
  const at = p.markup.search(/<title\b/i);
  const title = at === -1 ? null : /^<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(p.html.slice(at))?.[1] ?? null;
  const meta = (key) => p.metas.filter((t) => (t.attrs.name || t.attrs.property || "").toLowerCase() === key);
  const canonicals = p.tags.filter((t) => t.name === "link" && (t.attrs.rel || "").toLowerCase().split(/\s+/).includes("canonical"));
  return {
    titles: (p.markup.match(/<title\b/gi) || []).length,
    title: title === null ? null : decodeEntities(title).trim(),
    descriptions: meta("description"),
    ogImages: meta("og:image"),
    canonicals,
  };
}

function checkMeta() {
  for (const rel of HTML_FILES) {
    const p = page(rel);
    const h = headInfo(p);
    if (!h.title) fail("meta", rel, 1, "missing or empty <title>");
    if (h.titles > 1) fail("meta", rel, 1, `has ${h.titles} <title> elements`);
    if (h.descriptions.length === 0 || !h.descriptions[0].attrs.content?.trim()) fail("meta", rel, 1, 'missing or empty <meta name="description">');
    if (h.descriptions.length > 1) fail("meta", rel, lineAt(p.html, h.descriptions[1].index), 'has more than one <meta name="description">');

    // Unlisted (noindex) pages are not shared or indexed, so they only need a title and description.
    if (p.noindex) continue;

    if (h.canonicals.length === 0) {
      fail("meta", rel, 1, 'missing <link rel="canonical">');
    } else {
      if (h.canonicals.length > 1) fail("meta", rel, lineAt(p.html, h.canonicals[1].index), 'has more than one <link rel="canonical">');
      const href = h.canonicals[0].attrs.href || "";
      if (href !== prettyUrl(rel)) {
        fail("meta", rel, lineAt(p.html, h.canonicals[0].index), `canonical is "${href}", expected "${prettyUrl(rel)}"`);
      }
    }
    if (h.ogImages.length === 0 || !h.ogImages[0].attrs.content?.trim()) {
      fail("meta", rel, 1, 'missing <meta property="og:image">');
    } else if (!/^https:\/\//.test(h.ogImages[0].attrs.content)) {
      fail("meta", rel, lineAt(p.html, h.ogImages[0].index), "og:image must be an absolute https:// URL");
    }
  }
}

// ---------- check: sitemap ----------

function checkSitemap() {
  const rel = "sitemap.xml";
  if (!FILE_SET.has(rel)) {
    fail("sitemap", rel, 1, "sitemap.xml is missing");
    return;
  }
  const xml = read(rel);
  if (!/<urlset\b[^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.test(xml)) {
    fail("sitemap", rel, 1, "root element must be <urlset> in the sitemaps.org 0.9 namespace");
  }
  if ((xml.match(/<url>/g) || []).length !== (xml.match(/<\/url>/g) || []).length) fail("sitemap", rel, 1, "unbalanced <url> elements");

  const listed = new Map();
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const line = lineAt(xml, m.index);
    const loc = /<loc>\s*([^<]*?)\s*<\/loc>/.exec(m[1])?.[1];
    const lastmod = /<lastmod>\s*([^<]*?)\s*<\/lastmod>/.exec(m[1])?.[1];
    if (!loc) {
      fail("sitemap", rel, line, "<url> without <loc>");
      continue;
    }
    if (lastmod !== undefined && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/.test(lastmod)) {
      fail("sitemap", rel, line, `<lastmod> "${lastmod}" is not a W3C date`);
    }
    if (listed.has(loc)) fail("sitemap", rel, line, `${loc} is listed twice`);
    if (!loc.startsWith(ORIGIN + "/") || /[?#]/.test(loc)) {
      fail("sitemap", rel, line, `${loc} must be an ${ORIGIN}/ URL without a query or fragment`);
      continue;
    }
    const file = fileForPath(new URL(loc).pathname);
    if (!file) {
      fail("sitemap", rel, line, `${loc} does not map to a published file`);
      continue;
    }
    listed.set(loc, file);
    if (file.endsWith(".html")) {
      if (loc !== prettyUrl(file)) fail("sitemap", rel, line, `${loc} should be listed as ${prettyUrl(file)}`);
      if (page(file).noindex) fail("sitemap", rel, line, `${loc} is noindex, so it should not be in the sitemap`);
    }
  }

  const listedFiles = new Set(listed.values());
  for (const file of HTML_FILES) {
    if (page(file).noindex || listedFiles.has(file)) continue;
    fail("sitemap", rel, 1, `public page ${file} (${prettyUrl(file)}) is not listed. Add it, or mark the page noindex if it is unlisted on purpose`);
  }

  const robots = FILE_SET.has("robots.txt") ? read("robots.txt") : "";
  if (!robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`)) fail("sitemap", "robots.txt", 1, `robots.txt should contain "Sitemap: ${ORIGIN}/sitemap.xml"`);
}

// ---------- check: house-lines ----------

// Every page that links a Gumroad product carries an affiliation line ("Not affiliated with ...")
// and a not-advice line. Most use the house wording "General guidance, not legal, tax or IT advice";
// a few use a variant such as "Not tax, accounting, or legal advice", which is reported, not failed.
const GUMROAD_PRODUCT_RE = /https?:\/\/[a-z0-9-]+\.gumroad\.com\/l\/[A-Za-z0-9_-]+/;
const AFFILIATION_RE = /\bNot affiliated with\b/i;
const HOUSE_ADVICE_RE = /\bGeneral guidance, not legal\b/i;
const ANY_ADVICE_RE = /\bnot\b[^.!?]{0,60}\blegal\b[^.!?]{0,40}\badvice\b/i;

function checkHouseLines() {
  for (const rel of HTML_FILES) {
    const p = page(rel);
    const anchor = p.tags.find((t) => t.name === "a" && GUMROAD_PRODUCT_RE.test(t.attrs.href || ""));
    if (!anchor) {
      const scripted = [...p.html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].some((m) => GUMROAD_PRODUCT_RE.test(m[1]));
      const text = visibleText(p.markup);
      if (scripted && !(AFFILIATION_RE.test(text) && ANY_ADVICE_RE.test(text))) {
        note("house-lines", rel, 1, "an inline script builds Gumroad product links, but the page lacks the affiliation or not-advice line");
      }
      continue;
    }
    const line = lineAt(p.html, anchor.index);
    const text = visibleText(p.markup);
    if (!AFFILIATION_RE.test(text)) fail("house-lines", rel, line, 'links a Gumroad product but has no "Not affiliated with ..." line');
    if (!ANY_ADVICE_RE.test(text)) {
      fail("house-lines", rel, line, 'links a Gumroad product but has no not-advice line (house wording: "General guidance, not legal, tax or IT advice.")');
    } else if (!HOUSE_ADVICE_RE.test(text)) {
      note("house-lines", rel, line, `links a Gumroad product and uses a not-advice variant ("${ANY_ADVICE_RE.exec(text)[0]}") instead of "General guidance, not legal ..."`);
    }
  }
}

// ---------- check: feed ----------

// /feed.xml is the conventional feed path. GitHub Pages builds the site with Jekyll, so feed.xml at the
// root is a front-matter stub that publishes deadlines/feed.xml there (no second copy to keep in sync).
function checkFeed() {
  const source = "deadlines/feed.xml";
  if (!FILE_SET.has(source)) {
    fail("feed", source, 1, "the RSS feed is missing");
    return;
  }
  const xml = read(source);
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) fail("feed", source, 1, "must start with an XML declaration");
  if (/^---\s*$/m.test(xml.split("\n")[0]) || /\{[{%]/.test(xml)) fail("feed", source, 1, "must not contain Jekyll front matter or Liquid tags ({{ or {%), because feed.xml includes it");
  if (!/<rss\b[^>]*version="2\.0"[\s\S]*<channel>[\s\S]*<\/channel>\s*<\/rss>\s*$/.test(xml)) fail("feed", source, 1, "must be <rss version=\"2.0\"><channel>...</channel></rss>");
  const open = (xml.match(/<item>/g) || []).length;
  if (open !== (xml.match(/<\/item>/g) || []).length) fail("feed", source, 1, "unbalanced <item> elements");
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const line = lineAt(xml, m.index);
    for (const field of ["title", "link", "guid", "pubDate", "description"]) {
      if (!new RegExp(`<${field}\\b`).test(m[1])) fail("feed", source, line, `<item> has no <${field}>`);
    }
    const pubDate = /<pubDate>([^<]*)<\/pubDate>/.exec(m[1])?.[1];
    if (pubDate && !/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} [+-]\d{4}$/.test(pubDate)) {
      fail("feed", source, line, `pubDate "${pubDate}" is not RFC 822`);
    }
  }
  const stub = "feed.xml";
  // No trailing newline, so the published /feed.xml is byte-identical to /deadlines/feed.xml.
  const expected = "---\nlayout: null\n---\n{% include_relative deadlines/feed.xml %}";
  if (!FILE_SET.has(stub)) fail("feed", stub, 1, `missing; /feed.xml should publish ${source}`);
  else if (read(stub) !== expected) fail("feed", stub, 1, `must be exactly:\n${expected}`);
}

// ---------- known issues ----------

function loadKnownIssues() {
  if (!existsSync(path.join(ROOT, KNOWN_ISSUES_FILE))) return [];
  const data = JSON.parse(readFileSync(path.join(ROOT, KNOWN_ISSUES_FILE), "utf8"));
  return data.issues.map((entry) => ({ ...entry, used: false }));
}

function annotate(level, issue) {
  if (!IN_ACTIONS) return;
  const msg = `[${issue.check}] ${issue.message}`.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  console.log(`::${level} file=${issue.file},line=${issue.line}::${msg}`);
}

// ---------- main ----------

const requested = process.argv.slice(2);
const unknown = requested.filter((c) => !ALL_CHECKS.includes(c));
if (unknown.length) {
  console.error(`Unknown check(s): ${unknown.join(", ")}. Choose from: ${ALL_CHECKS.join(", ")}`);
  process.exit(2);
}
const selected = requested.length ? requested : ALL_CHECKS;
const runners = {
  links: checkLinks,
  images: checkImages,
  html: checkHtml,
  jsonld: checkJsonLd,
  meta: checkMeta,
  sitemap: checkSitemap,
  "house-lines": checkHouseLines,
  feed: checkFeed,
  denylist: checkDenylist,
};

const started = Date.now();
for (const name of selected) await runners[name]();

const known = loadKnownIssues();
const failures = [];
const allowed = [];
for (const issue of issues) {
  const entry = known.find((k) => k.check === issue.check && k.file === issue.file && issue.message.includes(k.match));
  if (entry) {
    entry.used = true;
    allowed.push({ ...issue, reason: entry.reason });
  } else {
    failures.push(issue);
  }
}

const fmt = (i) => `  ${i.file}:${i.line}  [${i.check}] ${i.message}`;
if (notes.length) {
  console.log(`\nNotes (${notes.length}, not failures):`);
  for (const n of notes) {
    console.log(fmt(n));
    annotate("notice", n);
  }
}
if (allowed.length) {
  console.log(`\nKnown issues in ${KNOWN_ISSUES_FILE} (${allowed.length}, not failures):`);
  for (const a of allowed) {
    console.log(fmt(a) + `\n      reason: ${a.reason}`);
    annotate("warning", a);
  }
}
const stale = known.filter((k) => !k.used && selected.includes(k.check));
if (stale.length) {
  console.log(`\nKnown-issue entries that no longer match anything (remove them from ${KNOWN_ISSUES_FILE}):`);
  for (const k of stale) {
    console.log(`  ${k.file}  [${k.check}] ${k.match}`);
    annotate("warning", { check: k.check, file: KNOWN_ISSUES_FILE, line: 1, message: `stale entry for ${k.file}: ${k.match}` });
  }
}
if (failures.length) {
  console.log(`\nFailures (${failures.length}):`);
  for (const f of failures) {
    console.log(fmt(f));
    annotate("error", f);
  }
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\nChecked ${HTML_FILES.length} HTML pages and ${FILES.length} published files (${selected.join(", ")}) in ${seconds}s.`);
console.log(failures.length ? `FAILED: ${failures.length} issue(s).` : "OK: no failures.");
process.exit(failures.length ? 1 : 0);
