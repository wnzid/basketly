export const STORES=["aldi","coles","woolworths","costco","iga"] as const;
export type Store=(typeof STORES)[number];
export type UnitType="kg"|"l"|"piece";
export type PromotionType="SALE"|"LOYALTY"|"CAMPAIGN";
export type SourcePlatform=Store;
export type SalesChannel="physical"|"online";
export type DisplayNameSource="CANONICAL"|"AUTO"|"UNTRANSLATED";
export type LocationScope="target-store"|"postcode-targeted"|"state-level"|"national";
export interface RawOffer{externalId?:string;name:string;description?:string;brand?:string;salePrice?:number;loyaltyPrice?:number;regularPrice?:number;discountPercent?:number;quantity?:number;unit?:string;pricePerUnit?:number;pricePerUnitType?:UnitType;validFrom?:string;validUntil?:string;imageUrl?:string;sourceUrl:string;category?:string;sourceCategory?:string;promotionType?:PromotionType;sourceType?:"web"|"structured"|"catalogue";sourcePlatform?:SourcePlatform;channel?:SalesChannel;campaignId?:string;promotionActive?:boolean;promotionConditions?:string;onlineAvailable?:boolean|null;physicalStoreAvailability?:"unknown";membershipRequired?:boolean;locationScope?:LocationScope;targetStore?:string;targetPostcode?:string;confidence?:"HIGH"|"MEDIUM"}
export interface StoreData{store:Store;collectedAt:string;source:string;target:{area:string;postcode:string;storeName:string;address:string;scope:LocationScope};offers:RawOffer[]}
export interface DealOffer extends RawOffer{store:Store;sourceName:string;displayName:string;displayNameSource:DisplayNameSource;canonicalProductId?:string;intelligence?:import("./deals/types.js").DealIntelligence}
export interface Deal{id:string;name:string;category:string;subcategory?:string;aliases:string[];primaryImageUrl?:string;offers:DealOffer[]}
