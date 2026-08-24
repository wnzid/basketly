import { chromium, type BrowserContext, type Page } from "playwright";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

export interface BrowserCapture {
  html: string;
  json: unknown[];
  finalUrl: string;
}

function proxyConfig() {
  const server = process.env.BASKETLY_PROXY_SERVER?.trim();
  if (!server) return undefined;
  return {
    server,
    username: process.env.BASKETLY_PROXY_USERNAME?.trim() || undefined,
    password: process.env.BASKETLY_PROXY_PASSWORD || undefined,
  };
}

async function settle(page: Page, waitMs = 2500) {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(waitMs);
}

export async function withBrowser<T>(run: (context: BrowserContext) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true, proxy: proxyConfig() });
  try {
    const context = await browser.newContext({
      locale: "en-AU",
      timezoneId: "Australia/Melbourne",
      userAgent: USER_AGENT,
      viewport: { width: 1440, height: 1000 },
      extraHTTPHeaders: {
        "accept-language": "en-AU,en;q=0.9",
      },
    });
    return await run(context);
  } finally {
    await browser.close();
  }
}

export async function capturePage(
  context: BrowserContext,
  url: string,
  responseFilter: (url: string, contentType: string) => boolean = (responseUrl, contentType) =>
    contentType.includes("json") || /\/api\//i.test(responseUrl),
): Promise<BrowserCapture> {
  const page = await context.newPage();
  const json: unknown[] = [];

  page.on("response", async response => {
    const contentType = response.headers()["content-type"] ?? "";
    if (!responseFilter(response.url(), contentType)) return;
    if (response.status() < 200 || response.status() >= 300) return;
    try {
      const body = await response.json();
      json.push(body);
    } catch {
      // Some XHR responses advertise JSON but return an empty body.
    }
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await settle(page);
    await autoScroll(page, 5);
    await page.waitForTimeout(900);
    return {
      html: await page.content(),
      json,
      finalUrl: page.url(),
    };
  } finally {
    await page.close();
  }
}

export async function autoScroll(page: Page, rounds = 8) {
  for (let i = 0; i < rounds; i += 1) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(700);
  }
}
