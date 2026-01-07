import { apiClient } from "./client";
import type { Item } from "../types/item";

export async function getItems(season: string): Promise<Item[]> {
  const params = season === "all" ? {} : { season };
  const response = await apiClient.get("/items/", { params });
  return response.data;
}
