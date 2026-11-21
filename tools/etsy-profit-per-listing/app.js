import {
  FREE_LISTING_CAP,
  ORDER_FIELDS,
  STATEMENT_FIELDS,
  attachFees,
  autoMapping,
  buildLines,
  buyerHeaders,
  capItems,
  dedupeFees,
  defaultRates,
  dropBuyerFields,
  estimateFees,
  feesForItems,
  formatMargin,
  formatUSD,
  isBuyerHeader,
  normalizeFeeRows,
  normalizeOrderItems,
  orderMappingOk,
  parseMoneyToCents,
  rollupListings,
  statementMappingOk
} from "./profit.js";

const STORAGE_KEY = "fmp-etsy-profit-per-listing";
const Papa = globalThis.Papa;

const feeFile = JSON.parse(document.getElementById("fee-defaults").textContent);
const offline = Boolean(globalThis.FMP_ETSY_OFFLINE);

const state = {
  items: [],
  fees: [],
  costs: {},
  rates: defaultRates(feeFile),
  month: "all",
  omittedIds: [],
  listings: [],
  lines: [],
  feeSource: "estimate",
  dropped: [],
  sortKey: "itemName",
  sortDir: 1,
  costStamp: "",
  omittedCount: 0
};

const els = {
  edition: document.getElementById("edition"),
  status: document.getElementById("status"),
  mapping: document.getElementById("mapping"),
  mappingFields: document.getElementById("mapping-fields"),
  mappingApply: document.getElementById("mapping-apply"),
  mappingError: document.getElementById("mapping-error"),
  results: document.getElementById("results"),
  capNote: document.getElementById("cap-note"),
  feeSource: document.getElementById("fee-source"),
  month: document.getElementById("month-filter"),
  flagSummary: document.getElementById("flag-summary"),
  summary: document.getElementById("summary"),
  tableBody: document.querySelector("#profit-table tbody"),
  tableFoot: document.querySelector("#profit-table tfoot"),
  costs: document.getElementById("costs"),
  rates: document.getElementById("fee-rates"),
  shareToggle: document.getElementById("share-by-date")
};

if (new URLSearchParams(location.search).get("qa") === "1") {
  document.documentElement.dataset.qa = "1";
}

els.edition.textContent = offline
  ? "Offline file for Etsy sellers. Every listing is included. Your files never leave this device."
  : "Free page for Etsy sellers. The free page includes 5 listings. Your files never leave this device.";

function listingCap() {
  return offline ? Infinity : FREE_LISTING_CAP;
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseCsv(text) {
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => String(header || "").trim()
  });
  const headers = parsed.meta.fields || [];
  const dropped = buyerHeaders(headers);
  const rows = parsed.data.map((row) => dropBuyerFields(row));
  return {
    headers: headers.filter((header) => !isBuyerHeader(header)),
    rows,
    dropped
  };
}

async function readFiles(fileList) {
  const out = [];
  for (const file of fileList) {
    const text = await file.text();
    out.push({ name: file.name, ...parseCsv(text) });
  }
  return out;
}

function rememberDropped(headers) {
  for (const header of headers) {
    if (!state.dropped.includes(header)) state.dropped.push(header);
  }
}

async function ingestOrders(fileList) {
  if (!fileList || !fileList.length) return;
  const [file] = await readFiles(fileList);
  rememberDropped(file.dropped);
  const detected = autoMapping(file.headers, ORDER_FIELDS);
  if (orderMappingOk(detected.mapping) && detected.ambiguous.length === 0) {
    acceptItems(normalizeOrderItems(file.rows, detected.mapping));
    state.mapping = null;
    els.mapping.hidden = true;
    return;
  }
  state.mapping = { kind: "order", file };
  renderMapping();
}

async function ingestStatements(fileList) {
  if (!fileList || !fileList.length) return;
  const files = await readFiles(fileList);
  const ready = [];
  const pending = [];
  for (const file of files) {
    rememberDropped(file.dropped);
    const detected = autoMapping(file.headers, STATEMENT_FIELDS);
    if (statementMappingOk(detected.mapping) && detected.ambiguous.length === 0) {
      ready.push(...normalizeFeeRows(file.rows, detected.mapping));
    } else pending.push(file);
  }
  state.fees = relevantFees(state.fees.concat(ready));
  if (pending.length) {
    state.mapping = { kind: "statement", file: pending[0], rest: pending.slice(1) };
    renderMapping();
    return;
  }
  state.mapping = null;
  els.mapping.hidden = true;
  recompute();
}

