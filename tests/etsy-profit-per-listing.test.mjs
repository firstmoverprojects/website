// Profit per listing for Etsy sellers. Fixtures are fake. The page must not
// send them anywhere, and the free page stops at 5 listings.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { chromiumLaunchOptions, importChromium } from "./playwright-helpers.mjs";
import {
  attachFees,
  autoMapping,
  buildLines,
  buyerHeaders,
  dedupeFees,
  isBuyerHeader,
  normalizeFeeRows,
  normalizeOrderItems,
  orderMappingOk,
  rollupListings,
  statementMappingOk,
  ORDER_FIELDS,
  STATEMENT_FIELDS
} from "../tools/etsy-profit-per-listing/profit.js";

const require = createRequire(import.meta.url);
const Papa = require("../tools/etsy-profit-per-listing/papaparse.js");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FIX = path.join(ROOT, "tests/fixtures/etsy");
const OFFLINE = path.join(ROOT, "scripts/dist/etsy-profit-per-listing.html");

const SECRETS = [
  "Nora Quinn",
  "Samir Patel",
  "418 Privet Lane",
  "77 Harbor Street",
  "Apt 9",
  "Floor 2",
  "Redactedville",
  "Example Harbor",
  "nora.quinn.example@invalid.test",
  "samir.patel.example@invalid.test",
  "nq_buyer_handle",
  "spatel_buyer",
  "Sixth Buyer",
  "sixth.buyer.example@invalid.test",
  "sixth_buyer_handle",
  "9 Omitted Road",
  "Leftout Town"
];

const BUYER_COLUMNS = [
  "Buyer",
  "Ship Name",
  "Ship Address1",
  "Ship Address2",
  "Ship City",
  "Ship State",
  "Ship Zipcode",
  "Ship Country",
  "Buyer User ID",
  "Buyer Email"
];

// Hand totals, in cents. Order 1008 is two lines. Shipping on that order is
// $10.00, split $8.00 / $2.00 by the $40 and $10 item totals. Order-level
// fees use the same split. Item transaction fees stay on the named line.
const ORDER_LINES = {
  "1001": { listing: "L100", revenue: 2500, fee: 130 + 33 + 85 + 20 },
  "1002": { listing: "L100", revenue: 5400, fee: 312 + 39 + 180 + 40 + 810 - 216 },
  "1003": { listing: "L200", revenue: 3000, fee: 195 + 115 + 20 },
  "1004": { listing: "L200", revenue: 9800, fee: 585 + 52 + 310 + 60 + 47 },
  "1005": { listing: "L300", revenue: 1900, fee: 98 + 26 + 82 + 20 - 76 },
  "1006": { listing: "L300", revenue: 3400, fee: 195 + 26 + 127 + 40 - 221 },
  "1007": { listing: "L300", revenue: 1900, fee: 98 + 26 + 82 + 20 - 76 },
  "1008:L400": { listing: "L400", revenue: 4800, fee: 260 + 52 + 160 + 20 + 600 + 20 },
  "1008:L200": { listing: "L200", revenue: 1200, fee: 65 + 13 + 40 + 20 + 150 + 5 },
  "1009": { listing: "L100", revenue: 2300, fee: 117 + 33 + 94 + 20 },
  "1010": { listing: "L400", revenue: 4200, fee: 273 + 151 + 20 + 630 }
};

const LISTINGS = {
  L100: { units: 4, revenue: 10200, fees: 1697, materials: 1900, profit: 6603, margin: "64.7%", perHour: 4402, flags: "None" },
  L200: { units: 5, revenue: 14000, fees: 1677, materials: 3000, profit: 9323, margin: "66.6%", perHour: 7458, flags: "None" },
  L300: { units: 4, revenue: 7200, fees: 467, materials: 6000, profit: 733, margin: "10.2%", perHour: 1100, flags: "Margin under 15%" },
  L400: { units: 2, revenue: 9000, fees: 2186, materials: 7600, profit: -786, margin: "-8.7%", perHour: -524, flags: "Loses money. Margin under 15%" }
};

