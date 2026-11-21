// Heapwell: boot, a seeded auto-player, fps, save/load, and a 360x640 fit.
// Browser checks load the game with ?qa=1 only.
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { startServer } from "./e2e/harness.mjs";
import { chromiumLaunchOptions, importChromium } from "./playwright-helpers.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const HEAP = path.join(ROOT, "games/heapwell");

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function dirSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(full) : statSync(full).size;
  }
  return total;
}

let browser;
let origin;
let server;

before(async () => {
  const started = await startServer();
  server = started.server;
  origin = started.origin;
  const chromium = await importChromium();
  browser = await chromium.launch(chromiumLaunchOptions([
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows"
  ]));
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function openQa(suffix) {
  const context = await browser.newContext({ viewport: { width: 360, height: 640 } });
  const page = await context.newPage();
  const errors = [];
  const external = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("request", (req) => {
    const url = req.url();
    if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:")) return;
    external.push(url);
  });
  const response = await page.goto(origin + "/games/heapwell/" + suffix, { waitUntil: "load" });
  assert.equal(response.status(), 200);
  await page.waitForFunction(() => window.HeapwellQA && window.HeapwellQA.ready);
  await page.waitForFunction(() => window.HeapwellQA.items().length > 0);
  return { context, page, errors, external };
}

function notable(errors) {
  return errors.filter((line) => !/favicon/i.test(line));
}

test("Heapwell files stay local, licensed, and under 5 MB", () => {
  const license = read("games/heapwell/matter.LICENSE");
  const matter = read("games/heapwell/matter.min.js");
  const html = read("games/heapwell/index.html");
  const game = read("games/heapwell/game.js");
  const card = read("games/index.html");
  assert.match(license, /The MIT License/);
  assert.match(license, /Copyright \(c\) Liam Brummitt and contributors/);
  assert.match(matter, /matter-js 0\.20\.0/);
  assert.match(matter, /License MIT/);
  assert.equal(html.includes("crazygames"), false);
  assert.equal(html.includes("http://") || html.includes("https://sdk."), false);
  assert.match(game, /sdk\.crazygames\.com\/crazygames-sdk-v3\.js/);
  assert.match(game, /portalOn/);
  assert.match(game, /age >= 60000/);
  assert.match(game, /requestAd\("midgame"/);
  assert.ok(dirSize(HEAP) < 5 * 1024 * 1024);
  assert.match(card, /id="hw-h">Heapwell/);
  assert.match(card, /href="\/games\/heapwell\/"/);
  assert.match(card, /General guidance, not legal, tax or IT advice\./);
  assert.match(card, /Thanks for your time\. If this isn't right for you, please share it with someone it could help\./);
});

test("Heapwell boots cleanly, holds 30 fps, and fits 360x640", async () => {
  const opened = await openQa("?qa=1&fresh=1&heap=1&seed=42");
  try {
    assert.deepEqual(opened.external, [], opened.external.join("\n"));
    assert.deepEqual(notable(opened.errors), [], notable(opened.errors).join("\n"));
    await opened.page.waitForFunction(() => window.HeapwellQA.snapshot().active >= 200, null, { timeout: 8000 });
    await opened.page.waitForTimeout(1500);
    const pace = await opened.page.evaluate(() => {
      const snap = window.HeapwellQA.snapshot();
      return { fps: snap.fps, active: snap.active, bodies: snap.bodies, screen: snap.screen };
    });
    assert.ok(pace.fps > 30, "fps " + pace.fps);
    assert.ok(pace.active >= 200, "active " + pace.active);
    assert.ok(pace.active <= 350, "active " + pace.active);
    assert.ok(pace.bodies <= 350, "bodies " + pace.bodies);
    assert.equal(pace.screen, "play");

    const fit = await opened.page.evaluate(() => {
      const doc = document.documentElement;
      const frame = document.getElementById("frame").getBoundingClientRect();
      return {
        sw: doc.scrollWidth,
        sh: doc.scrollHeight,
        cw: doc.clientWidth,
        ch: doc.clientHeight,
        fw: frame.width,
        fh: frame.height
      };
    });
    assert.ok(fit.sw <= fit.cw + 1, JSON.stringify(fit));
    assert.ok(fit.sh <= fit.ch + 1, JSON.stringify(fit));
    assert.ok(fit.fw <= 360.5 && fit.fh <= 640.5, JSON.stringify(fit));

    const targets = await opened.page.locator("#frame button").evaluateAll((els) => els.map((el) => {
      const rect = el.getBoundingClientRect();
      return { id: el.id, w: rect.width, h: rect.height };
    }));
    for (const target of targets) {
      assert.ok(target.w >= 43.5 && target.h >= 43.5, JSON.stringify(target));
    }

    const plan = await opened.page.evaluate(() => {
      const qa = window.HeapwellQA;
      const items = qa.items();
      const bins = qa.snapshot().bins;
      for (const it of items) {
        for (const bin of bins) {
          if (qa.preview(it.id, bin.index).ok) {
            return {
              from: qa.clientPoint(it.x, it.y),
              to: qa.clientPoint(bin.cx, bin.cy),
              sorted: qa.snapshot().sorted
            };
          }
        }
      }
      return null;
    });
    assert.ok(plan, "no legal drag");
    await opened.page.mouse.move(plan.from.x, plan.from.y);
    await opened.page.mouse.down();
    await opened.page.mouse.move(plan.to.x, plan.to.y, { steps: 8 });
    await opened.page.mouse.up();
    const afterDrag = await opened.page.evaluate(() => window.HeapwellQA.snapshot().sorted);
    assert.ok(afterDrag > plan.sorted, "drag did not sort, sorted " + afterDrag);

    const motion = await opened.page.evaluate(() => {
      const qa = window.HeapwellQA;
      qa.setLowMotion(true);
      const items = qa.items();
      const bins = qa.snapshot().bins;
      let bad = null;
      for (const it of items) {
        for (const bin of bins) {
          if (!qa.preview(it.id, bin.index).ok) {
            bad = { id: it.id, bin: bin.index };
            break;
          }
        }
        if (bad) break;
      }
      if (!bad) return { skipped: true };
      const coins = qa.snapshot().coins;
      const res = qa.drop(bad.id, bad.bin);
      const snap = qa.snapshot();
      return { skipped: false, ok: res.ok, shake: snap.shake, coins: snap.coins, before: coins };
    });
    if (!motion.skipped) {
      assert.equal(motion.ok, false);
      assert.equal(motion.shake, 0);
      assert.equal(motion.coins, motion.before);
    }
    assert.deepEqual(notable(opened.errors), [], notable(opened.errors).join("\n"));
  } finally {
    await opened.context.close();
  }
});

test("an auto-player clears seeded Heap 1", { timeout: 120000 }, async () => {
  const opened = await openQa("?qa=1&fresh=1&heap=1&seed=42");
  try {
    const result = await opened.page.evaluate(() => {
      const qa = window.HeapwellQA;
      let steps = 0;
      let stuck = 0;
      let last = -1;
      while (!qa.cleared()) {
        steps += 1;
        if (steps > 8000) return { ok: false, reason: "steps", snap: qa.snapshot() };
        const snap = qa.snapshot();
        if (snap.active > 350 || snap.bodies > 350) {
          return { ok: false, reason: "cap", snap: snap };
        }
        if (snap.sorted === last) stuck += 1;
        else {
          stuck = 0;
          last = snap.sorted;
        }
        if (stuck > 120) return { ok: false, reason: "stuck", steps: steps, snap: snap };
        const items = qa.items();
        const bins = snap.bins;
        let acted = false;
        for (const bin of bins) {
          if (bin.pendingId == null) continue;
          const match = items.find((it) => it.color === bin.pendingColor && it.shape === bin.pendingShape && it.id !== bin.pendingId);
          if (!match) continue;
          const res = qa.drop(match.id, bin.index);
          if (!res.ok) return { ok: false, reason: "pair", res: res, snap: qa.snapshot() };
          acted = true;
          break;
        }
        if (acted) continue;
        const full = bins.find((bin) => bin.full);
        if (full) {
          qa.store(full.index);
          continue;
        }
        let dropped = false;
        for (const bin of bins) {
          for (const it of items) {
            if (!qa.preview(it.id, bin.index).ok) continue;
            const res = qa.drop(it.id, bin.index);
            if (!res.ok) return { ok: false, reason: "drop", res: res, snap: qa.snapshot() };
            dropped = true;
            break;
          }
          if (dropped) break;
        }
        if (dropped) continue;
        const fullest = bins.slice().sort((a, b) => b.count - a.count)[0];
        qa.store(fullest ? fullest.index : 0);
      }
      return { ok: true, steps: steps, snap: qa.snapshot() };
    });
    assert.equal(result.ok, true, JSON.stringify({
      reason: result.reason,
      steps: result.steps,
      sorted: result.snap && result.snap.sorted,
      total: result.snap && result.snap.total,
      legal: result.snap && result.snap.legal,
      reserve: result.snap && result.snap.reserve,
      labels: result.snap && result.snap.bins.map((bin) => bin.label + ":" + bin.count)
    }));
    assert.equal(result.snap.sorted, 600);
    assert.equal(result.snap.total, 600);
    assert.equal(result.snap.cleared, true);
    assert.equal(result.snap.heap, 1);
    assert.equal(result.snap.seed, 42);
    assert.ok(result.snap.coins > 0);
    assert.deepEqual(notable(opened.errors), [], notable(opened.errors).join("\n"));
  } finally {
    await opened.context.close();
  }
});

test("Heapwell save and load restores the run", async () => {
  const opened = await openQa("?qa=1&fresh=1&heap=1&seed=99");
  try {
    const before = await opened.page.evaluate(() => {
      const qa = window.HeapwellQA;
      let guard = 0;
      while (qa.snapshot().sorted < 15 && guard < 400) {
        guard += 1;
        const items = qa.items();
        const bins = qa.snapshot().bins;
        let acted = false;
        for (const bin of bins) {
          if (bin.pendingId != null) {
            const match = items.find((it) => it.color === bin.pendingColor && it.shape === bin.pendingShape);
            if (match) {
              qa.drop(match.id, bin.index);
              acted = true;
              break;
            }
          }
        }
        if (acted) continue;
        const full = bins.find((bin) => bin.full);
        if (full) {
          qa.store(full.index);
          continue;
        }
        for (const bin of bins) {
          const it = items.find((item) => qa.preview(item.id, bin.index).ok);
          if (!it) continue;
          qa.drop(it.id, bin.index);
          acted = true;
          break;
        }
        if (!acted) qa.store(0);
      }
      const bought = qa.buy("magnet");
      qa.setMuted(true);
      qa.setLowMotion(true);
      qa.save();
      const snap = qa.snapshot();
      return { snap: snap, bought: bought, guard: guard };
    });
    assert.ok(before.snap.sorted >= 15, JSON.stringify(before));
    assert.equal(before.bought.ok, true, JSON.stringify(before.bought));
    assert.equal(before.snap.magnet, 1);
    assert.equal(before.snap.muted, true);
    assert.equal(before.snap.lowMotion, true);

    await opened.page.goto(origin + "/games/heapwell/?qa=1", { waitUntil: "load" });
    await opened.page.waitForFunction(() => window.HeapwellQA && window.HeapwellQA.ready);
    const after = await opened.page.evaluate(() => window.HeapwellQA.snapshot());
    assert.equal(after.sorted, before.snap.sorted);
    assert.equal(after.coins, before.snap.coins);
    assert.equal(after.seed, before.snap.seed);
    assert.equal(after.heap, 1);
    assert.equal(after.magnet, 1);
    assert.equal(after.muted, true);
    assert.equal(after.lowMotion, true);
    assert.equal(after.screen, "play");
    assert.deepEqual(notable(opened.errors), [], notable(opened.errors).join("\n"));
  } finally {
    await opened.context.close();
  }
});
