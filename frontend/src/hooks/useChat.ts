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

const SESSION_KEY = "nutrimentor-session-id";

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
  const [messages, setMessages]   = useState<AgentMessageType[]>([]);
  const [loading, setLoading]     = useState(false);
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [sessions, setSessions]   = useState<AgentSessionSummary[]>([]);

  // sessionId lives in a ref AND state — ref avoids stale closure issues
  const [sessionId, setSessionIdState] = useState<string | null>(
    () => window.localStorage.getItem(SESSION_KEY)
  );
  const sessionIdRef = useRef<string | null>(sessionId);

  function setSessionId(id: string | null) {
    sessionIdRef.current = id;
    setSessionIdState(id);
    if (id) window.localStorage.setItem(SESSION_KEY, id);
    else window.localStorage.removeItem(SESSION_KEY);
  }

  // Track last loaded session to avoid re-fetching on every render
  const loadedSessionRef = useRef<string | null>(null);
  const prevSelectedItemId = useRef<number | null>(selectedItem?.id ?? null);

  // Refresh sessions sidebar
  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await getAgentSessions());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refreshSessions(); }, [refreshSessions]);

  // Load message history when session first loads — but NOT after each send
  useEffect(() => {
    const sid = sessionId;
    if (!sid || loadedSessionRef.current === sid) return;
    loadedSessionRef.current = sid;

    getAgentSession(sid)
      .then((session) => {
        if (session.messages?.length) {
          setMessages(session.messages.map((m: any, i: number) => ({
            id: `hist-${i}-${m.role}`,
            role: m.role,
            content: m.content,
          })));
        }
      })
      .catch(() => {
        // Session not found on server (e.g. after restart) — clear it
        window.localStorage.removeItem(SESSION_KEY);
        setSessionId(null);
        loadedSessionRef.current = null;
      });
  }, [sessionId]);

  // Select/clear item context when it changes
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
        .then((r) => { if (r.session_id !== sid) setSessionId(r.session_id); })
        .catch(() => undefined);
    } else if (sid) {
      clearAgentContext(sid).catch(() => undefined);
    }
  }, [selectedItem]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    // Optimistically add user message
    const userMsg: AgentMessageType = {
      id: `${Date.now()}-user`,
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setAgentState(inferPendingState(trimmed));

    try {
      const sid = sessionIdRef.current;
      const response = await sendAgentMessage({
        message: trimmed,
        context: {
          session_id: sid,        // ← Worker reads this from context
          current_item: selectedItem
            ? { id: selectedItem.id, name: selectedItem.name, season: selectedItem.season }
            : null,
          current_season: season,
          profile,
        },
      });

      // Update session id if new
      if (response.session_id && response.session_id !== sid) {
        setSessionId(response.session_id);
        loadedSessionRef.current = response.session_id; // don't re-load from server
      }

      // Add assistant response — append to existing messages, never replace
      setMessages((prev) => [
        ...prev,
        {
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
        },
      ]);

      setAgentState("complete");
      refreshSessions();
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-error`,
          role: "assistant",
          content: "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
      setAgentState("complete");
    }
  }, [loading, profile, refreshSessions, season, selectedItem]);

  const continueSession = useCallback(async (sid: string) => {
    try {
      const session = await getAgentSession(sid);
      setSessionId(sid);
      loadedSessionRef.current = sid;
      setMessages(session.messages?.map((m: any, i: number) => ({
        id: `hist-${i}-${m.role}`,
        role: m.role,
        content: m.content,
      })) ?? []);
    } catch { /* ignore */ }
  }, []);

  const clearContext = useCallback(async () => {
    try {
      const sid = sessionIdRef.current;
      if (sid) await clearAgentContext(sid);
      refreshSessions();
    } catch { /* ignore */ }
  }, [refreshSessions]);

  const starterPrompts = useMemo(() => [
    selectedItem ? `Analyze ${selectedItem.name}` : "Tell me what you can do",
    selectedItem ? `What nutrients does ${selectedItem.name} have?` : "Suggest a seasonal food",
    selectedItem ? `Compare ${selectedItem.name} with banana` : "Build my day plan",
    "What is my BMI?",
  ], [selectedItem]);

  return {
    messages, loading, agentState, sessionId, sessions,
    starterPrompts, sendMessage, continueSession, clearContext,
  };
}