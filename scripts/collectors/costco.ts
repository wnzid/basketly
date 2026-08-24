import * as cheerio from "cheerio";
import { STORE_TARGETS, TARGET_AREA } from "../config.js";
import { fetchText } from "../http.js";
import { parseAdvertisedUnitPrice, parseQuantity, unitPrice } from "../normalization/normalize-units.js";
import type { RawOffer, StoreData } from "../types.js";
import { dedupeOffers, jsonScripts, parseGenericStructured } from "./common.js";
import { capturePage, withBrowser } from "./browser.js";

const HOME = "https://www.costco.com.au/";
const HOT_BUYS = "https://www.costco.com.au/c/hot-buys-category";
const SAVINGS = "https://www.costco.com.au/warehouse-savings";

type CheerioNode = cheerio.Cheerio<any>;

function clean(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function findProductRoot($: cheerio.CheerioAPI, start: CheerioNode): CheerioNode {
  let root = start;
  for (let i = 0; i < 9; i += 1) {
    const text = clean(root.text());
    const hasPrice = /\$\s*[\d,]+(?:\.\d{1,2})?/.test(text) || /member only item/i.test(text);
    const hasHotBuy = /hot\s*buy|warehouse\s*saving|instant\s*saving|save\s*\$/i.test(text) || root.find("img[alt*='Hot Buy' i]").length > 0;
    const hasProductLink = root.find("a[href*='/p/']").length > 0 || root.is("a[href*='/p/']");
    if (hasPrice && hasHotBuy && hasProductLink) return root;
    const parent = root.parent();
    if (!parent.length) break;
    root = parent;
  }
  return start;
}

function parseRoot($: cheerio.CheerioAPI, root: CheerioNode, pageUrl: string): RawOffer | undefined {
  const anchor = root.is("a[href*='/p/']") ? root : root.find("a[href*='/p/']").first();
  const href = anchor.attr("href");
  if (!href) return;
  const sourceUrl = new URL(href, pageUrl).href;
  const id = sourceUrl.match(/\/p\/([^/?#]+)/)?.[1] ?? sourceUrl;
  const text = clean(root.text());
  const hasHotBuy = /hot\s*buy|warehouse\s*saving|instant\s*saving|save\s*\$/i.test(text) || root.find("img[alt*='Hot Buy' i]").length > 0;
  if (!hasHotBuy) return;

  const priceMatches = [...text.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/g)]
    .map(match => Number(match[1].replace(/,/g, "")))
    .filter(value => Number.isFinite(value) && value > 0);
  if (!priceMatches.length) return; // Member-only hidden price cannot be compared safely.

  const name = clean(
    anchor.attr("aria-label") ||
      anchor.attr("title") ||
      anchor.find("img").attr("alt") ||
      root.find("h2,h3,h4,[class*='name'],[class*='title']").first().text() ||
      anchor.text(),
  );
  if (!name || /^hot buy$/i.test(name) || name.length < 3) return;

  const salePrice = priceMatches[0];
  const save = text.match(/save\s*\$\s*([\d,.]+)/i)?.[1];
  const regularPrice = save ? Number((salePrice + Number(save.replace(/,/g, ""))).toFixed(2)) : undefined;
  const advertised = parseAdvertisedUnitPrice(text);
  const quantity = parseQuantity(name);
  const image = root.find("img").filter((_, img) => !/hot\s*buy/i.test($(img).attr("alt") ?? "")).first().attr("src") ??
    root.find("img").filter((_, img) => !/hot\s*buy/i.test($(img).attr("alt") ?? "")).first().attr("data-src");

  return {
    externalId: id,
    name,
    salePrice,
    regularPrice,
    quantity: quantity?.quantity,
    unit: quantity?.unit,
    pricePerUnit: advertised?.price ?? unitPrice(salePrice, quantity),
    pricePerUnitType: advertised?.type ?? quantity?.type,
    imageUrl: image ? new URL(image, pageUrl).href : undefined,
    sourceUrl,
    promotionType: "CAMPAIGN",
    sourceType: "web",
    sourcePlatform: "costco",
    channel: "online",
    onlineAvailable: true,
    physicalStoreAvailability: "unknown",
    membershipRequired: true,
    locationScope: STORE_TARGETS.costco.scope,
    targetStore: STORE_TARGETS.costco.name,
    targetPostcode: TARGET_AREA.postcode,
    promotionConditions: "Costco membership required. Online and Ardeer warehouse prices may differ; verify the warehouse price before purchase.",
    confidence: "MEDIUM",
  };
}

function parseHotBuyHtml(html: string, pageUrl: string): RawOffer[] {
  const $ = cheerio.load(html);
  const result: RawOffer[] = [];
  const seenRoots = new Set<any>();

  // Start from both product links and Hot Buy badges because Costco's DOM nesting changes.
  $("a[href*='/p/'], img[alt*='Hot Buy' i]").each((_, element) => {
    const start = $(element);
    const root = findProductRoot($, start);
    const node = root.get(0);
    if (!node || seenRoots.has(node)) return;
    seenRoots.add(node);
    const offer = parseRoot($, root, pageUrl);
    if (offer) result.push(offer);
  });

  return dedupeOffers(result);
}

export async function collectCostco(): Promise<StoreData> {
  const offers: RawOffer[] = [];
  const urls = [process.env.COSTCO_SAVINGS_URL, HOT_BUYS, SAVINGS, HOME].filter(Boolean) as string[];

  for (const url of urls) {
    try {
      const html = await fetchText(url);
      offers.push(...parseHotBuyHtml(html, url));
      for (const data of jsonScripts(html)) {
        offers.push(...parseGenericStructured(data, {
          store: "costco",
          pageUrl: url,
          promotionType: "CAMPAIGN",
          confidence: "MEDIUM",
          membershipRequired: true,
        }));
      }
    } catch (error) {
      console.warn(`costco ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!offers.length) {
    try {
      await withBrowser(async context => {
        for (const url of [HOT_BUYS, HOME, SAVINGS]) {
          const capture = await capturePage(context, url, (responseUrl, contentType) =>
            contentType.includes("json") && /costco\.com\.au/i.test(responseUrl),
          );
          offers.push(...parseHotBuyHtml(capture.html, capture.finalUrl));
          for (const data of capture.json) {
            offers.push(...parseGenericStructured(data, {
              store: "costco",
              pageUrl: capture.finalUrl,
              promotionType: "CAMPAIGN",
              confidence: "MEDIUM",
              membershipRequired: true,
            }));
          }
        }
      });
    } catch (error) {
      console.warn(`costco browser fallback: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const unique = dedupeOffers(offers).filter(offer => offer.salePrice && offer.salePrice > 0);
  if (!unique.length) throw new Error("costco: public Hot Buy / Warehouse Savings sources returned no comparable priced offers; previous Costco data preserved");

  return {
    store: "costco",
    collectedAt: new Date().toISOString(),
    source: HOT_BUYS,
    target: {
      area: TARGET_AREA.label,
      postcode: TARGET_AREA.postcode,
      storeName: STORE_TARGETS.costco.name,
      address: STORE_TARGETS.costco.address,
      scope: STORE_TARGETS.costco.scope,
    },
    offers: unique,
  };
}
