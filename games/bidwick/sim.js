// Seeded auction math. Rivals commit to an estimate before the bidding starts.
// Nothing in here raises a rival's ceiling because the player bid.
(function (root) {
  "use strict";

  var Items = root.BidwickItems;
  var SAVE_KEY = "bidwick.v1";
  var AUCTION_MS = 90000;
  var PEEK_MS = 20000;
  var LOCK_MS = 80000;
  var SOFT_MS = 12000;
  var SOFT_ADD = 6000;
  var SOFT_CAP = 2;
  var PLAYER_STEP = 5;
  var PLAYER_GAP = 1500;
  var LOTS_PER_DAY = 8;
  var COIN_CAP = 10000000;

  var RIVAL_DEFS = [
    { id: "nessa", name: "Nessa Quill", personality: "cautious", line: "Stops early. Hates a stretch." },
    { id: "bram", name: "Bram Holt", personality: "bluffer", line: "Jumps loud, then goes quiet." },
    { id: "ida", name: "Ida Vetch", personality: "collector", line: "Pays up when the lot matches her shelf." }
  ];

  var CUSTOMERS = ["Senn", "Marlow", "Tansy", "Odder", "Brook", "Pell", "Hatch", "Linden"];

  var UPGRADES = [
    { id: "flashlight", cost: 80, name: "Brighter lamp", detail: "One more peek inside the unit." },
    { id: "book", cost: 110, name: "Appraisal book", detail: "Narrower value bands on the clue cards." },
    { id: "shop", cost: 90, name: "Bigger shop", detail: "Three more slots on the shelf." }
  ];

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashSeed(text) {
    var h = 2166136261;
    var s = String(text);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function finiteInt(value, fallback, min, max) {
    var n = Math.round(Number(value));
    if (!Number.isFinite(n)) n = fallback;
    if (min != null && n < min) n = min;
    if (max != null && n > max) n = max;
    return n;
  }

  function shuffle(list, rng) {
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function freshState() {
    return {
      v: 1,
      coins: 100,
      day: 1,
      lotInDay: 0,
      flashlight: false,
      book: false,
      shop: false,
      mute: false,
      salt: finiteInt(Math.floor(Math.random() * 0x7fffffff) + 1, 1, 1, 0x7fffffff),
      shelf: [],
      pending: null,
      lastRecap: null,
      daily: null,
      stats: { auctions: 0, wins: 0, earned: 0, spent: 0 }
    };
  }

  function cleanShelf(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || typeof item !== "object") continue;
      var name = String(item.name || "").slice(0, 80);
      if (!name) continue;
      var listPrice = finiteInt(item.list, 1, 1, 100000);
      out.push({
        uid: String(item.uid || ("s" + i)).slice(0, 48),
        name: name,
        familyName: String(item.familyName || "").slice(0, 80),
        list: listPrice,
        trueValue: finiteInt(item.trueValue, listPrice, 1, 100000)
      });
      if (out.length >= 12) break;
    }
    return out;
  }

  function normalize(state) {
    var base = freshState();
    if (!state || typeof state !== "object") return base;
    base.coins = finiteInt(state.coins, 100, 0, COIN_CAP);
    base.day = finiteInt(state.day, 1, 1, 9999);
    base.lotInDay = finiteInt(state.lotInDay, 0, 0, LOTS_PER_DAY);
    base.flashlight = state.flashlight === true;
    base.book = state.book === true;
    base.shop = state.shop === true;
    base.mute = state.mute === true;
    base.salt = finiteInt(state.salt, base.salt, 1, 0x7fffffff);
    base.shelf = cleanShelf(state.shelf);
    base.pending = state.pending && typeof state.pending === "object" ? state.pending : null;
    base.lastRecap = state.lastRecap && typeof state.lastRecap === "object" ? state.lastRecap : null;
    base.daily = state.daily && typeof state.daily === "object" ? {
      date: String(state.daily.date || "").slice(0, 10),
      emoji: String(state.daily.emoji || "").slice(0, 400),
      delta: finiteInt(state.daily.delta, 0, -100000, 100000),
      won: state.daily.won === true
    } : null;
    var stats = state.stats || {};
    base.stats = {
      auctions: finiteInt(stats.auctions, 0, 0, 1000000),
      wins: finiteInt(stats.wins, 0, 0, 1000000),
      earned: finiteInt(stats.earned, 0, 0, COIN_CAP),
      spent: finiteInt(stats.spent, 0, 0, COIN_CAP)
    };
    return base;
  }

  function hydrate(json) {
    try {
      return normalize(JSON.parse(json));
    } catch (err) {
      return freshState();
    }
  }

  function shelfCap(state) {
    return state && state.shop ? 7 : 4;
  }

  function peekBudget(state) {
    return state && state.flashlight ? 4 : 3;
  }

  function buildItem(family, index, cond, era) {
    var makerRow = family.makers[index % family.makers.length];
    var value = Items.itemValue(makerRow.base, cond, era);
    return {
      key: family.id + "-" + index,
      family: family.id,
      familyName: family.name,
      index: index,
      name: family.items[index],
      makerName: makerRow.name,
      base: makerRow.base,
      makerClue: makerRow.clue,
      condTitle: cond.title,
      condClue: cond.clue,
      eraTitle: era.title,
      eraClue: era.clue,
      value: value
    };
  }

  function estimateOf(items, rival, rng) {
    var sum = 0;
    for (var i = 0; i < items.length; i++) {
      var noise = 78 + Math.floor(rng() * 45);
      var bias = 100;
      if (rival.personality === "cautious") bias = 80;
      else if (rival.personality === "bluffer") bias = 102;
      else if (rival.personality === "collector") bias = items[i].family === rival.favored ? 132 : 88;
      sum += Math.round(items[i].value * noise / 100 * bias / 100);
    }
    return Math.max(5, sum);
  }

  function maxBidFor(rival) {
    var pct = rival.personality === "cautious" ? 72 : rival.personality === "bluffer" ? 90 : 98;
    return Math.max(5, Math.round(rival.estimate * pct / 100));
  }

  function createAuction(seed) {
    var rng = mulberry32(seed >>> 0);
    var count = 3 + Math.floor(rng() * 3);
    var items = [];
    var used = {};
    var guard = 0;
    while (items.length < count && guard++ < 80) {
      var family = Items.FAMILIES[Math.floor(rng() * Items.FAMILIES.length)];
      var index = Math.floor(rng() * family.items.length);
      var key = family.id + ":" + index;
      if (used[key]) continue;
      used[key] = true;
      var cond = Items.CONDITIONS[Math.floor(rng() * Items.CONDITIONS.length)];
      var era = Items.ERAS[Math.floor(rng() * Items.ERAS.length)];
      items.push(buildItem(family, index, cond, era));
    }
    var trueValue = 0;
    for (var i = 0; i < items.length; i++) trueValue += items[i].value;
    var opening = 10 + items.length * 4 + Math.floor(rng() * 11);
    var rivalCount = rng() < 0.42 ? 2 : 3;
    var picked = shuffle(RIVAL_DEFS, rng).slice(0, rivalCount);
    var favored = items[Math.floor(rng() * items.length)].family;
    var favoredName = Items.familyById(favored).name;
    var rivals = picked.map(function (def) {
      var rival = {
        id: def.id,
        name: def.name,
        personality: def.personality,
        line: def.line,
        favored: favored,
        favoredName: favoredName,
        step: def.personality === "bluffer" ? 10 : def.personality === "collector" ? 8 : 5,
        attempt: 0,
        estimate: 0,
        maxBid: 0
      };
      rival.estimate = estimateOf(items, rival, rng);
      rival.maxBid = maxBidFor(rival);
      return rival;
    });
    var aiEvents = [];
    for (var r = 0; r < rivals.length; r++) {
      var rival = rivals[r];
      var t = 21000 + Math.floor(rng() * 3500);
      var gap = rival.personality === "cautious" ? 12000 : rival.personality === "bluffer" ? 7500 : 9500;
      var n = 0;
      while (t < 86000 && n < 6) {
        aiEvents.push({ t: t, id: rival.id });
        t += gap + Math.floor(rng() * 1800);
        n += 1;
      }
    }
    aiEvents.sort(function (a, b) { return a.t - b.t; });
    return {
      seed: seed >>> 0,
      items: items,
      trueValue: trueValue,
      opening: opening,
      rivals: rivals,
      aiEvents: aiEvents
    };
  }

  function createSession(auction, opts) {
    var peeks = opts && opts.peeks ? opts.peeks : 3;
    return {
      auction: auction,
      high: auction.opening,
      leader: null,
      playerBids: 0,
      extensions: 0,
      clockEnd: AUCTION_MS,
      elapsed: 0,
      aiIndex: 0,
      pending: [],
      log: [],
      running: true,
      lastPlayerAt: -100000,
      peeksLeft: peeks,
      peekMax: peeks,
      peeked: [],
      peekIndex: -1,
      peekUntil: 0
    };
  }

  function nextPrice(session, step) {
    if (session.leader == null) return session.auction.opening;
    return session.high + step;
  }

  function rivalById(session, id) {
    var rivals = session.auction.rivals;
    for (var i = 0; i < rivals.length; i++) if (rivals[i].id === id) return rivals[i];
    return null;
  }

  function pushLog(session, entry) {
    session.log.push(entry);
    if (session.log.length > 16) session.log.shift();
  }

  function commitBid(session, who, price, at) {
    session.high = price;
    session.leader = who;
    pushLog(session, { t: Math.round(at), who: who, price: price, pass: false });
    if (at >= session.clockEnd - SOFT_MS && at < session.clockEnd && session.extensions < SOFT_CAP) {
      session.clockEnd += SOFT_ADD;
      session.extensions += 1;
      var rivals = session.auction.rivals;
      for (var i = 0; i < rivals.length; i++) {
        session.pending.push({ t: at + 2800, id: rivals[i].id });
      }
      session.pending.sort(function (a, b) { return a.t - b.t; });
    }
  }

  function tryPlayerBid(session, elapsed, coins) {
    if (elapsed < PEEK_MS) return { ok: false, reason: "The lock is still on." };
    if (session.playerBids === 0 && elapsed >= LOCK_MS) return { ok: false, reason: "Too late to jump in." };
    if (elapsed - session.lastPlayerAt < PLAYER_GAP) return { ok: false, reason: "Give the row a moment." };
    var price = nextPrice(session, PLAYER_STEP);
    if (!Number.isFinite(price) || coins < price) return { ok: false, reason: "Not enough coins." };
    commitBid(session, "player", price, elapsed);
    session.playerBids += 1;
    session.lastPlayerAt = elapsed;
    return { ok: true, price: price };
  }

  function resolveAi(session, ev) {
    var rival = rivalById(session, ev.id);
    if (!rival) return;
    var attempt = rival.attempt;
    rival.attempt += 1;
    var price = nextPrice(session, rival.step);
    var bluffSkip = rival.personality === "bluffer" && attempt % 2 === 1;
    if (bluffSkip || price > rival.maxBid) {
      pushLog(session, { t: Math.round(ev.t), who: rival.id, price: session.high, pass: true });
      return;
    }
    commitBid(session, rival.id, price, ev.t);
  }

  function pumpAi(session) {
    var guard = 0;
    while (guard++ < 40) {
      var due = [];
      var events = session.auction.aiEvents;
      while (session.aiIndex < events.length && events[session.aiIndex].t <= session.elapsed && events[session.aiIndex].t <= session.clockEnd) {
        due.push(events[session.aiIndex]);
        session.aiIndex += 1;
      }
      while (session.pending.length && session.pending[0].t <= session.elapsed && session.pending[0].t <= session.clockEnd) {
        due.push(session.pending.shift());
      }
      if (!due.length) break;
      due.sort(function (a, b) { return a.t - b.t; });
      for (var i = 0; i < due.length; i++) resolveAi(session, due[i]);
    }
  }

  function autoPlay(session, playerMax, coins) {
    var times = [24000, 33000, 42000, 51000, 60000, 69000, 78000, 84000, 90000, 96000, 101000];
    var guard = 0;
    while (session.elapsed < session.clockEnd && guard++ < 8000) {
      var next = session.clockEnd;
      if (session.aiIndex < session.auction.aiEvents.length) {
        var at = session.auction.aiEvents[session.aiIndex].t;
        if (at < next) next = at;
      }
      if (session.pending.length && session.pending[0].t < next) next = session.pending[0].t;
      for (var i = 0; i < times.length; i++) {
        if (times[i] > session.elapsed && times[i] < next) next = times[i];
      }
      if (!(next > session.elapsed)) break;
      if (next >= session.clockEnd) break;
      session.elapsed = next;
      pumpAi(session);
      var playerTurn = false;
      for (var k = 0; k < times.length; k++) if (times[k] === session.elapsed) playerTurn = true;
      if (!playerTurn) continue;
      if (session.elapsed >= LOCK_MS && session.playerBids === 0) continue;
      var price = nextPrice(session, PLAYER_STEP);
      if (price <= playerMax && coins >= price) tryPlayerBid(session, session.elapsed, coins);
    }
    session.elapsed = session.clockEnd;
    session.running = false;
  }

  function peekEstimate(auction, peeks, rng) {
    var idxs = [];
    for (var i = 0; i < auction.items.length; i++) idxs.push(i);
    idxs = shuffle(idxs, rng);
    var seen = Math.min(peeks, idxs.length);
    var known = 0;
    var seenIdx = [];
    for (var s = 0; s < seen; s++) {
      seenIdx.push(idxs[s]);
      known += Math.round(auction.items[idxs[s]].value * 9 / 10);
    }
    var unseen = auction.items.length - seen;
    return { estimate: known + unseen * 14, seen: seenIdx };
  }

  function openDeal(listPrice, rng) {
    var list = Math.max(1, Math.round(Number(listPrice)) || 1);
    var roll = 80 + Math.floor(rng() * 26);
    var max = Math.max(1, Math.round(list * roll / 100));
    var offer = Math.max(1, Math.min(list, Math.round(list * 70 / 100)));
    return {
      list: list,
      max: max,
      offer: offer,
      customer: customerName(rng),
      step: 1
    };
  }

  // A counter at or under the customer's hidden max is a sale.
  // A counter over it draws a higher offer, or a walk on the last step.
  function answerCounter(deal, counter) {
    counter = Math.round(Number(counter));
    if (!Number.isFinite(counter)) counter = deal.offer;
    if (counter <= deal.offer) return { sold: deal.offer, offer: deal.offer, done: true };
    if (counter <= deal.max) return { sold: counter, offer: deal.offer, done: true };
    if (deal.step >= 3) return { sold: 0, offer: deal.offer, done: true, walk: true };
    var gap = deal.max - deal.offer;
    if (gap <= 0) return { sold: 0, offer: deal.offer, done: true, walk: true };
    var offer = Math.min(deal.max, deal.offer + Math.max(1, Math.round(gap * 45 / 100)));
    return { sold: 0, offer: offer, done: false };
  }

  function haggle(listPrice, rng) {
    var deal = openDeal(listPrice, rng);
    var steps = [];
    for (var step = 1; step <= 3; step++) {
      deal.step = step;
      steps.push(deal.offer);
      if (deal.offer >= Math.round(deal.list * 85 / 100)) {
        return { sold: deal.offer, steps: steps, max: deal.max };
      }
      var counter = Math.min(deal.list, Math.max(deal.offer + 1, Math.round(deal.list * 92 / 100)));
      var answer = answerCounter(deal, counter);
      if (answer.done) return { sold: answer.sold, steps: steps, max: deal.max, counter: counter };
      deal.offer = answer.offer;
    }
    return { sold: 0, steps: steps, max: deal.max };
  }

  function customerName(rng) {
    return CUSTOMERS[Math.floor(rng() * CUSTOMERS.length)];
  }

  function maybeUpgrade(state) {
    var order = ["flashlight", "book", "shop"];
    for (var i = 0; i < order.length; i++) {
      var id = order[i];
      if (state[id]) continue;
      var cost = 0;
      for (var u = 0; u < UPGRADES.length; u++) if (UPGRADES[u].id === id) cost = UPGRADES[u].cost;
      var gate = cost + 100;
      if (state.coins >= gate) {
        state.coins -= cost;
        state[id] = true;
        return;
      }
    }
  }

  function playOut(state, seed) {
    maybeUpgrade(state);
    var auction = createAuction(seed);
    var session = createSession(auction, { peeks: peekBudget(state) });
    var rng = mulberry32((seed ^ 0x85ebca6b) >>> 0);
    var peeked = peekEstimate(auction, peekBudget(state), rng);
    var playerMax = Math.min(state.coins, Math.max(0, Math.round(peeked.estimate * 68 / 100)));
    autoPlay(session, playerMax, state.coins);
    var won = session.leader === "player" && session.high <= state.coins;
    var spent = 0;
    if (won) {
      spent = session.high;
      state.coins -= spent;
      state.stats.spent += spent;
      state.stats.wins += 1;
      var bands = Items.makeBands(!!state.book);
      var fresh = [];
      for (var i = 0; i < auction.items.length; i++) {
        var item = auction.items[i];
        var trueBand = Items.bandIndex(item.value, bands);
        var list = Items.salePrice(item.value, 0);
        fresh.push({
          uid: item.key + ":" + seed + ":" + i,
          name: item.name,
          familyName: item.familyName,
          list: list,
          trueValue: item.value,
          trueBand: trueBand
        });
      }
      var cap = shelfCap(state);
      var room = Math.max(0, cap - state.shelf.length);
      fresh.sort(function (a, b) { return b.list - a.list; });
      for (var k = 0; k < fresh.length; k++) {
        if (k < room) state.shelf.push(fresh[k]);
        else {
          var bulk = Math.max(1, Math.round(fresh[k].list * 2 / 5));
          state.coins += bulk;
          state.stats.earned += bulk;
        }
      }
    }
    state.stats.auctions += 1;
    var haggleSold = 0;
    if (state.shelf.length) {
      var idx = Math.floor(rng() * state.shelf.length);
      var goods = state.shelf[idx];
      var deal = haggle(goods.list, rng);
      if (deal.sold > 0) {
        state.coins += deal.sold;
        state.stats.earned += deal.sold;
        state.shelf.splice(idx, 1);
        haggleSold = deal.sold;
      }
    }
    state.lotInDay += 1;
    if (state.lotInDay >= LOTS_PER_DAY) {
      state.day += 1;
      state.lotInDay = 0;
    }
    state.coins = finiteInt(state.coins, 0, 0, COIN_CAP);
    return {
      won: won,
      trueValue: auction.trueValue,
      price: won ? spent : session.high,
      leader: session.leader,
      coins: state.coins,
      haggleSold: haggleSold,
      extensions: session.extensions,
      items: auction.items.length
    };
  }

  function runSeededAuctions(count, seed) {
    var state = freshState();
    state.salt = finiteInt(seed, 1, 1, 0x7fffffff);
    var finished = 0;
    var nan = false;
    var minCoins = state.coins;
    var n = finiteInt(count, 0, 0, 500);
    var base = seed >>> 0;
    for (var i = 0; i < n; i++) {
      var before = state.coins;
      var result = playOut(state, (base + i * 9973) >>> 0);
      finished += 1;
      if (!Number.isFinite(before) || !Number.isFinite(state.coins) || !Number.isFinite(result.trueValue) || !Number.isFinite(result.price) || !Number.isFinite(result.haggleSold)) {
        nan = true;
      }
      if (state.coins < minCoins) minCoins = state.coins;
    }
    return {
      finished: finished,
      coins: state.coins,
      nan: nan,
      minCoins: minCoins,
      shelf: state.shelf.length,
      day: state.day,
      auctions: state.stats.auctions
    };
  }

  function rulesHold() {
    var lateAuction = createAuction(7);
    var lateSession = createSession(lateAuction, { peeks: 3 });
    var late = tryPlayerBid(lateSession, 85000, 5000);
    var early = tryPlayerBid(createSession(createAuction(8), { peeks: 3 }), 5000, 5000);
    var auction = createAuction(11);
    var session = createSession(auction, { peeks: 3 });
    var maxes = auction.rivals.map(function (r) { return r.maxBid; });
    var t = 30000;
    for (var i = 0; i < 12; i++) {
      tryPlayerBid(session, t, 8000);
      session.elapsed = t;
      pumpAi(session);
      t += 2000;
    }
    var stable = auction.rivals.every(function (r, idx) { return r.maxBid === maxes[idx]; });
    var leaderOk = true;
    if (session.leader && session.leader !== "player") {
      var rival = rivalById(session, session.leader);
      if (rival && session.high > rival.maxBid) leaderOk = false;
    }
    return {
      lock: late.ok === false && early.ok === false,
      stable: stable,
      leaderOk: leaderOk
    };
  }

  function dailyCard(date, summary) {
    var used = summary.peeksUsed || 0;
    var max = summary.peekMax || 3;
    var peeks = "";
    for (var i = 0; i < used; i++) peeks += "\uD83D\uDD26";
    for (var k = used; k < max; k++) peeks += "\uD83C\uDF11";
    var marks = "";
    var distances = summary.distances || [];
    for (var d = 0; d < distances.length; d++) {
      marks += distances[d] === 0 ? "\uD83D\uDFE9" : distances[d] === 1 ? "\uD83D\uDFE8" : "\uD83D\uDFE5";
    }
    if (!marks) marks = "\u25AB\uFE0F";
    var delta = finiteInt(summary.delta, 0, -100000, 100000);
    var sign = delta > 0 ? "+" : "";
    var outcome = summary.won ? "Won the unit" : summary.leader ? "Outbid" : "Passed";
    return ["Bidwick \u00b7 " + date, peeks, outcome + " \u00b7 " + sign + delta + " coins", marks].join("\n");
  }

  function whoName(session, id) {
    if (!id) return "No one";
    if (id === "player") return "You";
    var rival = rivalById(session, id);
    return rival ? rival.name : "A rival";
  }

  root.BidwickSim = {
    SAVE_KEY: SAVE_KEY,
    AUCTION_MS: AUCTION_MS,
    PEEK_MS: PEEK_MS,
    LOCK_MS: LOCK_MS,
    LOTS_PER_DAY: LOTS_PER_DAY,
    PLAYER_STEP: PLAYER_STEP,
    UPGRADES: UPGRADES,
    mulberry32: mulberry32,
    hashSeed: hashSeed,
    finiteInt: finiteInt,
    freshState: freshState,
    normalize: normalize,
    hydrate: hydrate,
    shelfCap: shelfCap,
    peekBudget: peekBudget,
    createAuction: createAuction,
    createSession: createSession,
    nextPrice: nextPrice,
    tryPlayerBid: tryPlayerBid,
    pumpAi: pumpAi,
    autoPlay: autoPlay,
    haggle: haggle,
    openDeal: openDeal,
    answerCounter: answerCounter,
    customerName: customerName,
    playOut: playOut,
    runSeededAuctions: runSeededAuctions,
    rulesHold: rulesHold,
    dailyCard: dailyCard,
    whoName: whoName,
    rivalById: rivalById
  };
})(typeof window !== "undefined" ? window : globalThis);