function bindFiles(inputId, zoneId, handler) {
  const input = document.getElementById(inputId);
  const zone = document.getElementById(zoneId);
  input.addEventListener("change", () => {
    const files = [...input.files];
    input.value = "";
    handler(files);
  });
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("drag");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("drag");
    handler(event.dataTransfer.files);
  });
}

function renderMapping() {
  const mapping = state.mapping;
  if (!mapping) {
    els.mapping.hidden = true;
    return;
  }
  const fields = mapping.kind === "order" ? ORDER_FIELDS : STATEMENT_FIELDS;
  const detected = autoMapping(mapping.file.headers, fields);
  const options = ['<option value="">Not in this file</option>']
    .concat(mapping.file.headers.map((header) => `<option value="${esc(header)}">${esc(header)}</option>`))
    .join("");
  els.mappingFields.innerHTML = fields.map((field) => {
    return `<label for="map-${field.id}">${esc(field.label)}</label><select id="map-${field.id}">${options}</select>`;
  }).join("");
  for (const field of fields) {
    const select = document.getElementById("map-" + field.id);
    if (detected.mapping[field.id]) select.value = detected.mapping[field.id];
  }
  document.getElementById("mapping-title").textContent = mapping.kind === "order"
    ? "Match the sold-order columns"
    : "Match the statement columns";
  els.mappingError.textContent = "";
  els.mapping.hidden = false;
}

function applyMapping() {
  const mappingState = state.mapping;
  const fields = mappingState.kind === "order" ? ORDER_FIELDS : STATEMENT_FIELDS;
  const mapping = {};
  for (const field of fields) mapping[field.id] = document.getElementById("map-" + field.id).value;
  const ok = mappingState.kind === "order" ? orderMappingOk(mapping) : statementMappingOk(mapping);
  if (!ok) {
    els.mappingError.textContent = "Choose the columns this file uses for the required fields.";
    return;
  }
  if (mappingState.kind === "order") {
    acceptItems(normalizeOrderItems(mappingState.file.rows, mapping));
    state.mapping = null;
    els.mapping.hidden = true;
    return;
  } else {
    state.fees = relevantFees(state.fees.concat(normalizeFeeRows(mappingState.file.rows, mapping)));
    const rest = mappingState.rest || [];
    if (rest.length) {
      state.mapping = { kind: "statement", file: rest[0], rest: rest.slice(1) };
      renderMapping();
      recompute();
      return;
    }
    state.mapping = null;
  }
  els.mapping.hidden = true;
  recompute();
}

function ensureCosts(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.listingId)) groups.set(item.listingId, { name: item.itemName, variations: [] });
    const group = groups.get(item.listingId);
    group.name = item.itemName || group.name;
    if (!group.variations.includes(item.variation)) group.variations.push(item.variation);
  }
  for (const [id, group] of groups) {
    const distinct = group.variations.filter((variation) => variation).length;
    if (!state.costs[id]) {
      state.costs[id] = {
        byVariation: distinct > 1,
        materialCents: 0,
        minutes: 0,
        variations: {}
      };
    }
    const entry = state.costs[id];
    entry.itemName = group.name;
    entry.variationList = group.variations;
    for (const variation of group.variations) {
      if (!entry.variations[variation]) entry.variations[variation] = { materialCents: 0, minutes: 0 };
    }
  }
}

function activeItems() {
  return capItems(state.items, listingCap());
}

function acceptItems(items) {
  const capped = capItems(items, listingCap());
  state.omittedCount = capped.omittedIds.length;
  state.items = capped.items;
  state.fees = relevantFees(state.fees);
  recompute();
}

function relevantFees(fees) {
  return feesForItems(dedupeFees(fees), state.items);
}

