/**
 * Honest 1280x720 previews for Product nodes that had no image.
 * Each card shows the product name, one description already on the site,
 * and the price already shown on that page. No invented screenshots,
 * ratings, testimonials, third-party logos, or new claims.
 *
 * Writes assets/previews/<stem>-1280x720.png plus the WebP sizes the
 * other previews use: 1280x720, 960, 720, and 640.
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "assets/previews");
const sheetDir = "/opt/cursor/artifacts";

const products = [
  {
    stem: "income-expense-workbook-preview",
    kicker: "Workbook",
    name: "Small-Business Income and Expense Workbook (2026 Contractor Log)",
    description:
      "Type income and expenses in one place and get monthly and year-to-date totals, plus a contractor-payment log.",
    price: "$19",
    accent: "#c2410c",
    wash: "#fff7ed",
    page: "#fff1e6",
    note: "General guidance, not legal, tax or IT advice.",
    icon: "book"
  },
  {
    stem: "rfq-price-match-guard-preview",
    kicker: "Offline CSV review tool",
    name: "RFQ Price-Match Guard: Offline CSV Review Tool",
    description:
      "Check requested parts against your agreed price list and keep uncertain lines out of a complete quote total.",
    price: "$29",
    accent: "#0f766e",
    wash: "#f0fdfa",
    page: "#e7f6f3",
    note: "General guidance, not legal, tax or IT advice.",
    icon: "list"
  },
  {
    stem: "contact-collision-checker-preview",
    kicker: "Offline CSV review tool",
    name: "Contact Collision Checker: Offline CSV Review Tool",
    description:
      "Find conflicting IDs and shared contact details before a migration, and review records without merging them.",
    price: "$19",
    accent: "#4338ca",
    wash: "#eef2ff",
    page: "#e8edfb",
    note: "General guidance, not legal, tax or IT advice.",
    icon: "people"
  },
  {
    stem: "inventory-count-reconciliation-preview",
    kicker: "Offline CSV review tool",
    name: "Inventory Count Reconciliation: Offline CSV Review Tool",
    description:
      "Compare expected stock with a count by SKU and location. Missing counts stay unknown, not zero.",
    price: "$29",
    accent: "#1d4ed8",
    wash: "#eff6ff",
    page: "#e7f0fb",
    note: "General guidance, not legal, tax or IT advice.",
    icon: "boxes"
  },
  {
    stem: "ai-answer-audit-pack-preview",
    kicker: "Source correction pack",
    name: "AI Answer Audit & Source Correction Pack",
    description:
      "Documented evidence of AI answers, the likely sources, and corrected source text you submit yourself.",
    price: "$39",
    accent: "#6d28d9",
    wash: "#f5f3ff",
    page: "#efeafb",
    note: "General guidance, not legal, tax or IT advice.",
    icon: "pages"
  },
  {
    stem: "multimodal-search-report-preview",
    kicker: "Report template",
    name: "Multimodal Search Report Template (Google Search Console)",
    description:
      "Make sense of Search Console's new Lens and Circle to Search data in one report template.",
    price: "$29",
    accent: "#0369a1",
    wash: "#f0f9ff",
    page: "#e5f3fb",
    note: "Not affiliated with or endorsed by Google. General guidance, not legal, tax or IT advice.",
    icon: "report"
  },
  {
    stem: "intakebay-hvac-preview",
    kicker: "HTML site template",
    name: "IntakeBay: HVAC Intake Site Template (HTML)",
    description:
      "A website template with Emergency, Quote and Maintenance forms that post to your own webhook. You run, host and secure it yourself; no setup calls or custom work.",
    price: "$39",
    accent: "#047857",
    wash: "#ecfdf5",
    page: "#e5f7ef",
    note: "General guidance, not legal, tax or IT advice.",
    icon: "window"
  },
  {
    stem: "windows-server-2016-checklist-preview",
    kicker: "Planning checklist",
    name: "Windows Server 2016 planning checklist",
    description: "A planning sheet for Jan 12, 2027, the extended support end date Microsoft lists for Windows Server 2016.",
    price: "$19",
    accent: "#1e3a5f",
    wash: "#f1f5f9",
    page: "#e8eef5",
    note: "Not affiliated with or endorsed by Microsoft. General guidance, not legal, tax or IT advice.",
    icon: "check"
  }
];

const icons = {
  book: '<path d="M7 6.5h6.2A2.8 2.8 0 0 1 16 9.3V26H9.2A2.2 2.2 0 0 0 7 28.2V6.5z"/><path d="M25 6.5h-6.2A2.8 2.8 0 0 0 16 9.3V26h6.8A2.2 2.2 0 0 1 25 28.2V6.5z"/>',
  list: '<path d="M12 9h12M12 16h12M12 23h8"/><circle cx="8" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="8" cy="16" r="1.4" fill="currentColor" stroke="none"/><circle cx="8" cy="23" r="1.4" fill="currentColor" stroke="none"/>',
  people:
    '<circle cx="12" cy="12" r="3"/><circle cx="21" cy="13" r="2.4"/><path d="M6.5 23.5c.8-3 2.8-4.5 5.5-4.5s4.7 1.5 5.5 4.5"/><path d="M18 19.2c1.6-.4 3.2.2 4.2 1.6.8 1.1 1.1 2.2 1.2 2.7"/>',
  boxes:
    '<path d="M8 13.5 16 9l8 4.5-8 4.5-8-4.5z"/><path d="M8 13.5V21l8 4.5 8-4.5v-7.5"/><path d="M16 18v7.5"/>',
  pages: '<path d="M10 7h9l5 5v13H10z"/><path d="M19 7v5h5"/><path d="M13 16h7M13 20h5"/>',
  report: '<path d="M9 7h14v18H9z"/><path d="M12 18v4M16 15v7M20 12v10"/>',
  window: '<rect x="6" y="7" width="20" height="16" rx="2"/><path d="M6 12h20"/>',
  check: '<rect x="7" y="6" width="18" height="20" rx="2"/><path d="M11 12h8M11 16h8M11 20h5"/>'
};

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cardHtml(product) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 1280px;
    height: 720px;
    overflow: hidden;
    font-family: Inter, "Liberation Sans", sans-serif;
    color: #0f172a;
    background: ${product.page};
  }
  .card {
    width: 1244px;
    height: 684px;
    margin: 18px;
    background: #fff;
    border: 3px solid ${product.accent};
    border-radius: 22px;
    box-shadow: 0 16px 40px rgba(15, 23, 42, 0.12);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .top {
    padding: 26px 28px 18px;
    display: grid;
    grid-template-columns: 1fr 84px;
    gap: 16px;
    align-items: start;
  }
  .badges { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 14px; }
  .badge {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid #cbd5e1;
    color: #334155;
    background: #f8fafc;
  }
  .badge.price {
    background: #15803d;
    border-color: #15803d;
    color: #fff;
    letter-spacing: 0.02em;
  }
  h1 {
    font-size: 40px;
    line-height: 1.15;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #0f172a;
    max-width: 1040px;
  }
  .mark {
    width: 72px;
    height: 72px;
    border-radius: 18px;
    border: 2px solid ${product.accent};
    background: ${product.wash};
    color: ${product.accent};
    display: grid;
    place-items: center;
  }
  .mark svg { width: 40px; height: 40px; }
  .stage {
    flex: 1;
    min-height: 0;
    padding: 0 28px 18px;
    display: flex;
  }
  .quote {
    flex: 1;
    background: ${product.wash};
    border-radius: 16px;
    border-left: 8px solid ${product.accent};
    padding: 36px 40px;
    display: flex;
    align-items: center;
  }
  .quote p {
    font-size: 30px;
    line-height: 1.35;
    font-weight: 600;
    color: #1e293b;
    max-width: 1080px;
  }
  footer {
    height: 58px;
    background: #0b1b2b;
    color: #d6dee8;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 0 28px;
    font-size: 15px;
  }
  .brand {
    color: #7dd3fc;
    font-weight: 700;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .note { text-align: right; }
</style>
</head>
<body>
  <div class="card">
    <div class="top">
      <div>
        <div class="badges">
          <span class="badge">${esc(product.kicker)}</span>
          <span class="badge price">${esc(product.price)}</span>
        </div>
        <h1>${esc(product.name)}</h1>
      </div>
      <div class="mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[product.icon]}</svg>
      </div>
    </div>
    <div class="stage">
      <div class="quote"><p>${esc(product.description)}</p></div>
    </div>
    <footer>
      <span class="brand">FIRST MOVER PROJECTS</span>
      <span class="note">${esc(product.note)}</span>
    </footer>
  </div>
</body>
</html>`;
}

function assertWebp(filePath) {
  const head = readFileSync(filePath).subarray(0, 12);
  if (head.toString("ascii", 0, 4) !== "RIFF" || head.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error(`${filePath} is not a WebP`);
  }
}

function writeWebps(pngPath, stem) {
  const jobs = [
    [`${stem}-1280x720.webp`, null],
    [`${stem}-960.webp`, "scale=960:540:flags=lanczos"],
    [`${stem}-720.webp`, "scale=720:405:flags=lanczos"],
    [`${stem}-640.webp`, "scale=640:360:flags=lanczos"]
  ];
  for (const [name, scale] of jobs) {
    const target = path.join(outDir, name);
    const args = ["-y", "-i", pngPath];
    if (scale) args.push("-vf", scale);
    args.push("-c:v", "libwebp", "-quality", "90", target);
    execFileSync("ffmpeg", args, { stdio: "pipe" });
    assertWebp(target);
  }
}

function sheetHtml(items) {
  const cards = items
    .map(
      (item) => `<figure>
        <img src="${item.src}" alt="">
        <figcaption><strong>${esc(item.name)}</strong><span>${esc(item.file)}</span></figcaption>
      </figure>`
    )
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 1680px; background: #f6f3ee; color: #0f172a; font-family: Inter, "Liberation Sans", sans-serif; padding: 28px; }
  h1 { font-size: 28px; margin-bottom: 6px; }
  .lead { color: #475569; margin-bottom: 18px; font-size: 16px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 16px; }
  figure { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
  img { display: block; width: 100%; height: auto; }
  figcaption { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 2px; }
  strong { font-size: 15px; line-height: 1.3; }
  span { font-size: 13px; color: #475569; font-family: "Liberation Mono", ui-monospace, monospace; }
</style>
</head>
<body>
  <h1>New product preview images</h1>
  <p class="lead">Eight Product nodes that had no image. Each preview uses that product's name, existing description, and the price already on the page.</p>
  <div class="grid">${cards}</div>
</body>
</html>`;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});

const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1
});

const rendered = [];
for (const product of products) {
  await page.setContent(cardHtml(product), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const fontOk = await page.evaluate(() => document.fonts.check("16px Inter"));
  if (!fontOk) throw new Error("Inter is not available for preview rendering");
  const png = path.join(outDir, `${product.stem}-1280x720.png`);
  await page.screenshot({ path: png, type: "png", fullPage: false });
  const box = await page.evaluate(() => {
    const card = document.querySelector(".card");
    const quote = document.querySelector(".quote p");
    const title = document.querySelector("h1");
    const cardBox = card.getBoundingClientRect();
    const quoteBox = quote.getBoundingClientRect();
    const titleBox = title.getBoundingClientRect();
    return {
      cardOverflow: card.scrollHeight > card.clientHeight + 1,
      quoteOverflow: quote.scrollHeight > quote.clientHeight + 1,
      titleOverflow: title.scrollHeight > title.clientHeight + 1,
      quoteOutside: quoteBox.bottom > cardBox.bottom - 50 || quoteBox.top < titleBox.bottom,
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight
    };
  });
  if (box.width !== 1280 || box.height !== 720 || box.cardOverflow || box.quoteOverflow || box.titleOverflow) {
    throw new Error(`${product.stem} layout overflow ${JSON.stringify(box)}`);
  }
  writeWebps(png, product.stem);
  rendered.push({
    name: product.name,
    file: `${product.stem}-1280x720.png`,
    png,
    src: `data:image/png;base64,${readFileSync(png).toString("base64")}`
  });
  console.log("Wrote", png);
}

mkdirSync(sheetDir, { recursive: true });
const sheetPath = path.join(sheetDir, "product-preview-contact-sheet.png");
await page.setViewportSize({ width: 1680, height: 1200 });
await page.setContent(sheetHtml(rendered), { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const sheetHeight = await page.evaluate(() => document.documentElement.scrollHeight);
await page.setViewportSize({ width: 1680, height: sheetHeight });
await page.screenshot({ path: sheetPath, type: "png", fullPage: true });
console.log("Wrote", sheetPath);

await browser.close();
