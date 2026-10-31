"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const api = require("./deadline-watch.js");

const root = path.resolve(__dirname, "../..");
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "deadlines.json"), "utf8"));
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const js = fs.readFileSync(path.join(__dirname, "deadline-watch.js"), "utf8");
const failures = [];

function check(name, ok, extra) {
  if (!ok) failures.push(name + (extra ? ": " + extra : ""));
}

function weekday(iso) {
  const p = iso.split("-");
  return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
}

const dash = /\u2014|\u2013/;
check("json has no em dash or en dash", !dash.test(JSON.stringify(data)));
check("html has no em dash or en dash", !dash.test(html));
check("js has no em dash or en dash", !dash.test(js));
check("page has the plain top line", html.includes("A free web app that lists your business filing deadlines."));
check("page has the advice line", html.includes("Not tax or legal advice; confirm with the official source."));
check("page has the footer", html.includes("Thanks for your time. If this isn't right for you, please share it with someone it could help."));
check("page is noindex", /<meta\s+name="robots"\s+content="noindex"\s*>/.test(html));
check("page has no goatcounter", !/goatcounter|gtag|google-analytics|plausible/i.test(html + js));

const codes = data.states.map((s) => s.code);
check("51 jurisdictions", codes.length === 51, String(codes.length));
check("unique state codes", new Set(codes).size === 51);
check("DC included", codes.includes("DC"));
data.states.forEach((st) => {
  check(st.code + " office url", /^https:\/\/[^\s]+$/.test(st.officeUrl), st.officeUrl);
  check(st.code + " office name", typeof st.office === "string" && st.office.length > 3);
});

check("BOI not required for US companies", data.boi && data.boi.requiredForUsCompanies === false);
check("BOI has a source", /^https:\/\/[^\s]+$/.test(data.boi.sourceUrl));
check("no BOI deadline row", !data.deadlines.some((row) => /boi|beneficial ownership/i.test(row.title + row.id)));

const ids = new Set();
const iso = /^\d{4}-\d{2}-\d{2}$/;
data.deadlines.forEach((row) => {
  if (ids.has(row.id)) failures.push("duplicate id " + row.id);
  ids.add(row.id);
  if (!iso.test(row.date) || Number.isNaN(Date.parse(row.date + "T00:00:00Z"))) {
    failures.push(row.id + " bad date " + row.date);
  } else {
    const back = row.date;
    const d = new Date(row.date + "T00:00:00Z");
    const got = d.toISOString().slice(0, 10);
    if (got !== back) failures.push(row.id + " impossible date " + row.date);
  }
  if (!/^https:\/\/[^\s]+$/.test(row.sourceUrl)) failures.push(row.id + " missing source url");
  if (!row.sourceLabel) failures.push(row.id + " missing source label");
  if (!row.title || !row.detail) failures.push(row.id + " missing title or detail");
  if (!Array.isArray(row.types) || row.types.length === 0) failures.push(row.id + " missing types");
  if (row.state && !codes.includes(row.state)) failures.push(row.id + " unknown state " + row.state);
  (row.also || []).forEach((extra) => {
    if (!/^https:\/\/[^\s]+$/.test(extra.url)) failures.push(row.id + " bad extra url");
  });
});

const expect = {
  "fed-1040-2025": "2026-04-15",
  "fed-1065-2025": "2026-03-16",
  "fed-1065-2026": "2027-03-15",
  "fed-941-2026-q3": "2026-11-02",
  "fed-941-2027-q2": "2027-08-02",
  "fed-w2-2025": "2026-02-02",
  "fed-w2-2026": "2027-02-01",
  "fed-990-2026": "2027-05-17",
  "tx-franchise-2027": "2027-05-17",
  "fl-dissolve-2026": "2026-09-18",
  "fl-dissolve-2027": "2027-09-17"
};
Object.keys(expect).forEach((id) => {
  const row = data.deadlines.find((item) => item.id === id);
  check(id + " date", row && row.date === expect[id], row && row.date);
});
check("2026-03-15 is Sunday", weekday("2026-03-15") === 0);
check("2026-09-18 is Friday", weekday("2026-09-18") === 5);
check("2027-09-17 is Friday", weekday("2027-09-17") === 5);
check("2027-05-15 is Saturday", weekday("2027-05-15") === 6);
check("2027-05-17 is Monday", weekday("2027-05-17") === 1);

