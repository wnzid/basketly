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
  const visit = (item: unknown) => {
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) return void item.forEach(visit);
    const row = item as AnyRecord;
    if (row.pricing && row.name && (row.id || row.productId)) rows.push(row);
    Object.values(row).forEach(visit);
  };
  visit(value);
  return rows;
}

function colesOffer(row: AnyRecord, sourceUrl: string): RawOffer | undefined {
  const pricing = row.pricing ?? {};
  const promotionType = String(pricing.promotionType ?? "").toUpperCase();
  const salePrice = asNumber(pricing.now ?? pricing.price);
  if (!salePrice || salePrice <= 0) return;
  if (promotionType && !SPECIAL_PROMOS.has(promotionType)) return;

  const regularPrice = asNumber(pricing.was) ??
    (asNumber(pricing.saveAmount) ? Number((salePrice + asNumber(pricing.saveAmount)!).toFixed(2)) : undefined);
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
  for (const url of [BASE, `${BASE}/on-special`]) {
    try {
      const id = discoverBuildId(await fetchText(url, { headers: { cookie: `shoppingStore=${STORE_TARGETS.coles.retailerStoreId ?? "7612"}` } }));
      if (id) return id;
    } catch {
      // GitHub runners can normally read at least one Coles HTML entry point.
    }
  }
  throw new Error("coles: could not discover current Next.js build ID; set COLES_BUILD_ID as a temporary override");
}

async function fetchSpecialPage(buildId: string, page: number): Promise<unknown> {
  const candidates = [
    `${BASE}/_next/data/${encodeURIComponent(buildId)}/en/on-special.json?page=${page}`,
    `${BASE}/_next/data/${encodeURIComponent(buildId)}/en/on-special.json?pid=on-special&page=${page}`,
  ];
  let lastError: unknown;
  for (const url of candidates) {
    try {
      return await fetchJson(url, {
        headers: {
          referer: `${BASE}/on-special?page=${page}`,
          cookie: `shoppingStore=${STORE_TARGETS.coles.retailerStoreId ?? "7612"}`,
        },
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Coles specials endpoint failed");
}

export async function collectColes(): Promise<StoreData> {
  const maxPages = Math.max(1, Number(process.env.COLES_MAX_PAGES ?? 160));
  const offers: RawOffer[] = [];
  let directError: unknown;

  try {
    const buildId = await getBuildId();
    let emptyPages = 0;
    for (let page = 1; page <= maxPages; page += 1) {
      let data: unknown;
      try {
        data = await fetchSpecialPage(buildId, page);
      } catch (error) {
        if (page === 1) throw error;
        break;
      }

      const pageUrl = `${BASE}/on-special?page=${page}`;
      const parsed = collectProductRows(data).map(row => colesOffer(row, pageUrl)).filter(Boolean) as RawOffer[];
      offers.push(...parsed);
      if (!parsed.length) offers.push(...parseGenericStructured(data, { store: "coles", pageUrl, promotionType: "SALE", confidence: "MEDIUM" }));

      if (!parsed.length) emptyPages += 1;
      else emptyPages = 0;
      if (emptyPages >= 2) break;

      const raw = data as AnyRecord;
      const total = Number(
        raw?.pageProps?.searchResults?.totalResults ??
          raw?.pageProps?.searchResults?.total ??
          raw?.pageProps?.totalResults ??
          0,
      );
      if (total && page * 48 >= total) break;
    }
  } catch (error) {
    directError = error;
  }

  if (!offers.length) {
    try {
      await withBrowser(async context => {
        await context.addCookies([
          { name: "shoppingStore", value: STORE_TARGETS.coles.retailerStoreId ?? "7612", domain: ".coles.com.au", path: "/" },
        ]);
        const capture = await capturePage(context, `${BASE}/on-special?page=1`, (url, contentType) =>
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
  if (!unique.length) throw new Error(`coles: direct feed and browser fallback returned no sale offers${directError ? ` (${directError instanceof Error ? directError.message : String(directError)})` : ""}`);

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
