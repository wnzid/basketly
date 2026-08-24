import { STORE_TARGETS, TARGET_AREA } from "../config.js";
import { discount } from "../normalization/normalize-price.js";
import { parseAdvertisedUnitPrice, parseQuantity, unitPrice } from "../normalization/normalize-units.js";
import type { RawOffer, StoreData } from "../types.js";
import { dedupeOffers, parseProductHtml } from "./common.js";
import { capturePage, withBrowser } from "./browser.js";

const BASE = "https://www.woolworths.com.au";
const SPECIALS_URL = `${BASE}/shop/browse/specials`;
type AnyRecord = Record<string, any>;

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}

function parseWoolworthsResponse(value: unknown): RawOffer[] {
  const result: RawOffer[] = [];
  const seen = new Set<string>();

  const addProduct = (product: AnyRecord, groupName?: string) => {
    const stockcode = product.Stockcode ?? product.stockcode ?? product.StockCode;
    if (!stockcode) return;
    const id = String(stockcode);
    if (seen.has(id)) return;

    const salePrice = numberValue(product.InstorePrice ?? product.Price ?? product.price);
    const regularPrice = numberValue(product.InstoreWasPrice ?? product.WasPrice ?? product.wasPrice);
    const isSpecial = Boolean(
      product.IsOnSpecial ?? product.isOnSpecial ?? product.IsSpecial ?? product.isSpecial ?? (regularPrice && salePrice && regularPrice > salePrice),
    );
    if (!salePrice || salePrice <= 0 || !isSpecial) return;

    const name = String(product.DisplayName ?? product.Description ?? product.Name ?? groupName ?? "").replace(/\s+/g, " ").trim();
    if (!name) return;
    const cup = String(product.InstoreCupString ?? product.CupString ?? product.cupString ?? "");
    const advertised = parseAdvertisedUnitPrice(cup);
    const quantity = parseQuantity(name);
    const image =
      product.MediumImageFile ??
      product.SmallImageFile ??
      product.LargeImageFile ??
      `https://cdn0.woolworths.media/content/wowproductimages/medium/${id}.jpg`;

    seen.add(id);
    result.push({
      externalId: id,
      name,
      brand: product.Brand || undefined,
      salePrice,
      regularPrice,
      discountPercent: discount(salePrice, regularPrice),
      quantity: quantity?.quantity,
      unit: quantity?.unit,
      pricePerUnit: advertised?.price ?? unitPrice(salePrice, quantity),
      pricePerUnitType: advertised?.type ?? quantity?.type,
      imageUrl: /^https?:/i.test(String(image)) ? String(image) : new URL(String(image), BASE).href,
      sourceUrl: `${BASE}/shop/productdetails/${id}`,
      promotionType: "SALE",
      sourceType: "structured",
      sourcePlatform: "woolworths",
      channel: "physical",
      physicalStoreAvailability: "unknown",
      locationScope: STORE_TARGETS.woolworths.scope,
      targetStore: STORE_TARGETS.woolworths.name,
      targetPostcode: TARGET_AREA.postcode,
      promotionConditions: String(product.PromotionDescription ?? product.Savings ?? product.MarketingTag ?? "") || undefined,
      confidence: "HIGH",
    });
  };

  const visit = (item: unknown, parentName?: string) => {
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) return void item.forEach(child => visit(child, parentName));
    const row = item as AnyRecord;
    const groupName = String(row.DisplayName ?? row.Name ?? parentName ?? "") || parentName;
    if (row.Stockcode ?? row.stockcode ?? row.StockCode) addProduct(row, groupName);
    for (const child of Object.values(row)) visit(child, groupName);
  };
  visit(value);
  return result;
}