function recompute() {
  const capped = activeItems();
  ensureCosts(capped.items);
  let lines = buildLines(capped.items);
  if (state.fees.length) {
    lines = attachFees(lines, feesForItems(state.fees, capped.items));
    state.feeSource = "statement";
  } else {
    lines = estimateFees(lines, state.rates);
    state.feeSource = "estimate";
  }
  state.lines = lines;
  state.listings = rollupListings(lines, state.costs, state.month);
  save();
  render();
}

function refreshTable() {
  const capped = activeItems();
  let lines = buildLines(capped.items);
  lines = state.fees.length
    ? attachFees(lines, feesForItems(state.fees, capped.items))
    : estimateFees(lines, state.rates);
  state.lines = lines;
  state.feeSource = state.fees.length ? "statement" : "estimate";
  state.listings = rollupListings(lines, state.costs, state.month);
  save();
  renderTable();
  renderStatus();
}

function publicItem(item) {
  return {
    orderId: item.orderId,
    listingId: item.listingId,
    itemName: item.itemName,
    quantity: item.quantity,
    itemTotalCents: item.itemTotalCents,
    shippingCents: item.shippingCents,
    salesTaxCents: item.salesTaxCents,
    saleDate: item.saleDate,
    variation: item.variation,
    sku: item.sku,
    currency: item.currency
  };
}

function publicFee(fee) {
  return {
    date: fee.date,
    type: fee.type,
    title: fee.title,
    info: fee.info,
    orderId: fee.orderId,
    listingId: fee.listingId,
    kind: fee.kind,
    costCents: fee.costCents,
    currency: fee.currency
  };
}

function save() {
  const payload = {
    v: 1,
    items: state.items.map(publicItem),
    fees: state.fees.map(publicFee),
    costs: state.costs,
    rates: state.rates,
    month: state.month,
    omittedCount: state.omittedCount
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    state.items = Array.isArray(data.items) ? data.items : [];
    state.fees = Array.isArray(data.fees) ? data.fees : [];
    state.costs = data.costs && typeof data.costs === "object" ? data.costs : {};
    state.rates = { ...defaultRates(feeFile), ...(data.rates || {}) };
    state.month = data.month || "all";
    state.omittedCount = Number(data.omittedCount) || 0;
  } catch (err) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function erase() {
  localStorage.removeItem(STORAGE_KEY);
  state.items = [];
  state.fees = [];
  state.costs = {};
  state.lines = [];
  state.listings = [];
  state.month = "all";
  state.omittedCount = 0;
  state.dropped = [];
  state.mapping = null;
  state.rates = defaultRates(feeFile);
  state.costStamp = "";
  els.shareToggle.checked = false;
  renderRates();
  render();
}

function sortedListings() {
  const rows = state.listings.slice();
  const key = state.sortKey;
  const dir = state.sortDir;
  rows.sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string" || typeof bv === "string") {
      return String(av).localeCompare(String(bv)) * dir;
    }
    return (av - bv) * dir;
  });
  return rows;
}

function flagText(row) {
  const flags = [];
  if (row.losesMoney) flags.push("Loses money");
  if (row.thinMargin) flags.push("Margin under 15%");
  return flags.length ? flags.join(". ") : "None";
}

