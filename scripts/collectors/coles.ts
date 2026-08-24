import { STORE_TARGETS, TARGET_AREA } from "../config.js";
import { fetchJson, fetchText } from "../http.js";
import { discount } from "../normalization/normalize-price.js";
import { parseAdvertisedUnitPrice, parseQuantity, unitPrice } from "../normalization/normalize-units.js";
import type { RawOffer, StoreData } from "../types.js";
import { dedupeOffers, parseGenericStructured, parseProductHtml } from "./common.js";
import { capturePage, withBrowser } from "./browser.js";

const BASE = "https://www.coles.com.au";
const IMAGE_BASE = "https://cdn.productimages.coles.com.au/productimages";
const SPECIAL_PROMOS = new Set(["SPECIAL", "DOWN", "MULTIBUY", "PERCENT_OFF"]);
const PAGE_SIZE = 48;

type AnyRecord = Record<string, any>;

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}

function discoverBuildId(html: string): string | undefined {
  return html.match(/"buildId"\s*:\s*"([^"]+)"/)?.[1] ?? html.match(/\/_next\/static\/([^/]+)\/_buildManifest\.js/)?.[1];
}

function collectProductRows(value: unknown): AnyRecord[] {
  const rows: AnyRecord[] = [];
  const visited = new Set<object>();
  const visit = (item: unknown) => {
    if (!item || typeof item !== "object") return;
    if (visited.has(item as object)) return;
    visited.add(item as object);
    if (Array.isArray(item)) return void item.forEach(visit);
    const row = item as AnyRecord;
    if (row.pricing && row.name && (row.id || row.productId)) rows.push(row);
    Object.values(row).forEach(visit);
  };
  visit(value);
  return rows;
}

function resultMeta(data: unknown) {
  const raw = data as AnyRecord;
  const search = raw?.pageProps?.searchResults ?? raw?.pageProps?.results ?? {};
  const rows = Array.isArray(search?.results) ? search.results : collectProductRows(data);
  const total = Number(search?.totalResults ?? search?.total ?? raw?.pageProps?.totalResults ?? 0);
  return { rows, total: Number.isFinite(total) ? total : 0 };
}

function colesOffer(row: AnyRecord, sourceUrl: string): RawOffer | undefined {
  const pricing = row.pricing ?? {};
  const promotionType = String(pricing.promotionType ?? "").toUpperCase();
  const salePrice = asNumber(pricing.now ?? pricing.price);
  if (!salePrice || salePrice <= 0) return;
  if (promotionType && !SPECIAL_PROMOS.has(promotionType)) return;

  const saveAmount = asNumber(pricing.saveAmount);
  const regularPrice = asNumber(pricing.was) ?? (saveAmount ? Number((salePrice + saveAmount).toFixed(2)) : undefined);
  if (!promotionType && (!regularPrice || regularPrice <= salePrice)) return;

  const name = [row.brand, row.name, row.size].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (!name) return;
  const advertised = parseAdvertisedUnitPrice(String(pricing.comparable ?? ""));
  const quantity = parseQuantity(name);
  const imagePath = row.imageUris?.[0]?.uri ?? row.imageUrl ?? row.image;
  const id = String(row.id ?? row.productId ?? name);
  const productUrl = row.url
    ? new URL(String(row.url), BASE).href
    : `${BASE}/product/${encodeURIComponent(String(row.name ?? id).toLowerCase().replace(/[^a-z0-9]+/g, "-"))}-${id}`;

  return {
    externalId: id,
    name,
    brand: row.brand || undefined,
    salePrice,
    regularPrice,
    discountPercent: asNumber(pricing.savePercent) ?? discount(salePrice, regularPrice),
    quantity: quantity?.quantity,
    unit: quantity?.unit,
    pricePerUnit: advertised?.price ?? unitPrice(salePrice, quantity),
    pricePerUnitType: advertised?.type ?? quantity?.type,
    imageUrl: imagePath ? (/^https?:/i.test(imagePath) ? imagePath : `${IMAGE_BASE}${imagePath}`) : undefined,
    sourceUrl: productUrl,
    promotionType: "SALE",
    sourceType: "structured",
    sourcePlatform: "coles",
    channel: "physical",
    physicalStoreAvailability: "unknown",
    locationScope: STORE_TARGETS.coles.scope,
    targetStore: STORE_TARGETS.coles.name,
    targetPostcode: TARGET_AREA.postcode,
    promotionConditions: pricing.saveStatement || undefined,
    confidence: "HIGH",
  };
}

async function getBuildId(): Promise<string> {
  if (process.env.COLES_BUILD_ID) return process.env.COLES_BUILD_ID;
  for (const url of [BASE, `${BASE}/search/products?q=milk`, `${BASE}/on-special`]) {
    try {
      const html = await fetchText(url, {
        headers: { cookie: `shoppingStore=${STORE_TARGETS.coles.retailerStoreId ?? "7612"}` },
      });
      const id = discoverBuildId(html);
      if (id) return id;
    } catch {
      // Try the next public entry point.
    }
  }
  throw new Error("coles: could not discover current Next.js build ID; set COLES_BUILD_ID as a temporary override");
}

