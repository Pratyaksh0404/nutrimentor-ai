import { apiClient } from "./client";

interface ChatPayload {
  message: string;
  context?: any;
}

export async function sendChatMessage(payload: ChatPayload) {
  const response = await apiClient.post("/chat/", payload);
  return response.data;
}
