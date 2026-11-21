// Profit per listing. No network, no storage. The page stores only the objects these functions return.

export const FREE_LISTING_CAP = 5;
export const LOW_MARGIN = 0.15;
export const SHARE_SAVE_CHANGE = "2027-01-04";

const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12
};

export const ORDER_FIELDS = [
  { id: "orderId", label: "Order ID", aliases: ["order id"] },
  { id: "listingId", label: "Listing ID", aliases: ["listing id"] },
  { id: "itemName", label: "Item name", aliases: ["item name", "listing title"] },
  { id: "quantity", label: "Quantity", aliases: ["quantity"] },
  { id: "price", label: "Unit price", aliases: ["price"] },
  { id: "itemTotal", label: "Item total", aliases: ["item total"] },
  { id: "discount", label: "Discount", aliases: ["coupon discount", "discount amount"] },
  { id: "shipping", label: "Shipping charged", aliases: ["order shipping", "shipping"] },
  { id: "salesTax", label: "Sales tax", aliases: ["order sales tax", "sales tax"] },
  { id: "saleDate", label: "Sale date", aliases: ["sale date"] },
  { id: "variations", label: "Variations", aliases: ["variations", "variation"] },
  { id: "sku", label: "SKU", aliases: ["sku"] },
  { id: "currency", label: "Currency", aliases: ["currency"] }
];

export const STATEMENT_FIELDS = [
  { id: "date", label: "Date", aliases: ["date"] },
  { id: "type", label: "Type", aliases: ["type"] },
  { id: "title", label: "Title", aliases: ["title"] },
  { id: "info", label: "Info", aliases: ["info"] },
  { id: "amount", label: "Amount", aliases: ["amount"] },
  { id: "fees", label: "Fees and taxes", aliases: ["fees & taxes", "fees and taxes"] },
  { id: "net", label: "Net", aliases: ["net"] },
  { id: "currency", label: "Currency", aliases: ["currency"] }
];

const BUYER_HEADER = [
  /^buyer$/,
  /^buyer user id$/,
  /^buyer email$/,
  /^buyer name$/,
  /^username$/,
  /^user name$/,
  /^user id$/,
  /^email$/,
  /^e-mail$/,
  /^full name$/,
  /^first name$/,
  /^last name$/,
  /^name$/,
  /^ship name$/,
  /^ship address\d*$/,
  /^ship city$/,
  /^ship state$/,
  /^ship zipcode$/,
  /^ship zip$/,
  /^ship country$/,
  /^ship to$/,
  /^phone$/,
  /^telephone$/,
  /^street$/,
  /^address$/,
  /^address ?\d$/,
  /^city$/,
  /^zipcode$/,
  /^zip code$/,
  /^postal/,
  /^country$/
];

export function normHeader(header) {
  return String(header || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function isBuyerHeader(header) {
  const name = normHeader(header);
  if (!name) return false;
  return BUYER_HEADER.some((pattern) => pattern.test(name));
}

export function buyerHeaders(headers) {
  return headers.filter((header) => isBuyerHeader(header));
}

export function dropBuyerFields(row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (!isBuyerHeader(key)) out[key] = value;
  }
  return out;
}

export function parseMoneyToCents(value) {
  if (value == null) return null;
  let text = String(value).trim();
  if (text === "" || text === "--" || text === "-" || text === "\u2014") return null;
  let negative = false;
  if (text.startsWith("(") && text.endsWith(")")) {
    negative = true;
    text = text.slice(1, -1).trim();
  }
  text = text.replace(/[$,\s]/g, "");
  if (text.startsWith("+")) text = text.slice(1);
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const cents = Math.round(Number(text) * 100);
  return negative ? -cents : cents;
}

export function parseFlexibleDate(value) {
  const text = String(value || "").trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) return validDate(match[1], match[2], match[3]);
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (match) return validDate(match[3], match[1], match[2]);
  match = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(text);
  if (match) return validDate(match[3], MONTHS[match[1].toLowerCase()], match[2]);
  match = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(text);
  if (match) return validDate(match[3], MONTHS[match[2].toLowerCase()], match[1]);
  return "";
}

function validDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return "";
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "";
  return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

export function cleanId(value) {
  let text = String(value ?? "").trim();
  if (/^\d+\.0+$/.test(text)) text = text.replace(/\.0+$/, "");
  return text;
}

export function autoMapping(headers, fields) {
  const mapping = {};
  const ambiguous = [];
  for (const field of fields) {
    const hits = headers.filter((header) => field.aliases.includes(normHeader(header)) && !isBuyerHeader(header));
    if (hits.length === 1) mapping[field.id] = hits[0];
    else mapping[field.id] = "";
    if (hits.length > 1) ambiguous.push(field.id);
  }
  return { mapping, ambiguous };
}

