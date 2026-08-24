import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from "react";
import type {Deal} from "../types/index.js";
import {addShoppingItem,readShoppingList,removeShoppingItem,SHOPPING_LIST_KEY,type ShoppingListItem} from "../lib/shopping-list.js";

interface ShoppingListState{items:ShoppingListItem[];add:(deal:Deal)=>void;remove:(id:string)=>void;clear:()=>void;has:(deal:Deal)=>boolean}
const Context=createContext<ShoppingListState|undefined>(undefined);
export function ShoppingListProvider({children}:{children:ReactNode}){const[items,setItems]=useState<ShoppingListItem[]>(()=>typeof window==="undefined"?[]:readShoppingList(window.localStorage));useEffect(()=>{window.localStorage.setItem(SHOPPING_LIST_KEY,JSON.stringify(items))},[items]);const value=useMemo<ShoppingListState>(()=>({items,add:deal=>setItems(current=>addShoppingItem(current,deal)),remove:id=>setItems(current=>removeShoppingItem(current,id)),clear:()=>setItems([]),has:deal=>items.some(item=>item.dealId===deal.id)}),[items]);return <Context.Provider value={value}>{children}</Context.Provider>}
// eslint-disable-next-line react-refresh/only-export-components
export function useShoppingList(){const value=useContext(Context);if(!value)throw new Error("useShoppingList must be used within ShoppingListProvider");return value}
