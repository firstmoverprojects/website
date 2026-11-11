// Internal links must resolve, including GitHub Pages directory redirects.
// A request for /tools/amazon-coi-check (no slash) is a 301 to the slash URL,
// and that URL has to be a 200 page. This server mirrors that behavior from
// the checkout. It does not contact the network.
import assert from "node:assert/strict";
import { createServer, get as httpGet } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ORIGIN = "https://firstmoverprojects.com";
const HOSTS = new Set(["firstmoverprojects.com", "www.firstmoverprojects.com"]);
const SKIP_DIRS = new Set([".git", "node_modules", "tests", "offer-page-screenshots", "test-results", "playwright-report"]);

function readConfigExcludes() {
  const config = path.join(ROOT, "_config.yml");
  if (!existsSync(config)) return [];
  const match = /^exclude:\s*\[([^\]]*)\]/m.exec(readFileSync(config, "utf8"));
  return match ? match[1].split(",").map((part) => part.trim().replace(/^["']|["']$/g, "")).filter(Boolean) : [];
}
const JEKYLL_EXCLUDES = readConfigExcludes();

function isPublished(rel) {
  const parts = rel.split("/");
  if (parts.some((part) => part.startsWith(".") || part.startsWith("_") || SKIP_DIRS.has(part))) return false;
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

function blank(value) {
  return value.replace(/[^\n]/g, " ");
}

function stripNonMarkup(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (_, open, body, close) => open + blank(body) + close)
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, open, body, close) => open + blank(body) + close);
}

function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function pageUrl(rel) {
  if (rel.endsWith("/index.html")) return `${ORIGIN}/${rel.slice(0, -"index.html".length)}`;
  return `${ORIGIN}/${rel}`;
}

function unfolded(rel, text) {
  if (!rel.endsWith(".ics")) return text;
  return text.split(/\r?\n/).reduce((lines, line) => {
    if (/^[ \t]/.test(line) && lines.length) lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
    return lines;
  }, []).join("\n");
}

function collectLinks() {
  const found = [];
  const absRe = /https?:\/\/(?:www\.)?firstmoverprojects\.com(?:\/[^\s"'<>()\\\]`{}|^]*)?/g;
  for (const rel of FILES) {
    const text = unfolded(rel, readFileSync(path.join(ROOT, rel), "utf8"));
    const base = pageUrl(rel);
    if (rel.endsWith(".html")) {
      const markup = stripNonMarkup(text);
      for (const tag of markup.matchAll(/<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
        const attrs = tag[2];
        const srcset = /\bsrcset\s*=\s*"([^"]*)"/i.exec(attrs);
        if (srcset) {
          for (const part of srcset[1].split(",")) {
            const url = part.trim().split(/\s+/)[0];
            if (url) found.push({ from: rel, raw: decodeEntities(url) });
          }
        }
        for (const attr of attrs.matchAll(/\b(?:href|src|poster|data|action)\s*=\s*"([^"]*)"/gi)) {
          found.push({ from: rel, raw: decodeEntities(attr[1]) });
        }
        if (/^meta$/i.test(tag[1])) {
          const prop = /(?:property|name)\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] || "";
          const content = /content\s*=\s*"([^"]*)"/i.exec(attrs)?.[1];
          if (content && /^(og:image|og:image:url|og:image:secure_url|og:url|og:audio|og:video|twitter:image|twitter:image:src)$/i.test(prop)) {
            found.push({ from: rel, raw: decodeEntities(content) });
          }
        }
      }
      for (const script of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
        for (const url of script[1].matchAll(absRe)) {
          found.push({ from: rel, raw: url[0].replace(/[.,;:]+$/, "") });
        }
      }
    }
    if (rel.endsWith(".css")) {
      for (const url of text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/g)) {
        found.push({ from: rel, raw: url[1] ?? url[2] ?? url[3] });
      }
    }
    if (/\.(xml|txt|ics|json|webmanifest|js|mjs)$/.test(rel) && rel !== "package.json" && rel !== "package-lock.json") {
      for (const url of text.matchAll(absRe)) {
        found.push({ from: rel, raw: decodeEntities(url[0]).replace(/[.,;:]+$/, ""), base });
      }
    }
    for (const item of found) {
      if (!item.base) item.base = base;
    }
  }
  return found;
}

