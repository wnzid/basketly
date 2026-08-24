# PriceRadar AU

Static supermarket promotion comparison for **St Albans VIC 3021, Melbourne**. It follows the original PriceRadar architecture: scheduled TypeScript collectors -> repository JSON -> conservative product grouping -> deal intelligence/history -> React/Vite -> GitHub Pages. No database or runtime server.

Retailers: **ALDI, Coles, Woolworths, Costco, IGA**.

## Start

```bash
npm install
npm run collect
npm run dev
```

Useful commands: `npm test`, `npm run typecheck`, `npm run build`, `npm run collect:coles`, `npm run collect:woolworths`, `npm run collect:aldi`, `npm run collect:costco`, `npm run collect:iga`.

## Location handling

The target is St Albans VIC 3021. Retailer sources do not all expose the same localisation controls, so every offer records its source scope (`target-store`, `postcode-targeted`, `state-level`, or `national`). The app never labels a general online price as an exact local shelf price.

Targets used by the collectors are in `scripts/config.ts`; change that one file to move the project to another suburb/postcode.

## Collector safety

A collector that returns zero offers or a suspiciously large drop is rejected by `scripts/write-data.ts`, preserving the last good JSON. Costco and IGA may change catalogue/warehouse viewers; optional `COSTCO_SAVINGS_URL` and `IGA_CATALOGUE_URL` environment variables can point at a current official machine-readable page without changing code.

`COLES_MAX_PAGES` and `WOOLWORTHS_MAX_PAGES` can cap collection during development.

## Data / legal

This is an independent comparison project, not affiliated with any listed retailer. Prices, catalogue coverage, membership conditions, stock and local availability can change. Retailer source pages remain authoritative. Do not bypass login, paywall, bot protection or access controls; the collectors use only publicly reachable sources.
