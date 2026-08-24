import type {DealOffer,UnitType} from "../types.js";

export type HistoricalStatus="LOWEST_OBSERVED"|"NEAR_LOWEST"|"NORMAL"|"INSUFFICIENT_HISTORY";
export type DealReason="HIGH_DISCOUNT"|"GOOD_DISCOUNT"|"LOWEST_OBSERVED_PRICE"|"NEAR_HISTORICAL_LOW"|"STRONG_UNIT_PRICE"|"LOYALTY_REQUIRED"|"LIMITED_HISTORY"|"CHEAPEST_TRACKED_STORE";
export interface HistoricalObservation{snapshot:string;price:number;unit?:UnitType}
export interface HistorySummary{status:HistoricalStatus;observations:number;low?:number;median?:number;high?:number;percentBelowMedian?:number}
export interface DealIntelligence{advertisedDiscountPercent?:number;absoluteSaving?:number;unitSaving?:number;historicalStatus:HistoricalStatus;historicalObservations:number;historicalLow?:number;historicalMedian?:number;historicalHigh?:number;percentBelowHistoricalMedian?:number;dealScore:number;reasons:DealReason[];comparisonReasons:DealReason[];cheaperThanTrackedBy?:number;cheaperThanTrackedPercent?:number}
export interface RankedDeal{rank:number;dealId:string;product:string;category:string;store:DealOffer["store"];sourceName:string;salePrice?:number;regularPrice?:number;pricePerUnit?:number;pricePerUnitType?:UnitType;discountPercent?:number;validUntil?:string;sourceUrl:string;promotionType?:DealOffer["promotionType"];dealScore:number;reasons:DealReason[];historicalStatus:HistoricalStatus}
export interface BestDealsData{generatedAt:string;all:RankedDeal[];byStore:Record<DealOffer["store"],RankedDeal[]>}