function safePath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.split("/").includes("..")) return null;
  const rel = decoded.replace(/^\/+/, "");
  const abs = path.resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return { rel, abs };
}

// Same mapping GitHub Pages uses: a directory URL without a slash is a 301,
// an extensionless HTML file is the page itself, and a directory index is 200.
function locate(pathname) {
  const located = safePath(pathname);
  if (!located) return { status: 400 };
  const { abs } = located;
  if (existsSync(abs) && statSync(abs).isDirectory()) {
    if (!pathname.endsWith("/")) return { status: 301, location: `${pathname}/` };
    const index = path.join(abs, "index.html");
    if (existsSync(index) && statSync(index).isFile()) return { status: 200, file: index };
    return { status: 404 };
  }
  if (existsSync(abs) && statSync(abs).isFile()) return { status: 200, file: abs };
  const html = `${abs}.html`;
  if (existsSync(html) && statSync(html).isFile()) return { status: 200, file: html };
  return { status: 404 };
}

function indexDirectories() {
  const dirs = [];
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(ROOT, full).split(path.sep).join("/");
      if (!isPublished(rel)) continue;
      if (!entry.isDirectory()) continue;
      if (existsSync(path.join(full, "index.html"))) dirs.push("/" + rel);
      visit(full);
    }
  }
  visit(ROOT);
  return dirs.sort();
}

function startServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const found = locate(url.pathname);
    if (found.status === 301) {
      res.writeHead(301, { location: found.location });
      res.end();
      return;
    }
    if (found.status !== 200) {
      res.writeHead(found.status);
      res.end();
      return;
    }
    const body = readFileSync(found.file);
    res.writeHead(200, { "content-length": body.length });
    res.end(req.method === "HEAD" ? undefined : body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

function request(origin, pathname) {
  const target = new URL(pathname, origin);
  return new Promise((resolve, reject) => {
    const req = httpGet(target, (res) => {
      res.resume();
      resolve({ status: res.statusCode, location: res.headers.location || "" });
    });
    req.on("error", reject);
  });
}

async function follow(origin, pathname) {
  const chain = [];
  let current = pathname;
  for (let hop = 0; hop < 6; hop += 1) {
    const response = await request(origin, current);
    chain.push({ path: current, status: response.status, location: response.location });
    if (response.status !== 301 && response.status !== 302 && response.status !== 307 && response.status !== 308) {
      return chain;
    }
    current = new URL(response.location, origin + current).pathname;
  }
  return chain;
}

function internalPath(raw, base) {
  const value = String(raw || "").trim();
  if (value === "" || /^(?:mailto|tel|sms|javascript|data|blob|about):/i.test(value) || value.startsWith("#")) return null;
  let url;
  try {
    url = new URL(value, base);
  } catch {
    return { error: `is not a valid URL (${value})` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!HOSTS.has(url.hostname)) return null;
  return { pathname: url.pathname };
}

test("internal links follow directory redirects onto a 200 page", async () => {
  const { server, origin } = await startServer();
  try {
    const failures = [];
    const seen = new Set();
    for (const link of collectLinks()) {
      const target = internalPath(link.raw, link.base);
      if (!target) continue;
      if (target.error) {
        failures.push(`${link.from} ${link.raw} ${target.error}`);
        continue;
      }
      const key = `${link.from} ${target.pathname}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const chain = await follow(origin, target.pathname);
      const final = chain[chain.length - 1];
      if (final.status !== 200) {
        const hops = chain.map((hop) => `${hop.status} ${hop.path}`).join(" -> ");
        failures.push(`${link.from} ${link.raw} -> ${hops}`);
      }
    }
    assert.deepEqual(failures, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("tool-check directory URLs 301 to a 200 page", async () => {
  const checks = indexDirectories().filter((dir) => dir.startsWith("/tools/") && dir.endsWith("-check"));
  assert.ok(checks.length >= 10, checks.join(", "));
  const { server, origin } = await startServer();
  try {
    const failures = [];
    for (const dir of checks) {
      const slashless = dir.replace(/\/$/, "");
      const first = await request(origin, slashless);
      if (first.status !== 301 || first.location !== `${slashless}/`) {
        failures.push(`${slashless} returned ${first.status} location ${first.location}`);
        continue;
      }
      const second = await request(origin, first.location);
      if (second.status !== 200) failures.push(`${slashless} -> ${first.location} returned ${second.status}`);
    }
    assert.deepEqual(failures, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
