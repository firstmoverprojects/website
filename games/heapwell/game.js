/* Heapwell: top-down pile sort. Matter.js is loaded first (MIT, see vendor/LICENSE). */
(function () {
  "use strict";

  var MAX_ACTIVE = 320;
  var HARD_CAP = 348;
  var TOTAL = 600;
  var SAVE_KEY = "heapwell-save-v1";
  var BIN_BOX = [
    { x: 4, y: 96, w: 74, h: 214 },
    { x: 4, y: 318, w: 74, h: 214 },
    { x: 282, y: 96, w: 74, h: 214 },
    { x: 282, y: 318, w: 74, h: 214 }
  ];
  var COST = {
    magnet: [12, 36, 80, 140, 220],
    sieve: [16, 44, 96, 160],
    conveyor: [20, 55, 120],
    bins: [10, 28, 64, 110, 180]
  };
  var COLOR = {
    red: { name: "Red", fill: "#d4534a", ink: "#3a1614" },
    blue: { name: "Blue", fill: "#3d7ebf", ink: "#102033" },
    gold: { name: "Gold", fill: "#e0a43a", ink: "#3a2a0c" },
    green: { name: "Green", fill: "#5f9a55", ink: "#142014" },
    cream: { name: "Cream", fill: "#f3e6cf", ink: "#3a3224" },
    violet: { name: "Violet", fill: "#8d6aad", ink: "#24182e" }
  };
  var SHAPE_WORD = {
    button: "Buttons",
    bead: "Beads",
    washer: "Washers",
    leaf: "Leaves",
    shell: "Shells"
  };
  var SHAPE_ONE = {
    button: "Button",
    bead: "Bead",
    washer: "Washer",
    leaf: "Leaf",
    shell: "Shell"
  };
  var SHAPE_MANY = {
    button: "buttons",
    bead: "beads",
    washer: "washers",
    leaf: "leaves",
    shell: "shells"
  };
  var FAMILIES = {
    1: {
      name: "Button Tin",
      blurb: "Color first. The cards ask for more as the pile clears.",
      shapes: ["button", "bead"],
      colors: ["red", "blue", "gold", "green"],
      phases: ["color", "shape", "and", "pair"]
    },
    2: {
      name: "Washer Well",
      blurb: "Washers and beads. Shape leads, then shape and color.",
      shapes: ["washer", "bead"],
      colors: ["blue", "gold", "cream", "violet"],
      phases: ["shape", "color", "and", "pair"]
    },
    3: {
      name: "Shell Sill",
      blurb: "Shells and beads. The cards ask for two traits at once.",
      shapes: ["shell", "bead"],
      colors: ["blue", "cream", "red", "violet"],
      phases: ["and", "and", "and", "pair"]
    },
    4: {
      name: "Leaf Ledger",
      blurb: "Leaves and shells. Keep pairs.",
      shapes: ["leaf", "shell"],
      colors: ["green", "gold", "red", "cream"],
      phases: ["pair", "pair", "pair", "color"]
    },
    5: {
      name: "Whole Cupboard",
      blurb: "Every family. Each bin keeps its own kind of rule.",
      shapes: ["button", "bead", "washer", "leaf", "shell"],
      colors: ["red", "blue", "gold", "green", "cream", "violet"],
      phases: ["mix", "mix", "mix", "mix"]
    }
  };
  var CALM_FAMILY = {
    name: "Calm Heap",
    blurb: "No timer. Sort as long as you like.",
    shapes: ["button", "bead", "washer", "leaf", "shell"],
    colors: ["red", "blue", "gold", "green", "cream"],
    phases: ["color", "shape"]
  };
  var DAILY_FAMILY = {
    name: "Daily Heap",
    blurb: "Same pile for everyone on this date.",
    shapes: ["button", "bead", "washer", "leaf", "shell"],
    colors: ["red", "blue", "gold", "green", "cream", "violet"],
    phases: ["color", "shape", "and", "pair"]
  };

  var params = new URLSearchParams(window.location.search);
  var qaOn = params.get("qa") === "1";
  var portalOn = params.get("portal") === "cg";
  var sessionT0 = performance.now();

  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var frame = document.getElementById("frame");
  var overlay = document.getElementById("overlay");
  var panelTitle = document.getElementById("panel-title");
  var panelCopy = document.getElementById("panel-copy");
  var panelActions = document.getElementById("panel-actions");
  var heapName = document.getElementById("heap-name");
  var clearedEl = document.getElementById("cleared");
  var meter = document.getElementById("meter");
  var barFill = document.getElementById("bar-fill");
  var coinsEl = document.getElementById("coins");
  var btnPause = document.getElementById("btn-pause");
  var btnMute = document.getElementById("btn-mute");
  var btnMotion = document.getElementById("btn-motion");
  var binButtons = [0, 1, 2, 3].map(function (i) { return document.getElementById("bin-" + i); });

  var engine = Matter.Engine.create({
    enableSleeping: true,
    positionIterations: 3,
    velocityIterations: 2,
    constraintIterations: 1
  });
  engine.gravity.x = 0;
  engine.gravity.y = 0;
  engine.gravity.scale = 0;
  engine.enableSleeping = true;

  var settings = {
    v: 1,
    coins: 0,
    muted: false,
    lowMotion: false,
    unlocked: 1,
    best: {},
    dailyCleared: "",
    upgrades: { magnet: 0, sieve: 0, conveyor: 0, bins: 0 }
  };
  var items = new Map();
  var world = new Map();
  var sorted = new Set();
  var held = new Set();
  var reserve = [];
  var bins = [];
  var family = null;
  var run = null;
  var screen = "menu";
  var drag = null;
  var suppressClick = false;
  var shake = 0;
  var fps = 0;
  var fpsSamples = [];
  var lastT = 0;
  var magnetAcc = 0;
  var sieveAcc = 0;
  var slotSerial = 0;
  var freeSlots = [];
  var flashes = [];
  var gestured = false;
  var audioCtx = null;
  var adMuted = false;
  var saveTimer = 0;
  var portalReady = false;
  var cgPlay = false;
  var cgWantPlay = false;
  var adLog = [];
  var ready = false;
  var reducedMotion = false;

  try {
    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (err) {
    reducedMotion = false;
  }
  if (reducedMotion) settings.lowMotion = true;

  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t = (t + 0x6d2b79f5) >>> 0;
      var x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function todayKey() {
    if (qaOn && params.get("date")) return String(params.get("date"));
    return new Date().toISOString().slice(0, 10);
  }

  function isRound(shape) {
    return shape === "button" || shape === "bead" || shape === "washer";
  }

  function buildItem(seed, fam, id) {
    var rng = mulberry32((seed ^ Math.imul(id >> 1, 0x9e3779b1)) >>> 0);
    var shape = fam.shapes[Math.floor(rng() * fam.shapes.length)];
    var color = fam.colors[Math.floor(rng() * fam.colors.length)];
    var size = rng() < 0.42 ? "small" : "large";
    return {
      id: id,
      shape: shape,
      color: color,
      size: size,
      round: isRound(shape),
      holes: shape === "button" ? (rng() < 0.5 ? 2 : 4) : 0,
      spin: rng() * Math.PI * 2,
      radius: size === "small" ? 4.4 : 5.2
    };
  }

  function freshBins() {
    bins = [0, 1, 2, 3].map(function () {
      return { rule: null, count: 0, full: false, pending: null, convey: 0 };
    });
  }

  function capacity() {
    return 10 + settings.upgrades.bins * 6;
  }

  function activeCap() {
    return run && run.endless ? 200 : MAX_ACTIVE;
  }

  function phaseKind() {
    if (!run) return "color";
    if (run.endless) return Math.floor(sorted.size / 40) % 2 === 0 ? "color" : "shape";
    var phases = family.phases;
    var p = run.total ? sorted.size / run.total : 0;
    var i = Math.min(phases.length - 1, Math.floor(p * phases.length));
    return phases[i];
  }

  function ruleFromItem(it, kind) {
    if (kind === "shape") return { kind: "shape", shape: it.shape, label: SHAPE_WORD[it.shape] };
    if (kind === "and") {
      if (it.round) {
        return { kind: "and", round: true, color: it.color, label: "Round AND " + COLOR[it.color].name.toLowerCase() };
      }
      return {
        kind: "and",
        shape: it.shape,
        color: it.color,
        label: SHAPE_ONE[it.shape] + " AND " + COLOR[it.color].name.toLowerCase()
      };
    }
    if (kind === "pair") {
      return {
        kind: "pair",
        shape: it.shape,
        color: it.color,
        label: "Pairs of " + COLOR[it.color].name.toLowerCase() + " " + SHAPE_MANY[it.shape]
      };
    }
    return { kind: "color", color: it.color, label: COLOR[it.color].name };
  }

  function matches(rule, it) {
    if (!rule || !it) return false;
    if (rule.kind === "color") return it.color === rule.color;
    if (rule.kind === "shape") return it.shape === rule.shape;
    if (rule.kind === "and") {
      if (it.color !== rule.color) return false;
      if (rule.round) return it.round === true;
      if (rule.shape) return it.shape === rule.shape;
      return false;
    }
    if (rule.kind === "pair") return it.color === rule.color && it.shape === rule.shape;
    return false;
  }

  function countSignature(shape, color) {
    var n = 0;
    items.forEach(function (it) {
      if (sorted.has(it.id)) return;
      if (it.shape === shape && it.color === color) n += 1;
    });
    return n;
  }

  function canDrop(it, bin) {
    if (!it || !bin || !bin.rule) return false;
    if (screen !== "play") return false;
    if (sorted.has(it.id) || held.has(it.id)) return false;
    if (bin.rule.kind === "pair" && bin.pending) {
      return bin.pending.shape === it.shape && bin.pending.color === it.color && bin.pending.id !== it.id;
    }
    if (bin.full) return false;
    if (!matches(bin.rule, it)) return false;
    if (bin.rule.kind === "pair") {
      var reserved = bins.some(function (other) {
        return other !== bin && other.pending && other.pending.shape === it.shape && other.pending.color === it.color;
      });
      if (reserved) return false;
      return countSignature(it.shape, it.color) >= 2;
    }
    return true;
  }

  function remainingItems() {
    var out = [];
    items.forEach(function (it) {
      if (!sorted.has(it.id)) out.push(it);
    });
    return out;
  }

  function slotPos(index) {
    var cols = 13;
    var cell = 13;
    var col = index % cols;
    var row = Math.floor(index / cols);
    var w = cols * cell;
    var jx = ((index * 3) % 5) - 2;
    var jy = ((index * 5) % 5) - 2;
    return {
      x: 180 - w / 2 + cell / 2 + col * cell + jx * 0.35,
      y: 188 + row * cell + jy * 0.35
    };
  }

  function takeSlot() {
    return freeSlots.length ? freeSlots.pop() : slotSerial++;
  }

  function spawnId(id) {
    var it = items.get(id);
    if (!it || world.has(id) || sorted.has(id) || held.has(id)) return;
    var slot = takeSlot();
    var pos = slotPos(slot % 338);
    var body = Matter.Bodies.circle(pos.x, pos.y, it.radius, {
      frictionAir: 0.28,
      friction: 0.02,
      restitution: 0.02,
      density: 0.001,
      slop: 0.15,
      sleepThreshold: 18,
      label: "bit"
    }, 10);
    body.itemId = id;
    body.slot = slot;
    Matter.Composite.add(engine.world, body);
    world.set(id, body);
  }

  function removeBody(id) {
    var body = world.get(id);
    if (!body) return;
    freeSlots.push(body.slot);
    Matter.Composite.remove(engine.world, body);
    world.delete(id);
  }

  function bringToWorld(id) {
    if (id == null || world.has(id) || sorted.has(id) || held.has(id)) return;
    var idx = reserve.indexOf(id);
    if (idx === -1) return;
    if (world.size >= HARD_CAP) return;
    reserve.splice(idx, 1);
    spawnId(id);
  }

  function findPartner(it) {
    var found = null;
    world.forEach(function (body, id) {
      if (found != null || id === it.id) return;
      var other = items.get(id);
      if (other && other.shape === it.shape && other.color === it.color) found = id;
    });
    if (found != null) return found;
    for (var i = 0; i < reserve.length; i++) {
      var other = items.get(reserve[i]);
      if (other && other.id !== it.id && other.shape === it.shape && other.color === it.color) return reserve[i];
    }
    return null;
  }

  function spawnNext() {
    var cap = activeCap();
    if (world.size >= cap) return false;
    if (!reserve.length) {
      if (run && run.endless) generateCalm(16);
      if (!reserve.length) return false;
    }
    var pick = 0;
    for (var i = 0; i < reserve.length; i++) {
      var it = items.get(reserve[i]);
      if (it && bins.some(function (b) { return canDrop(it, b); })) {
        pick = i;
        break;
      }
    }
    var id = reserve.splice(pick, 1)[0];
    spawnId(id);
    return true;
  }

  function refill(limit) {
    if (!run || (screen !== "play" && screen !== "paused")) return;
    var guard = 0;
    var max = limit || 16;
    while (world.size < activeCap() && guard < max) {
      if (!spawnNext()) break;
      guard += 1;
    }
  }

  function generateCalm(n) {
    for (var i = 0; i < n; i++) {
      var id = run.nextId++;
      items.set(id, buildItem(run.seed, family, id));
      reserve.push(id);
    }
  }

  function legalInWorld() {
    var n = 0;
    world.forEach(function (body, id) {
      var it = items.get(id);
      if (!it) return;
      for (var i = 0; i < bins.length; i++) {
        if (canDrop(it, bins[i])) {
          n += 1;
          return;
        }
      }
    });
    return n;
  }

  function retargetEmpty() {
    var list = remainingItems().filter(function (it) { return !held.has(it.id); });
    var uncovered = list.filter(function (it) {
      return !bins.some(function (b) { return canDrop(it, b); });
    });
    if (!uncovered.length) return;
    var kind = run.kind === "mix" ? "color" : run.kind;
    var used = 0;
    for (var i = 0; i < bins.length && used < uncovered.length; i++) {
      var bin = bins[i];
      if (bin.pending || bin.full || bin.count > 0) continue;
      var it = uncovered[used];
      var use = kind === "pair" && countSignature(it.shape, it.color) < 2 ? "color" : kind;
      if (use === "mix") use = "color";
      bin.rule = ruleFromItem(it, use);
      bringToWorld(it.id);
      used += 1;
    }
  }

  function parkNonMatching() {
    var ids = [];
    world.forEach(function (body, id) {
      var it = items.get(id);
      if (!it) return;
      var ok = bins.some(function (b) { return canDrop(it, b); });
      if (!ok) ids.push(id);
    });
    ids.forEach(function (id) {
      removeBody(id);
      reserve.push(id);
    });
  }

  function healPile() {
    if (screen !== "play") return;
    if (legalInWorld() > 0) return;
    bins.forEach(function (bin) {
      if (bin.full || bin.pending) return;
      var supplied = remainingItems().some(function (it) { return canDrop(it, bin); });
      if (!supplied) bin.count = 0;
    });
    retargetEmpty();
    if (legalInWorld() > 0) return;
    if (bins.some(function (b) { return !b.full; })) {
      parkNonMatching();
      refill();
    }
  }

  function releasePending() {
    bins.forEach(function (bin) {
      if (!bin.pending) return;
      var id = bin.pending.id;
      held.delete(id);
      if (!sorted.has(id)) reserve.unshift(id);
      bin.pending = null;
    });
  }

  function assignRules(kind) {
    var list = remainingItems().filter(function (it) { return !held.has(it.id); });
    if (!list.length) return;
    if (kind === "mix") {
      var kinds = ["color", "shape", "and", "pair"];
      for (var i = 0; i < bins.length; i++) {
        if (bins[i].pending) continue;
        var sample = list[(i * 17) % list.length];
        var use = kinds[i % 4];
        if (use === "pair" && countSignature(sample.shape, sample.color) < 2) use = "color";
        if (use === "and" && !sample.round && sample.shape === "button") use = "color";
        bins[i].rule = ruleFromItem(sample, use);
        bins[i].count = 0;
        bins[i].full = false;
        bins[i].convey = 0;
      }
      retargetEmpty();
      return;
    }
    var map = new Map();
    list.forEach(function (it) {
      var key = kind + ":" + (kind === "color" ? it.color : kind === "shape" ? it.shape : kind === "pair" ? it.shape + it.color : (it.round ? "round" : it.shape) + it.color);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    });
    var entries = Array.from(map.values());
    if (kind === "pair") entries = entries.filter(function (arr) { return arr.length >= 2; });
    if (!entries.length) {
      if (kind !== "color") assignRules("color");
      return;
    }
    entries.sort(function (a, b) { return b.length - a.length; });
    for (var b = 0; b < bins.length; b++) {
      if (bins[b].pending) continue;
      var group = entries[b % entries.length];
      var useKind = kind === "pair" && group.length < 2 ? "color" : kind;
      bins[b].rule = ruleFromItem(group[0], useKind);
      bins[b].count = 0;
      bins[b].full = false;
      bins[b].convey = 0;
    }
    retargetEmpty();
  }

  function payFor(kind) {
    if (kind === "shape") return 2;
    if (kind === "and") return 3;
    if (kind === "pair") return 4;
    return 1;
  }

  function percentNow() {
    if (!run) return 0;
    if (run.endless) return sorted.size % 100;
    if (!run.total) return 0;
    return Math.max(0, Math.min(100, Math.floor((sorted.size / run.total) * 100)));
  }

  function uiSync() {
    var pct = percentNow();
    meter.setAttribute("aria-valuenow", String(pct));
    if (run && run.endless) {
      clearedEl.textContent = pct + "% cleared · " + sorted.size + " sorted";
    } else if (run && run.total) {
      clearedEl.textContent = pct + "% · " + sorted.size + " of " + run.total;
    } else {
      clearedEl.textContent = "0% cleared";
    }
    var bar = pct;
    if (run && run.total && sorted.size > 0) bar = Math.max(bar, (sorted.size / run.total) * 100, 1.5);
    barFill.style.width = Math.min(100, bar) + "%";
    coinsEl.textContent = settings.coins + (settings.coins === 1 ? " coin" : " coins");
    heapName.textContent = family ? family.name : "Choose a heap";
    btnMute.textContent = settings.muted ? "Muted" : "Mute";
    btnMute.setAttribute("aria-pressed", settings.muted ? "true" : "false");
    btnMotion.textContent = settings.lowMotion ? "Low motion on" : "Low motion off";
    btnMotion.setAttribute("aria-pressed", settings.lowMotion ? "true" : "false");
    syncShop("magnet", "buy-magnet", "Magnet");
    syncShop("sieve", "buy-sieve", "Sieve");
    syncShop("conveyor", "buy-conveyor", "Conveyor");
    syncShop("bins", "buy-bins", "Bigger bins");
    for (var i = 0; i < 4; i++) {
      var bin = bins[i];
      var btn = binButtons[i];
      if (!bin || !bin.rule) {
        btn.querySelector(".rule").textContent = "Bin";
        btn.querySelector(".meta").textContent = "";
        btn.classList.remove("full");
        continue;
      }
      btn.querySelector(".rule").textContent = bin.rule.label;
      var meta = bin.count + "/" + capacity();
      if (bin.pending) meta = "Held 1";
      if (bin.full) meta = "Full · tap";
      btn.querySelector(".meta").textContent = meta;
      btn.classList.toggle("full", !!bin.full);
    }
  }

  function syncShop(key, id, label) {
    var btn = document.getElementById(id);
    var level = settings.upgrades[key];
    var ladder = COST[key];
    var name = btn.querySelector(".nm");
    var cost = btn.querySelector(".cs");
    name.textContent = level ? label + " " + level : label;
    if (level >= ladder.length) {
      cost.textContent = "Max";
      btn.disabled = true;
    } else {
      cost.textContent = String(ladder[level]);
      btn.disabled = settings.coins < ladder[level];
    }
  }

  function saveSoon() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(save, 180);
  }

  function payload() {
    var data = {
      v: 1,
      coins: settings.coins,
      muted: settings.muted,
      lowMotion: settings.lowMotion,
      unlocked: settings.unlocked,
      best: settings.best,
      dailyCleared: settings.dailyCleared,
      upgrades: settings.upgrades,
      run: null
    };
    if (run && (screen === "play" || screen === "paused" || screen === "between")) {
      data.run = {
        type: run.type,
        heap: run.heap,
        seed: run.seed,
        day: run.day || "",
        endless: !!run.endless,
        total: run.total,
        nextId: run.nextId || 0,
        kind: run.kind,
        sorted: Array.from(sorted),
        coinsEarned: run.coinsEarned || 0,
        bins: bins.map(function (bin) {
          return {
            rule: bin.rule,
            count: bin.count,
            full: bin.full,
            pending: bin.pending
          };
        })
      };
    }
    return data;
  }

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload()));
    } catch (err) {
      /* private mode or a full disk: the heap still plays */
    }
  }

  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || data.v !== 1) return null;
      return data;
    } catch (err) {
      return null;
    }
  }

  function applySettings(data) {
    if (!data) return;
    settings.coins = data.coins || 0;
    settings.muted = !!data.muted;
    settings.lowMotion = !!data.lowMotion;
    settings.unlocked = data.unlocked || 1;
    settings.best = data.best || {};
    settings.dailyCleared = data.dailyCleared || "";
    var up = data.upgrades || {};
    settings.upgrades = {
      magnet: up.magnet || 0,
      sieve: up.sieve || 0,
      conveyor: up.conveyor || 0,
      bins: up.bins || 0
    };
  }

  function clearWorld() {
    Array.from(world.keys()).forEach(removeBody);
    items = new Map();
    sorted = new Set();
    held = new Set();
    reserve = [];
    freeSlots = [];
    slotSerial = 0;
    magnetAcc = 0;
    sieveAcc = 0;
    flashes = [];
  }

  function familyFor(type, heap) {
    if (type === "calm") return CALM_FAMILY;
    if (type === "daily") return DAILY_FAMILY;
    return FAMILIES[heap] || FAMILIES[1];
  }

  function beginRun(spec) {
    clearWorld();
    family = familyFor(spec.type, spec.heap);
    run = {
      type: spec.type,
      heap: spec.heap || 0,
      seed: spec.seed >>> 0,
      day: spec.day || "",
      endless: spec.type === "calm",
      total: spec.type === "calm" ? 0 : TOTAL,
      nextId: spec.nextId || 0,
      kind: spec.kind || "",
      coinsEarned: spec.coinsEarned || 0,
      key: spec.type === "heap" ? String(spec.heap) : spec.type
    };
    freshBins();
    screen = "play";
    if (spec.sorted) spec.sorted.forEach(function (id) { sorted.add(id); });
    if (run.endless) {
      if (!run.nextId) run.nextId = 0;
      generateCalm(220);
    } else {
      for (var id = 0; id < TOTAL; id++) {
        items.set(id, buildItem(run.seed, family, id));
        if (!sorted.has(id)) reserve.push(id);
      }
      var rng = mulberry32(run.seed ^ 0x51ed);
      for (var i = reserve.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1));
        var tmp = reserve[i];
        reserve[i] = reserve[j];
        reserve[j] = tmp;
      }
    }
    if (spec.bins && spec.bins.length === 4) {
      spec.bins.forEach(function (saved, index) {
        bins[index].rule = saved.rule;
        bins[index].count = saved.count || 0;
        bins[index].full = !!saved.full;
        bins[index].pending = saved.pending || null;
        if (saved.pending) held.add(saved.pending.id);
      });
      run.kind = spec.kind || phaseKind();
    } else {
      run.kind = phaseKind();
      assignRules(run.kind);
    }
    hideOverlay();
    refill(80);
    healPile();
    uiSync();
    cgStart();
    save();
  }

  function startHeap(heap, seed) {
    beginRun({ type: "heap", heap: heap, seed: seed });
  }

  function startCalm(seed) {
    beginRun({ type: "calm", heap: 0, seed: seed });
  }

  function startDaily() {
    var day = todayKey();
    beginRun({ type: "daily", heap: 0, seed: hashString("daily-" + day) || 1, day: day });
  }

  function resumeSaved(data) {
    if (!data || !data.run) return false;
    var saved = data.run;
    beginRun({
      type: saved.type,
      heap: saved.heap,
      seed: saved.seed,
      day: saved.day,
      nextId: saved.nextId,
      kind: saved.kind,
      sorted: saved.sorted,
      coinsEarned: saved.coinsEarned,
      bins: saved.bins
    });
    return true;
  }

  function anyPending() {
    return bins.some(function (bin) { return !!bin.pending; });
  }

  function finishHeap() {
    if (!run || run.endless) return;
    screen = "between";
    settings.best[run.key] = 100;
    if (run.type === "heap") settings.unlocked = Math.max(settings.unlocked, run.heap + 1);
    if (run.type === "daily") settings.dailyCleared = run.day;
    settings.coins += 25;
    run.coinsEarned += 25;
    cgStop();
    showBetween();
    save();
    uiSync();
  }

  function afterChange(scored) {
    if (!run || screen !== "play") return;
    if (scored) {
      var next = phaseKind();
      if (next !== run.kind) {
        run.kind = next;
        releasePending();
        bins.forEach(function (bin) {
          bin.count = 0;
          bin.full = false;
          bin.convey = 0;
        });
        assignRules(run.kind);
      } else {
        retargetEmpty();
      }
      if (!run.endless && sorted.size >= run.total && !anyPending()) {
        finishHeap();
        return;
      }
    }
    healPile();
    refill();
    uiSync();
    saveSoon();
  }

  function flashAt(it, binIndex) {
    if (!it) return;
    var box = BIN_BOX[binIndex];
    flashes.push({
      x: box.x + box.w / 2,
      y: box.y + 36,
      color: COLOR[it.color].fill,
      life: 1
    });
  }

  function tryDrop(id, binIndex) {
    var it = items.get(id);
    var bin = bins[binIndex];
    if (!it || !bin) return { ok: false, reason: "missing" };
    if (!canDrop(it, bin)) {
      shake = settings.lowMotion || screen !== "play" ? 0 : Math.min(8, shake + 5);
      thud();
      return { ok: false, reason: "rule" };
    }
    if (bin.rule.kind === "pair" && !bin.pending) {
      var partner = findPartner(it);
      removeBody(id);
      held.add(id);
      bin.pending = { id: id, color: it.color, shape: it.shape };
      if (partner != null) bringToWorld(partner);
      tick();
      afterChange(false);
      return { ok: true, reason: "hold" };
    }
    if (bin.rule.kind === "pair" && bin.pending) {
      var pid = bin.pending.id;
      removeBody(id);
      held.delete(pid);
      sorted.add(pid);
      sorted.add(id);
      bin.pending = null;
      bin.count += 2;
      if (bin.count >= capacity()) bin.full = true;
      settings.coins += 4;
      run.coinsEarned += 4;
      chime();
      flashAt(it, binIndex);
      afterChange(true);
      return { ok: true, reason: "pair" };
    }
    removeBody(id);
    sorted.add(id);
    bin.count += 1;
    if (bin.count >= capacity()) bin.full = true;
    var pay = payFor(bin.rule.kind);
    settings.coins += pay;
    run.coinsEarned += pay;
    chime();
    flashAt(it, binIndex);
    afterChange(true);
    return { ok: true, reason: "ok" };
  }

  function bounce(id) {
    var body = world.get(id);
    if (!body) return;
    var ang = Math.atan2(320 - body.position.y, 180 - body.position.x);
    Matter.Body.setPosition(body, { x: 180 + Math.cos(ang) * 28, y: 320 + Math.sin(ang) * 22 });
    Matter.Body.setVelocity(body, { x: Math.cos(ang) * 5, y: Math.sin(ang) * 4 });
    Matter.Sleeping.set(body, false);
    body.collisionFilter.mask = 4294967295;
  }

  function storeBin(index) {
    var bin = bins[index];
    if (!bin || screen !== "play") return { ok: false, reason: "closed" };
    if (bin.pending) {
      var id = bin.pending.id;
      held.delete(id);
      if (!sorted.has(id)) reserve.unshift(id);
      bin.pending = null;
    }
    bin.count = 0;
    bin.full = false;
    bin.convey = 0;
    retargetEmpty();
    healPile();
    refill();
    uiSync();
    saveSoon();
    return { ok: true };
  }

  function buy(name) {
    var ladder = COST[name];
    if (!ladder) return { ok: false, reason: "missing" };
    var level = settings.upgrades[name];
    if (level >= ladder.length) return { ok: false, reason: "max" };
    var cost = ladder[level];
    if (settings.coins < cost) return { ok: false, reason: "coins" };
    settings.coins -= cost;
    settings.upgrades[name] = level + 1;
    save();
    uiSync();
    return { ok: true, level: settings.upgrades[name] };
  }

  function pullMatch(smallOnly) {
    var choice = null;
    var binIndex = -1;
    world.forEach(function (body, id) {
      if (choice) return;
      var it = items.get(id);
      if (!it) return;
      if (smallOnly && it.size !== "small") return;
      for (var i = 0; i < bins.length; i++) {
        if (canDrop(it, bins[i])) {
          choice = id;
          binIndex = i;
          return;
        }
      }
    });
    if (choice == null) return;
    var it = items.get(choice);
    tryDrop(choice, binIndex);
    if (it) flashAt(it, binIndex);
  }

  function updateIdle(dt) {
    if (screen !== "play" || !run) return;
    var magnet = settings.upgrades.magnet;
    if (magnet > 0) {
      magnetAcc += dt;
      var everyM = Math.max(2500, 8000 - (magnet - 1) * 1400);
      if (magnetAcc >= everyM) {
        magnetAcc = 0;
        pullMatch(false);
      }
    }
    var sieve = settings.upgrades.sieve;
    if (sieve > 0) {
      sieveAcc += dt;
      var everyS = Math.max(2000, 6000 - (sieve - 1) * 1100);
      if (sieveAcc >= everyS) {
        sieveAcc = 0;
        pullMatch(true);
      }
    }
    var belt = settings.upgrades.conveyor;
    if (belt > 0) {
      var delay = Math.max(700, 2200 - (belt - 1) * 500);
      bins.forEach(function (bin, index) {
        if (!bin.full) {
          bin.convey = 0;
          return;
        }
        bin.convey += dt;
        if (bin.convey >= delay) storeBin(index);
      });
    }
  }

  function binAt(x, y) {
    for (var i = 0; i < BIN_BOX.length; i++) {
      var b = BIN_BOX[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return i;
    }
    return -1;
  }

  function toLogical(e) {
    var rect = canvas.getBoundingClientRect();
    var w = rect.width || 360;
    var h = rect.height || 640;
    return {
      x: ((e.clientX - rect.left) * 360) / w,
      y: ((e.clientY - rect.top) * 640) / h
    };
  }

  function nearest(x, y, maxDist) {
    var best = null;
    var bestD = maxDist * maxDist;
    world.forEach(function (body, id) {
      var dx = body.position.x - x;
      var dy = body.position.y - y;
      var d = dx * dx + dy * dy;
      if (d <= bestD) {
        bestD = d;
        best = id;
      }
    });
    return best;
  }

  function onDown(e) {
    gestured = true;
    if (screen !== "play") return;
    var p = toLogical(e);
    var hit = nearest(p.x, p.y, 28);
    if (hit == null) return;
    var body = world.get(hit);
    if (!body) return;
    drag = { id: hit, x: p.x, y: p.y, lx: p.x, ly: p.y, t: performance.now() };
    body.collisionFilter.mask = 0;
    Matter.Sleeping.set(body, false);
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* already released */ }
    }
  }

  function onMove(e) {
    if (!drag) return;
    var p = toLogical(e);
    var body = world.get(drag.id);
    if (!body) {
      drag = null;
      return;
    }
    Matter.Body.setPosition(body, p);
    Matter.Body.setVelocity(body, { x: 0, y: 0 });
    drag.lx = drag.x;
    drag.ly = drag.y;
    drag.x = p.x;
    drag.y = p.y;
    drag.t = performance.now();
  }

  function onUp(e) {
    if (!drag) return;
    suppressClick = true;
    var p = toLogical(e);
    var id = drag.id;
    var body = world.get(id);
    var dt = Math.max(16, performance.now() - drag.t);
    var vx = ((p.x - drag.lx) / dt) * 16.667;
    var vy = ((p.y - drag.ly) / dt) * 16.667;
    var sp = Math.hypot(vx, vy);
    if (sp > 14) {
      vx = (vx / sp) * 14;
      vy = (vy / sp) * 14;
    }
    drag = null;
    if (body) {
      body.collisionFilter.mask = 4294967295;
      Matter.Body.setPosition(body, p);
      Matter.Body.setVelocity(body, { x: vx, y: vy });
      Matter.Sleeping.set(body, false);
    }
    var bin = binAt(p.x, p.y);
    if (bin >= 0) {
      var res = tryDrop(id, bin);
      if (!res.ok) bounce(id);
    }
  }

  function checkFlicks() {
    if (screen !== "play" || drag) return;
    var hits = [];
    world.forEach(function (body, id) {
      if (body.isSleeping) return;
      var speed = Math.hypot(body.velocity.x, body.velocity.y);
      if (speed < 2) return;
      var bin = binAt(body.position.x, body.position.y);
      if (bin >= 0) hits.push({ id: id, bin: bin });
    });
    hits.forEach(function (hit) {
      var res = tryDrop(hit.id, hit.bin);
      if (!res.ok && world.has(hit.id)) bounce(hit.id);
    });
  }

  function ac() {
    if (!gestured || settings.muted || adMuted) return null;
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { audioCtx = new AC(); } catch (err) { return null; }
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(function () {});
    return audioCtx;
  }

  function tone(freq, when, dur, gain) {
    var actx = ac();
    if (!actx) return;
    var osc = actx.createOscillator();
    var amp = actx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(Math.max(0.0001, gain), when);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(amp);
    amp.connect(actx.destination);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  function chime() {
    var actx = ac();
    if (!actx) return;
    var t = actx.currentTime;
    tone(660, t, 0.09, 0.05);
    tone(990, t + 0.07, 0.12, 0.04);
  }

  function tick() {
    var actx = ac();
    if (!actx) return;
    tone(520, actx.currentTime, 0.05, 0.03);
  }

  function thud() {
    var actx = ac();
    if (!actx) return;
    tone(140, actx.currentTime, 0.08, 0.04);
  }

  function drawButton(g, r, color, holes) {
    g.fillStyle = color.fill;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = color.ink;
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = color.ink;
    var n = holes || 2;
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + (i * Math.PI * 2) / n;
      g.beginPath();
      g.arc(Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38, Math.max(0.7, r * 0.16), 0, Math.PI * 2);
      g.fill();
    }
  }

  function drawBead(g, r, color) {
    g.fillStyle = color.fill;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.65)";
    g.beginPath();
    g.arc(-r * 0.28, -r * 0.32, Math.max(0.8, r * 0.28), 0, Math.PI * 2);
    g.fill();
  }

  function drawWasher(g, r, color) {
    g.strokeStyle = color.fill;
    g.lineWidth = Math.max(1.4, r * 0.55);
    g.beginPath();
    g.arc(0, 0, r * 0.62, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = color.ink;
    g.lineWidth = 0.6;
    g.beginPath();
    g.arc(0, 0, r * 0.9, 0, Math.PI * 2);
    g.stroke();
  }

  function drawLeaf(g, r, color) {
    g.fillStyle = color.fill;
    g.beginPath();
    g.moveTo(0, -r);
    g.quadraticCurveTo(r * 1.15, -r * 0.15, 0, r);
    g.quadraticCurveTo(-r * 1.15, -r * 0.15, 0, -r);
    g.fill();
    g.strokeStyle = color.ink;
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(0, -r * 0.65);
    g.lineTo(0, r * 0.7);
    g.stroke();
  }

  function drawShell(g, r, color) {
    g.fillStyle = color.fill;
    g.beginPath();
    g.arc(0, r * 0.2, r, Math.PI * 1.05, Math.PI * 1.95);
    g.lineTo(0, r * 0.95);
    g.closePath();
    g.fill();
    g.strokeStyle = color.ink;
    g.lineWidth = 0.7;
    for (var i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(0, r * 0.85);
      g.lineTo(Math.sin(i * 0.4) * r * 0.85, -r * 0.45);
      g.stroke();
    }
  }

  function drawItem(it, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(it.spin);
    ctx.scale(scale, scale);
    var color = COLOR[it.color] || COLOR.cream;
    if (it.shape === "button") drawButton(ctx, it.radius, color, it.holes);
    else if (it.shape === "bead") drawBead(ctx, it.radius, color);
    else if (it.shape === "washer") drawWasher(ctx, it.radius, color);
    else if (it.shape === "leaf") drawLeaf(ctx, it.radius, color);
    else drawShell(ctx, it.radius, color);
    ctx.restore();
  }

  function render() {
    var ox = 0;
    var oy = 0;
    if (shake > 0.25 && !settings.lowMotion) {
      ox = (Math.random() - 0.5) * shake;
      oy = (Math.random() - 0.5) * shake;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 360, 640);
    ctx.fillStyle = "#241c16";
    ctx.fillRect(0, 0, 360, 640);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.fillStyle = "#3b2e24";
    ctx.beginPath();
    ctx.ellipse(180, 330, 92, 150, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#6d563f";
    ctx.lineWidth = 3;
    ctx.stroke();
    BIN_BOX.forEach(function (box) {
      ctx.fillStyle = "rgba(18, 42, 48, 0.35)";
      roundRect(box.x, box.y, box.w, box.h, 12);
      ctx.fill();
    });
    var heldId = drag ? drag.id : null;
    var heldBody = null;
    world.forEach(function (body, id) {
      if (id === heldId) {
        heldBody = body;
        return;
      }
      var it = items.get(id);
      if (!it) return;
      drawItem(it, body.position.x, body.position.y, 1);
    });
    if (heldBody) {
      var heldItem = items.get(heldId);
      if (heldItem) drawItem(heldItem, heldBody.position.x, heldBody.position.y, 1.7);
    }
    for (var i = flashes.length - 1; i >= 0; i--) {
      var flash = flashes[i];
      if (settings.lowMotion) {
        flashes.splice(i, 1);
        continue;
      }
      flash.life -= 0.08;
      if (flash.life <= 0) {
        flashes.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = flash.life;
      ctx.strokeStyle = flash.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(flash.x, flash.y, (1 - flash.life) * 16 + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function frameStep(t) {
    window.requestAnimationFrame(frameStep);
    var dt = lastT ? Math.min(34, t - lastT) : 16.6;
    lastT = t;
    fpsSamples.push(t);
    while (fpsSamples.length && t - fpsSamples[0] > 1000) fpsSamples.shift();
    fps = fpsSamples.length;
    if (screen === "play") {
      refill(10);
      updateIdle(dt);
      checkFlicks();
      Matter.Engine.update(engine, 1000 / 60);
    }
    if (settings.lowMotion) shake = 0;
    else if (shake > 0) {
      shake *= 0.86;
      if (shake < 0.25) shake = 0;
    }
    render();
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  function showOverlay() {
    overlay.hidden = false;
  }

  function clearActions() {
    panelActions.textContent = "";
  }

  function addButton(label, fn, opts) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    if (opts && opts.disabled) btn.disabled = true;
    btn.addEventListener("click", function () {
      gestured = true;
      fn();
    });
    panelActions.appendChild(btn);
    return btn;
  }

  function showMenu() {
    screen = "menu";
    cgStop();
    family = null;
    panelTitle.textContent = "Heapwell";
    panelCopy.textContent = "Sort the pile from above. Drag or flick a piece into a bin. A wrong piece bounces back. Nothing is lost but time.";
    clearActions();
    var finished = run && !run.endless && run.total && sorted.size >= run.total;
    if (run && !finished && (sorted.size > 0 || world.size > 0)) {
      addButton("Continue", function () {
        screen = "play";
        hideOverlay();
        cgStart();
        uiSync();
      });
    }
    for (var n = 1; n <= 5; n++) {
      (function (heap) {
        var locked = settings.unlocked < heap;
        var fam = FAMILIES[heap];
        addButton(heap + " · " + fam.name + (locked ? " (locked)" : ""), function () {
          startHeap(heap, hashString("heap-" + heap + "-" + settings.coins + "-" + (settings.best[String(heap)] || 0)) || heap);
        }, { disabled: locked });
      })(n);
    }
    addButton("Calm Heap", function () {
      startCalm(hashString("calm-" + todayKey()) || 3);
    });
    var day = todayKey();
    var done = settings.dailyCleared === day;
    addButton(done ? "Daily Heap (cleared today)" : "Daily Heap", function () {
      startDaily();
    });
    showOverlay();
    uiSync();
    save();
  }

  function showPause() {
    panelTitle.textContent = "Paused";
    panelCopy.textContent = family ? family.name + " is waiting. The pile stays put." : "Paused.";
    clearActions();
    addButton("Resume", function () {
      screen = "play";
      hideOverlay();
      if (!run || !run.blurPause) cgStart();
      if (run) run.blurPause = false;
      uiSync();
    });
    addButton("Heaps", function () {
      if (run) run.blurPause = false;
      showMenu();
    });
    showOverlay();
  }

  function showBetween() {
    var next = run && run.type === "heap" && run.heap < 5 ? FAMILIES[run.heap + 1] : null;
    panelTitle.textContent = family ? family.name + " is clear" : "Clear";
    panelCopy.textContent = "You sorted " + sorted.size + " pieces and earned " + (run ? run.coinsEarned : 0) + " coins this heap." + (next ? " Next: " + next.name + ". " + next.blurb : " That was the last cupboard.");
    clearActions();
    if (next) {
      addButton("Next heap", function () {
        var heap = run.heap + 1;
        var seed = hashString("next-" + run.seed + "-" + heap) || heap;
        considerAd("between").then(function () {
          startHeap(heap, seed);
        });
      });
    }
    addButton("Heaps", function () {
      considerAd("between").then(function () {
        showMenu();
      });
    });
    showOverlay();
  }

  function pauseFromTab() {
    if (screen !== "play") return;
    if (run) run.blurPause = true;
    screen = "paused";
    showPause();
    save();
  }

  function cgStart() {
    cgWantPlay = true;
    if (!portalReady || cgPlay) return;
    try {
      window.CrazyGames.SDK.game.gameplayStart();
      cgPlay = true;
    } catch (err) {
      cgPlay = false;
    }
  }

  function cgStop() {
    cgWantPlay = false;
    if (!portalReady || !cgPlay) return;
    try {
      window.CrazyGames.SDK.game.gameplayStop();
    } catch (err) {
      /* the portal SDK can refuse a stop when it is already stopped */
    }
    cgPlay = false;
  }

  function considerAd(reason) {
    var age = performance.now() - sessionT0;
    var allow = portalOn && reason === "between" && age >= 60000;
    if (qaOn) adLog.push({ reason: reason, age: age, allow: allow });
    if (!allow || !portalReady) return Promise.resolve("skip");
    return new Promise(function (resolve) {
      var settled = false;
      function finish(why) {
        if (settled) return;
        settled = true;
        adMuted = false;
        resolve(why);
      }
      window.setTimeout(function () { finish("timeout"); }, 8000);
      try {
        window.CrazyGames.SDK.ad.requestAd("midgame", {
          adStarted: function () { adMuted = true; },
          adFinished: function () { finish("finished"); },
          adError: function () { finish("error"); }
        });
      } catch (err) {
        finish("throw");
      }
    });
  }

  function bootPortal() {
    if (!portalOn) return;
    var script = document.createElement("script");
    script.src = "https://sdk.crazygames.com/crazygames-sdk-v3.js";
    script.async = true;
    script.onload = function () {
      var sdk = window.CrazyGames && window.CrazyGames.SDK;
      if (!sdk || !sdk.init) return;
      sdk.init().then(function () {
        portalReady = true;
        if (cgWantPlay) cgStart();
      }).catch(function () { portalReady = false; });
    };
    script.onerror = function () { portalReady = false; };
    document.head.appendChild(script);
  }

  function snapshot() {
    var sleeping = 0;
    world.forEach(function (body) { if (body.isSleeping) sleeping += 1; });
    return {
      ready: ready,
      screen: screen,
      type: run ? run.type : "",
      heap: run ? run.heap : 0,
      seed: run ? run.seed : 0,
      total: run ? run.total : 0,
      sorted: sorted.size,
      cleared: !!(run && !run.endless && screen === "between" && sorted.size >= run.total),
      percent: percentNow(),
      coins: settings.coins,
      muted: settings.muted,
      lowMotion: settings.lowMotion,
      shake: settings.lowMotion ? 0 : shake,
      active: world.size,
      bodies: Matter.Composite.allBodies(engine.world).length,
      sleeping: sleeping,
      reserve: reserve.length,
      fps: fps,
      legal: legalInWorld(),
      unlocked: settings.unlocked,
      magnet: settings.upgrades.magnet,
      sieve: settings.upgrades.sieve,
      conveyor: settings.upgrades.conveyor,
      binLevel: settings.upgrades.bins,
      costs: {
        magnet: settings.upgrades.magnet >= COST.magnet.length ? null : COST.magnet[settings.upgrades.magnet],
        sieve: settings.upgrades.sieve >= COST.sieve.length ? null : COST.sieve[settings.upgrades.sieve],
        conveyor: settings.upgrades.conveyor >= COST.conveyor.length ? null : COST.conveyor[settings.upgrades.conveyor],
        bins: settings.upgrades.bins >= COST.bins.length ? null : COST.bins[settings.upgrades.bins]
      },
      bins: bins.map(function (bin, index) {
        var box = BIN_BOX[index];
        return {
          index: index,
          label: bin.rule ? bin.rule.label : "",
          kind: bin.rule ? bin.rule.kind : "",
          count: bin.count,
          capacity: capacity(),
          full: bin.full,
          pendingId: bin.pending ? bin.pending.id : null,
          pendingColor: bin.pending ? bin.pending.color : "",
          pendingShape: bin.pending ? bin.pending.shape : "",
          cx: box.x + box.w / 2,
          cy: box.y + box.h / 2
        };
      }),
      adLog: adLog.slice()
    };
  }

  function wire() {
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    btnPause.addEventListener("click", function () {
      gestured = true;
      if (screen === "play") {
        if (run) run.blurPause = false;
        screen = "paused";
        cgStop();
        showPause();
        save();
      } else if (screen === "paused") {
        screen = "play";
        hideOverlay();
        cgStart();
        uiSync();
      }
    });
    btnMute.addEventListener("click", function () {
      gestured = true;
      settings.muted = !settings.muted;
      save();
      uiSync();
    });
    btnMotion.addEventListener("click", function () {
      gestured = true;
      settings.lowMotion = !settings.lowMotion;
      if (settings.lowMotion) shake = 0;
      save();
      uiSync();
    });
    ["magnet", "sieve", "conveyor", "bins"].forEach(function (name) {
      document.getElementById("buy-" + name).addEventListener("click", function () {
        gestured = true;
        buy(name);
      });
    });
    binButtons.forEach(function (btn, index) {
      btn.addEventListener("click", function () {
        if (suppressClick) {
          suppressClick = false;
          return;
        }
        gestured = true;
        storeBin(index);
      });
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        save();
        pauseFromTab();
      }
    });
    window.addEventListener("resize", fit);
    fit();
  }

  function fit() {
    var s = Math.min(window.innerWidth / 360, window.innerHeight / 640);
    if (!isFinite(s) || s <= 0) s = 1;
    frame.style.transform = "scale(" + s + ")";
  }

  function boot() {
    wire();
    bootPortal();
    var fresh = qaOn && params.get("fresh") === "1";
    if (fresh) {
      try { localStorage.removeItem(SAVE_KEY); } catch (err) { /* ignore */ }
    }
    var data = fresh ? null : loadSave();
    applySettings(data);
    var wantHeap = qaOn && params.get("heap");
    var wantMode = qaOn ? params.get("mode") : "";
    if (wantHeap || wantMode === "calm" || wantMode === "daily") {
      var seed = qaOn && params.get("seed") ? (Number(params.get("seed")) >>> 0) : (hashString(todayKey()) || 1);
      if (!seed) seed = 1;
      if (wantMode === "calm") startCalm(seed);
      else if (wantMode === "daily") startDaily();
      else startHeap(Math.max(1, Math.min(5, Number(wantHeap) || 1)), seed);
    } else if (data && data.run) {
      resumeSaved(data);
    } else {
      showMenu();
    }
    uiSync();
    ready = true;
    window.requestAnimationFrame(frameStep);
  }

  if (qaOn) {
    window.HeapwellQA = {
      get ready() { return ready; },
      snapshot: snapshot,
      items: function () {
        var out = [];
        world.forEach(function (body, id) {
          var it = items.get(id);
          if (!it) return;
          out.push({
            id: id,
            color: it.color,
            shape: it.shape,
            size: it.size,
            round: it.round,
            x: body.position.x,
            y: body.position.y,
            r: it.radius
          });
        });
        return out;
      },
      preview: function (id, binIndex) {
        var it = items.get(id);
        var bin = bins[binIndex];
        if (!it || !bin) return { ok: false, reason: "missing" };
        return { ok: canDrop(it, bin), reason: canDrop(it, bin) ? "ok" : "rule" };
      },
      drop: function (id, binIndex) {
        var res = tryDrop(id, binIndex);
        if (!res.ok) bounce(id);
        return res;
      },
      store: storeBin,
      buy: buy,
      save: save,
      setMuted: function (value) {
        settings.muted = !!value;
        save();
        uiSync();
      },
      setLowMotion: function (value) {
        settings.lowMotion = !!value;
        if (settings.lowMotion) shake = 0;
        save();
        uiSync();
      },
      cleared: function () {
        return !!(run && !run.endless && sorted.size >= run.total && !anyPending());
      },
      clientPoint: function (x, y) {
        var rect = canvas.getBoundingClientRect();
        return {
          x: rect.left + (x / 360) * rect.width,
          y: rect.top + (y / 640) * rect.height
        };
      },
      adLog: function () { return adLog.slice(); }
    };
  }

  boot();
})();
