import { API_BASE_URL } from "./config";

export async function apiGet<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${endpoint}`);
  if (!res.ok) {
    throw new Error("API request failed");
  }
  return res.json();
}

export async function apiPost<T>(endpoint: string, body: any): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error("API request failed");
  }
  return res.json();
}