function renderTable() {
  const rows = sortedListings();
  els.tableBody.innerHTML = rows.map((row) => {
    const cls = [row.losesMoney ? "is-loss" : "", row.thinMargin ? "is-thin" : ""].filter(Boolean).join(" ");
    return `<tr data-listing="${esc(row.listingId)}" class="${cls}">
      <th scope="row">${esc(row.itemName)}</th>
      <td data-field="units">${esc(row.units)}</td>
      <td data-field="revenue" data-cents="${row.revenueCents}">${esc(formatUSD(row.revenueCents))}</td>
      <td data-field="fees" data-cents="${row.feeCents}">${esc(formatUSD(row.feeCents))}</td>
      <td data-field="materials" data-cents="${row.materialCents}">${esc(formatUSD(row.materialCents))}</td>
      <td data-field="profit" data-cents="${row.profitCents}">${esc(formatUSD(row.profitCents))}</td>
      <td data-field="margin">${esc(formatMargin(row.margin))}</td>
      <td data-field="perHour" data-cents="${row.perHourCents == null ? "" : row.perHourCents}">${row.perHourCents == null ? "Add labor minutes" : esc(formatUSD(row.perHourCents))}</td>
      <td data-field="flags">${esc(flagText(row))}</td>
    </tr>`;
  }).join("");
  const totals = rows.reduce((sum, row) => {
    sum.units += row.units;
    sum.revenueCents += row.revenueCents;
    sum.feeCents += row.feeCents;
    sum.materialCents += row.materialCents;
    sum.profitCents += row.profitCents;
    return sum;
  }, { units: 0, revenueCents: 0, feeCents: 0, materialCents: 0, profitCents: 0 });
  const margin = totals.revenueCents === 0 ? null : totals.profitCents / totals.revenueCents;
  els.tableFoot.innerHTML = `<tr>
    <th scope="row">Total</th>
    <td data-field="units">${totals.units}</td>
    <td data-field="revenue" data-cents="${totals.revenueCents}">${esc(formatUSD(totals.revenueCents))}</td>
    <td data-field="fees" data-cents="${totals.feeCents}">${esc(formatUSD(totals.feeCents))}</td>
    <td data-field="materials" data-cents="${totals.materialCents}">${esc(formatUSD(totals.materialCents))}</td>
    <td data-field="profit" data-cents="${totals.profitCents}">${esc(formatUSD(totals.profitCents))}</td>
    <td data-field="margin">${esc(formatMargin(margin))}</td>
    <td></td>
    <td></td>
  </tr>`;
  document.querySelectorAll("#profit-table thead th").forEach((th) => {
    const key = th.getAttribute("data-sort");
    th.setAttribute("aria-sort", key === state.sortKey ? (state.sortDir === 1 ? "ascending" : "descending") : "none");
  });
  const losses = rows.filter((row) => row.losesMoney).length;
  const thin = rows.filter((row) => row.thinMargin).length;
  els.flagSummary.textContent = rows.length
    ? losses + " listing" + (losses === 1 ? "" : "s") + " lose money. " + thin + " listing" + (thin === 1 ? "" : "s") + " have a margin under 15%."
    : "";
  els.summary.textContent = rows.length
    ? "Summary: " + totals.units + " units, revenue " + formatUSD(totals.revenueCents) + ", fees " + formatUSD(totals.feeCents) + ", materials " + formatUSD(totals.materialCents) + ", profit " + formatUSD(totals.profitCents) + ", margin " + (formatMargin(margin) || "n/a") + "."
    : "";
}

function costStamp() {
  const capped = activeItems();
  const ids = [];
  for (const item of capped.items) {
    const token = item.listingId + "=" + item.variation;
    if (!ids.includes(token)) ids.push(token);
  }
  return ids.join("|") + "::" + JSON.stringify(Object.keys(state.costs).sort().map((id) => [id, Boolean(state.costs[id].byVariation)]));
}

function renderCosts() {
  const stamp = costStamp();
  if (stamp === state.costStamp) return;
  state.costStamp = stamp;
  const capped = activeItems();
  const seen = [];
  const blocks = [];
  for (const item of capped.items) {
    if (seen.includes(item.listingId)) continue;
    seen.push(item.listingId);
    const entry = state.costs[item.listingId];
    const variations = entry.variationList || [];
    const split = `<label class="check"><input type="checkbox" data-split="${esc(item.listingId)}"${entry.byVariation ? " checked" : ""}> Costs differ by variation</label>`;
    let fields;
    if (entry.byVariation) {
      fields = variations.map((variation) => costFields(item.listingId, variation, entry.variations[variation], variation || "No variation")).join("");
    } else {
      fields = costFields(item.listingId, null, entry, "Per unit");
    }
    blocks.push(`<fieldset><legend>${esc(entry.itemName || item.listingId)}</legend>${split}${fields}</fieldset>`);
  }
  els.costs.innerHTML = blocks.join("");
}

