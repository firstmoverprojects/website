/* Deadline Finder v1. Vanilla JS, no network calls, no storage. Works without JS: the full list is server-rendered. */
(function () {
  "use strict";
  var el = document.getElementById("finder-data");
  if (!el) return;
  var D = JSON.parse(el.textContent);
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var now = new Date();
  var today = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
  if (today < D.today) today = D.today; /* never show a date as upcoming that the build already treated as passed */
  var byId = {};
  D.items.forEach(function (it) { byId[it.id] = it; });
  function status(it) {
    if (today >= it.review_by) return "expired";
    if (it.primary_date < today) {
      if (it.past_summary) return "passed";
      return it.key_dates.some(function (k) { return k.date >= today; }) ? "upcoming" : "expired";
    }
    return "upcoming";
  }
  var arts = Array.prototype.slice.call(document.querySelectorAll("article.item"));
  /* re-label dates that passed since the build */
  arts.forEach(function (a) {
    var it = byId[a.id];
    if (!it) return;
    var st = status(it);
    if (st === "expired") { a.parentNode.removeChild(a); return; }
    if (st !== a.getAttribute("data-status")) {
      /* status changed after build: hide rather than show stale wording */
      a.parentNode.removeChild(a); return;
    }
    var late = today >= D.past_switch;
    var ps = a.querySelector(".past-sum");
    if (ps && late && it.past_summary_late) ps.textContent = it.past_summary_late;
    var lis = a.querySelectorAll("ul.kd li");
    it.key_dates.forEach(function (k, i) {
      if (lis[i] && k.date < today && lis[i].className !== "past") {
        lis[i].className = "past";
        lis[i].querySelector("strong").textContent = "passed on " + k.label;
      }
    });
    var act = a.querySelector(".act");
    var future = it.key_dates.filter(function (k) { return k.date >= today; });
    if (act && future.length) {
      act.hidden = false;
      act.querySelector("button").addEventListener("click", function () { ics(it, future); });
    }
  });
  arts = Array.prototype.slice.call(document.querySelectorAll("article.item"));

  function esc(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
  function ics(it, dates) {
    var stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    var L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//First Mover Projects//Deadline Finder//EN", "CALSCALE:GREGORIAN"];
    dates.forEach(function (k, i) {
      var d = k.date.replace(/-/g, "");
      var n = new Date(k.date + "T12:00:00"); n.setDate(n.getDate() + 1);
      var e = n.getFullYear() + pad(n.getMonth() + 1) + pad(n.getDate());
      L.push("BEGIN:VEVENT", "UID:" + it.id + "-" + i + "-" + d + "@firstmoverprojects.com", "DTSTAMP:" + stamp,
        "DTSTART;VALUE=DATE:" + d, "DTEND;VALUE=DATE:" + e,
        "SUMMARY:" + esc(it.tool + ": " + k.text),
        "DESCRIPTION:" + esc(it.change + ". Source: " + it.source_urls.join(" ") + "\nReminder one week before: " + D.own_dates),
        "BEGIN:VALARM", "TRIGGER:-P7D", "ACTION:DISPLAY", "DESCRIPTION:" + esc("Reminder " + D.own_dates), "END:VALARM", "END:VEVENT");
    });
    L.push("END:VCALENDAR");
    var b = new Blob([L.join("\r\n") + "\r\n"], { type: "text/calendar" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = it.id + ".ics";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.parentNode.removeChild(a); }, 0);
  }

  var tools = document.querySelector(".js-only");
  if (tools) tools.hidden = false;
  var boxes = Array.prototype.slice.call(document.querySelectorAll('input[name="tool"]'));
  var btn = document.getElementById("copy-all"), pre = document.getElementById("combined");
  var count = document.getElementById("count"), empty = document.getElementById("empty"), copied = document.getElementById("copied");
  function picked() { return boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; }); }
  function update() {
    var p = picked(), shown = [];
    arts.forEach(function (a) {
      var t = a.getAttribute("data-tools").split(" ");
      var on = !p.length || t.some(function (x) { return p.indexOf(x) !== -1; });
      a.hidden = !on;
      if (on && p.length) shown.push(byId[a.id]);
    });
    count.textContent = p.length ? shown.length : arts.length;
    empty.hidden = !!p.length;
    btn.disabled = !shown.length;
    copied.textContent = "";
    if (!shown.length) { pre.hidden = true; pre.textContent = ""; return; }
    var parts = ["I run a small business. Below are dated changes for tools we use, each with its source. For each one, help me check whether it affects us and what I should look at. " + D.quote_rule];
    shown.forEach(function (it, i) {
      var txt = it.prompt_text;
      if (status(it) === "passed" && it.past_prompt) txt = (today >= D.past_switch && it.past_prompt_late) ? it.past_prompt_late : it.past_prompt;
      parts.push("--- " + (i + 1) + ". " + it.tool + ": " + it.change + " ---\n" + txt);
    });
    parts.push("Do not buy, install, file or change anything, and do not log in to any account. Only list what I should check and I will decide.");
    pre.textContent = parts.join("\n\n");
    pre.hidden = false;
  }
  boxes.forEach(function (b) { b.addEventListener("change", update); });
  btn.addEventListener("click", function () {
    var t = pre.textContent;
    var done = function () { copied.textContent = "Copied."; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(done, function () { fallback(t); done(); });
    } else { fallback(t); done(); }
  });
  function fallback(t) {
    var r = document.createRange(); r.selectNodeContents(pre);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    try { document.execCommand("copy"); } catch (e) { /* user can copy the selected text */ }
  }
  update();
})();
