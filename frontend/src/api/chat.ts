import { apiClient } from "./client";
import type {
  AgentContext,
  AgentContextItem,
  AgentResponse,
  AgentSessionDetail,
  AgentSessionSummary,
} from "../types/chat";

interface AgentPayload {
  message: string;
  session_id?: string | null;
  context?: AgentContext;
}

export async function sendAgentMessage(payload: AgentPayload): Promise<AgentResponse> {
  const response = await apiClient.post("/agent/message", payload);
  return response.data;
}

export async function selectAgentContext(
  sessionId: string | null,
  item: AgentContextItem,
): Promise<{ session_id: string; selected_item: AgentContextItem }> {
  const response = await apiClient.post("/agent/context/select", {
    session_id: sessionId,
    item,
  });
  return response.data;
}

export async function clearAgentContext(
  sessionId: string | null,
): Promise<{ session_id: string; selected_item: null }> {
  const response = await apiClient.post("/agent/context/clear", {
    session_id: sessionId,
  });
  return response.data;
}

export async function getAgentSessions(): Promise<AgentSessionSummary[]> {
  const response = await apiClient.get("/agent/sessions");
  return response.data;
}

export async function getAgentSession(sessionId: string): Promise<AgentSessionDetail> {
  const response = await apiClient.get(`/agent/sessions/${sessionId}`);
  return response.data;
}
