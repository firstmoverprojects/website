(function () {
  "use strict";
  var KEY = "fmp_utm_source";
  var FALLBACK = "site";

  function clean(value) {
    if (value == null) return "";
    var s = String(value).replace(/\+/g, " ").trim().toLowerCase();
    try { s = decodeURIComponent(s); } catch (e) { /* keep the raw token */ }
    s = s.trim().toLowerCase().replace(/[^a-z0-9\-_]/g, "-").slice(0, 200).replace(/^-+|-+$/g, "");
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(s) || s === FALLBACK) return "";
    return s;
  }

  function fromLocation() {
    var q = "";
    try { q = location.search || ""; } catch (e) { q = ""; }
    var m = /(?:^|[?&])utm_source=([^&#]*)/.exec(q);
    return m ? clean(m[1]) : "";
  }

  function landingSource() {
    var fromUrl = fromLocation();
    var saved = "";
    try {
      saved = clean(sessionStorage.getItem(KEY));
      if (!saved && fromUrl) {
        sessionStorage.setItem(KEY, fromUrl);
        saved = fromUrl;
      }
    } catch (e) {
      saved = fromUrl;
    }
    return saved || FALLBACK;
  }

  function patchHref(anchor, source) {
    if (!anchor || !source || source === FALLBACK || !anchor.getAttribute) return;
    var href = anchor.getAttribute("href");
    if (!href || href.indexOf("firstmoverprojects.gumroad.com/l/") === -1) return;
    if (href.indexOf("utm_source=") === -1) return;
    var next = href.replace(/([?&]utm_source=)[^&#]*/, "$1" + source);
    if (next !== href) anchor.setAttribute("href", next);
  }

  function patchAll(source) {
    if (!document.querySelectorAll) return;
    var links = document.querySelectorAll('a[href*="firstmoverprojects.gumroad.com/l/"]');
    for (var i = 0; i < links.length; i++) patchHref(links[i], source);
  }

  function onClick(ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    patchHref(t.closest("a"), landingSource());
  }

  patchAll(landingSource());
  document.addEventListener("click", onClick, true);
  document.addEventListener("auxclick", onClick, true);
})();
