import {writeFile} from "node:fs/promises";
import type {Deal} from "../types.js";
import {enrichDeals,rankDeals} from "./generate-ranking.js";
import {loadHistory} from "./history.js";

export async function generateDealIntelligence(deals:Deal[],generatedAt=new Date().toISOString()){
  const history=await loadHistory(),enriched=enrichDeals(deals,history.observations),ranking=rankDeals(enriched,generatedAt);
  await writeFile("data/current/deals.json",`${JSON.stringify(enriched,null,2)}\n`);
  await writeFile("data/current/best-deals.json",`${JSON.stringify(ranking,null,2)}\n`);
  return{deals:enriched,ranking,historyFiles:history.files};
}