const sole = api.rowsFor(data, { type: "sole", employees: "no", state: "WY" });
check("Wyoming sole has federal rows", sole.some((row) => row.id === "fed-1040-2025"));
check("Wyoming sole has no state rows", sole.every((row) => !row.state));
check("Wyoming sole hides payroll", sole.every((row) => row.id.indexOf("941") === -1 && row.id.indexOf("940") === -1 && row.id.indexOf("w2") === -1));

const employer = api.rowsFor(data, { type: "scorp", employees: "yes", state: "TX" });
check("Texas S corp has 1120-S", employer.some((row) => row.id === "fed-1120s-2025"));
check("Texas S corp has 941", employer.some((row) => row.id === "fed-941-2026-q1"));
check("Texas S corp has franchise tax", employer.some((row) => row.id === "tx-franchise-2026"));
check("Texas S corp has no 1040", employer.every((row) => row.id.indexOf("1040") === -1 || row.id.indexOf("1040-es") !== -1 || row.id.indexOf("fed-es-") === 0));
check("Texas S corp is not a C corp return", employer.every((row) => row.id !== "fed-1120-2025"));

const nonprofit = api.rowsFor(data, { type: "nonprofit", employees: "no", state: "MI" });
check("Michigan nonprofit has 990", nonprofit.some((row) => row.id === "fed-990-2025"));
check("Michigan nonprofit has October report", nonprofit.some((row) => row.id === "mi-np-2026"));
check("Michigan nonprofit has no 1120", nonprofit.every((row) => row.id.indexOf("1120") === -1));

function unfold(ics) {
  return ics.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r\n/);
}

function parseIcs(ics) {
  const lines = unfold(ics);
  check("ics uses CRLF", ics.indexOf("\r\n") !== -1);
  ics.split("\r\n").forEach((line, index) => {
    if (line.length > 75) failures.push("ics line " + index + " is " + line.length + " octets");
  });
  const events = [];
  let current = null;
  let alarm = null;
  lines.forEach((line) => {
    if (line === "BEGIN:VEVENT") current = { alarms: [] };
    else if (line === "END:VEVENT") {
      events.push(current);
      current = null;
    } else if (line === "BEGIN:VALARM") alarm = {};
    else if (line === "END:VALARM") {
      current.alarms.push(alarm);
      alarm = null;
    } else if (alarm && line.indexOf("TRIGGER:") === 0) alarm.trigger = line.slice(8);
    else if (current && !alarm && line.indexOf("DTSTART;") === 0) current.start = line;
    else if (current && !alarm && line.indexOf("SUMMARY:") === 0) current.summary = line.slice(8);
    else if (current && !alarm && line.indexOf("URL:") === 0) current.url = line.slice(4);
  });
  return { lines, events };
}

const sample = api.rowsFor(data, { type: "ccorp", employees: "yes", state: "DE" }).filter((row) => !row.draft);
const ics = api.buildIcs(sample, "20261031T120000Z");
const parsed = parseIcs(ics);
check("calendar wrapper", parsed.lines[0] === "BEGIN:VCALENDAR" && parsed.lines[parsed.lines.length - 2] === "END:VCALENDAR");
check("event count", parsed.events.length === sample.length, parsed.events.length + " vs " + sample.length);
parsed.events.forEach((event) => {
  if (!event.start || event.start.indexOf("VALUE=DATE:") === -1) failures.push("missing DTSTART");
  if (!event.summary) failures.push("missing SUMMARY");
  if (!/^https:\/\//.test(event.url || "")) failures.push("missing URL " + event.summary);
  const triggers = (event.alarms || []).map((alarm) => alarm.trigger).sort();
  if (triggers.join(",") !== "-P1D,-P7D") failures.push("alarms " + triggers.join(",") + " for " + event.summary);
});

const hidden = sample.filter((row) => row.id !== sample[0].id);
const smaller = parseIcs(api.buildIcs(hidden, "20261031T120000Z"));
check("turned off row leaves the calendar", smaller.events.length === hidden.length);
check("empty calendar still parses", parseIcs(api.buildIcs([], "20261031T120000Z")).events.length === 0);

function walk(dir, acc) {
  fs.readdirSync(dir).forEach((name) => {
    if (name === ".git" || name === "node_modules") return;
    const full = path.join(dir, name);
    if (full === __dirname) return;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, acc);
    else if (/\.(html|xml|js|json|md|yml)$/.test(name)) acc.push(full);
  });
}
const others = [];
walk(root, others);
others.forEach((file) => {
  const text = fs.readFileSync(file, "utf8");
  if (text.includes("deadline-watch")) failures.push("linked from " + path.relative(root, file));
});

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok " + data.deadlines.length + " deadlines, " + data.states.length + " states, ics events " + parsed.events.length);