const COSTS = {
  L100: {
    byVariation: true,
    variations: {
      "Size:12 oz": { materialCents: 400, minutes: 20 },
      "Size:16 oz": { materialCents: 550, minutes: 25 }
    }
  },
  L200: { byVariation: false, materialCents: 600, minutes: 15 },
  L300: { byVariation: false, materialCents: 1500, minutes: 10 },
  L400: { byVariation: false, materialCents: 3800, minutes: 45 }
};

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function parseCsv(rel) {
  const parsed = Papa.parse(read(rel), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim()
  });
  assert.equal(parsed.errors.length, 0, rel + " " + JSON.stringify(parsed.errors[0] || {}));
  return parsed;
}

function loadShop() {
  const orders = parseCsv("tests/fixtures/etsy/sold-order-items.csv");
  const orderMap = autoMapping(orders.meta.fields, ORDER_FIELDS);
  assert.equal(orderMappingOk(orderMap.mapping), true);
  const items = normalizeOrderItems(orders.data, orderMap.mapping);
  let fees = [];
  for (const name of ["statement-2026-10.csv", "statement-2026-11.csv", "statement-2026-12.csv", "statement-2027-01.csv"]) {
    const parsed = parseCsv("tests/fixtures/etsy/" + name);
    const mapping = autoMapping(parsed.meta.fields, STATEMENT_FIELDS);
    assert.equal(statementMappingOk(mapping.mapping), true, name);
    fees.push(...normalizeFeeRows(parsed.data, mapping.mapping));
  }
  fees = dedupeFees(fees);
  const lines = attachFees(buildLines(items), fees);
  return { orders, items, fees, lines };
}

test("fixtures parse, buyer columns are dropped, and 10 orders match the hand totals", () => {
  const shop = loadShop();
  assert.equal(shop.orders.data.length, 11);
  assert.deepEqual(buyerHeaders(shop.orders.meta.fields), BUYER_COLUMNS);
  for (const header of BUYER_COLUMNS) assert.equal(isBuyerHeader(header), true);
  assert.equal(isBuyerHeader("buyer_email"), true);
  assert.equal(isBuyerHeader("Item Name"), false);
  const stored = JSON.stringify(shop.items);
  for (const secret of SECRETS) assert.equal(stored.includes(secret), false, secret);
  for (const header of BUYER_COLUMNS) assert.equal(stored.includes(header), false, header);

  const orderIds = [...new Set(shop.items.map((item) => item.orderId))];
  assert.deepEqual(orderIds, ["1001", "1002", "1003", "1004", "1005", "1006", "1007", "1008", "1009", "1010"]);
  assert.equal(Object.keys(ORDER_LINES).length, 11);

  for (const line of shop.lines) {
    const key = line.orderId === "1008" ? line.orderId + ":" + line.listingId : line.orderId;
    const expected = ORDER_LINES[key];
    assert.ok(expected, key);
    assert.equal(line.revenueCents, expected.revenue, key + " revenue");
    assert.equal(line.feeCents, expected.fee, key + " fee");
  }

  const rows = rollupListings(shop.lines, COSTS, "all");
  assert.equal(rows.length, 4);
  for (const row of rows) {
    const expected = LISTINGS[row.listingId];
    assert.equal(row.units, expected.units, row.listingId);
    assert.equal(row.revenueCents, expected.revenue, row.listingId);
    assert.equal(row.feeCents, expected.fees, row.listingId);
    assert.equal(row.materialCents, expected.materials, row.listingId);
    assert.equal(row.profitCents, expected.profit, row.listingId);
    assert.equal(row.perHourCents, expected.perHour, row.listingId);
    assert.equal(row.losesMoney, row.listingId === "L400", row.listingId);
    assert.equal(row.thinMargin, row.listingId === "L300" || row.listingId === "L400", row.listingId);
  }
  const january = rollupListings(shop.lines, COSTS, "2027-01");
  assert.equal(january.length, 1);
  assert.equal(january[0].listingId, "L300");
  assert.equal(january[0].units, 3);
  assert.equal(january[0].revenueCents, 5300);
  assert.equal(january[0].feeCents, 317);
  assert.equal(january[0].materialCents, 4500);
  assert.equal(january[0].profitCents, 483);
  assert.equal(january[0].perHourCents, 966);

  const unknown = parseCsv("tests/fixtures/etsy/sold-order-items-unknown-headers.csv");
  const unknownMap = autoMapping(unknown.meta.fields, ORDER_FIELDS);
  assert.equal(orderMappingOk(unknownMap.mapping), false);
  assert.deepEqual(buyerHeaders(unknown.meta.fields), ["buyer_name", "buyer_email"]);

  const six = parseCsv("tests/fixtures/etsy/sold-order-items-six-listings.csv");
  assert.equal(six.data.length, 6);
  assert.equal(orderMappingOk(autoMapping(six.meta.fields, ORDER_FIELDS).mapping), true);
});