function costFields(listingId, variation, values, label) {
  const variationAttr = variation == null ? "" : ` data-variation="${esc(variation)}"`;
  const material = ((values.materialCents || 0) / 100).toFixed(2);
  const minutes = values.minutes || 0;
  return `<div class="cost-row"><p>${esc(label)}</p>
    <label>Material cost<input data-field="material" data-listing="${esc(listingId)}"${variationAttr} inputmode="decimal" value="${esc(material)}"></label>
    <label>Labor minutes<input data-field="minutes" data-listing="${esc(listingId)}"${variationAttr} inputmode="decimal" value="${esc(minutes)}"></label>
  </div>`;
}

function renderMonth() {
  const months = [];
  for (const item of state.items) {
    const month = (item.saleDate || "").slice(0, 7);
    if (month && !months.includes(month)) months.push(month);
  }
  months.sort();
  const current = state.month;
  els.month.innerHTML = `<option value="all">All months</option>` + months.map((month) => `<option value="${esc(month)}">${esc(month)}</option>`).join("");
  els.month.value = months.includes(current) || current === "all" ? current : "all";
  state.month = els.month.value;
}

function renderStatus() {
  const capped = activeItems();
  const bits = [];
  if (state.items.length) bits.push(capped.items.length + " order rows in the table.");
  if (state.dropped.length) bits.push("Buyer columns dropped before saving: " + state.dropped.join(", ") + ".");
  else if (state.items.length) bits.push("No buyer-information columns were in the files.");
  if (state.feeSource === "statement") bits.push("Fees in this table come from the statement, matched by order ID.");
  else if (state.items.length) bits.push("No statement is loaded. Fees use the editable default rates.");
  bits.push("Saved on this device.");
  els.status.textContent = state.items.length || state.fees.length ? bits.join(" ") : "Choose a sold-order CSV to start. A statement CSV is optional.";
  els.feeSource.textContent = state.feeSource === "statement"
    ? "A statement is loaded, so these rates are not used for the table."
    : "These rates are used because no statement is loaded.";
  if (state.omittedCount && !offline) {
    els.capNote.hidden = false;
    const count = state.omittedCount;
    els.capNote.textContent = "The free page includes 5 listings. " + count + (count === 1 ? " listing was" : " listings were") + " left out. The offline file is the $19 download and it has no listing cap. This page does not open a checkout.";
  } else {
    els.capNote.hidden = true;
    els.capNote.textContent = "";
  }
  els.results.hidden = state.items.length === 0 && !state.mapping;
}

function render() {
  renderStatus();
  renderMonth();
  renderTable();
  renderCosts();
  if (!state.mapping) els.mapping.hidden = true;
}

function renderRates() {
  els.rates.innerHTML = feeFile.defaults.map((row) => {
    const source = `<a href="${esc(row.source)}">etsy.com/legal/fees</a>`;
    let control = "";
    if (row.id === "processing") {
      control = `<label>Percent<input id="rate-processing-percent" data-rate="processingPercent" inputmode="decimal" value="${esc(state.rates.processingPercent)}"></label>
        <label>Fixed amount per order<input id="rate-processing-fixed" data-rate="processingFixed" inputmode="decimal" value="${esc(state.rates.processingFixed)}"></label>`;
    } else if (row.id === "listing") {
      control = `<label>Amount per unit<input id="rate-listing" data-rate="listingFixed" inputmode="decimal" value="${esc(state.rates.listingFixed)}"></label>`;
    } else if (row.id === "offsiteAds") {
      control = choiceSelect(row, "offsitePercent") + `<label>Percent<input id="rate-offsite" data-rate="offsitePercent" inputmode="decimal" value="${esc(state.rates.offsitePercent)}"></label>`;
    } else if (row.id === "regulatory") {
      control = choiceSelect(row, "regulatoryPercent") + `<label>Percent<input id="rate-regulatory" data-rate="regulatoryPercent" inputmode="decimal" value="${esc(state.rates.regulatoryPercent)}"></label>`;
    } else if (row.id === "shareAndSave") {
      control = `<label>Credit percent<input id="rate-share" data-rate="sharePercent" inputmode="decimal" value="${esc(state.rates.sharePercent)}"></label>`;
    } else {
      control = `<label>Percent<input id="rate-transaction" data-rate="transactionPercent" inputmode="decimal" value="${esc(state.rates.transactionPercent)}"></label>`;
    }
    return `<fieldset><legend>${esc(row.label)}</legend><p>${esc(row.effectiveLabel)}. Source: ${source}.</p><p>${esc(row.note)}</p>${control}</fieldset>`;
  }).join("");
  els.shareToggle.checked = Boolean(state.rates.shareByDate);
}

