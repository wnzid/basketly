import * as cheerio from "cheerio";
import { STORE_TARGETS, TARGET_AREA } from "../config.js";
import { fetchText } from "../http.js";
import { parseAdvertisedUnitPrice, parseQuantity, unitPrice } from "../normalization/normalize-units.js";
import type { RawOffer, StoreData } from "../types.js";
import { dedupeOffers, jsonScripts, parseGenericStructured } from "./common.js";
import { capturePage, withBrowser } from "./browser.js";

const HOME = "https://www.costco.com.au/";
const SAVINGS = "https://www.costco.com.au/warehouse-savings";

function parseHotBuyHtml(html: string, pageUrl: string): RawOffer[] {
  const $ = cheerio.load(html);
  const result: RawOffer[] = [];
  const seen = new Set<string>();

  $("a[href*='/p/']").each((_, element) => {
    const anchor = $(element);
    const href = anchor.attr("href");
    if (!href) return;
    const sourceUrl = new URL(href, pageUrl).href;
    const card = anchor.closest("article,li,[class*='product'],[class*='tile'],[class*='card'],[class*='item']");
    const root = card.length ? card : anchor.parent().parent();
    const text = root.text().replace(/\s+/g, " ").trim();
    const hasHotBuy = /hot\s*buy|warehouse\s*saving|instant\s*saving|save\s*\$/i.test(text) || root.find("img[alt*='Hot Buy' i]").length > 0;
    if (!hasHotBuy) return;

    const id = sourceUrl.match(/\/p\/(\d+)/)?.[1] ?? sourceUrl;
    if (seen.has(id)) return;
    const name = (anchor.attr("aria-label") || anchor.attr("title") || anchor.text()).replace(/\s+/g, " ").trim();
    if (!name || name.length < 3) return;
    const priceMatch = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
    if (!priceMatch) return; // "Member Only Item" without a public price cannot be compared safely.
    const salePrice = Number(priceMatch[1].replace(/,/g, ""));
    if (!salePrice || salePrice <= 0) return;

    const advertised = parseAdvertisedUnitPrice(text);
    const quantity = parseQuantity(name);
    const image = root.find("img").first().attr("src") ?? root.find("img").first().attr("data-src");
    const save = text.match(/save\s*\$\s*([\d,.]+)/i)?.[1];
    const regularPrice = save ? Number((salePrice + Number(save.replace(/,/g, ""))).toFixed(2)) : undefined;

    seen.add(id);
    result.push({
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
    });
  });

  return result;
}

export async function collectCostco(): Promise<StoreData> {
  const offers: RawOffer[] = [];
  const urls = [process.env.COSTCO_SAVINGS_URL, SAVINGS, HOME].filter(Boolean) as string[];

  for (const url of urls) {
    try {
      const html = await fetchText(url);
      offers.push(...parseHotBuyHtml(html, url));
      if (/warehouse-savings/i.test(url)) {
        for (const data of jsonScripts(html)) {
          offers.push(...parseGenericStructured(data, {
            store: "costco",
            pageUrl: url,
            promotionType: "CAMPAIGN",
            confidence: "MEDIUM",
            membershipRequired: true,
          }));
        }
      }
    } catch (error) {
      console.warn(`costco ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!offers.length || !offers.some(offer => offer.promotionType === "CAMPAIGN")) {
    try {
      await withBrowser(async context => {
        for (const url of [SAVINGS, HOME]) {
          const capture = await capturePage(context, url, (responseUrl, contentType) =>
            contentType.includes("json") && /costco\.com\.au/i.test(responseUrl),
          );
          offers.push(...parseHotBuyHtml(capture.html, capture.finalUrl));
          if (/warehouse-savings/i.test(capture.finalUrl)) {
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
    source: SAVINGS,
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