test("the offline build stays out of the published site and removes the 5-listing cap", () => {
  const built = spawnSync(process.execPath, ["scripts/build_etsy_offline.mjs"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr || built.stdout);
  assert.equal(existsSync(OFFLINE), true);
  assert.equal(OFFLINE.startsWith(path.join(ROOT, "scripts") + path.sep), true);
  const config = read("_config.yml");
  assert.match(config, /exclude:\s*\[[^\]]*scripts/);
  const offline = readFileSync(OFFLINE, "utf8");
  const web = read("tools/etsy-profit-per-listing/index.html");
  assert.match(offline, /window\.FMP_ETSY_OFFLINE = true/);
  assert.equal(web.includes("window.FMP_ETSY_OFFLINE = true"), false);
  assert.equal(offline.includes('src="papaparse.js"'), false);
  assert.equal(/<script[^>]+src="https?:/i.test(offline), false);
  assert.match(offline, /Papa Parse/);
  assert.match(offline, /License: MIT/);
  assert.equal(offline.includes('from "./profit.js"'), false);
  const fees = JSON.parse(read("tools/etsy-profit-per-listing/fees.json"));
  const embedded = JSON.parse(/<script id="fee-defaults" type="application\/json">([\s\S]*?)<\/script>/.exec(web)[1]);
  assert.deepEqual(embedded, fees);
  for (const row of fees.defaults) {
    assert.equal(row.source, "https://www.etsy.com/legal/fees");
    assert.match(row.effective, /^\d{4}-\d{2}-\d{2}$/);
  }
});

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8"
};

function startServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.normalize(path.join(ROOT, rel));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    if (!existsSync(file)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const body = readFileSync(file);
    const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, origin: "http://127.0.0.1:" + server.address().port });
    });
  });
}

let origin;
let server;
let browser;

before(async () => {
  ({ server, origin } = await startServer());
  const chromium = await importChromium();
  browser = await chromium.launch(chromiumLaunchOptions(["--disable-background-networking"]));
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(OFFLINE, { force: true });
});

async function storageText(page) {
  return page.evaluate(() => {
    const dump = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      dump[key] = localStorage.getItem(key);
    }
    return JSON.stringify(dump);
  });
}

function assertNoSecrets(raw) {
  for (const secret of SECRETS) assert.equal(raw.includes(secret), false, secret);
  for (const header of BUYER_COLUMNS) assert.equal(raw.includes(header), false, header);
  assert.equal(raw.includes("buyer_name"), false);
  assert.equal(raw.includes("buyer_email"), false);
}

async function rowData(page, listing) {
  const row = page.locator(`#profit-table tbody tr[data-listing="${listing}"]`);
  assert.equal(await row.count(), 1, listing);
  return {
    units: Number(await row.locator('[data-field="units"]').innerText()),
    revenue: Number(await row.locator('[data-field="revenue"]').getAttribute("data-cents")),
    fees: Number(await row.locator('[data-field="fees"]').getAttribute("data-cents")),
    materials: Number(await row.locator('[data-field="materials"]').getAttribute("data-cents")),
    profit: Number(await row.locator('[data-field="profit"]').getAttribute("data-cents")),
    margin: (await row.locator('[data-field="margin"]').innerText()).trim(),
    perHour: Number(await row.locator('[data-field="perHour"]').getAttribute("data-cents")),
    flags: (await row.locator('[data-field="flags"]').innerText()).trim(),
    text: await row.innerText()
  };
}

