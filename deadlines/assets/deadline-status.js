/* Relabel hub rows whose date is before the visitor's local today.
   Static HTML is already correct without this script. Only chips marked
   data-chip="status" that still say "Upcoming", or an open window whose
   data-until date has passed, are changed. */
(function () {
  "use strict";
  var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  function parseDate(text) {
    var match = /^([A-Za-z]{3}) (\d{1,2}), (\d{4})$/.exec(String(text || "").trim());
    if (!match) return null;
    var month = MONTHS[match[1].toLowerCase()];
    if (month == null) return null;
    var day = Number(match[2]);
    var year = Number(match[3]);
    var date = new Date(year, month, day);
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
    return date;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function monthDay(date) {
    var names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return names[date.getMonth()] + " " + date.getDate();
  }

  function chipText(chip) {
    return String(chip.textContent || "").replace(/\s+/g, " ").trim();
  }

  function apply(root, now) {
    var today = startOfDay(now || new Date());
    var scope = root && root.querySelectorAll ? root : (typeof document !== "undefined" ? document : null);
    if (!scope || !scope.querySelectorAll) return;
    var rows = scope.querySelectorAll("tr.dated-item[data-date]");
    var i;
    for (i = 0; i < rows.length; i++) {
      var row = rows[i];
      var chip = row.querySelector("[data-chip='status']");
      if (!chip) continue;
      var when = parseDate(row.getAttribute("data-date"));
      if (!when) continue;
      var untilText = row.getAttribute("data-until");
      var until = untilText ? parseDate(untilText) : null;
      var whenPast = startOfDay(when).getTime() < today.getTime();
      var untilOpen = !!(until && startOfDay(until).getTime() >= today.getTime());
      var text = chipText(chip);

      if (until && untilOpen && whenPast) {
        if (text === "Upcoming" || chip.className === "chip") {
          chip.className = "chip";
          chip.textContent = row.getAttribute("data-open-label") || ("Until " + untilText);
        }
        continue;
      }
      if (until && !untilOpen) {
        chip.className = "chip chip--past chip--expired";
        chip.textContent = row.getAttribute("data-past-label") || ("Expired. Passed " + monthDay(until));
        continue;
      }
      if (text === "Upcoming" && whenPast) {
        chip.className = "chip chip--past chip--expired";
        chip.textContent = row.getAttribute("data-past-label") || ("Expired. Passed " + monthDay(when));
      }
    }
  }

  function boot() {
    apply(typeof document !== "undefined" ? document : null, new Date());
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
  var api = { parseDate: parseDate, apply: apply, monthDay: monthDay };
  if (typeof window !== "undefined") window.FMP_DEADLINE_STATUS = api;
})();
