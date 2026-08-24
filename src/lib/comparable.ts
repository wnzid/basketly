import type {Offer} from "../types/index.js";

export function comparableOffers(offers:Offer[]){
  const unit=offers.find(offer=>offer.pricePerUnit!=null)?.pricePerUnitType;
  return offers.filter(offer=>offer.pricePerUnit!=null&&offer.pricePerUnitType===unit);
}