export function orderMappingOk(mapping) {
  if (!mapping.orderId || !mapping.quantity || !mapping.saleDate) return false;
  if (!mapping.itemTotal && !mapping.price) return false;
  if (!mapping.listingId && !mapping.itemName) return false;
  return true;
}

export function statementMappingOk(mapping) {
  if (!mapping.title || !mapping.info) return false;
  if (!mapping.fees && !mapping.amount) return false;
  return true;
}

function cell(row, header) {
  if (!header) return "";
  const value = row[header];
  return value == null ? "" : String(value).trim();
}

export function normalizeOrderItems(rows, mapping) {
  return rows.map((row) => {
    const clean = dropBuyerFields(row);
    const quantity = Number(String(cell(clean, mapping.quantity)).replace(/,/g, ""));
    const priceCents = parseMoneyToCents(cell(clean, mapping.price));
    const discountCents = parseMoneyToCents(cell(clean, mapping.discount)) || 0;
    let itemTotalCents = parseMoneyToCents(cell(clean, mapping.itemTotal));
    if (itemTotalCents == null) {
      const unit = priceCents == null ? 0 : priceCents;
      const qty = Number.isFinite(quantity) ? quantity : 0;
      itemTotalCents = Math.round(unit * qty) - discountCents;
    }
    const shipping = parseMoneyToCents(cell(clean, mapping.shipping));
    const tax = parseMoneyToCents(cell(clean, mapping.salesTax));
    const listingId = cleanId(cell(clean, mapping.listingId));
    const itemName = cell(clean, mapping.itemName);
    return {
      orderId: cleanId(cell(clean, mapping.orderId)),
      listingId: listingId || itemName,
      itemName: itemName || listingId,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      itemTotalCents,
      shippingCents: shipping == null ? 0 : shipping,
      salesTaxCents: tax == null ? 0 : tax,
      saleDate: parseFlexibleDate(cell(clean, mapping.saleDate)),
      variation: cell(clean, mapping.variations),
      sku: cell(clean, mapping.sku),
      currency: cell(clean, mapping.currency) || "USD"
    };
  }).filter((item) => item.orderId && item.listingId && item.saleDate);
}

export function classifyFeeTitle(title) {
  const text = String(title || "").toLowerCase();
  if (/share\s*&\s*save|share and save/.test(text)) return "shareAndSave";
  if (/offsite ads/.test(text)) return "offsiteAds";
  if (/regulatory/.test(text)) return "regulatory";
  if (/processing fee/.test(text)) return "processing";
  if (/listing fee|auto-renew|renew sold|renewal fee/.test(text)) return "listing";
  if (/transaction fee/.test(text)) return "transaction";
  return "";
}

export function extractOrderId(text) {
  const match = /order\s*#\s*(\d+)/i.exec(String(text || ""));
  return match ? match[1] : "";
}

export function extractListingId(text) {
  const match = /listing\s*#\s*([a-z0-9_-]+)/i.exec(String(text || ""));
  return match ? match[1] : "";
}

export function feeCostCents(amountCents, feesCents, type) {
  if (feesCents != null && feesCents !== 0) return -feesCents;
  const kind = String(type || "").trim().toLowerCase();
  if (amountCents != null && amountCents !== 0 && (kind === "fee" || kind === "marketing" || kind === "vat")) {
    return -amountCents;
  }
  return 0;
}

export function normalizeFeeRows(rows, mapping) {
  const fees = [];
  for (const row of rows) {
    const clean = dropBuyerFields(row);
    const title = cell(clean, mapping.title);
    const kind = classifyFeeTitle(title);
    if (!kind) continue;
    const info = cell(clean, mapping.info);
    const amountCents = parseMoneyToCents(cell(clean, mapping.amount));
    const feesCents = parseMoneyToCents(cell(clean, mapping.fees));
    const costCents = feeCostCents(amountCents, feesCents, cell(clean, mapping.type));
    fees.push({
      date: parseFlexibleDate(cell(clean, mapping.date)),
      type: cell(clean, mapping.type),
      title,
      info,
      orderId: extractOrderId(info + " " + title),
      listingId: extractListingId(info + " " + title),
      kind,
      costCents,
      currency: cell(clean, mapping.currency) || "USD"
    });
  }
  return dedupeFees(fees);
}

export function dedupeFees(fees) {
  const seen = new Set();
  const out = [];
  for (const fee of fees) {
    const key = [fee.date, fee.kind, fee.orderId, fee.listingId, fee.title, fee.costCents].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(fee);
  }
  return out;
}

