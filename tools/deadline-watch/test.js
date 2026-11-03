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
check("page has the advice line", html.includes("General guidance, not legal, tax or IT advice."));
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
check("BOI not required for US persons", data.boi && data.boi.requiredForUsPersons === false);
check("BOI cites the FinCEN status page", data.boi.sourceUrl === "https://www.fincen.gov/boi");
check("BOI source label names FinCEN", data.boi.sourceLabel === "FinCEN: Beneficial ownership information");
check(
  "BOI summary states the US exemption",
  /Companies formed in the United States, including U\.S\. LLCs, do not file beneficial ownership \(BOI\) reports/.test(data.boi.summary) &&
    /U\.S\. persons are exempt/.test(data.boi.summary) &&
    /August 14, 2026/.test(data.boi.summary) &&
    /March 26, 2025 interim final rule/.test(data.boi.summary)
);
check(
  "BOI summary has no scare copy",
  !/penalt|fine|prison|criminal|jail|\$\d|willful|failure to file|must file|required to file|or else/i.test(data.boi.summary)
);
check("no BOI deadline row", !data.deadlines.some((row) => /boi|beneficial ownership/i.test(row.title + " " + row.detail + " " + row.id)));

const usMustFileBoi =
  /(?:U\.S\.|United States|domestic).{0,80}(?:LLC|compan(?:y|ies)|person).{0,120}(?:must|required to|have to|need to)\s+file.{0,40}(?:BOI|beneficial ownership)/i;
const fileBoiForUs =
  /(?:must|required to|have to|need to)\s+file.{0,60}(?:BOI|beneficial ownership).{0,120}(?:U\.S\.|United States|domestic|LLC)/i;
const directBoiOrder = [
  /(?:must|required to|have to|need to)\s+file\s+(?:a |your |the )?(?:BOI|beneficial ownership)/i,
  /(?:LLC|LLCs|compan(?:y|ies))\s+must\s+file/i,
  /file your (?:BOI|beneficial ownership)/i,
  /BOI reports? (?:is|are) due/i
];
function scanForStaleBoi(dir, acc) {
  fs.readdirSync(dir).forEach((name) => {
    if (name === ".git" || name === "node_modules") return;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) scanForStaleBoi(full, acc);
    else if (/\.(html|xml|js|json|md|yml|txt|ics)$/.test(name)) acc.push(full);
  });
}
const siteFiles = [];
scanForStaleBoi(root, siteFiles);
siteFiles.forEach((file) => {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file);
  if (usMustFileBoi.test(text) || fileBoiForUs.test(text) || directBoiOrder.some((pattern) => pattern.test(text))) {
    failures.push("stale US BOI filing copy in " + rel);
  }
});

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
const moSeller = api.rowsFor(data, { type: "sole", employees: "no", state: "MO" });
const moZero = moSeller.find((row) => row.id === "mo-zero-return-2026");
check("Missouri sole sees the zero-return rule", !!moZero);
check("Missouri zero-return date is the Code effective date", moZero && moZero.date === "2026-12-30");
check("Missouri zero-return can be turned off", moZero && /Turn this off if you have no open Missouri/.test(moZero.detail));
check("Missouri zero-return cites the November 2 order", moZero && moZero.sourceUrl === "https://www.sos.mo.gov/CMSImages/AdRules/moreg/2026/v51n21Nov2/v51n21.pdf");
check("Missouri nonprofit also sees the row", api.rowsFor(data, { type: "nonprofit", employees: "no", state: "MO" }).some((row) => row.id === "mo-zero-return-2026"));
check("a Texas seller does not get the Missouri row", api.rowsFor(data, { type: "sole", employees: "no", state: "TX" }).every((row) => row.id !== "mo-zero-return-2026"));
const moOn = moSeller.filter((row) => row.id !== "mo-zero-return-2026");
check("turning the Missouri row off drops it", moOn.length === moSeller.length - 1);
check("turned-off Missouri row leaves the calendar", parseIcs(api.buildIcs(moOn, "20261101T120000Z")).events.every((event) => (event.summary || "").indexOf("Missouri zero") === -1));

