import {useEffect, useState} from "react";
import type {Deal, Metadata} from "../types";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export function useDeals() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [metadata, setMetadata] = useState<Metadata>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    Promise.all([
      fetchJson<Deal[]>(`${base}data/current/deals.json`),
      fetchJson<Metadata>(`${base}data/current/metadata.json`),
    ])
      .then(([nextDeals, nextMetadata]) => {
        setDeals(nextDeals);
        setMetadata(nextMetadata);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return {deals, metadata, loading, error};
}
