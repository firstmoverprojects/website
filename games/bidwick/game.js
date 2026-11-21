// Bidwick. A yard day is 8 lots, about 90 seconds each.
// Rivals bid from a seeded estimate. They do not chase the player.
// A first bid in the last 10 seconds is refused, and a late bid gives them time to answer.
(function () {
  "use strict";

  var Items = window.BidwickItems;
  var Sim = window.BidwickSim;
  var Draw = window.BidwickDraw;
  var params = new URLSearchParams(location.search);
  var QA = params.get("qa") === "1";
  var PORTAL = params.get("portal") === "cg";

  var frame = document.getElementById("frame");
  var board = document.getElementById("board");
  var screen = document.getElementById("screen");
  var toastEl = document.getElementById("toast");
  var overlay = document.getElementById("overlay");
  var adhold = document.getElementById("adhold");
  var coinsEl = document.getElementById("coins");
  var muteBtn = document.getElementById("mute");
  var pauseBtn = document.getElementById("pause");

  var state = Sim.freshState();
  var view = "title";
  var session = null;
  var run = null;
  var deal = null;
  var dealUid = "";
  var dealName = "";
  var dealNext = "shop";
  var flipped = [false, false, false];
  var paused = false;
  var timeScale = 1;
  var lastFrame = 0;
  var logicalH = 168;
  var revealMs = 0;
  var audioCtx = null;
  var adMute = false;
  var sdkMute = false;
  var portalSdk = null;
  var portalPlaying = false;
  var firstPlayAt = 0;
  var toastTimer = 0;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var COLORS = { nessa: "#7eb6d6", bram: "#e0a15a", ida: "#c98ad4" };

  function coinText(n) {
    var v = Sim.finiteInt(n, 0, 0, 10000000);
    return v.toLocaleString("en-US") + (v === 1 ? " coin" : " coins");
  }

  function todayString(date) {
    var dt = date || new Date();
    var m = String(dt.getMonth() + 1);
    var d = String(dt.getDate());
    if (m.length < 2) m = "0" + m;
    if (d.length < 2) d = "0" + d;
    return dt.getFullYear() + "-" + m + "-" + d;
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === "class") node.className = attrs[key];
        else if (key === "text") node.textContent = attrs[key];
        else node.setAttribute(key, attrs[key]);
      });
    }
    (children || []).forEach(function (child) {
      if (child == null) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  function button(label, act, kind, arg) {
    var attrs = { type: "button", class: kind || "primary", "data-act": act, text: label };
    if (arg != null) attrs["data-arg"] = String(arg);
    return el("button", attrs);
  }

  function toast(message) {
    toastEl.textContent = message || "";
    if (toastTimer) clearTimeout(toastTimer);
    if (!message) return;
    toastTimer = setTimeout(function () { toastEl.textContent = ""; }, 2200);
  }

  function persist() {
    try {
      state = Sim.normalize(state);
      localStorage.setItem(Sim.SAVE_KEY, JSON.stringify(state));
    } catch (err) { /* private mode or a full disk */ }
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(Sim.SAVE_KEY);
      if (!raw) return Sim.freshState();
      return Sim.hydrate(raw);
    } catch (err) {
      return Sim.freshState();
    }
  }

  function forcedMute() {
    return sdkMute || adMute;
  }

  function updateMuteLabel() {
    var off = !!(state.mute || forcedMute());
    muteBtn.textContent = off ? "Muted" : "Sound";
    muteBtn.setAttribute("aria-pressed", off ? "true" : "false");
  }

  function updateCoins() {
    coinsEl.textContent = coinText(state.coins);
  }

  function fit() {
    var s = Math.min(window.innerWidth / 360, window.innerHeight / 640);
    frame.style.transform = Math.abs(s - 1) < 0.01 ? "none" : "scale(" + s + ")";
  }

  function setBoard(show, cssH) {
    if (!show) {
      board.hidden = true;
      return;
    }
    board.hidden = false;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    logicalH = cssH;
    board.style.height = cssH + "px";
    board.width = Math.round(360 * dpr);
    board.height = Math.round(cssH * dpr);
    var ctx = board.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function sceneObject() {
    var items = [];
    var open = 0;
    var peekOn = false;
    var peekIndex = -1;
    var banner = "";
    if (session && session.auction) items = session.auction.items;
    else if (run && run.items) items = run.items;
    if (view === "reveal" && run && run.displayWon) {
      open = reduceMotion ? 1 : Math.max(0, Math.min(1, revealMs / 1100));
      if (open > 0.82) banner = "Yours";
    }
    if (view === "auction" && session) {
      peekOn = session.peekIndex >= 0 && session.elapsed < session.peekUntil;
      peekIndex = session.peekIndex;
    }
    return {
      open: open,
      items: items,
      peekOn: peekOn,
      peekIndex: peekIndex,
      banner: banner,
      sweep: view === "title",
      time: performance.now()
    };
  }

  function drawScene() {
    if (board.hidden) return;
    var ctx = board.getContext("2d");
    if (!ctx) return;
    Draw.draw(ctx, 360, logicalH, sceneObject());
  }

  function unlockAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function blip(freq, dur) {
    if (state.mute || forcedMute() || !audioCtx) return;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = 0.045;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    var t = audioCtx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.start(t);
    osc.stop(t + dur);
  }

  function chime() {
    blip(523, 0.12);
    setTimeout(function () { blip(659, 0.14); }, 90);
    setTimeout(function () { blip(784, 0.18); }, 180);
  }

  function portalCall(fn) {
    try { fn(); } catch (err) { /* the yard keeps running */ }
  }

  function portalStart() {
    if (!portalSdk || !portalSdk.game || portalPlaying) return;
    if (!firstPlayAt) firstPlayAt = Date.now();
    portalPlaying = true;
    portalCall(function () { portalSdk.game.gameplayStart(); });
  }

  function portalStop() {
    if (!portalSdk || !portalSdk.game || !portalPlaying) return;
    portalPlaying = false;
    portalCall(function () { portalSdk.game.gameplayStop(); });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error("sdk")); };
      document.head.appendChild(script);
    });
  }

  function initPortal() {
    if (!PORTAL) return Promise.resolve();
    return loadScript("https://sdk.crazygames.com/crazygames-sdk-v3.js").then(function () {
      var SDK = window.CrazyGames && window.CrazyGames.SDK;
      if (!SDK || !SDK.init) return null;
      if (SDK.game && SDK.game.loadingStart) portalCall(function () { SDK.game.loadingStart(); });
      return SDK.init().then(function () {
        portalSdk = SDK;
        if (SDK.game && SDK.game.loadingStop) portalCall(function () { SDK.game.loadingStop(); });
        applySdkMute();
        if (SDK.game && SDK.game.addSettingsChangeListener) {
          portalCall(function () {
            SDK.game.addSettingsChangeListener(function () { applySdkMute(); });
          });
        }
      });
    }).catch(function () { portalSdk = null; });
  }

  function applySdkMute() {
    var settings = portalSdk && portalSdk.game && portalSdk.game.settings;
    sdkMute = !!(settings && settings.muteAudio) || (PORTAL && params.get("muteAudio") === "true");
    updateMuteLabel();
  }

  function maybeMidgameAd() {
    return new Promise(function (resolve) {
      if (!portalSdk || !portalSdk.ad || !firstPlayAt || Date.now() - firstPlayAt < 60000) {
        resolve();
        return;
      }
      var settled = false;
      var started = false;
      function done() {
        if (settled) return;
        settled = true;
        adMute = false;
        adhold.hidden = true;
        updateMuteLabel();
        resolve();
      }
      var failSafe = setTimeout(function () { if (!started) done(); }, 8000);
      adhold.hidden = false;
      portalStop();
      portalCall(function () {
        portalSdk.ad.requestAd("midgame", {
          adStarted: function () {
            started = true;
            clearTimeout(failSafe);
            adMute = true;
            updateMuteLabel();
          },
          adFinished: function () { done(); },
          adError: function () { done(); }
        });
      });
    });
  }

  function showOverlay() {
    overlay.hidden = false;
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  function doPause() {
    paused = true;
    if (view === "auction") portalStop();
    showOverlay();
  }

  function resumePlay() {
    paused = false;
    hideOverlay();
    if (view === "auction" && session && session.running) portalStart();
  }

  function onHide() {
    if (document.hidden) {
      paused = true;
      showOverlay();
    }
  }

  function setView(next) {
    view = next;
    if (next === "title") setBoard(true, 150);
    else if (next === "auction") setBoard(true, 210);
    else if (next === "reveal") {
      setBoard(true, 236);
      revealMs = 0;
      if (run) {
        run.listed = false;
        run.chimed = false;
      }
    } else setBoard(false, 0);
    render();
    drawScene();
  }

  function render() {
    updateCoins();
    updateMuteLabel();
    if (view === "title") renderTitle();
    else if (view === "help") renderHelp();
    else if (view === "upgrades") renderUpgrades();
    else if (view === "shop") renderShop();
    else if (view === "auction") renderAuction();
    else if (view === "reveal") renderReveal();
    else if (view === "appraise") renderAppraise();
    else if (view === "recap") renderRecap();
    else if (view === "haggle") renderHaggle();
    else if (view === "dayend") renderDayEnd();
    else if (view === "daily") renderDaily();
    else renderTitle();
  }

  function renderTitle() {
    var dayOver = state.lotInDay >= Sim.LOTS_PER_DAY;
    var kids = [
      el("p", { class: "tagline", text: dayOver
        ? "The gate is shut for the day."
        : "Lot " + (state.lotInDay + 1) + " of " + Sim.LOTS_PER_DAY + ". A sealed unit, then the bid." }),
      button(dayOver ? "The gate is shut" : "Open the yard", dayOver ? "gate" : "open", "primary"),
      button("Daily lot", "daily", "ghost"),
      button("Shop shelf", "shop", "ghost"),
      button("Upgrades", "upgrades", "ghost"),
      button("How to bid", "help", "ghost")
    ];
    if (state.lastRecap) kids.push(button("Last lot recap", "recap-open", "ghost"));
    kids.push(el("p", { class: "hint", text: "The yard and every item in it are made up. This is a game, not advice, and the coins are not money." }));
    kids.push(el("a", { class: "quiet", href: "/games/", text: "All games" }));
    screen.replaceChildren(el("div", { class: "stack" }, kids));
  }

  function renderHelp() {
    screen.replaceChildren(el("div", null, [
      el("h2", { text: "How to bid" }),
      el("p", { text: "Each lot lasts about 90 seconds. You get three flashlight peeks, four with the brighter lamp. The shapes are only silhouettes." }),
      el("p", { text: "Nessa stops early. Bram bids loud, then goes quiet. Ida pays up when the lot matches the shelf she wants. Their ceilings are set before you bid. They do not chase you." }),
      el("p", { text: "You cannot jump in during the last 10 seconds if you have not bid yet. A late raise gives the row a moment to answer." }),
      el("p", { text: "On a win, read the maker mark, the condition, and the era. A 40-coin mark in fair shape (take off a fifth) from the early years (take off a fifth) is 26 coins after rounding. A closer band sells for more." }),
      el("p", { text: "Customers haggle in three steps. A yard day is 8 lots. The gate shuts after that. Thank you for working the row." }),
      button("Back", "title", "primary")
    ]));
  }

  function renderUpgrades() {
    var stack = [el("h2", { text: "Upgrades" }), el("p", { class: "hint", text: "Coins only. The purse you have: " + coinText(state.coins) + "." })];
    Sim.UPGRADES.forEach(function (up) {
      var owned = state[up.id] === true;
      stack.push(el("p", { text: up.name + ". " + up.detail + " " + coinText(up.cost) + "." }));
      if (owned) stack.push(el("p", { class: "good", text: "On your bench." }));
      else {
        var btn = button(state.coins >= up.cost ? "Buy" : "Need more coins", "buy", "primary", up.id);
        if (state.coins < up.cost) btn.disabled = true;
        stack.push(btn);
      }
    });
    stack.push(button("Back", "title", "ghost"));
    screen.replaceChildren(el("div", { class: "stack" }, stack));
  }

  function renderShop() {
    var stack = [el("h2", { text: "Shop shelf" }), el("p", { class: "hint", text: state.shelf.length + " of " + Sim.shelfCap(state) + " slots." })];
    if (!state.shelf.length) stack.push(el("p", { text: "The shelf is empty. Win a unit, then price it." }));
    state.shelf.forEach(function (item) {
      stack.push(el("div", { class: "shelf-row" }, [
        el("p", { text: item.name + " · ask " + coinText(item.list) }),
        button("Bulk", "bulk", "ghost", item.uid)
      ]));
    });
    if (state.shelf.length) stack.push(button("Call a customer", "call", "primary"));
    stack.push(button("Back", "title", "ghost"));
    screen.replaceChildren(el("div", null, stack));
  }

  function renderAuction() {
    if (!session) {
      screen.replaceChildren(button("Back", "title", "primary"));
      return;
    }
    var rivals = session.auction.rivals.map(function (rival) {
      var extra = rival.personality === "collector" ? " Watching for " + rival.favoredName + "." : "";
      return el("div", { class: "rival" }, [
        el("span", { class: "dot", style: "background:" + (COLORS[rival.id] || "#e2b15a") }),
        el("p", null, [
          el("span", { class: "who", text: rival.name + " · " + rival.personality }),
          document.createElement("br"),
          el("span", { class: "fine", text: rival.line + extra })
        ])
      ]);
    });
    var peekBtn = button("Peek (" + session.peeksLeft + ")", "peek", "ghost");
    peekBtn.id = "peek-btn";
    if (session.peeksLeft <= 0) peekBtn.disabled = true;
    var bidBtn = button("Bid", "bid", "primary");
    bidBtn.id = "bid-btn";
    screen.replaceChildren(el("div", null, [
      el("p", { id: "phase", text: "" }),
      el("div", null, rivals),
      el("div", { class: "bar", "aria-hidden": "true" }, [el("span", { id: "timer-bar" })]),
      el("div", { class: "row" }, [peekBtn, bidBtn]),
      el("p", { class: "log", id: "log", text: "" })
    ]));
    updateAuctionHud();
  }

  function updateAuctionHud() {
    if (!session || view !== "auction") return;
    var phase = document.getElementById("phase");
    var bar = document.getElementById("timer-bar");
    var log = document.getElementById("log");
    var bidBtn = document.getElementById("bid-btn");
    var peekBtn = document.getElementById("peek-btn");
    var left = Math.max(0, Math.ceil((session.clockEnd - session.elapsed) / 1000));
    var locked = session.playerBids === 0 && session.elapsed >= Sim.LOCK_MS;
    var early = session.elapsed < Sim.PEEK_MS;
    if (phase) {
      var bidWord = session.leader ? "high " + coinText(session.high) : "ask " + coinText(session.auction.opening);
      phase.textContent = (early ? "Lock's on" : "Bidding") + " · " + left + "s"
        + (session.extensions ? " · held" : "")
        + " · " + bidWord;
    }
    if (bar) {
      var frac = session.clockEnd > 0 ? Math.max(0, Math.min(1, session.elapsed / session.clockEnd)) : 0;
      bar.style.width = Math.round(frac * 100) + "%";
    }
    if (bidBtn) {
      var price = Sim.nextPrice(session, Sim.PLAYER_STEP);
      var short = state.coins < price;
      if (locked) bidBtn.textContent = "Too late to jump in";
      else if (early) bidBtn.textContent = "Bids open soon";
      else if (short) bidBtn.textContent = "Not enough coins";
      else bidBtn.textContent = "Bid " + coinText(price);
      bidBtn.disabled = locked || early || short;
    }
    if (peekBtn) {
      peekBtn.textContent = "Peek (" + session.peeksLeft + ")";
      peekBtn.disabled = session.peeksLeft <= 0;
    }
    if (log) {
      var lines = session.log.slice(-2).map(function (entry) {
        var name = Sim.whoName(session, entry.who);
        if (entry.pass) return name + " passes.";
        return name + " bids " + coinText(entry.price) + ".";
      });
      log.textContent = lines.join(" ") || "The row is quiet.";
    }
    updateCoins();
  }

  function renderReveal() {
    var kids = [el("h2", { text: "The door is up" })];
    if (run && run.listed && run.items) {
      run.items.forEach(function (item) {
        kids.push(el("p", { text: item.name }));
      });
      kids.push(button("Read the clues", "clues", "primary"));
    } else {
      kids.push(el("p", { class: "hint", text: "Listen for the latch." }));
    }
    screen.replaceChildren(el("div", null, kids));
  }

  function renderAppraise() {
    if (!run || !run.items) {
      screen.replaceChildren(button("Back", "title", "primary"));
      return;
    }
    var index = run.guesses.length;
    if (index >= run.items.length) {
      screen.replaceChildren(button("See the recap", "settle", "primary"));
      return;
    }
    var item = run.items[index];
    var bands = Items.makeBands(!!state.book);
    var cards = [
      ["Maker mark", item.makerClue],
      ["Condition", item.condClue],
      ["Era", item.eraClue]
    ];
    var stack = [
      el("h2", { text: item.name + " · " + (index + 1) + " of " + run.items.length }),
      el("p", { class: "hint", text: "Halve, drop a fifth, keep, or add a quarter. Eras drop a fifth, stay, or add a fifth." })
    ];
    cards.forEach(function (card, i) {
      stack.push(button(flipped[i] ? card[1] : card[0], "flip", "paper", i));
    });
    if (flipped[0] && flipped[1] && flipped[2]) {
      var grid = el("div", { class: "bands" });
      bands.forEach(function (band, i) {
        grid.appendChild(button(band.label + " coins", "band", "ghost", i));
      });
      stack.push(grid);
    } else {
      stack.push(el("p", { class: "hint", text: "Turn all three cards, then pick a band." }));
    }
    screen.replaceChildren(el("div", { class: "stack" }, stack));
  }

  function verdict(info) {
    var worth = info.trueValue;
    var price = info.price;
    if (!info.leader) return "Nobody bid. The unit was worth " + coinText(worth) + ".";
    if (info.displayWon || info.won) {
      if (price < worth) return "You paid " + coinText(price) + ". The unit was worth " + coinText(worth) + ". You paid under the worth.";
      if (price > worth) return "You paid " + coinText(price) + ". The unit was worth " + coinText(worth) + ". You paid over the worth.";
      return "You paid " + coinText(price) + ", the worth of the unit.";
    }
    var who = info.leaderName || "The row";
    if (price < worth) return who + " paid " + coinText(price) + ". The unit was worth " + coinText(worth) + ". That one got away.";
    if (price > worth) return who + " paid " + coinText(price) + ". The unit was worth " + coinText(worth) + ". You were right to let it go.";
    return who + " paid the worth, " + coinText(worth) + ".";
  }

  function renderRecap() {
    if (!run) {
      screen.replaceChildren(button("Back", "title", "primary"));
      return;
    }
    var stack = [el("h2", { text: "Lot recap" }), el("p", { text: verdict(run) })];
    var priced = {};
    (run.priced || []).forEach(function (row) { priced[row.item.key] = row; });
    (run.items || []).forEach(function (item) {
      var row = priced[item.key];
      var line = item.name + " · worth " + coinText(item.value);
      if (row) line += " · shelf " + coinText(row.list);
      stack.push(el("p", { text: line }));
    });
    if (run.bulk) stack.push(el("p", { text: "Bulk bin paid " + coinText(run.bulk) + " for what did not fit." }));
    if (run.practice) stack.push(el("p", { class: "hint", text: "Practice. Your coins stay put." }));
    if (run.daily && state.daily && state.daily.date === run.date) {
      stack.push(el("textarea", { class: "share", id: "share", readonly: "readonly", "aria-label": "Shareable result" }, [state.daily.emoji]));
      stack.push(button("Copy result", "copy", "primary"));
    }
    var hasCustomer = !run.daily && state.shelf.length > 0;
    if (hasCustomer) stack.push(button("See a customer", "customer", "primary"));
    if (run.daily) stack.push(button("Back to the gate", "title", "ghost"));
    else if (state.lotInDay >= Sim.LOTS_PER_DAY) stack.push(button("Close the gate", "gate", hasCustomer ? "ghost" : "primary"));
    else stack.push(button("Next lot", "next", hasCustomer ? "ghost" : "primary"));
    screen.replaceChildren(el("div", null, stack));
  }

  function renderHaggle() {
    if (!deal) {
      screen.replaceChildren(button("Back", "shop", "primary"));
      return;
    }
    var counterStart = Math.min(deal.list, Math.max(deal.offer, Math.round(deal.list * 92 / 100)));
    if (counterStart <= deal.offer) counterStart = Math.min(deal.list, deal.offer + 1);
    var stack = [
      el("h2", { text: deal.customer + " is looking" }),
      el("p", { text: dealName + ". Your ask is " + coinText(deal.list) + "." }),
      el("p", { text: "Offer " + deal.step + " of 3: " + coinText(deal.offer) + "." }),
      el("label", { class: "slider", for: "offer", text: "Your counter" }),
      el("input", { id: "offer", type: "range", min: String(deal.offer), max: String(deal.list), step: "1", value: String(Math.min(deal.list, counterStart)) })
    ];
    var row = el("div", { class: "row" }, [
      button("Accept " + coinText(deal.offer), "accept", "primary"),
      button("Counter", "counter", "ghost")
    ]);
    stack.push(row);
    stack.push(button("Send them off", "walk", "ghost"));
    screen.replaceChildren(el("div", null, stack));
    var slider = document.getElementById("offer");
    var counterBtn = row.children[1];
    function sync() {
      if (!slider || !counterBtn) return;
      counterBtn.textContent = "Counter " + coinText(slider.value);
    }
    if (slider) slider.addEventListener("input", sync);
    sync();
  }

  function renderDayEnd() {
    screen.replaceChildren(el("div", { class: "stack" }, [
      el("h2", { text: "The gate is shut" }),
      el("p", { text: "Eight lots. About ninety seconds each, plus the shelf. This is a natural place to stop. Thank you for working the row." }),
      el("p", { text: "You have " + coinText(state.coins) + ". Wins " + state.stats.wins + " of " + state.stats.auctions + " lots." }),
      button("Another day", "another", "primary"),
      button("Leave the yard", "title", "ghost")
    ]));
  }

  function renderDaily() {
    var emoji = state.daily && state.daily.emoji ? state.daily.emoji : "";
    screen.replaceChildren(el("div", { class: "stack" }, [
      el("h2", { text: "Today's lot" }),
      el("p", { text: "You already worked this date. The result stays." }),
      el("textarea", { class: "share", id: "share", readonly: "readonly", "aria-label": "Shareable result" }, [emoji]),
      button("Copy result", "copy", "primary"),
      button("Practice this lot", "practice", "ghost"),
      button("Back", "title", "ghost")
    ]));
  }

  function beginLot(seed, flags) {
    flags = flags || {};
    run = {
      seed: seed >>> 0,
      daily: !!flags.daily,
      practice: !!flags.practice,
      date: flags.date || null,
      guesses: [],
      priced: [],
      bulk: 0
    };
    var auction = Sim.createAuction(run.seed);
    session = Sim.createSession(auction, { peeks: Sim.peekBudget(state) });
    session.running = true;
    paused = false;
    hideOverlay();
    setView("auction");
    portalStart();
  }

  function finishAuction() {
    if (!session || !session.running) return;
    session.running = false;
    portalStop();
    var auction = session.auction;
    var canPay = session.leader === "player" && session.high <= state.coins;
    run.items = auction.items;
    run.trueValue = auction.trueValue;
    run.price = session.high;
    run.opening = auction.opening;
    run.leader = session.leader;
    run.leaderName = Sim.whoName(session, session.leader);
    run.displayWon = canPay;
    run.won = canPay && !run.practice;
    run.paid = run.won ? session.high : 0;
    run.peeksUsed = session.peeked.length;
    run.peekMax = session.peekMax;
    run.guesses = [];
    if (!run.practice) {
      state.stats.auctions += 1;
      if (run.won) {
        state.coins -= session.high;
        state.stats.spent += session.high;
        state.stats.wins += 1;
        state.pending = {
          seed: run.seed,
          paid: session.high,
          daily: !!run.daily,
          date: run.date,
          peeksUsed: run.peeksUsed,
          peekMax: run.peekMax,
          guesses: []
        };
      }
      if (!run.daily) state.lotInDay += 1;
    }
    persist();
    if (canPay) setView("reveal");
    else closeLot();
  }

  function closeLot() {
    if (run && run.daily && !run.practice && !run.displayWon) {
      var emoji = Sim.dailyCard(run.date, {
        peeksUsed: run.peeksUsed,
        peekMax: run.peekMax,
        distances: [],
        delta: 0,
        won: false,
        leader: run.leader
      });
      state.daily = { date: run.date, emoji: emoji, delta: 0, won: false };
    }
    if (!run.practice) {
      state.pending = null;
      state.lastRecap = plainRecap();
    }
    persist();
    setView("recap");
  }

  function plainRecap() {
    return {
      items: (run.items || []).map(function (item) {
        return { key: item.key, name: item.name, value: item.value, family: item.family, index: item.index };
      }),
      trueValue: run.trueValue,
      price: run.price,
      leader: run.leader,
      leaderName: run.leaderName,
      displayWon: !!run.displayWon,
      won: !!run.won,
      paid: run.paid || 0,
      priced: run.priced || [],
      bulk: run.bulk || 0,
      daily: !!run.daily,
      date: run.date || null,
      practice: !!run.practice,
      peeksUsed: run.peeksUsed || 0,
      peekMax: run.peekMax || 3
    };
  }

  function settleFinds() {
    if (!run || run.settled) {
      closeLot();
      return;
    }
    var bands = Items.makeBands(!!state.book);
    var priced = [];
    for (var i = 0; i < run.items.length; i++) {
      var item = run.items[i];
      var trueBand = Items.bandIndex(item.value, bands);
      var guess = Sim.finiteInt(run.guesses[i], 0, 0, bands.length - 1);
      var distance = Math.abs(guess - trueBand);
      priced.push({
        item: { key: item.key, name: item.name, value: item.value, family: item.family, index: item.index },
        distance: distance,
        list: Items.salePrice(item.value, distance)
      });
    }
    run.priced = priced;
    run.settled = true;
    if (run.practice) {
      closeLot();
      return;
    }
    if (run.daily) {
      var gain = 0;
      for (var g = 0; g < priced.length; g++) gain += priced[g].list;
      state.coins += gain;
      state.stats.earned += gain;
      var delta = gain - (run.paid || 0);
      var emoji = Sim.dailyCard(run.date, {
        peeksUsed: run.peeksUsed,
        peekMax: run.peekMax,
        distances: priced.map(function (row) { return row.distance; }),
        delta: delta,
        won: true,
        leader: "player"
      });
      state.daily = { date: run.date, emoji: emoji, delta: delta, won: true };
      run.saleTotal = gain;
      closeLot();
      return;
    }
    var cap = Sim.shelfCap(state);
    var room = Math.max(0, cap - state.shelf.length);
    var ranked = priced.slice().sort(function (a, b) { return b.list - a.list; });
    run.bulk = 0;
    for (var k = 0; k < ranked.length; k++) {
      var row = ranked[k];
      if (k < room) {
        state.shelf.push({
          uid: row.item.key + ":" + run.seed + ":" + k,
          name: row.item.name,
          familyName: "",
          list: row.list,
          trueValue: row.item.value
        });
      } else {
        var bulk = Math.max(1, Math.round(row.list * 2 / 5));
        state.coins += bulk;
        state.stats.earned += bulk;
        run.bulk += bulk;
      }
    }
    closeLot();
  }

  function resumePending() {
    var p = state.pending;
    if (!p || !Number.isFinite(Number(p.seed))) return false;
    var auction = Sim.createAuction(p.seed >>> 0);
    run = {
      seed: p.seed >>> 0,
      daily: !!p.daily,
      practice: false,
      date: p.date || null,
      items: auction.items,
      trueValue: auction.trueValue,
      price: p.paid,
      paid: p.paid,
      opening: auction.opening,
      leader: "player",
      leaderName: "You",
      displayWon: true,
      won: true,
      peeksUsed: p.peeksUsed || 0,
      peekMax: p.peekMax || Sim.peekBudget(state),
      guesses: Array.isArray(p.guesses) ? p.guesses.map(function (n) { return Sim.finiteInt(n, 0, 0, 20); }) : [],
      priced: [],
      bulk: 0
    };
    flipped = [false, false, false];
    setView("appraise");
    return true;
  }

  function doPeek() {
    if (!session || !session.running || paused) return;
    if (session.peeksLeft <= 0) {
      toast("No peeks left.");
      return;
    }
    var items = session.auction.items;
    var unseen = [];
    for (var i = 0; i < items.length; i++) if (session.peeked.indexOf(i) === -1) unseen.push(i);
    var pool = unseen.length ? unseen : items.map(function (_, i) { return i; });
    var rng = Sim.mulberry32(Sim.hashSeed(String(session.auction.seed) + ":peek:" + session.peeked.length));
    var pick = pool[Math.floor(rng() * pool.length)];
    session.peeksLeft -= 1;
    session.peeked.push(pick);
    session.peekIndex = pick;
    session.peekUntil = session.elapsed + 2200;
    blip(660, 0.08);
    updateAuctionHud();
  }

  function doBid() {
    if (!session || !session.running || paused) return;
    var res = Sim.tryPlayerBid(session, session.elapsed, state.coins);
    if (!res.ok) {
      toast(res.reason);
      return;
    }
    blip(420, 0.07);
    updateAuctionHud();
  }

  function chooseBand(index) {
    if (!run || !flipped[0] || !flipped[1] || !flipped[2]) {
      toast("Read the three cards.");
      return;
    }
    run.guesses.push(index);
    flipped = [false, false, false];
    if (state.pending && !run.practice) {
      state.pending.guesses = run.guesses.slice();
      persist();
    }
    blip(540, 0.05);
    if (run.guesses.length >= run.items.length) settleFinds();
    else render();
  }

  function startHaggle(item, next) {
    var rng = Sim.mulberry32(Sim.hashSeed(item.uid + ":" + state.day + ":" + state.stats.auctions));
    deal = Sim.openDeal(item.list, rng);
    dealUid = item.uid;
    dealName = item.name;
    dealNext = next || "shop";
    setView("haggle");
  }

  function finishDeal(sold) {
    if (sold > 0) {
      state.coins += sold;
      state.stats.earned += sold;
      state.shelf = state.shelf.filter(function (item) { return item.uid !== dealUid; });
      toast(deal.customer + " pays " + coinText(sold) + ".");
      blip(700, 0.1);
    } else toast((deal ? deal.customer : "They") + " walk away.");
    var next = dealNext;
    deal = null;
    persist();
    if (next === "after-lot") {
      if (state.lotInDay >= Sim.LOTS_PER_DAY) setView("dayend");
      else nextLot();
      return;
    }
    setView(next === "shop" ? "shop" : "title");
  }

  function acceptDeal() {
    if (!deal) return;
    finishDeal(deal.offer);
  }

  function counterDeal() {
    if (!deal) return;
    var slider = document.getElementById("offer");
    var counter = slider ? Number(slider.value) : deal.offer;
    var answer = Sim.answerCounter(deal, counter);
    if (answer.done) {
      finishDeal(answer.sold);
      return;
    }
    deal.offer = answer.offer;
    deal.step += 1;
    toast(deal.customer + " comes back with " + coinText(deal.offer) + ".");
    render();
  }

  function nextLot() {
    if (state.lotInDay >= Sim.LOTS_PER_DAY) {
      setView("dayend");
      return;
    }
    maybeMidgameAd().then(function () {
      var seed = Sim.hashSeed(state.salt + ":d" + state.day + ":l" + state.lotInDay);
      beginLot(seed, {});
    });
  }

  function startDaily() {
    var date = todayString();
    if (state.daily && state.daily.date === date && state.daily.emoji) {
      setView("daily");
      return;
    }
    beginLot(Sim.hashSeed("bidwick-daily:" + date), { daily: true, date: date });
  }

  function practiceDaily() {
    var date = todayString();
    beginLot(Sim.hashSeed("bidwick-daily:" + date), { daily: true, practice: true, date: date });
  }

  function buyUpgrade(id) {
    var up = null;
    for (var i = 0; i < Sim.UPGRADES.length; i++) if (Sim.UPGRADES[i].id === id) up = Sim.UPGRADES[i];
    if (!up || state[id] || state.coins < up.cost) return;
    state.coins -= up.cost;
    state[id] = true;
    persist();
    blip(600, 0.1);
    toast(up.name + " is on your bench.");
    render();
  }

  function bulkItem(uid) {
    var idx = -1;
    for (var i = 0; i < state.shelf.length; i++) if (state.shelf[i].uid === uid) idx = i;
    if (idx < 0) return;
    var item = state.shelf[idx];
    var gain = Math.max(1, Math.round(item.list * 2 / 5));
    state.shelf.splice(idx, 1);
    state.coins += gain;
    state.stats.earned += gain;
    persist();
    toast("Bulk bin, " + coinText(gain) + ".");
    render();
  }

  function copyShare() {
    var area = document.getElementById("share");
    var text = area ? area.value : (state.daily && state.daily.emoji) || "";
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast("Copied."); }).catch(function () { fallbackCopy(area); });
      return;
    }
    fallbackCopy(area);
  }

  function fallbackCopy(area) {
    if (!area) {
      toast("Select the result and copy it.");
      return;
    }
    area.focus();
    area.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
    toast(ok ? "Copied." : "Select the result and copy it.");
  }

  function act(name, arg) {
    if (name === "title") setView("title");
    else if (name === "help") setView("help");
    else if (name === "upgrades") setView("upgrades");
    else if (name === "shop") setView("shop");
    else if (name === "daily") startDaily();
    else if (name === "practice") practiceDaily();
    else if (name === "open") nextLot();
    else if (name === "peek") doPeek();
    else if (name === "bid") doBid();
    else if (name === "clues") {
      flipped = [false, false, false];
      setView("appraise");
    } else if (name === "flip") {
      var n = Number(arg);
      if (n >= 0 && n < 3) flipped[n] = true;
      render();
    } else if (name === "band") chooseBand(Number(arg));
    else if (name === "settle") settleFinds();
    else if (name === "customer") {
      if (state.shelf.length) startHaggle(state.shelf[state.shelf.length - 1], "after-lot");
    } else if (name === "next") nextLot();
    else if (name === "gate") setView("dayend");
    else if (name === "another") {
      state.day += 1;
      state.lotInDay = 0;
      state.lastRecap = null;
      persist();
      setView("title");
    } else if (name === "accept") acceptDeal();
    else if (name === "counter") counterDeal();
    else if (name === "walk") finishDeal(0);
    else if (name === "buy") buyUpgrade(arg);
    else if (name === "bulk") bulkItem(arg);
    else if (name === "call") {
      if (!state.shelf.length) return;
      var best = state.shelf[0];
      for (var i = 1; i < state.shelf.length; i++) if (state.shelf[i].list > best.list) best = state.shelf[i];
      startHaggle(best, "shop");
    } else if (name === "copy") copyShare();
    else if (name === "recap-open" && state.lastRecap) {
      run = state.lastRecap;
      setView("recap");
    }
  }

  function frameTick(now) {
    var delta = Math.min(80, now - lastFrame);
    lastFrame = now;
    if (!paused && !document.hidden && session && session.running && view === "auction") {
      session.elapsed += delta * timeScale;
      Sim.pumpAi(session);
      if (session.elapsed >= session.clockEnd) finishAuction();
      else updateAuctionHud();
    }
    if (view === "reveal" && run && run.displayWon) {
      if (!paused && !document.hidden) revealMs += delta * (reduceMotion ? 30 : timeScale);
      if (!run.chimed && (reduceMotion || revealMs > 1000)) {
        run.chimed = true;
        chime();
      }
      if (!run.listed && (reduceMotion || revealMs > 820)) {
        run.listed = true;
        render();
      }
    }
    if (view === "title" || view === "auction" || view === "reveal") drawScene();
    requestAnimationFrame(frameTick);
  }

  function publicState() {
    return {
      coins: state.coins,
      day: state.day,
      lotInDay: state.lotInDay,
      flashlight: state.flashlight === true,
      book: state.book === true,
      shop: state.shop === true,
      mute: state.mute === true,
      shelf: state.shelf.map(function (item) {
        return { uid: item.uid, name: item.name, familyName: item.familyName, list: item.list, trueValue: item.trueValue };
      }),
      daily: state.daily ? { date: state.daily.date, emoji: state.daily.emoji, delta: state.daily.delta, won: state.daily.won } : null
    };
  }

  function installQA() {
    window.BidwickQA = {
      ready: true,
      runSeededAuctions: function (count, seed) {
        return Sim.runSeededAuctions(count, seed);
      },
      rules: function () { return Sim.rulesHold(); },
      catalog: function () {
        return { families: Items.FAMILIES.length, items: Items.countItems() };
      },
      snapshot: function () { return publicState(); },
      save: function () { persist(); return publicState(); },
      load: function () {
        state = loadState();
        render();
        return publicState();
      },
      reset: function () {
        try { localStorage.removeItem(Sim.SAVE_KEY); } catch (err) { /* ignore */ }
        state = Sim.freshState();
        session = null;
        run = null;
        deal = null;
        setView("title");
        return publicState();
      },
      stamp: function (partial) {
        partial = partial || {};
        if (partial.coins != null) state.coins = partial.coins;
        if (partial.day != null) state.day = partial.day;
        if (partial.lotInDay != null) state.lotInDay = partial.lotInDay;
        if (partial.flashlight != null) state.flashlight = !!partial.flashlight;
        if (partial.book != null) state.book = !!partial.book;
        if (partial.shop != null) state.shop = !!partial.shop;
        if (partial.mute != null) state.mute = !!partial.mute;
        if (partial.shelf) state.shelf = partial.shelf;
        state = Sim.normalize(state);
        persist();
        render();
        return publicState();
      },
      show: function (name) { showSample(name); return name; },
      setTimeScale: function (n) { timeScale = Sim.finiteInt(n, 1, 1, 40); return timeScale; },
      layout: function () {
        var doc = document.documentElement;
        var rect = frame.getBoundingClientRect();
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          scrollHeight: doc.scrollHeight,
          clientHeight: doc.clientHeight,
          frameLeft: rect.left,
          frameTop: rect.top,
          frameRight: rect.right,
          frameBottom: rect.bottom,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          text: document.body.innerText || ""
        };
      }
    };
  }

  function showSample(name) {
    session = null;
    paused = false;
    hideOverlay();
    adhold.hidden = true;
    if (name === "auction") {
      var auction = Sim.createAuction(3);
      session = Sim.createSession(auction, { peeks: Sim.peekBudget(state) });
      session.running = false;
      session.elapsed = 28000;
      Sim.pumpAi(session);
      setView("auction");
      return;
    }
    if (name === "reveal" || name === "appraise" || name === "recap") {
      var lot = Sim.createAuction(5);
      run = {
        seed: 5,
        items: lot.items,
        trueValue: lot.trueValue,
        price: lot.opening + 10,
        leader: "player",
        leaderName: "You",
        displayWon: name !== "recap" ? true : false,
        won: false,
        paid: 0,
        daily: false,
        practice: true,
        guesses: [],
        priced: name === "recap" ? lot.items.map(function (item) {
          return { item: item, distance: 0, list: item.value };
        }) : [],
        bulk: 0,
        peeksUsed: 2,
        peekMax: 3,
        listed: true,
        chimed: true
      };
      if (name === "recap") {
        run.leader = "bram";
        run.leaderName = "Bram Holt";
        run.displayWon = false;
      }
      flipped = [false, false, false];
      setView(name === "reveal" ? "reveal" : name);
      if (name === "reveal") {
        run.listed = true;
        run.chimed = true;
        revealMs = 2000;
        render();
        drawScene();
      }
      return;
    }
    if (name === "haggle") {
      deal = Sim.openDeal(48, Sim.mulberry32(2));
      dealName = "Chimney lamp";
      dealNext = "shop";
      setView("haggle");
      return;
    }
    if (name === "shop") {
      if (!state.shelf.length) {
        state.shelf = [{ uid: "sample", name: "Chimney lamp", familyName: "Wick lamps", list: 22, trueValue: 22 }];
      }
      setView("shop");
      return;
    }
    if (name === "pause") {
      setView("title");
      showOverlay();
      return;
    }
    if (name === "daily") {
      state.daily = state.daily || { date: todayString(), emoji: "Bidwick · sample\n\uD83D\uDD26\uD83D\uDD26\uD83C\uDF11\nPassed · 0 coins\n\u25AB\uFE0F", delta: 0, won: false };
      setView("daily");
      return;
    }
    if (name === "dayend" || name === "help" || name === "upgrades" || name === "title") {
      setView(name);
      return;
    }
    setView("title");
  }

  screen.addEventListener("click", function (ev) {
    var btn = ev.target.closest && ev.target.closest("[data-act]");
    if (!btn || btn.disabled) return;
    act(btn.getAttribute("data-act"), btn.getAttribute("data-arg"));
  });

  muteBtn.addEventListener("click", function () {
    unlockAudio();
    if (forcedMute()) {
      toast("Sound is held off.");
      return;
    }
    state.mute = !state.mute;
    persist();
    updateMuteLabel();
  });

  pauseBtn.addEventListener("click", function () {
    if (paused) resumePlay();
    else doPause();
  });

  document.getElementById("resume").addEventListener("click", resumePlay);

  document.addEventListener("pointerdown", function () { unlockAudio(); }, { passive: true });

  document.addEventListener("keydown", function (ev) {
    var tag = ev.target && ev.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (ev.key === "m" || ev.key === "M") muteBtn.click();
    else if (ev.key === "p" || ev.key === "P" || ev.key === "Escape") {
      if (paused) resumePlay();
      else doPause();
    } else if (ev.key === " " && view === "auction") {
      ev.preventDefault();
      doPeek();
    } else if (ev.key === "Enter" && view === "auction") doBid();
  });

  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("resize", fit);

  fit();
  state = loadState();
  if (!resumePending()) setView("title");
  if (QA) installQA();
  requestAnimationFrame(function (now) {
    lastFrame = now;
    requestAnimationFrame(frameTick);
  });
  initPortal();
})();
