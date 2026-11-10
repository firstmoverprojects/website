// Quoted strings in served JavaScript must not look like site paths unless
// that path is a real page or asset. Googlebot has treated slash-leading
// literals such as "/event/..." and "/mo" as URLs.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

function inlineScripts(html) {
  const scripts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    const attrs = match[1];
    if (/type\s*=\s*["']application\/(?:ld\+)?json["']/i.test(attrs)) continue;
    if (!match[2].trim()) continue;
    const line = html.slice(0, match.index).split("\n").length;
    scripts.push({ line, code: match[2] });
  }
  return scripts;
}

function localScriptSrcs(html, htmlRel) {
  const srcs = [];
  const re = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = re.exec(html))) {
    const src = match[1];
    if (/^(?:https?:)?\/\//i.test(src) || src.startsWith("data:")) continue;
    const abs = src.startsWith("/")
      ? path.join(ROOT, src.slice(1))
      : path.resolve(path.dirname(path.join(ROOT, htmlRel)), src);
    const rel = path.relative(ROOT, abs);
    if (!rel.startsWith("..") && existsSync(abs)) srcs.push(rel);
  }
  return srcs;
}

const REGEX_BEFORE = new Set(["", "(", "[", "{", "=", ":", ",", ";", "!", "&", "|", "?", "+", "-", "*", "%", "^", "~", "<", ">", "return", "typeof", "case", "throw", "void", "delete", "in", "of", "do"]);

function skipRegex(code, i) {
  i += 1;
  let inClass = false;
  while (i < code.length) {
    const ch = code[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "[" && !inClass) inClass = true;
    else if (ch === "]" && inClass) inClass = false;
    else if (ch === "/" && !inClass) {
      i += 1;
      while (i < code.length && /[a-z]/i.test(code[i])) i += 1;
      return i;
    } else if (ch === "\n") return i;
    i += 1;
  }
  return i;
}

function slashStrings(code) {
  const found = [];
  let i = 0;
  let line = 1;
  let last = "";
  const mark = (ch) => {
    if (ch === "\n") line += 1;
  };
  while (i < code.length) {
    const ch = code[i];
    if (ch === "\n") {
      mark(ch);
      i += 1;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "/" && code[i + 1] === "/") {
      while (i < code.length && code[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && code[i + 1] === "*") {
      i += 2;
      while (i + 1 < code.length && !(code[i] === "*" && code[i + 1] === "/")) {
        mark(code[i]);
        i += 1;
      }
      i = Math.min(code.length, i + 2);
      continue;
    }
    if (ch === "/" && REGEX_BEFORE.has(last)) {
      const next = skipRegex(code, i);
      for (let k = i; k < next; k += 1) mark(code[k]);
      i = next;
      last = "regex";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      const startLine = line;
      i += 1;
      let value = "";
      while (i < code.length) {
        const c = code[i];
        if (c === "\\") {
          value += c;
          mark(c);
          i += 1;
          if (i < code.length) {
            value += code[i];
            mark(code[i]);
            i += 1;
          }
          continue;
        }
        if (quote === "`" && c === "$" && code[i + 1] === "{") {
          value += c;
          i += 2;
          let depth = 1;
          while (i < code.length && depth) {
            if (code[i] === "{") depth += 1;
            else if (code[i] === "}") depth -= 1;
            mark(code[i]);
            i += 1;
          }
          continue;
        }
        if (c === quote) {
          i += 1;
          break;
        }
        value += c;
        mark(c);
        i += 1;
      }
      if (value.startsWith("/")) found.push({ line: startLine, value });
      last = "string";
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      i += 1;
      while (i < code.length && /[A-Za-z0-9_$]/.test(code[i])) i += 1;
      last = code.slice(start, i);
      continue;
    }
    last = ch;
    i += 1;
  }
  return found;
}

function isRealSitePath(value) {
  if (value === "/") return true;
  const pathname = value.split(/[?#]/)[0];
  if (pathname !== value) return false;
  if (!pathname.startsWith("/") || pathname.includes(" ") || pathname.includes("\\")) return false;
  const rel = pathname.replace(/^\/+/, "");
  if (!rel || rel.includes("..")) return false;
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) return false;
  const st = statSync(abs);
  if (st.isFile()) return true;
  return st.isDirectory() && existsSync(path.join(abs, "index.html"));
}

test("served JavaScript has no slash-leading string that is not a real page or asset", () => {
  const htmlFiles = walk(ROOT).filter((abs) => abs.endsWith(".html"));
  const servedJs = new Set();
  const problems = [];
  const allowed = new Set();
  for (const abs of htmlFiles) {
    const rel = path.relative(ROOT, abs);
    const html = readFileSync(abs, "utf8");
    for (const src of localScriptSrcs(html, rel)) servedJs.add(src);
    for (const script of inlineScripts(html)) {
      for (const item of slashStrings(script.code)) {
        if (isRealSitePath(item.value)) {
          allowed.add(item.value);
          continue;
        }
        problems.push(`${rel}:${script.line + item.line - 1} ${JSON.stringify(item.value)}`);
      }
    }
  }
  for (const rel of servedJs) {
    const code = read(rel);
    for (const item of slashStrings(code)) {
      if (isRealSitePath(item.value)) {
        allowed.add(item.value);
        continue;
      }
      problems.push(`${rel}:${item.line} ${JSON.stringify(item.value)}`);
    }
  }
  assert.deepEqual(problems, []);
  assert.equal(allowed.has("/"), true);
  assert.equal(allowed.has("/tools/fire-to-iris-check/"), true);
  assert.equal([...allowed].some((value) => value.startsWith("/event/")), false);
});

test("robots.txt disallows /event/ in every user-agent group and still publishes the sitemap", () => {
  const robots = read("robots.txt");
  const groups = robots.split(/\n(?=User-agent:)/);
  assert.equal(groups.length, 4);
  for (const group of groups) {
    assert.match(group, /^User-agent: /);
    assert.match(group, /^Allow: \/$/m);
    assert.match(group, /^Disallow: \/event\/$/m);
  }
  assert.equal(robots.split("\n").filter((line) => line === "Disallow: /event/").length, 4);
  assert.equal(robots.split("\n").includes("Disallow: /"), false);
  assert.match(robots, /^Sitemap: https:\/\/firstmoverprojects\.com\/sitemap\.xml$/m);
});