export function allocateCents(totalCents, weights) {
  const sign = totalCents < 0 ? -1 : 1;
  const total = Math.abs(totalCents);
  const safe = weights.map((weight) => Math.max(0, Number(weight) || 0));
  if (!safe.length || total === 0) return safe.map(() => 0);
  const sum = safe.reduce((acc, weight) => acc + weight, 0);
  const basis = sum === 0 ? safe.map(() => 1) : safe;
  const basisSum = basis.reduce((acc, weight) => acc + weight, 0);
  const exact = basis.map((weight) => (total * weight) / basisSum);
  const floors = exact.map((value) => Math.floor(value));
  let left = total - floors.reduce((acc, value) => acc + value, 0);
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (let i = 0; i < left; i += 1) floors[order[i % order.length].index] += 1;
  return floors.map((value) => value * sign);
}

export function buildLines(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.orderId)) groups.set(item.orderId, []);
    groups.get(item.orderId).push(item);
  }
  const lines = [];
  for (const [orderId, rows] of groups) {
    const shares = allocateCents(rows[0].shippingCents || 0, rows.map((row) => row.itemTotalCents));
    rows.forEach((row, index) => {
      const shippingCents = shares[index];
      lines.push({
        orderId,
        listingId: row.listingId,
        itemName: row.itemName,
        variation: row.variation || "",
        sku: row.sku || "",
        saleDate: row.saleDate,
        quantity: row.quantity,
        itemTotalCents: row.itemTotalCents,
        shippingCents,
        revenueCents: row.itemTotalCents + shippingCents,
        orderTaxCents: row.salesTaxCents || 0,
        currency: row.currency || "USD",
        feeCents: 0
      });
    });
  }
  return lines;
}

function addFee(line, cents) {
  line.feeCents += cents;
}