async function fetchSearchPage(buildId: string, query: string, page: number): Promise<unknown> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  const url = `${BASE}/_next/data/${encodeURIComponent(buildId)}/en/search/products.json${suffix ? `?${suffix}` : ""}`;
  return fetchJson(url, {
    headers: {
      referer: `${BASE}/search/products?${params.toString()}`,
      cookie: `shoppingStore=${STORE_TARGETS.coles.retailerStoreId ?? "7612"}`,
    },
  });
}

function defaultSearchTerms() {
  const configured = process.env.COLES_SEARCH_TERMS?.split(",").map(term => term.trim()).filter(Boolean);
  if (configured?.length) return configured;
  // The empty query is attempted first. These terms are only a fallback for Coles builds
  // that require a non-empty q parameter. Unioning broad grocery terms keeps requests modest.
  return [
    "milk", "bread", "cheese", "yoghurt", "meat", "chicken", "beef", "pork", "fish", "fruit", "vegetable",
    "snack", "chips", "chocolate", "biscuit", "cereal", "coffee", "tea", "drink", "water", "juice", "soft drink",
    "pasta", "rice", "sauce", "frozen", "ice cream", "cleaning", "laundry", "toilet", "shampoo", "baby", "pet",
  ];
}

async function collectSearch(buildId: string, query: string, maxPages: number): Promise<RawOffer[]> {
  const offers: RawOffer[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await fetchSearchPage(buildId, query, page);
    const meta = resultMeta(data);
    const pageUrl = `${BASE}/search/products?q=${encodeURIComponent(query)}${page > 1 ? `&page=${page}` : ""}`;
    offers.push(...meta.rows.map(row => colesOffer(row, pageUrl)).filter(Boolean) as RawOffer[]);
    if (!meta.rows.length || meta.rows.length < PAGE_SIZE) break;
    if (meta.total && page * PAGE_SIZE >= meta.total) break;
  }
  return offers;
}

export async function collectColes(): Promise<StoreData> {
  const offers: RawOffer[] = [];
  let directError: unknown;

  try {
    const buildId = await getBuildId();
    const maxPages = Math.max(1, Number(process.env.COLES_MAX_PAGES_PER_QUERY ?? 12));

    // First try an empty search. Some Coles builds return the whole catalogue here.
    try {
      offers.push(...(await collectSearch(buildId, "", Math.max(maxPages, 40))));
    } catch (error) {
      directError = error;
    }

    // If empty-search coverage is poor, sweep a bounded set of normal product searches
    // and keep only products whose official promotionType marks them as specials.
    if (dedupeOffers(offers).length < Number(process.env.COLES_MIN_DIRECT_OFFERS ?? 300)) {
      for (const term of defaultSearchTerms()) {
        try {
          offers.push(...(await collectSearch(buildId, term, maxPages)));
        } catch (error) {
          directError ??= error;
        }
      }
    }
  } catch (error) {
    directError = error;
  }

  // HTML/browser fallback remains useful for future site changes, but is not the primary source.
  if (!offers.length) {
    try {
      await withBrowser(async context => {
        await context.addCookies([
          { name: "shoppingStore", value: STORE_TARGETS.coles.retailerStoreId ?? "7612", domain: ".coles.com.au", path: "/" },
        ]);
        const capture = await capturePage(context, `${BASE}/search/products?q=milk`, (url, contentType) =>
          contentType.includes("json") && /coles\.com\.au/i.test(url),
        );
        offers.push(...parseProductHtml(capture.html, { store: "coles", pageUrl: capture.finalUrl, promotionType: "SALE", confidence: "MEDIUM" }));
        for (const body of capture.json) {
          offers.push(...collectProductRows(body).map(row => colesOffer(row, capture.finalUrl)).filter(Boolean) as RawOffer[]);
          offers.push(...parseGenericStructured(body, { store: "coles", pageUrl: capture.finalUrl, promotionType: "SALE", confidence: "MEDIUM" }));
        }
      });
    } catch (error) {
      directError ??= error;
    }
  }

  const unique = dedupeOffers(offers).filter(offer => offer.salePrice && offer.salePrice > 0);
  if (!unique.length) {
    throw new Error(`coles: official Next.js search feed returned no sale offers${directError ? ` (${directError instanceof Error ? directError.message : String(directError)})` : ""}`);
  }

  return {
    store: "coles",
    collectedAt: new Date().toISOString(),
    source: STORE_TARGETS.coles.source,
    target: {
      area: TARGET_AREA.label,
      postcode: TARGET_AREA.postcode,
      storeName: STORE_TARGETS.coles.name,
      address: STORE_TARGETS.coles.address,
      scope: STORE_TARGETS.coles.scope,
    },
    offers: unique,
  };
}