const miCorp = api.rowsFor(data, { type: "ccorp", employees: "yes", state: "MI" });
const detroit = miCorp.find((row) => row.id === "mi-detroit-biz-2026");
check("Michigan C corp sees the Detroit business tax change", !!detroit);
check("Detroit date is November 12, 2026", detroit && detroit.date === "2026-11-12");
check("Detroit row quotes November 12, 2026", detroit && /beginning November 12, 2026/.test(detroit.detail));
check("Detroit row can be turned off", detroit && /Turn this off if you do not file City of Detroit/.test(detroit.detail));
check("Detroit cites the business key-changes page", detroit && detroit.sourceUrl === "https://www.michigan.gov/taxes/citytax/detroit/key-changes/key-changes-for-business");
check("Michigan sole also sees the Detroit row", api.rowsFor(data, { type: "sole", employees: "no", state: "MI" }).some((row) => row.id === "mi-detroit-biz-2026"));
check("a Texas business does not get the Detroit row", api.rowsFor(data, { type: "ccorp", employees: "yes", state: "TX" }).every((row) => row.id !== "mi-detroit-biz-2026"));
const miOn = miCorp.filter((row) => row.id !== "mi-detroit-biz-2026");
check("turning the Detroit row off drops it", miOn.length === miCorp.length - 1);

