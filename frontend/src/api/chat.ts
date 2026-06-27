import { apiClient } from "./client";
import type {
  AgentContextItem,
  AgentProfile,
  AgentResponse,
  AgentSessionDetail,
  AgentSessionSummary,
} from "../types/chat";

interface AgentMessagePayload {
  message: string;
  context: {
    session_id: string | null;
    profile_id?: string;
    current_item?: AgentContextItem | null;
    current_season?: string;
    profile?: AgentProfile;
  };
}

export async function sendAgentMessage(payload: AgentMessagePayload): Promise<AgentResponse> {
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

export async function getAgentSessions(
  profileId?: string | null,
  sessionId?: string | null,
): Promise<AgentSessionSummary[]> {
  const params: Record<string, string> = {};
  if (profileId) params.profile_id = profileId;
  if (sessionId) params.session_id = sessionId;
  const response = await apiClient.get("/agent/sessions", { params });
  return response.data;
}

export async function getAgentSession(sessionId: string, profileId?: string | null): Promise<AgentSessionDetail> {
  const params = profileId ? { profile_id: profileId } : {};
  const response = await apiClient.get(`/agent/sessions/${sessionId}`, { params });
  return response.data;
}