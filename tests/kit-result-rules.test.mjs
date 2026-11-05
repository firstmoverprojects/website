// Kit buttons that belong on a result only when that result says the kit applies.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function runMarker(html, marker) {
  const at = html.indexOf(marker);
  assert.notEqual(at, -1, marker);
  const scriptStart = html.lastIndexOf("<script", at);
  const openEnd = html.indexOf(">", scriptStart);
  const close = html.indexOf("</script>", openEnd);
  const code = html.slice(openEnd + 1, close);
  const nodes = [];
  const sandbox = {
    console,
    Date,
    Math,
    Number,
    String,
    Object,
    document: {
      readyState: "complete",
      getElementById() {
        return {
          hidden: false,
          textContent: "",
          value: "",
          className: "",
          children: [],
          addEventListener() {},
          appendChild() {},
          scrollIntoView() {},
          setAttribute() {},
          removeAttribute() {}
        };
      },
      querySelectorAll() { return nodes; },
      addEventListener(type, fn) { if (type === "DOMContentLoaded") fn(); },
      createElement() {
        return { textContent: "", appendChild() {}, setAttribute() {} };
      }
    },
    navigator: {},
    setTimeout() {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: marker });
  return sandbox;
}

test("FIRE kit buttons hide at Nov 19, 2026 3:00 p.m. Eastern", () => {
  const sandbox = runMarker(read("tools/fire-to-iris-check/index.html"), "function expired");
  const api = sandbox.FMP_FIRE_KIT;
  assert.equal(api.expired(new Date("2026-11-19T19:59:59Z")), false);
  assert.equal(api.expired(new Date("2026-11-19T20:00:00Z")), true);
  assert.equal(api.expired(new Date("2026-11-20T15:00:00Z")), true);
  const node = { hidden: false };
  sandbox.document.querySelectorAll = () => [node];
  api.hide(new Date("2026-11-19T19:59:59Z"));
  assert.equal(node.hidden, false);
  api.hide(new Date("2026-11-19T20:00:00Z"));
  assert.equal(node.hidden, true);
});

test("deadline rows keep each kit on its own row", () => {
  const html = read("deadlines/index.html");
  const famli = html.slice(html.indexOf('id="md-famli"'), html.indexOf('id="ws2016"'));
  const ws = html.slice(html.indexOf('id="ws2016"'), html.indexOf('data-date="Apr 1, 2027"'));
  assert.match(famli, /Maryland FAMLI payroll deductions start Jan 1, 2027; employee notice due 1 pay period before \(Maryland FAMLI\)\./);
  assert.match(famli, /https:\/\/paidleave\.maryland\.gov\/employers\/make-contributions\//);
  assert.match(famli, /https:\/\/paidleave\.maryland\.gov\/files\/famli-2026-employee-notification-template\.docx/);
  assert.match(famli, /Free Maryland FAMLI employee notice template \(Maryland Department of Labor\)/);
  assert.match(famli, /Not affiliated with or endorsed by the Maryland Department of Labor\./);
  assert.match(famli, /paidleave\.maryland\.gov/);
  assert.match(famli, /COMAR 09\.42/);
  assert.equal(famli.includes("gumroad.com"), false);
  assert.equal(famli.includes("$9"), false);
  assert.equal(famli.includes("notice kit"), false);
  assert.match(famli, /General guidance, not legal, tax or IT advice\./);
  assert.equal(famli.includes("windows-server-2016"), false);
  assert.match(ws, /Windows Server 2016 extended support ends Jan 12, 2027/);
  assert.match(ws, /Microsoft sells paid Extended Security Updates/);
  assert.match(ws, /Not affiliated with or endorsed by Microsoft/);
  assert.match(ws, /Optional: \$19 Windows Server 2016 planning checklist/);
  assert.match(ws, /utm_content=ws2016/);
  assert.match(ws, /General guidance, not legal, tax or IT advice\./);
  assert.equal(ws.includes("days left"), false);
  assert.equal(ws.includes("setInterval"), false);
  assert.equal(html.split("maryland-famli-payroll-notice-kit").length - 1, 0);
  assert.equal(html.split("windows-server-2016-end-of-support-kit").length - 1, 1);
  assert.equal(html.includes("windows-server-2016-check"), false);
  const hub = html.slice(html.indexOf("Optional printable kits"));
  assert.equal(hub.includes("maryland-famli"), false);
  assert.equal(hub.includes("windows-server-2016-end-of-support-kit"), false);
});

test("EWS, Loom, and after-hours kits follow the applies result", () => {
  const ews = runMarker(read("tools/ews-setting-decoder/index.html"), "window.FMP_EWS");
  assert.equal(ews.FMP_EWS.kitApplies("null"), true);
  assert.equal(ews.FMP_EWS.kitApplies("true-list"), true);
  assert.equal(ews.FMP_EWS.kitApplies("true-empty"), true);
  assert.equal(ews.FMP_EWS.kitApplies("false"), true);
  assert.equal(ews.FMP_EWS.kitApplies("unknown"), false);
  assert.equal(ews.FMP_EWS.kitApplies("other"), false);
  const ewsHtml = read("tools/ews-setting-decoder/index.html");
  const ewsKit = ewsHtml.slice(ewsHtml.indexOf('id="ews-kit"'), ewsHtml.indexOf("follow-bar", ewsHtml.indexOf('id="ews-kit"')));
  assert.match(ewsKit, /id="kit-result"/);
  assert.match(ewsKit, /Get the \$39 EWS Cutover Kit/);
  assert.match(ewsKit, /General guidance, not legal, tax or IT advice\./);

  const loom = runMarker(read("tools/loom-seat-audit-calculator/index.html"), "window.FMP_LOOM");
  const counts = { keep: 0, move: 0, archive: 0, free: 0 };
  assert.equal(loom.FMP_LOOM.kitApplies({ ok: false }), false);
  assert.equal(loom.FMP_LOOM.kitApplies({ ok: true, classified: { counts } }), false);
  assert.equal(loom.FMP_LOOM.kitApplies({ ok: true, classified: { counts: { ...counts, move: 2 } } }), true);

  const after = runMarker(read("tools/after-hours-gap-check/index.html"), "window.FMP_AFTER");
  assert.equal(after.FMP_AFTER.kitApplies({
    sides: { current: [{ gap: false, text: "After-hours path is an instant triage form." }] }
  }), false);
  assert.equal(after.FMP_AFTER.kitApplies({
    sides: { current: [{ gap: true, text: "After-hours path was not answered." }] }
  }), false);
  assert.equal(after.FMP_AFTER.kitApplies({
    sides: { current: [{ gap: true, text: "After-hours path is voicemail." }] }
  }), true);
});