const paLlc = api.rowsFor(data, { type: "mmllc", employees: "no", state: "PA" });
const paEnforce = paLlc.find((row) => row.id === "pa-enforce-2027");
check("Pennsylvania LLC sees 2027 annual report enforcement", !!paEnforce);
check("Pennsylvania enforcement date is January 4, 2027", paEnforce && paEnforce.date === "2027-01-04");
check("January 4, 2027 is Monday", weekday("2027-01-04") === 1);
check("Pennsylvania row says it is not one filing deadline", paEnforce && /not one association's filing deadline/.test(paEnforce.detail));
check("Pennsylvania row names six months", paEnforce && /within six months after it is due/.test(paEnforce.detail));
check("Pennsylvania row names the 60-day notice", paEnforce && /60 days after that notice/.test(paEnforce.detail));
check("Pennsylvania row names the foreign reregistration", paEnforce && /new Foreign Registration Statement/.test(paEnforce.detail));
check("Pennsylvania row names the $7 fee", paEnforce && /\$7/.test(paEnforce.detail));
check("Pennsylvania row names the $0 nonprofit fee", paEnforce && /\$0 for a nonprofit corporation/.test(paEnforce.detail));
check("Pennsylvania row can be turned off", paEnforce && /Turn this off if you are a sole proprietor and not an LLC/.test(paEnforce.detail));
check(
  "Pennsylvania cites the Department of State annual reports page",
  paEnforce && paEnforce.sourceUrl === "https://www.pa.gov/agencies/dos/programs/business/types-of-filings-and-registrations/annual-reports"
);
const paAlso = (paEnforce && paEnforce.also ? paEnforce.also : []).map((item) => item.url);
check("Pennsylvania row links section 381", paAlso.indexOf("https://www.legis.state.pa.us/WU01/LI/LI/CT/HTM/15/00.003.081.000..HTM") !== -1);
check("Pennsylvania row links section 419", paAlso.indexOf("https://www.legis.state.pa.us/WU01/LI/LI/CT/HTM/15/00.004.019.000..HTM") !== -1);
check("Pennsylvania row links the answer page", paAlso.indexOf("https://firstmoverprojects.com/deadlines/pennsylvania-annual-report-2027.html") !== -1);
check("Pennsylvania corporation also sees the row", api.rowsFor(data, { type: "ccorp", employees: "no", state: "PA" }).some((row) => row.id === "pa-enforce-2027"));
check("Pennsylvania nonprofit also sees the row", api.rowsFor(data, { type: "nonprofit", employees: "no", state: "PA" }).some((row) => row.id === "pa-enforce-2027"));
check("Pennsylvania sole does not get the row", api.rowsFor(data, { type: "sole", employees: "no", state: "PA" }).every((row) => row.id !== "pa-enforce-2027"));
check("a Texas business does not get the Pennsylvania enforcement row", api.rowsFor(data, { type: "mmllc", employees: "no", state: "TX" }).every((row) => row.id !== "pa-enforce-2027"));
const paOn = paLlc.filter((row) => row.id !== "pa-enforce-2027");
check("turning the Pennsylvania row off drops it", paOn.length === paLlc.length - 1);
check("turned-off Pennsylvania row leaves the calendar", parseIcs(api.buildIcs(paOn, "20261103T120000Z")).events.every((event) => (event.summary || "").indexOf("Pennsylvania annual report enforcement") === -1));

const mdFiler = api.rowsFor(data, { type: "mmllc", employees: "no", state: "MD" });
const mdEfile = mdFiler.find((row) => row.id === "md-efile-2027");
check("Maryland partnership sees electronic filing", !!mdEfile);
check("Maryland e-file row is January 1, 2027", mdEfile && mdEfile.date === "2027-01-01");
check("Maryland row quotes periods after December 31, 2026", mdEfile && /periods beginning after December 31, 2026/.test(mdEfile.detail));
check("Maryland row quotes taxable years after December 31, 2026", mdEfile && /taxable year beginning after December 31, 2026/.test(mdEfile.detail));
check("Maryland row names the under-15 corporation exception", mdEfile && /fewer than 15 employees/.test(mdEfile.detail));
check("Maryland row can be turned off", mdEfile && /Turn this off if you do not file one of these Maryland returns/.test(mdEfile.detail));
check("Maryland cites the Comptroller tax alert", mdEfile && mdEfile.sourceUrl === "https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/legal-publications/alerts/tax-alert-sales-and-use-tax-updates-2026-2027.pdf");
check("Maryland nonprofit also sees the row", api.rowsFor(data, { type: "nonprofit", employees: "no", state: "MD" }).some((row) => row.id === "md-efile-2027"));
check("a Texas seller does not get the Maryland e-file row", api.rowsFor(data, { type: "mmllc", employees: "no", state: "TX" }).every((row) => row.id !== "md-efile-2027"));
const mdFamli = mdFiler.find((row) => row.id === "md-famli-2027");
check("Maryland filter includes FAMLI", !!mdFamli);
check("FAMLI date is January 1, 2027", mdFamli && mdFamli.date === "2027-01-01");
check("FAMLI cites paidleave.maryland.gov", mdFamli && mdFamli.sourceUrl === "https://paidleave.maryland.gov/employers/make-contributions/");
check("FAMLI names COMAR 09.42", mdFamli && /COMAR 09\.42/.test(mdFamli.detail));
check("FAMLI avoids a contribution split", mdFamli && /does not state a contribution split/.test(mdFamli.detail));
check("FAMLI kit is only on that row", mdFamli && mdFamli.kit && mdFamli.kit.label === "Optional: $9 Maryland FAMLI notice kit");
check("a Texas business does not get the FAMLI row", api.rowsFor(data, { type: "ccorp", employees: "yes", state: "TX" }).every((row) => row.id !== "md-famli-2027"));
const famliCard = api.card(mdFamli, false, "2026-11-02");
check("FAMLI card links the kit", famliCard.indexOf("maryland-famli-payroll-notice-kit") !== -1);
check("FAMLI card has the advice line", famliCard.indexOf("General guidance, not legal, tax or IT advice.") !== -1);
const plainCard = api.card(mdEfile, false, "2026-11-02");
check("Maryland e-file card has no kit link", plainCard.indexOf("gumroad.com") === -1);
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
const deadlineWatchLinks = new Set([
  path.join(root, "tools/detroit-business-tax-check/index.html"),
  path.join(root, "deadlines/pennsylvania-annual-report-2027.html")
]);
others.forEach((file) => {
  const text = fs.readFileSync(file, "utf8");
  if (text.includes("deadline-watch") && !deadlineWatchLinks.has(file)) failures.push("linked from " + path.relative(root, file));
});
const detroitHtml = fs.readFileSync(path.join(root, "tools/detroit-business-tax-check/index.html"), "utf8");
const paPageHtml = fs.readFileSync(path.join(root, "deadlines/pennsylvania-annual-report-2027.html"), "utf8");
check("Detroit check links Deadline Watch", detroitHtml.includes("https://firstmoverprojects.com/tools/deadline-watch/"));
check("Detroit check stays noindex", /<meta\s+name="robots"\s+content="noindex"\s*>/.test(detroitHtml));
check("Pennsylvania page links Deadline Watch as a reminder", paPageHtml.includes("https://firstmoverprojects.com/tools/deadline-watch/"));
check("Deadline Watch links stay on the Detroit check and the Pennsylvania page", deadlineWatchLinks.size === 2);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok " + data.deadlines.length + " deadlines, " + data.states.length + " states, ics events " + parsed.events.length);
