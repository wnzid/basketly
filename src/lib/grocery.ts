import type {Deal} from "../types/index.js";

export const GROCERY_CATEGORIES=new Set(["Fruit & Vegetables","Meat","Fish & Seafood","Dairy & Eggs","Bakery","Pantry","Frozen","Snacks","Drinks"]);
export const isGroceryCategory=(category:string)=>GROCERY_CATEGORIES.has(category);
const score=(deal:Deal)=>Math.max(0,...deal.offers.filter(offer=>offer.channel!=="online").map(offer=>offer.intelligence?.dealScore??0));
export function bestGroceryDeals(deals:Deal[],limit=8){const sorted=deals.filter(deal=>isGroceryCategory(deal.category)&&deal.offers.some(offer=>offer.channel!=="online")).sort((a,b)=>score(b)-score(a)||a.name.localeCompare(b.name)),selected:Deal[]=[],used=new Set<string>();for(const deal of sorted)if(!used.has(deal.category)){selected.push(deal);used.add(deal.category);if(selected.length===limit)return selected}for(const deal of sorted)if(!selected.includes(deal)){selected.push(deal);if(selected.length===limit)break}return selected}
