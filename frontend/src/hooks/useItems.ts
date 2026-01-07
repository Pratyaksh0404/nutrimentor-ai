import { useEffect, useState } from "react";
import { getItems } from "../api/items";
import type { Item } from "../types/item";

export function useItems(season: string) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getItems(season)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [season]);

  return { items, loading };
}