function dateDistance(saleDate, feeDate) {
  if (!saleDate || !feeDate) return Number.MAX_SAFE_INTEGER;
  const a = Date.parse(saleDate + "T00:00:00Z");
  const b = Date.parse(feeDate + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.MAX_SAFE_INTEGER;
  return Math.abs(a - b);
}

function distributeFee(targets, fee) {
  let pool = targets;
  if (fee.kind === "listing" && fee.listingId) {
    const narrowed = targets.filter((line) => line.listingId.toLowerCase() === fee.listingId.toLowerCase());
    if (narrowed.length) pool = narrowed;
  }
  const title = fee.title.toLowerCase();
  const shippingFee = fee.kind === "transaction" && /shipping/.test(title);
  if (!shippingFee) {
    const named = pool.filter((line) => line.itemName && title.includes(line.itemName.toLowerCase()));
    if (named.length === 1) {
      addFee(named[0], fee.costCents);
      return;
    }
  }
  const parts = allocateCents(fee.costCents, pool.map((line) => line.itemTotalCents));
  pool.forEach((line, index) => addFee(line, parts[index]));
}

export function attachFees(lines, fees) {
  const fresh = lines.map((line) => ({ ...line, feeCents: 0 }));
  const byOrder = new Map();
  for (const line of fresh) {
    if (!byOrder.has(line.orderId)) byOrder.set(line.orderId, []);
    byOrder.get(line.orderId).push(line);
  }
  for (const fee of fees) {
    if (!fee.kind || !fee.costCents) continue;
    let targets = [];
    if (fee.orderId && byOrder.has(fee.orderId)) {
      targets = byOrder.get(fee.orderId);
    } else if (fee.listingId) {
      const candidates = fresh.filter((line) => line.listingId.toLowerCase() === fee.listingId.toLowerCase());
      if (!candidates.length) continue;
      candidates.sort((a, b) => dateDistance(a.saleDate, fee.date) - dateDistance(b.saleDate, fee.date) || (a.orderId < b.orderId ? -1 : 1));
      targets = byOrder.get(candidates[0].orderId).filter((line) => line.listingId.toLowerCase() === fee.listingId.toLowerCase());
    }
    if (!targets.length) continue;
    distributeFee(targets, fee);
  }
  return fresh;
}

export function percentCents(baseCents, percent) {
  return Math.round((Number(baseCents) || 0) * (Number(percent) || 0) / 100);
}

export function estimateFees(lines, rates) {
  const fresh = lines.map((line) => ({ ...line, feeCents: 0 }));
  const groups = new Map();
  for (const line of fresh) {
    if (!groups.has(line.orderId)) groups.set(line.orderId, []);
    groups.get(line.orderId).push(line);
  }
  const listingFixed = Math.round((Number(rates.listingFixed) || 0) * 100);
  const processingFixed = Math.round((Number(rates.processingFixed) || 0) * 100);
  const cap = Math.round((Number(rates.offsiteCap) || 0) * 100);
  for (const group of groups.values()) {
    const base = group.reduce((sum, line) => sum + line.revenueCents, 0);
    const tax = group[0].orderTaxCents || 0;
    const quantity = group.reduce((sum, line) => sum + line.quantity, 0);
    let sharePercent = Number(rates.sharePercent) || 0;
    if (rates.shareByDate) {
      sharePercent = group[0].saleDate <= SHARE_SAVE_CHANGE ? Number(rates.shareHolidayPercent) || 6.5 : Number(rates.shareStandardPercent) || 4;
    }
    const pieces = [
      percentCents(base, rates.transactionPercent),
      percentCents(base + tax, rates.processingPercent) + processingFixed,
      listingFixed * quantity,
      Math.min(cap, Math.max(0, percentCents(base, rates.offsitePercent))),
      percentCents(base, rates.regulatoryPercent),
      -percentCents(base, sharePercent)
    ];
    for (const cost of pieces) {
      const parts = allocateCents(cost, group.map((line) => line.itemTotalCents));
      group.forEach((line, index) => addFee(line, parts[index]));
    }
  }
  return fresh;
}

export function resolveUnitCost(costs, listingId, variation) {
  const entry = (costs && costs[listingId]) || {};
  if (entry.byVariation && entry.variations && entry.variations[variation]) {
    return {
      materialCents: entry.variations[variation].materialCents || 0,
      minutes: entry.variations[variation].minutes || 0
    };
  }
  return {
    materialCents: entry.materialCents || 0,
    minutes: entry.minutes || 0
  };
}

export function rollupListings(lines, costs, month) {
  const filtered = !month || month === "all" ? lines : lines.filter((line) => line.saleDate.startsWith(month));
  const map = new Map();
  for (const line of filtered) {
    if (!map.has(line.listingId)) {
      map.set(line.listingId, {
        listingId: line.listingId,
        itemName: line.itemName,
        currency: line.currency || "USD",
        units: 0,
        revenueCents: 0,
        feeCents: 0,
        materialCents: 0,
        laborMinutes: 0,
        variations: []
      });
    }
    const row = map.get(line.listingId);
    if (line.itemName) row.itemName = line.itemName;
    const unit = resolveUnitCost(costs, line.listingId, line.variation);
    row.units += line.quantity;
    row.revenueCents += line.revenueCents;
    row.feeCents += line.feeCents;
    row.materialCents += unit.materialCents * line.quantity;
    row.laborMinutes += unit.minutes * line.quantity;
    if (!row.variations.includes(line.variation)) row.variations.push(line.variation);
  }
  const listings = [];
  for (const row of map.values()) {
    const profitCents = row.revenueCents - row.feeCents - row.materialCents;
    const margin = row.revenueCents === 0 ? null : profitCents / row.revenueCents;
    const perHourCents = row.laborMinutes > 0 ? Math.round((profitCents * 60) / row.laborMinutes) : null;
    listings.push({
      ...row,
      profitCents,
      margin,
      perHourCents,
      losesMoney: profitCents < 0,
      thinMargin: margin != null && margin < LOW_MARGIN
    });
  }
  return listings;
}

export function capItems(items, cap) {
  const order = [];
  for (const item of items) {
    if (!order.includes(item.listingId)) order.push(item.listingId);
  }
  if (!Number.isFinite(cap) || order.length <= cap) {
    return { items, keptIds: order, omittedIds: [] };
  }
  const kept = new Set(order.slice(0, cap));
  return {
    items: items.filter((item) => kept.has(item.listingId)),
    keptIds: order.slice(0, cap),
    omittedIds: order.slice(cap)
  };
}

export function feesForItems(fees, items) {
  if (!items.length) return fees.slice();
  const orders = new Set(items.map((item) => item.orderId));
  const listings = new Set(items.map((item) => item.listingId.toLowerCase()));
  return fees.filter((fee) => {
    if (fee.orderId) return orders.has(fee.orderId);
    if (fee.listingId) return listings.has(fee.listingId.toLowerCase());
    return false;
  });
}

export function formatUSD(cents) {
  if (cents == null || Number.isNaN(cents)) return "";
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  const withCommas = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (negative ? "-$" : "$") + withCommas + "." + frac;
}

export function formatMargin(margin) {
  if (margin == null || Number.isNaN(margin)) return "";
  const rounded = Math.round(margin * 1000) / 10;
  return rounded.toFixed(1) + "%";
}

export function defaultRates(feeFile) {
  const byId = Object.fromEntries(feeFile.defaults.map((row) => [row.id, row]));
  return {
    transactionPercent: byId.transaction.percent,
    processingPercent: byId.processing.percent,
    processingFixed: byId.processing.fixed,
    listingFixed: byId.listing.fixed,
    offsitePercent: byId.offsiteAds.percent,
    offsiteCap: byId.offsiteAds.cap,
    regulatoryPercent: byId.regulatory.percent,
    sharePercent: byId.shareAndSave.percent,
    shareByDate: false,
    shareHolidayPercent: feeFile.shareAndSave.holidayPercent,
    shareStandardPercent: feeFile.shareAndSave.standardPercent
  };
}
