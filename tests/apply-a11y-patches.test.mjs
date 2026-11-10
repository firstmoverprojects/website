import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const VLI = "deadlines/1098-vli-check/index.html";

test("apply_a11y_patches self-test passes", () => {
  const out = execFileSync("python3", ["scripts/apply_a11y_patches.py", "--self-test"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.match(out, /self-test OK/);
});

test("1098-vli-check a11y-patch link resolves to a published file", () => {
  const file = path.join(ROOT, VLI);
  const html = readFileSync(file, "utf8");
  const links = [
    ...html.matchAll(
      /<link\s+rel="stylesheet"[^>]*href="([^"]*a11y-patch\.css)"[^>]*>/gi,
    ),
  ];
  assert.equal(links.length, 1, "one a11y-patch stylesheet link");
  assert.equal(links[0][1], "../a11y-patch.css", "parent-relative href");
  const resolved = path.normalize(path.join(path.dirname(VLI), links[0][1]));
  const target = path.join(ROOT, resolved);
  assert.ok(existsSync(target), `resolved patch exists: ${target}`);
});