function choiceSelect(row, rateKey) {
  const options = row.choices.map((choice) => `<option value="${esc(choice.percent)}">${esc(choice.label)}</option>`).join("");
  return `<label>Preset<select data-choice="${esc(rateKey)}">${options}</select></label>`;
}

function moneyInputToCents(value) {
  const text = String(value || "").trim().replace(/\.$/, "");
  if (!text) return 0;
  return parseMoneyToCents(text) || 0;
}

function readRateInput(input) {
  const key = input.dataset.rate;
  const number = Number(String(input.value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(number)) return;
  state.rates[key] = number;
  if (!state.fees.length) refreshTable();
  else save();
}

function exportCsv() {
  const header = ["Listing", "Listing ID", "Units", "Revenue", "Fees", "Materials", "Profit", "Margin percent", "Profit per labor hour", "Labor minutes", "Flags"];
  const lines = [header.join(",")];
  for (const row of sortedListings()) {
    lines.push([
      row.itemName,
      row.listingId,
      row.units,
      (row.revenueCents / 100).toFixed(2),
      (row.feeCents / 100).toFixed(2),
      (row.materialCents / 100).toFixed(2),
      (row.profitCents / 100).toFixed(2),
      row.margin == null ? "" : (row.margin * 100).toFixed(1),
      row.perHourCents == null ? "" : (row.perHourCents / 100).toFixed(2),
      row.laborMinutes,
      flagText(row)
    ].map(csvCell).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "profit-per-listing.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}

function onCostEvent(event) {
  const input = event.target;
  if (input.dataset.split) {
    const entry = state.costs[input.dataset.split];
    entry.byVariation = input.checked;
    state.costStamp = "";
    refreshTable();
    renderCosts();
    return;
  }
  if (!input.dataset.listing || !input.dataset.field) return;
  const entry = state.costs[input.dataset.listing];
  const target = input.hasAttribute("data-variation") ? entry.variations[input.dataset.variation] : entry;
  if (input.dataset.field === "material") target.materialCents = moneyInputToCents(input.value);
  else target.minutes = Number(input.value) || 0;
  refreshTable();
}

renderRates();
load();
if (state.items.length) recompute();
else render();

bindFiles("orders-file", "orders-drop", ingestOrders);
bindFiles("statements-file", "statements-drop", ingestStatements);
els.mappingApply.addEventListener("click", applyMapping);
els.month.addEventListener("change", () => {
  state.month = els.month.value;
  refreshTable();
});
els.costs.addEventListener("input", onCostEvent);
els.rates.addEventListener("input", (event) => {
  if (event.target.dataset.rate) readRateInput(event.target);
});
els.rates.addEventListener("change", (event) => {
  if (event.target.dataset.choice) {
    const key = event.target.dataset.choice;
    state.rates[key] = Number(event.target.value);
    const input = els.rates.querySelector(`[data-rate="${key}"]`);
    if (input) input.value = state.rates[key];
    if (!state.fees.length) refreshTable();
    else save();
  }
});
els.shareToggle.addEventListener("change", () => {
  state.rates.shareByDate = els.shareToggle.checked;
  if (!state.fees.length) refreshTable();
  else save();
});
document.getElementById("export-csv").addEventListener("click", exportCsv);
document.getElementById("print-summary").addEventListener("click", () => window.print());
document.getElementById("erase").addEventListener("click", erase);
document.getElementById("clear-statements").addEventListener("click", () => {
  state.fees = [];
  recompute();
});
document.querySelectorAll("#profit-table thead button").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.getAttribute("data-sort");
    if (state.sortKey === key) state.sortDir = -state.sortDir;
    else {
      state.sortKey = key;
      state.sortDir = key === "itemName" ? 1 : 1;
    }
    renderTable();
  });
});
