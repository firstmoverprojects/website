(function () {
  var q = location.search || "";
  var testVisit = /(?:^|[?&])(?:fmp_test=1|utm_source=fmp_test_exclude)(?:&|$)/.test(q);
  var kitClickBySlug = {
    "fire-to-iris-switch-checklist": "click-fire-kit",
    "amazon-1m-insurance-readiness-kit": "click-amazon-kit",
    "lnfgc": "click-etsy-kit"
  };
  function prefixExcludedClick(ev) {
    var node = ev.target && ev.target.closest ? ev.target.closest("[data-goatcounter-click]") : null;
    if (!node || !node.getAttribute) return;
    var cur = node.getAttribute("data-goatcounter-click") || "";
    if (!cur || cur.indexOf("TEST-EXCLUDE") === 0) return;
    node.setAttribute("data-goatcounter-click", "TEST-EXCLUDE/" + cur);
  }
  if (testVisit) {
    window.goatcounter = { path: function (p) { return "TEST-EXCLUDE" + p; } };
    document.addEventListener("click", prefixExcludedClick, true);
    document.addEventListener("auxclick", prefixExcludedClick, true);
  }
  function sendGcEvent(path, title) {
    if (!path) return;
    if (window.goatcounter && typeof window.goatcounter.count === "function") {
      window.goatcounter.count({
        path: path,
        title: title,
        event: true
      });
    }
    var gcCountUrl = "https://firstmoverprojects.goatcounter.com/count?p=" + encodeURIComponent(path) + "&t=" + encodeURIComponent(title) + "&e=true";
    try {
      if (typeof fetch === "function") fetch(gcCountUrl, { keepalive: true, mode: "no-cors" });
    } catch (fetchErr) {}
    try {
      if (typeof navigator !== "undefined" && navigator && typeof navigator.sendBeacon === "function") navigator.sendBeacon(gcCountUrl);
    } catch (beaconErr) {}
  }
  function trackGumroadClick(ev) {
    if (ev.type === "auxclick" && ev.button !== 1) return;
    var node = ev.target && ev.target.closest ? ev.target.closest("a") : null;
    if (!node || !node.getAttribute) return;
    var ctaPath = node.getAttribute("data-goatcounter-click") || "";
    if (ctaPath) {
      var ctaTitle = node.getAttribute("data-goatcounter-title") || ("CTA click: " + ctaPath);
      sendGcEvent(ctaPath, ctaTitle);
    }
    var href = node.getAttribute("href") || "";
    var toolSlug = node.getAttribute("data-tool-slug") || "";
    var className = node.getAttribute("class") || "";
    var path = "";
    var title = "";
    if (className.indexOf("follow-tiktok") !== -1) {
      if (!/^[a-z0-9-]{1,80}$/.test(toolSlug)) return;
      if (node.target !== "_blank") node.target = "_blank";
      if (typeof node.setAttribute === "function") {
        var tiktokRel = node.getAttribute("rel") || "";
        if (tiktokRel.indexOf("noopener") === -1) node.setAttribute("rel", (tiktokRel ? tiktokRel + " " : "") + "noopener");
      }
      // Keep the counted GoatCounter name, but do not leave a root-relative event literal in the source.
      path = (testVisit ? "TEST-EXCLUDE-" : "") + ["", "event", "tiktok-follow-click-"].join("/") + toolSlug;
      title = "TikTok follow click: " + toolSlug;
      sendGcEvent(path, title);
      return;
    }
    var parts = href.split("/");
    if (parts[0] !== "https:" || parts[2] !== "firstmoverprojects.gumroad.com" || parts[3] !== "l") return;
    if (href.indexOf("wanted=true") === -1) return;
    var slug = parts[4] || "";
    var cut = slug.search(/[?#]/);
    if (cut !== -1) slug = slug.slice(0, cut);
    if (!slug) return;
    if (node.target !== "_blank") node.target = "_blank";
    if (typeof node.setAttribute === "function") {
      var rel = node.getAttribute("rel") || "";
      if (rel.indexOf("noopener") === -1) node.setAttribute("rel", (rel ? rel + " " : "") + "noopener");
    }
    path = (testVisit ? "TEST-EXCLUDE/" : "") + "gumroad-click/" + slug;
    title = "Gumroad checkout click: " + slug;
    sendGcEvent(path, title);
    var kitPath = kitClickBySlug[slug];
    if (kitPath) {
      sendGcEvent((testVisit ? "TEST-EXCLUDE/" : "") + kitPath, "Kit buy click: " + kitPath);
    }
  }
  document.addEventListener("click", trackGumroadClick);
  document.addEventListener("auxclick", trackGumroadClick);
})();
