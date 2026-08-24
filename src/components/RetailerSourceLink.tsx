import {stores} from "../lib/format.js";
import type {Offer} from "../types/index.js";

export function RetailerSourceLink({offer,productName}:{offer:Offer;productName:string}){if(!offer.sourceUrl)return null;const retailer=stores[offer.store].label;return <a href={offer.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`View ${productName} at ${retailer} (opens in a new tab)`}>View at {retailer} →</a>}
