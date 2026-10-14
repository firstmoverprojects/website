/* A/B CTA test (Risk A1/A2). Variant picked per page load; nothing stored on the device. */
(function () {
  var v = Math.random() < 0.5 ? "green" : "cyan";
  document.documentElement.setAttribute("data-ab-cta", v);
  function track(name) {
    if (window.goatcounter && window.goatcounter.count) {
      window.goatcounter.count({ path: "ab-cta/" + v + "/" + name, title: name, event: true });
    }
  }
  function init() {
    var links = document.querySelectorAll('a[href*="sibforms.com"], a[href*="gumroad.com"]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i], kind = a.href.indexOf("sibforms.com") > -1 ? "signup-click" : "gumroad-click";
      a.classList.add("btn", "btn--primary", "ab-cta");
      a.addEventListener("click", (function (k) { return function () { track(k); }; })(kind));
    }
    if (links.length) track("view");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
