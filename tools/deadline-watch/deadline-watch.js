(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DeadlineWatch = api;
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      var app = document.getElementById("app");
      if (!app) return;
      fetch("deadlines.json", { credentials: "same-origin" })
        .then(function (res) {
          if (!res.ok) throw new Error("load");
          return res.json();
        })
        .then(function (data) {
          api.mount(data);
        })
        .catch(function () {
          var err = document.getElementById("load-error");
          if (err) err.hidden = false;
        });
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var STORAGE = "deadline-watch-v1";
  var TYPES = ["sole", "mmllc", "scorp", "ccorp", "nonprofit"];

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function parseIso(iso) {
    var p = String(iso).split("-");
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  }

  function formatDate(iso) {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    }).format(parseIso(iso));
  }

  function addDays(iso, n) {
    var d = parseIso(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }

  function stampFromDate(d) {
    return (
      d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) +
      "Z"
    );
  }

  function icsEscape(text) {
    return String(text)
      .replace(/\\/g, "\\\\")
      .replace(/\r\n|\n|\r/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function fold(line) {
    if (line.length <= 75) return line;
    var out = line.slice(0, 75);
    var rest = line.slice(75);
    while (rest.length) {
      out += "\r\n " + rest.slice(0, 74);
      rest = rest.slice(74);
    }
    return out;
  }

  function rowsFor(data, choice) {
    return data.deadlines
      .filter(function (row) {
        if (!choice || TYPES.indexOf(choice.type) === -1) return false;
        if (row.types.indexOf(choice.type) === -1) return false;
        if (row.needsEmployees && choice.employees !== "yes") return false;
        if (row.state && row.state !== choice.state) return false;
        return true;
      })
      .slice()
      .sort(function (a, b) {
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        if (a.title < b.title) return -1;
        if (a.title > b.title) return 1;
        return 0;
      });
  }

  function buildIcs(rows, dtstamp) {
    var stamp = dtstamp || stampFromDate(new Date());
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//First Mover Projects//Deadline Watch//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Deadline Watch"
    ];
    rows.forEach(function (row) {
      var description =
        row.detail + " Official source: " + row.sourceLabel + " " + row.sourceUrl;
      lines.push("BEGIN:VEVENT");
      lines.push("UID:" + row.id + "@deadline-watch.firstmoverprojects.com");
      lines.push("DTSTAMP:" + stamp);
      lines.push("DTSTART;VALUE=DATE:" + row.date.replace(/-/g, ""));
      lines.push("DTEND;VALUE=DATE:" + addDays(row.date, 1).replace(/-/g, ""));
      lines.push("SUMMARY:" + icsEscape(row.title));
      lines.push("DESCRIPTION:" + icsEscape(description));
      lines.push("URL:" + row.sourceUrl);
      lines.push("BEGIN:VALARM");
      lines.push("ACTION:DISPLAY");
      lines.push("DESCRIPTION:" + icsEscape("7 day reminder: " + row.title));
      lines.push("TRIGGER:-P7D");
      lines.push("END:VALARM");
      lines.push("BEGIN:VALARM");
      lines.push("ACTION:DISPLAY");
      lines.push("DESCRIPTION:" + icsEscape("1 day reminder: " + row.title));
      lines.push("TRIGGER:-P1D");
      lines.push("END:VALARM");
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    return lines.map(fold).join("\r\n") + "\r\n";
  }

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORAGE);
      if (!raw) return { off: {}, state: "", type: "sole", employees: "no" };
      var parsed = JSON.parse(raw);
      return {
        off: parsed.off && typeof parsed.off === "object" ? parsed.off : {},
        state: typeof parsed.state === "string" ? parsed.state : "",
        type: TYPES.indexOf(parsed.type) !== -1 ? parsed.type : "sole",
        employees: parsed.employees === "yes" ? "yes" : "no"
      };
    } catch (err) {
      return { off: {}, state: "", type: "sole", employees: "no" };
    }
  }

  function saveStore(store) {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(store));
    } catch (err) {
      /* private mode can block storage; the list still works for this visit */
    }
  }

  function hashChoice() {
    if (typeof location === "undefined" || !location.hash || location.hash.length < 2) return null;
    var params = new URLSearchParams(location.hash.slice(1));
    var choice = {};
    if (params.has("state")) choice.state = params.get("state");
    if (params.has("type") && TYPES.indexOf(params.get("type")) !== -1) choice.type = params.get("type");
    if (params.get("employees") === "yes" || params.get("employees") === "no") {
      choice.employees = params.get("employees");
    }
    return Object.keys(choice).length ? choice : null;
  }

  function esc(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function card(row, off, today) {
    var past = row.date < today;
    var bits = ['<article class="card' + (off ? " off" : "") + '">'];
    bits.push('<p class="when">' + esc(formatDate(row.date)) + "</p>");
    bits.push("<p>");
    if (past) bits.push('<span class="tag past">Passed</span> ');
    if (row.draft) bits.push('<span class="tag">Draft calendar</span> ');
    bits.push('<span class="title">' + esc(row.title) + "</span></p>");
    bits.push("<p>" + esc(row.detail) + "</p>");
    bits.push(
      '<p><a class="src" href="' +
        esc(row.sourceUrl) +
        '">' +
        esc(row.sourceLabel) +
        "</a></p>"
    );
    (row.also || []).forEach(function (extra) {
      bits.push(
        '<p><a class="src" href="' + esc(extra.url) + '">' + esc(extra.label) + "</a></p>"
      );
    });
    bits.push(
      '<p><button type="button" class="secondary" data-toggle="' +
        esc(row.id) +
        '">' +
        (off ? "Turn this back on" : "Doesn't apply to me") +
        "</button></p>"
    );
    bits.push("</article>");
    return bits.join("");
  }

  function mount(data) {
    var store = loadStore();
    var hashed = hashChoice();
    if (hashed) {
      if (hashed.state) store.state = hashed.state;
      if (hashed.type) store.type = hashed.type;
      if (hashed.employees) store.employees = hashed.employees;
    }
    var stateSelect = document.getElementById("state");
    var typeSelect = document.getElementById("type");
    var federalList = document.getElementById("federal-list");
    var stateList = document.getElementById("state-list");
    var summary = document.getElementById("summary");
    var draftNote = document.getElementById("draft-note");
    var boi = document.getElementById("boi");
    var exportBtn = document.getElementById("export");
    var exportStatus = document.getElementById("export-status");
    var known = {};
    data.states.forEach(function (st) {
      known[st.code] = st;
      var opt = document.createElement("option");
      opt.value = st.code;
      opt.textContent = st.name;
      stateSelect.appendChild(opt);
    });
    if (store.state && !known[store.state]) store.state = "";
    stateSelect.value = store.state;
    typeSelect.value = store.type;
    var radios = document.querySelectorAll('input[name="employees"]');
    radios.forEach(function (radio) {
      radio.checked = radio.value === store.employees;
    });
    if (data.boi && data.boi.summary) {
      boi.innerHTML =
        "<p>" +
        esc(data.boi.summary) +
        ' <a class="src" href="' +
        esc(data.boi.sourceUrl) +
        '">' +
        esc(data.boi.sourceLabel) +
        "</a></p>";
    }

    function choice() {
      var employees = "no";
      radios.forEach(function (radio) {
        if (radio.checked) employees = radio.value;
      });
      return {
        state: stateSelect.value,
        type: typeSelect.value,
        employees: employees
      };
    }

    function enabledRows() {
      var current = choice();
      return rowsFor(data, current).filter(function (row) {
        return !store.off[row.id];
      });
    }

    function render() {
      var current = choice();
      store.state = current.state;
      store.type = current.type;
      store.employees = current.employees;
      saveStore(store);
      var rows = rowsFor(data, current);
      var today = todayIso();
      var federal = rows.filter(function (row) {
        return !row.state;
      });
      var stateRows = rows.filter(function (row) {
        return row.state;
      });
      federalList.innerHTML = federal
        .map(function (row) {
          return card(row, !!store.off[row.id], today);
        })
        .join("");
      draftNote.hidden = !federal.some(function (row) {
        return row.draft && !store.off[row.id];
      });
      var stateHtml = "";
      if (!current.state || !known[current.state]) {
        stateHtml = "<p>Choose a state to see state filings.</p>";
      } else {
        var office = known[current.state];
        if (!stateRows.length) {
          stateHtml =
            '<p><a class="office" href="' +
            esc(office.officeUrl) +
            '">Check your state\'s site</a></p>' +
            "<p>" +
            esc(office.office) +
            ". We did not add a 2026 or 2027 date for this state and business type, because we could not tie one to an official page.</p>";
        } else {
          stateHtml = stateRows
            .map(function (row) {
              return card(row, !!store.off[row.id], today);
            })
            .join("");
          stateHtml +=
            '<p><a class="office" href="' +
            esc(office.officeUrl) +
            '">Check your state\'s site</a> for a filing that is not listed above. ' +
            esc(office.office) +
            ".</p>";
        }
      }
      stateList.innerHTML = stateHtml;
      var onCount = rows.filter(function (row) {
        return !store.off[row.id];
      }).length;
      var offCount = rows.length - onCount;
      summary.textContent =
        onCount +
        " on your list. " +
        offCount +
        " turned off. On and off choices stay in this browser only.";
      exportBtn.disabled = onCount === 0;
    }

    document.getElementById("filters").addEventListener("change", render);
    document.getElementById("app").addEventListener("click", function (event) {
      var btn = event.target.closest("[data-toggle]");
      if (!btn) return;
      var id = btn.getAttribute("data-toggle");
      if (store.off[id]) delete store.off[id];
      else store.off[id] = true;
      saveStore(store);
      render();
      var again = document.querySelector('[data-toggle="' + id + '"]');
      if (again) again.focus();
    });
    exportBtn.addEventListener("click", function () {
      var rows = enabledRows();
      exportStatus.textContent = "";
      if (!rows.length) {
        exportStatus.textContent = "Turn at least one deadline back on before you download a calendar.";
        return;
      }
      var ics = buildIcs(rows);
      var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = "deadline-watch.ics";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      exportStatus.textContent =
        "Downloaded " + rows.length + " deadlines. Each one has a 7 day reminder and a 1 day reminder.";
    });
    render();
  }

  return {
    rowsFor: rowsFor,
    buildIcs: buildIcs,
    formatDate: formatDate,
    addDays: addDays,
    mount: mount
  };
});
