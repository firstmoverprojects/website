// Windows Server 2016 result kit: hidden unless the answers say the machine is Server 2016.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const html = readFileSync(path.join(ROOT, "tools/windows-server-2016-check/index.html"), "utf8");

function load() {
  const match = html.match(/<script id="ws2016-check">([\s\S]*?)<\/script>/);
  assert.ok(match, "ws2016-check script");
  const store = {};
  function make(id) {
    const node = {
      id,
      hidden: true,
      textContent: "",
      value: "",
      checked: false,
      elements: {},
      addEventListener() {}
    };
    store[id] = node;
    return node;
  }
  ["ws-lead", "ws-days", "ws-plain", "ws-kit", "ws-advice", "ws-form", "ws-go", "ws-clear"].forEach(make);
  const sandbox = {
    console,
    document: { getElementById(id) { return store[id] || null; } },
    navigator: {},
    Intl,
    Date,
    Math,
    Number,
    String,
    Object
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox, { filename: "tools/windows-server-2016-check/index.html" });
  return { api: sandbox.FMP_WS2016, store };
}

const fixed = new Date("2026-11-02T18:00:00Z");

function answers(run) {
  return { run, edition: "standard", rwa: "no", count: "1" };
}

test("kit is hidden for run=no and run=unsure, and shown for run=yes", () => {
  const { api, store } = load();
  const no = api.buildResult(answers("no"), fixed);
  assert.equal(no.path, "not-2016");
  api.show(no);
  assert.equal(store["ws-kit"].hidden, true);
  assert.equal(store["ws-advice"].hidden, true);

  const unsure = api.buildResult(answers("unsure"), fixed);
  assert.equal(unsure.path, "confirm");
  api.show(unsure);
  assert.equal(store["ws-kit"].hidden, true);
  assert.equal(store["ws-advice"].hidden, true);

  const yes = api.buildResult(answers("yes"), fixed);
  assert.equal(yes.path, "upgrade");
  assert.equal(api.kitVisible(yes), true);
  api.show(yes);
  assert.equal(store["ws-kit"].hidden, false);
  assert.equal(store["ws-advice"].hidden, false);
  assert.match(yes.text, /Microsoft sells paid Extended Security Updates for Windows Server 2016/);
  assert.match(yes.text, /Not affiliated with or endorsed by Microsoft/);
  assert.equal(yes.text.includes("setInterval"), false);

  api.show({ complete: false, text: "Answer all four questions, then use Show days left." });
  assert.equal(store["ws-kit"].hidden, true);
  assert.equal(store["ws-advice"].hidden, true);
});

test("the result button names the kit and the page has no live countdown", () => {
  const kit = html.match(/<p id="ws-kit" hidden>([\s\S]*?)<\/p>/);
  assert.ok(kit);
  assert.match(kit[1], /Get the \$19 Windows Server 2016 planning checklist/);
  assert.match(kit[1], /utm_content=ws-check-result/);
  const after = html.slice(html.indexOf('id="ws-kit"'));
  assert.match(after, /id="ws-advice" hidden>General guidance, not legal, tax or IT advice\./);
  assert.equal(html.includes("setInterval"), false);
  assert.match(html, /Not affiliated with or endorsed by Microsoft\./);
});
