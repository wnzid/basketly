import {useEffect} from "react";
import {siteConfig} from "../config/site.js";

export function PageMeta({title,description}:{title:string;description:string}){
  useEffect(()=>{const previousTitle=document.title;let meta=document.querySelector<HTMLMetaElement>('meta[name="description"]'),created=false;if(!meta){meta=document.createElement("meta");meta.name="description";document.head.append(meta);created=true}const previousDescription=meta.content;document.title=`${title} | ${siteConfig.siteName}`;meta.content=description;return()=>{document.title=previousTitle;if(created)meta.remove();else meta.content=previousDescription}},[title,description]);
  return null;
}