async function dropCsv(page, selector, name, contents) {
  await page.locator(selector).evaluate((el, payload) => {
    const file = new File([payload.contents], payload.name, { type: "text/csv" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    el.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, { name, contents });
}

async function fillCost(page, listing, variation, material, minutes) {
  const base = variation == null
    ? `input[data-listing="${listing}"]:not([data-variation])`
    : `input[data-listing="${listing}"][data-variation="${variation}"]`;
  await page.locator(base + '[data-field="material"]').fill(material);
  await page.locator(base + '[data-field="minutes"]').fill(minutes);
}

test("the page keeps files local, matches the 10-order totals, and caps the free page at 5 listings", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const requests = [];
  let watch = false;
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("request", (req) => {
    if (!watch) return;
    if (/^https?:/i.test(req.url())) requests.push(req.url());
  });
  async function open(urlPath) {
    watch = false;
    const response = await page.goto(origin + urlPath, { waitUntil: "load" });
    assert.equal(response.status(), 200, urlPath);
    watch = true;
  }

  await open("/tools/etsy-profit-per-listing/?qa=1");
  assert.equal(await page.locator("html").getAttribute("data-qa"), "1");
  assert.match(await page.locator("#privacy-line").innerText(), /Your files never leave this device\./);
  assert.match(await page.locator("#share-save-note").innerText(), /January 4, 2027/);
  assert.match(await page.locator("#share-save-note").innerText(), /6\.5%/);
  assert.match(await page.locator("#share-save-note").innerText(), /returns to 4%/);
  assert.match(await page.locator("body").innerText(), /Not affiliated with or endorsed by Etsy\. General guidance, not tax or accounting advice\./);
  assert.match(await page.locator("body").innerText(), /General guidance, not legal, tax or IT advice\./);
  assert.equal(await page.locator("img").count(), 0);
  assert.match(await page.locator("#fee-rates").innerText(), /etsy\.com\/legal\/fees/);
  assert.match(await page.locator("#fee-rates").innerText(), /Effective April 11, 2022/);

  await page.setViewportSize({ width: 375, height: 800 });
  const narrow = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth
  }));
  assert.equal(narrow.sw, narrow.cw, JSON.stringify(narrow));
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.setInputFiles("#orders-file", path.join(FIX, "sold-order-items.csv"));
  await page.waitForSelector("#profit-table tbody tr");
  await page.setInputFiles("#statements-file", [
    path.join(FIX, "statement-2026-10.csv"),
    path.join(FIX, "statement-2026-11.csv"),
    path.join(FIX, "statement-2026-12.csv")
  ]);
  await dropCsv(page, "#statements-drop", "statement-2027-01.csv", read("tests/fixtures/etsy/statement-2027-01.csv"));
  await page.waitForFunction(() => /statement, matched by order ID/.test(document.getElementById("status").textContent || ""));

  await fillCost(page, "L100", "Size:12 oz", "4.00", "20");
  await fillCost(page, "L100", "Size:16 oz", "5.50", "25");
  await fillCost(page, "L200", null, "6.00", "15");
  await fillCost(page, "L300", null, "15.00", "10");
  await fillCost(page, "L400", null, "38.00", "45");

  for (const [listing, expected] of Object.entries(LISTINGS)) {
    const got = await rowData(page, listing);
    assert.equal(got.units, expected.units, listing);
    assert.equal(got.revenue, expected.revenue, listing);
    assert.equal(got.fees, expected.fees, listing);
    assert.equal(got.materials, expected.materials, listing);
    assert.equal(got.profit, expected.profit, listing);
    assert.equal(got.margin, expected.margin, listing);
    assert.equal(got.perHour, expected.perHour, listing);
    assert.equal(got.flags, expected.flags, listing);
    assert.match(got.text, new RegExp(expected.margin.replace(".", "\\.")));
  }
  const totals = page.locator("#profit-table tfoot tr");
  assert.equal(await totals.locator('[data-field="units"]').innerText(), "15");
  assert.equal(await totals.locator('[data-field="revenue"]').getAttribute("data-cents"), "40400");
  assert.equal(await totals.locator('[data-field="fees"]').getAttribute("data-cents"), "6027");
  assert.equal(await totals.locator('[data-field="materials"]').getAttribute("data-cents"), "18500");
  assert.equal(await totals.locator('[data-field="profit"]').getAttribute("data-cents"), "15873");

  let stored = await storageText(page);
  assert.match(stored, /fmp-etsy-profit-per-listing/);
  assert.match(stored, /1001/);
  assertNoSecrets(stored);

  await page.locator("#month-filter").selectOption("2027-01");
  const january = await rowData(page, "L300");
  assert.equal(await page.locator("#profit-table tbody tr").count(), 1);
  assert.equal(january.units, 3);
  assert.equal(january.revenue, 5300);
  assert.equal(january.fees, 317);
  assert.equal(january.materials, 4500);
  assert.equal(january.profit, 483);
  assert.equal(january.margin, "9.1%");
  assert.equal(january.perHour, 966);
  await page.locator("#month-filter").selectOption("all");
  await page.locator('#profit-table button[data-sort="profitCents"]').click();
  const first = await page.locator("#profit-table tbody tr").first().getAttribute("data-listing");
  assert.equal(first, "L400");

  await page.evaluate(() => {
    window.__printed = false;
    window.print = () => {
      window.__printed = true;
    };
  });
  await page.locator("#print-summary").click();
  assert.equal(await page.evaluate(() => window.__printed), true);
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-csv").click();
  const download = await downloadPromise;
  const csv = readFileSync(await download.path(), "utf8");
  assert.match(csv, /Cedar mug/);
  assert.match(csv, /Loses money/);
  assertNoSecrets(csv);

  await open("/tools/etsy-profit-per-listing/?qa=1");
  await page.waitForSelector('tr[data-listing="L100"]');
  assert.equal((await rowData(page, "L100")).profit, 6603);
  assertNoSecrets(await storageText(page));

  await page.setInputFiles("#orders-file", path.join(FIX, "sold-order-items-six-listings.csv"));
  await page.waitForSelector("#cap-note:not([hidden])");
  assert.equal(await page.locator("#profit-table tbody tr").count(), 5);
  assert.equal(await page.locator('tr[data-listing="C6"]').count(), 0);
  assert.equal((await page.locator("body").innerText()).includes("Cap Foxtrot"), false);
  assert.match(await page.locator("#cap-note").innerText(), /free page includes 5 listings/i);
  stored = await storageText(page);
  assertNoSecrets(stored);
  assert.equal(stored.includes("Cap Foxtrot"), false);
  assert.equal(stored.includes("C6"), false);
  assert.equal(stored.includes("3006"), false);

  await page.locator("#erase").click();
  await page.waitForFunction(() => localStorage.length === 0);
  assert.equal(await page.locator("#results").getAttribute("hidden"), "");

  await page.setInputFiles("#orders-file", path.join(FIX, "sold-order-items-unknown-headers.csv"));
  await page.waitForSelector("#mapping:not([hidden])");
  await page.locator("#map-orderId").selectOption("oid");
  await page.locator("#map-listingId").selectOption("lid");
  await page.locator("#map-itemName").selectOption("title");
  await page.locator("#map-quantity").selectOption("qty");
  await page.locator("#map-itemTotal").selectOption("line_total");
  await page.locator("#map-shipping").selectOption("ship_charged");
  await page.locator("#map-saleDate").selectOption("sold_on");
  await page.locator("#map-variations").selectOption("var");
  const buyerOption = await page.locator("#map-itemName option").evaluateAll((nodes) => nodes.map((node) => node.value));
  assert.equal(buyerOption.includes("buyer_name"), false);
  assert.equal(buyerOption.includes("buyer_email"), false);
  await page.locator("#mapping-apply").click();
  await page.waitForSelector('tr[data-listing="L900"]');
  const spoon = await rowData(page, "L900");
  assert.equal(spoon.revenue, 1200);
  assert.equal(spoon.fees, 159);
  assert.match(await page.locator("#profit-table").innerText(), /Maple spoon/);
  assertNoSecrets(await storageText(page));

  await open("/scripts/dist/etsy-profit-per-listing.html?qa=1");
  watch = false;
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  watch = true;
  await page.setInputFiles("#orders-file", path.join(FIX, "sold-order-items-six-listings.csv"));
  await page.waitForSelector('tr[data-listing="C6"]');
  assert.equal(await page.locator("#profit-table tbody tr").count(), 6);
  assert.equal(await page.locator("#cap-note").getAttribute("hidden"), "");
  assert.match(await page.locator("#edition").innerText(), /Every listing is included/);
  assertNoSecrets(await storageText(page));
  assert.match(await storageText(page), /Cap Foxtrot/);

  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
  await page.close();
});
