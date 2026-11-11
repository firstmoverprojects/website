// Shared Playwright launch and network guard for headless site tests.
// CI sets PLAYWRIGHT_CORE=playwright and installs Chromium via `npx playwright install`.
const EXTERNAL =
  /(?:goatcounter\.com|gc\.zgo\.at|gumroad\.com|brevo\.com|sendinblue\.com|indexnow\.org)/i;

export function chromiumLaunchOptions(extraArgs = []) {
  const options = {
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", ...extraArgs]
  };
  if (process.env.CHROME_PATH) options.executablePath = process.env.CHROME_PATH;
  return options;
}

export async function importChromium() {
  const mod = process.env.PLAYWRIGHT_CORE || "playwright";
  const { chromium } = await import(mod);
  return chromium;
}

/** Block outbound HTTP(S) except localhost (optional prefix) and non-network schemes. */
export async function blockExternalOnPage(page, { allowUrlPrefix } = {}) {
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (allowUrlPrefix && url.startsWith(allowUrlPrefix)) return route.continue();
    if (url.startsWith("file:") || url.startsWith("data:") || url.startsWith("blob:")) {
      return route.continue();
    }
    if (/^http:\/\/127\.0\.0\.1(?::\d+)?\//.test(url) || /^http:\/\/localhost(?::\d+)?\//.test(url)) {
      return route.continue();
    }
    if (/^https?:/i.test(url)) return route.abort();
    return route.continue();
  });
}

export function isAllowedAnalyticsUrl(url) {
  return /^https:\/\/(?:gc\.zgo\.at|[^/]*goatcounter\.com)(?:[/?#]|$)/.test(url);
}

export { EXTERNAL };
