/* Relabel dated rows. A row may set data-cutoff to an ISO UTC instant
   (for example 2026-11-19T20:00:00Z). That row flips from Upcoming at that
   instant, inclusive, instead of at the visitor's local midnight.
   Other rows flip once their date is before the visitor's local today.
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

  function parseCutoff(text) {
    var match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/.exec(String(text || "").trim());
    if (!match) return null;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var hour = Number(match[4]);
    var minute = Number(match[5]);
    var second = Number(match[6]);
    var ms = match[7] ? Number(match[7]) : 0;
    if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
    var instant = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
    if (instant.getUTCFullYear() !== year || instant.getUTCMonth() !== month - 1 || instant.getUTCDate() !== day) return null;
    if (instant.getUTCHours() !== hour || instant.getUTCMinutes() !== minute || instant.getUTCSeconds() !== second) return null;
    return instant.getTime();
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

  function pastLabel(row, when) {
    var label = row.getAttribute("data-past-label");
    if (label) return label;
    if (when) return "Expired. Passed " + monthDay(when);
    return "Expired";
  }

  function apply(root, now) {
    var instant = now || new Date();
    var today = startOfDay(instant);
    var scope = root && root.querySelectorAll ? root : (typeof document !== "undefined" ? document : null);
    if (!scope || !scope.querySelectorAll) return;
    var rows = scope.querySelectorAll(".dated-item[data-date]");
    var i;
    for (i = 0; i < rows.length; i++) {
      var row = rows[i];
      var chip = row.querySelector("[data-chip='status']");
      if (!chip) continue;
      var when = parseDate(row.getAttribute("data-date"));
      var cutoff = parseCutoff(row.getAttribute("data-cutoff"));
      if (cutoff != null) {
        if (chipText(chip) === "Upcoming" && instant.getTime() >= cutoff) {
          chip.className = "chip chip--past chip--expired";
          chip.textContent = pastLabel(row, when);
        }
        continue;
      }
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
        chip.textContent = pastLabel(row, when);
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
  var api = { parseDate: parseDate, parseCutoff: parseCutoff, apply: apply, monthDay: monthDay };
  if (typeof window !== "undefined") window.FMP_DEADLINE_STATUS = api;
})();
