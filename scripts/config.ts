import type{LocationScope,Store}from"./types.js";
export const TARGET_AREA={suburb:"St Albans",state:"VIC",postcode:"3021",city:"Melbourne",country:"Australia",label:"St Albans VIC 3021, Melbourne"}as const;
export interface StoreTarget{name:string;address:string;scope:LocationScope;source:string}
export const STORE_TARGETS:Record<Store,StoreTarget>={
 aldi:{name:"ALDI Keilor Downs",address:"80 Taylors Road, Keilor Downs VIC 3038",scope:"state-level",source:"https://www.aldi.com.au/products/super-savers/k/1588161426952145"},
 coles:{name:"Coles Brimbank",address:"Brimbank Shopping Centre, Neale Rd & Station Rd, Deer Park VIC 3021",scope:"postcode-targeted",source:"https://www.coles.com.au/on-special"},
 woolworths:{name:"Woolworths St Albans",address:"315-321 Main Road East, St Albans VIC 3021",scope:"postcode-targeted",source:"https://www.woolworths.com.au/shop/browse/specials"},
 costco:{name:"Costco Ardeer",address:"740 Ballarat Road, Ardeer VIC 3022",scope:"target-store",source:"https://www.costco.com.au/"},
 iga:{name:"IGA Saint Albans",address:"16-18 East Esplanade, St Albans VIC 3021",scope:"target-store",source:"https://www.iga.com.au/stores/iga-saint-albans/"}
};
