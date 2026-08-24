import type {Deal} from "../types/index.js";

export const SHOPPING_LIST_KEY="priceradar.au.shoppingList.v1";
export interface ShoppingListItem{id:string;dealId:string;label:string}
interface ReadStorage{getItem:(key:string)=>string|null}interface WriteStorage{setItem:(key:string,value:string)=>void}
export const shoppingIdentity=(deal:Deal)=>`${deal.id.startsWith("unmatched-")?"deal":"canonical"}:${deal.id}`;
export function readShoppingList(storage:ReadStorage):ShoppingListItem[]{try{const value=JSON.parse(storage.getItem(SHOPPING_LIST_KEY)??"[]");return Array.isArray(value)?value.filter(item=>item&&typeof item.id==="string"&&typeof item.dealId==="string"&&typeof item.label==="string"):[]}catch{return[]}}
export function writeShoppingList(storage:WriteStorage,items:ShoppingListItem[]){storage.setItem(SHOPPING_LIST_KEY,JSON.stringify(items))}
export function addShoppingItem(items:ShoppingListItem[],deal:Deal){const id=shoppingIdentity(deal);return items.some(item=>item.id===id)?items:[...items,{id,dealId:deal.id,label:deal.name}]}
export const removeShoppingItem=(items:ShoppingListItem[],id:string)=>items.filter(item=>item.id!==id);
export function resolveShoppingItem(item:ShoppingListItem,deals:Deal[]){return{item,deal:deals.find(deal=>shoppingIdentity(deal)===item.id||deal.id===item.dealId)}}
