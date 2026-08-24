import * as cheerio from "cheerio";
import { STORE_TARGETS, TARGET_AREA } from "../config.js";
import { fetchText } from "../http.js";
import type { RawOffer, StoreData } from "../types.js";
import { dedupeOffers, jsonScripts, parseGenericStructured, parseProductHtml } from "./common.js";
import { capturePage, withBrowser } from "./browser.js";

const STORE_URL = "https://www.iga.com.au/stores/iga-saint-albans/";
const CATALOGUE_URL = "https://www.iga.com.au/catalogue/";

function catalogueLinks(html: string, base: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  $("a[href],iframe[src]").each((_, el) => {
    const value = $(el).attr("href") ?? $(el).attr("src");
    if (!value) return;
    try {
      const url = new URL(value, base);
      if (/catalog|special|flip|weekly|viewer/i.test(url.href)) urls.add(url.href);
    } catch {
      // Ignore malformed third-party links.
    }
  });
  return [...urls];
}

export async function collectIga(): Promise<StoreData> {
  const offers: RawOffer[] = [];
  const urls = new Set<string>([process.env.IGA_CATALOGUE_URL ?? CATALOGUE_URL]);

  try {
    const storeHtml = await fetchText(STORE_URL);
    catalogueLinks(storeHtml, STORE_URL).forEach(url => urls.add(url));
  } catch (error) {
    console.warn(`iga store page: ${error instanceof Error ? error.message : String(error)}`);
  }

  for (const url of [...urls].slice(0, 10)) {
    try {
      const html = await fetchText(url, { headers: { referer: STORE_URL } });
      offers.push(...parseProductHtml(html, { store: "iga", pageUrl: url, promotionType: "SALE", confidence: "MEDIUM" }));
      for (const data of jsonScripts(html)) {
        offers.push(...parseGenericStructured(data, { store: "iga", pageUrl: url, promotionType: "SALE", confidence: "MEDIUM" }));
      }
      catalogueLinks(html, url).forEach(link => urls.add(link));
    } catch (error) {
      console.warn(`iga ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!offers.length) {
    try {
      await withBrowser(async context => {
        for (const url of [...urls].slice(0, 6)) {
          const capture = await capturePage(context, url, (responseUrl, contentType) =>
            contentType.includes("json") || /catalog|flip|special|viewer/i.test(responseUrl),
          );
          offers.push(...parseProductHtml(capture.html, { store: "iga", pageUrl: capture.finalUrl, promotionType: "SALE", confidence: "MEDIUM" }));
          for (const data of capture.json) {
            offers.push(...parseGenericStructured(data, { store: "iga", pageUrl: capture.finalUrl, promotionType: "SALE", confidence: "MEDIUM" }));
          }
        }
      });
    } catch (error) {
      console.warn(`iga browser fallback: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const unique = dedupeOffers(offers).filter(offer => offer.salePrice && offer.salePrice > 0);
  if (!unique.length) {
    throw new Error("iga: Saint Albans catalogue is currently image/viewer-only with no reliable product-price rows; previous IGA data preserved");
  }

  return {
    store: "iga",
    collectedAt: new Date().toISOString(),
    source: STORE_URL,
    target: {
      area: TARGET_AREA.label,
      postcode: TARGET_AREA.postcode,
      storeName: STORE_TARGETS.iga.name,
      address: STORE_TARGETS.iga.address,
      scope: STORE_TARGETS.iga.scope,
    },
    offers: unique,
  };
}
