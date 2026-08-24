import {createElement,useState} from "react";

export function ProductImage({src,alt,className=""}:{src?:string;alt:string;className?:string}){const[failed,setFailed]=useState(false);return createElement("div",{className:`product-image ${className}`},src&&!failed?createElement("img",{src,alt,loading:"lazy",width:240,height:180,onError:()=>setFailed(true)}):createElement("div",{className:"image-fallback",role:"img","aria-label":`${alt} image unavailable`},createElement("span",null,"◉")))}
