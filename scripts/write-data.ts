import {mkdir, readFile, writeFile} from "node:fs/promises";
import type {StoreData} from "./types.js";

export const meaningfulStoreJson = (data: StoreData) =>
  JSON.stringify(
    data.offers
      .map(({sourceUrl, ...offer}) => ({...offer, sourceUrl}))
      .sort((a, b) => (a.externalId ?? a.name).localeCompare(b.externalId ?? b.name)),
  );

export function validateStoreData(next: StoreData, previous?: StoreData): void {
  if (!next.offers.length) throw new Error(`${next.store}: zero offers; preserving previous data`);
  if (!previous?.offers.length) return;

  const ratio = next.offers.length / previous.offers.length;
  const floor = previous.offers.length >= 100 ? 0.5 : 0.25;
  const verifiedMigration =
    next.offers.every((offer) => offer.confidence === "HIGH") &&
    !previous.offers.some((offer) => offer.confidence);

  if (ratio < floor && !verifiedMigration) {
    throw new Error(
      `${next.store}: suspicious drop ${previous.offers.length} -> ${next.offers.length}; preserving previous data`,
    );
  }
}

export async function acceptStoreData(next: StoreData, fileKey: string = next.store): Promise<boolean> {
  const path = `data/current/${fileKey}.json`;
  let previous: StoreData | undefined;
  try {
    previous = JSON.parse(await readFile(path, "utf8")) as StoreData;
  } catch {
    // First successful collection for this source.
  }

  validateStoreData(next, previous);
  if (previous && meaningfulStoreJson(previous) === meaningfulStoreJson(next)) return false;

  await mkdir("data/current", {recursive: true});
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`);
  return true;
}
