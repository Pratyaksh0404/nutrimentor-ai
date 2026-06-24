import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearAgentContext,
  getAgentSession,
  getAgentSessions,
  selectAgentContext,
  sendAgentMessage,
} from "../api/chat";
import type {
  AgentMessageType,
  AgentProfile,
  AgentSessionSummary,
  AgentState,
} from "../types/chat";
import type { Item } from "../types/item";

const PROFILE_KEY = "nutrimentor-profile-id";

function getOrCreateProfileId(): string {
  let id = window.localStorage.getItem(PROFILE_KEY);
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, "");
    window.localStorage.setItem(PROFILE_KEY, id);
  }
  return id;
}

function inferPendingState(message: string): AgentState {
  const m = message.toLowerCase();
  if (m.includes("bmi") || m.includes("compare")) return "calculating";
  if (m.includes("diet plan") || m.includes("meal plan") || m.includes("day plan")) return "generating-plan";
  if (m.includes("nutrient") || m.includes("vitamin") || m.includes("season") || m.includes("calorie")) return "retrieving";
  return "thinking";
}

interface UseChatOptions {
  selectedItem: Item | null;
  season: string;
  profile: AgentProfile;
}

export function useChat({ selectedItem, season, profile }: UseChatOptions) {
  const [messages, setMessages]     = useState<AgentMessageType[]>([]);
  const [loading, setLoading]       = useState(false);
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [sessions, setSessions]     = useState<AgentSessionSummary[]>([]);
  const [sessionId, setSessionId]   = useState<string | null>(null);

  const sessionIdRef       = useRef<string | null>(null);
  const loadedSessionRef   = useRef<string | null>(null);
  const prevSelectedItemId = useRef<number | null>(selectedItem?.id ?? null);

  const profileId = useMemo(() => getOrCreateProfileId(), []);

  function updateSessionId(id: string | null) {
    sessionIdRef.current = id;
    setSessionId(id);
  }

  const refreshSessions = useCallback(async () => {
    try {
      const data = await getAgentSessions(profileId, sessionIdRef.current);
      setSessions(data);
    } catch { /* ignore */ }
  }, [profileId]);

  useEffect(() => { refreshSessions(); }, [refreshSessions]);

  useEffect(() => {
    const currentId = selectedItem?.id ?? null;
    if (currentId === prevSelectedItemId.current) return;
    prevSelectedItemId.current = currentId;
    const sid = sessionIdRef.current;
    if (selectedItem) {
      selectAgentContext(sid, {
        id: selectedItem.id,
        name: selectedItem.name,
        season: selectedItem.season,
      })
        .then((r) => { if (r.session_id !== sid) updateSessionId(r.session_id); })
        .catch(() => undefined);
    } else if (sid) {
      clearAgentContext(sid).catch(() => undefined);
    }
  }, [selectedItem]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [...prev, {
      id: `${Date.now()}-user`,
      role: "user",
      content: trimmed,
    }]);
    setLoading(true);
    setAgentState(inferPendingState(trimmed));

    try {
      const sid = sessionIdRef.current;
      const response = await sendAgentMessage({
        message: trimmed,
        context: {
          session_id: sid,
          profile_id: profileId,
          current_item: selectedItem
            ? { id: selectedItem.id, name: selectedItem.name, season: selectedItem.season }
            : null,
          current_season: season,
          profile,
        },
      });

      if (response.session_id && response.session_id !== sid) {
        updateSessionId(response.session_id);
        loadedSessionRef.current = response.session_id;
      }

      setMessages((prev) => [...prev, {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        content: response.message,
        cards: response.cards,
        nextActions: response.next_actions,
        metadata: {
          mode: response.mode,
          taskType: response.task_type,
          citations: response.citations,
        },
      }]);

      setAgentState("complete");
      refreshSessions();
    } catch (err: any) {
      console.error("sendMessage error:", err?.response?.data || err?.message || err);
      const errMsg = err?.response?.status === 401 ? "Authentication error — please refresh the page."
                   : err?.response?.status === 429 ? "Too many requests — please wait a moment and try again."
                   : err?.response?.status >= 500 ? "Server error — please try again in a moment."
                   : "Something went wrong. Please try again.";
      setMessages((prev) => [...prev, {
        id: `${Date.now()}-error`,
        role: "assistant",
        content: errMsg,
      }]);
    } finally {
      setLoading(false);
      setAgentState("complete");
    }
  }, [loading, profile, profileId, refreshSessions, season, selectedItem]);

  const continueSession = useCallback(async (sid: string) => {
    try {
      const session = await getAgentSession(sid);
      updateSessionId(sid);
      loadedSessionRef.current = sid;
      setMessages(session.messages?.map((m, i) => ({
        id: `hist-${i}-${m.role}`,
        role: m.role,
        content: m.content,
      })) ?? []);
    } catch (err) {
      console.error("continueSession error:", err);
    }
  }, []);

  const clearContext = useCallback(async () => {
    try {
      const sid = sessionIdRef.current;
      if (sid) await clearAgentContext(sid);
      refreshSessions();
    } catch { /* ignore */ }
  }, [refreshSessions]);

  const startNewChat = useCallback(() => {
    setMessages([]);
    updateSessionId(null);
    loadedSessionRef.current = null;
    prevSelectedItemId.current = null;
  }, []);

  const starterPrompts = useMemo(() => [
    selectedItem ? `Analyze ${selectedItem.name}` : "Tell me what you can do",
    selectedItem ? `What nutrients does ${selectedItem.name} have?` : "Suggest a seasonal food",
    selectedItem ? `Compare ${selectedItem.name} with banana` : "Build my day plan",
    "What is my BMI?",
  ], [selectedItem]);

  return {
    messages, loading, agentState, sessionId, sessions,
    starterPrompts, sendMessage, continueSession, clearContext, startNewChat,
    profileId,
  };
}