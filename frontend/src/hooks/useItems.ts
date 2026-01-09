import { useEffect, useState } from "react";
import { getItems } from "../api/items";
import type { Item } from "../types/item";

export function useItems(season: string) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    getItems(season)
      .then(setItems)
      .catch(() => setError("Failed to load items"))
      .finally(() => setLoading(false));
  }, [season]);

  return { items, loading, error };
}