async function browserApiCollection(): Promise<RawOffer[]> {
  return withBrowser(async context => {
    await context.addCookies([
      { name: "woolworths-postcode", value: TARGET_AREA.postcode, domain: ".woolworths.com.au", path: "/" },
    ]);

    const page = await context.newPage();
    try {
      await page.goto(SPECIALS_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => undefined);
      await page.waitForTimeout(1800);

      const maxPages = Math.max(1, Number(process.env.WOOLWORTHS_MAX_PAGES ?? 120));
      const responses: unknown[] = [];
      for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
        const data = await page.evaluate(
          async ({ pageNumber, pageSize }) => {
            const headers = { "content-type": "application/json", accept: "application/json, text/plain, */*" };
            const payload = {
              Filters: [],
              IsSpecial: true,
              Location: "/shop/browse/specials",
              PageNumber: pageNumber,
              PageSize: pageSize,
              SearchTerm: "",
              SortType: "TraderRelevance",
              IsHideEverydayMarketProducts: true,
              IsRegisteredRewardCardPromotion: null,
              ExcludeSearchTypes: ["UntraceableVendors"],
              GpBoost: 0,
              GroupEdmVariants: false,
              EnableAdReRanking: false,
            };

            const post = await fetch("/apis/ui/Search/products", {
              method: "POST",
              credentials: "include",
              headers,
              body: JSON.stringify(payload),
            });
            if (post.ok) return { source: "search", status: post.status, body: await post.json() };

            const browse = await fetch(`/apis/ui/browse/category?category=specials&pageNumber=${pageNumber}&pageSize=${pageSize}`, {
              credentials: "include",
              headers: { accept: "application/json, text/plain, */*" },
            });
            return { source: "browse", status: browse.status, body: browse.ok ? await browse.json() : null };
          },
          { pageNumber, pageSize: 36 },
        );

        if (!data.body || data.status < 200 || data.status >= 300) {
          if (pageNumber === 1) throw new Error(`Woolworths API returned HTTP ${data.status}`);
          break;
        }
        const parsed = parseWoolworthsResponse(data.body);
        if (!parsed.length) {
          if (pageNumber === 1) throw new Error("Woolworths authenticated API returned no sale products");
          break;
        }
        responses.push(data.body);
        if (parsed.length < 30) break;
      }

      return dedupeOffers(responses.flatMap(parseWoolworthsResponse));
    } finally {
      await page.close();
    }
  });
}

export async function collectWoolworths(): Promise<StoreData> {
  const offers: RawOffer[] = [];
  let browserError: unknown;

  try {
    offers.push(...(await browserApiCollection()));
  } catch (error) {
    browserError = error;
  }

  // Browser/network-capture fallback: useful if Woolworths changes the direct API payload.
  if (!offers.length) {
    try {
      await withBrowser(async context => {
        await context.addCookies([{ name: "woolworths-postcode", value: TARGET_AREA.postcode, domain: ".woolworths.com.au", path: "/" }]);
        const capture = await capturePage(context, SPECIALS_URL, (url, contentType) =>
          contentType.includes("json") && /woolworths\.com\.au\/api/i.test(url),
        );
        offers.push(...parseProductHtml(capture.html, { store: "woolworths", pageUrl: capture.finalUrl, promotionType: "SALE", confidence: "MEDIUM" }));
        for (const body of capture.json) {
          offers.push(...parseWoolworthsResponse(body));
        }
      });
    } catch (error) {
      browserError ??= error;
    }
  }

  const unique = dedupeOffers(offers).filter(offer => offer.salePrice && offer.salePrice > 0);
  if (!unique.length) {
    throw new Error(`woolworths: browser/API collector returned no sale offers${browserError ? ` (${browserError instanceof Error ? browserError.message : String(browserError)})` : ""}`);
  }

  return {
    store: "woolworths",
    collectedAt: new Date().toISOString(),
    source: STORE_TARGETS.woolworths.source,
    target: {
      area: TARGET_AREA.label,
      postcode: TARGET_AREA.postcode,
      storeName: STORE_TARGETS.woolworths.name,
      address: STORE_TARGETS.woolworths.address,
      scope: STORE_TARGETS.woolworths.scope,
    },
    offers: unique,
  };
}
