# Basketly

Static supermarket specials comparison for **St Albans VIC 3021, Melbourne**.

Basketly collects public offers from **ALDI, Coles, Woolworths, Costco and IGA**, normalizes prices/unit prices, conservatively groups equivalent products, ranks deals, keeps dated history, and deploys a React/Vite site to GitHub Pages. There is no database or runtime server.

## Setup

Node 24 recommended.

```bash
npm install
npx playwright install chromium
npm run collect
npm run dev
```

`npm run collect` preserves the last good retailer JSON if a collector fails or returns suspiciously little data.

## Collectors

- **ALDI:** public Super Savers / Limited Time / Special Buys pages; nearest configured store is ALDI Brimbank.
- **Coles:** Next.js JSON data feed; targets Coles Brimbank (`7612`). `COLES_BUILD_ID` can temporarily override automatic build-ID discovery.
- **Woolworths:** anonymous Chromium session + Woolworths JSON API, targeting postcode `3021` where the site accepts postcode context.
- **Costco:** public Hot Buy and Warehouse Savings sources. Costco membership is required and online/warehouse prices can differ.
- **IGA:** IGA Saint Albans weekly catalogue, including client-rendered catalogue/network data when available. `IGA_CATALOGUE_URL` can override the catalogue entry point.

## Commands

```bash
npm run collect
npm run collect:aldi
npm run collect:coles
npm run collect:woolworths
npm run collect:costco
npm run collect:iga
npm test
npm run typecheck
npm run lint
npm run build
```

## GitHub Pages

The included Actions workflow collects twice daily and commits only meaningful data changes. A data commit triggers the Pages workflow automatically.

Enable **Settings -> Pages -> Source: GitHub Actions** if Pages is not already enabled.

## Data / legal note

Basketly is independent and is not affiliated with the listed retailers. Retailer prices, availability and promotional conditions remain authoritative. IGA pricing can vary by independently operated store; Costco warehouse and online prices can differ; some Coles/Woolworths availability is location/session dependent.
