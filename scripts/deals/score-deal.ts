import type {DealOffer} from "../types.js";
import type {DealIntelligence,DealReason,HistorySummary} from "./types.js";

const round=(value:number,digits=2)=>Number(value.toFixed(digits));
export function advertisedDiscount(offer:Pick<DealOffer,"regularPrice"|"salePrice"|"discountPercent">){
  const{regularPrice:regular,salePrice:sale}=offer;if(regular==null||sale==null||regular<=0||sale<=0||sale>regular)return undefined;
  const calculated=((regular-sale)/regular)*100;if(calculated<0||calculated>100)return undefined;
  return offer.discountPercent!=null&&offer.discountPercent>=0&&offer.discountPercent<=100&&Math.abs(offer.discountPercent-calculated)<=2?round(offer.discountPercent,1):round(calculated,1);
}
export function savingEvidence(offer:DealOffer){
  const{regularPrice:regular,salePrice:sale}=offer;if(regular==null||sale==null||regular<=0||sale<=0||sale>regular)return{};
  const absoluteSaving=round(regular-sale),quantity=offer.quantity,baseQuantity=quantity!=null&&(offer.unit==="g"||offer.unit==="ml")?quantity/1000:quantity;
  const regularUnit=offer.pricePerUnit!=null&&offer.pricePerUnitType&&baseQuantity!=null&&baseQuantity>0?regular/baseQuantity:undefined;
  const unitSaving=regularUnit!=null&&regularUnit>=offer.pricePerUnit!?round(regularUnit-offer.pricePerUnit!):undefined;
  return{absoluteSaving,unitSaving};
}
export function scoreDeal(offer:DealOffer,history:HistorySummary):DealIntelligence{
  const discount=advertisedDiscount(offer),saving=savingEvidence(offer),savingBasis=saving.unitSaving??saving.absoluteSaving??0;
  const discountPoints=discount==null?0:Math.min(45,discount*1.125),savingPoints=Math.min(20,Math.log1p(savingBasis)*6);
  const historyPoints=history.status==="LOWEST_OBSERVED"?30:history.status==="NEAR_LOWEST"?22:history.percentBelowMedian&&history.percentBelowMedian>0?Math.min(15,history.percentBelowMedian*.6):0;
  const qualityPoints=(discount!=null?3:0)+(offer.confidence==="HIGH"?2:0),reasons:DealReason[]=[];
  if(discount!=null&&discount>=40)reasons.push("HIGH_DISCOUNT");else if(discount!=null&&discount>=25)reasons.push("GOOD_DISCOUNT");
  if(history.status==="LOWEST_OBSERVED")reasons.push("LOWEST_OBSERVED_PRICE");else if(history.status==="NEAR_LOWEST")reasons.push("NEAR_HISTORICAL_LOW");else if(history.status==="INSUFFICIENT_HISTORY")reasons.push("LIMITED_HISTORY");
  if(saving.unitSaving!=null&&saving.unitSaving>=2&&(offer.pricePerUnitType==="kg"||offer.pricePerUnitType==="l"))reasons.push("STRONG_UNIT_PRICE");if(offer.promotionType==="LOYALTY")reasons.push("LOYALTY_REQUIRED");
  return{advertisedDiscountPercent:discount,...saving,historicalStatus:history.status,historicalObservations:history.observations,historicalLow:history.low,historicalMedian:history.median,historicalHigh:history.high,percentBelowHistoricalMedian:history.percentBelowMedian,dealScore:round(Math.max(0,Math.min(100,discountPoints+savingPoints+historyPoints+qualityPoints)),1),reasons,comparisonReasons:[]};
}
