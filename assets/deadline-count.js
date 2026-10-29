(function () {
  "use strict";

  function chicagoYmd(date) {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    var map = { year: "", month: "", day: "" };
    for (var i = 0; i < parts.length; i++) {
      if (Object.prototype.hasOwnProperty.call(map, parts[i].type)) map[parts[i].type] = parts[i].value;
    }
    return map.year + "-" + map.month + "-" + map.day;
  }

  function daysUntil(deadline, now) {
    function utc(ymd) {
      var p = String(ymd).split("-");
      return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    }
    return Math.round((utc(deadline) - utc(chicagoYmd(now))) / 86400000);
  }

  function line(days, label) {
    if (days > 1) return days + " days left until the " + label + " (Central Time).";
    if (days === 1) return "1 day left until the " + label + " (Central Time).";
    if (days === 0) return "Today is the " + label + " (Central Time).";
    return "";
  }

  function render(now) {
    if (!document.querySelectorAll) return;
    var nodes = document.querySelectorAll(".deadline-count");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var text = "";
      try {
        text = line(daysUntil(el.getAttribute("data-deadline"), now || new Date()), el.getAttribute("data-deadline-label") || "");
      } catch (e) {
        text = "";
      }
      if (!text) {
        el.hidden = true;
        el.textContent = "";
      } else {
        el.textContent = text;
        el.hidden = false;
      }
    }
  }

  var api = { chicagoYmd: chicagoYmd, daysUntil: daysUntil, line: line, render: render };
  if (typeof window !== "undefined") window.fmpDeadlineCount = api;
  if (typeof document !== "undefined") render(new Date());
})();
