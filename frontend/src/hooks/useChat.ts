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

const SESSION_STORAGE_KEY = "nutrimentor-agent-session";

function inferPendingState(message: string): AgentState {
  const lowered = message.toLowerCase();
  if (lowered.includes("bmi") || lowered.includes("compare")) {
    return "calculating";
  }
  if (lowered.includes("diet plan") || lowered.includes("meal plan")) {
    return "generating-plan";
  }
  if (
    lowered.includes("nutrient") ||
    lowered.includes("season") ||
    lowered.includes("vitamin") ||
    lowered.includes("calorie")
  ) {
    return "retrieving";
  }
  return "thinking";
}

function toUiMessages(
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    metadata?: {
      mode?: "tool" | "retrieval" | "llm-assisted";
      task_type?: string;
      citations?: string[];
    };
  }>,
): AgentMessageType[] {
  return messages.map((message, index) => ({
    id: `${message.role}-${index}-${message.content.slice(0, 16)}`,
    role: message.role,
    content: message.content,
    metadata: {
      mode: message.metadata?.mode,
      taskType: message.metadata?.task_type,
      citations: message.metadata?.citations,
    },
  }));
}

interface UseChatOptions {
  selectedItem: Item | null;
  season: string;
  profile: AgentProfile;
}

export function useChat({ selectedItem, season, profile }: UseChatOptions) {
  const [messages, setMessages] = useState<AgentMessageType[]>([]);
  const [loading, setLoading] = useState(false);
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [sessionId, setSessionId] = useState<string | null>(() =>
    window.localStorage.getItem(SESSION_STORAGE_KEY),
  );
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const previousSelectedItemId = useRef<number | null>(selectedItem?.id ?? null);

  const refreshSessions = useCallback(async () => {
    try {
      const nextSessions = await getAgentSessions();
      setSessions(nextSessions);
    } catch {
      // Ignore session sidebar refresh failures.
    }
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);

    getAgentSession(sessionId)
      .then((session) => {
        setMessages(toUiMessages(session.messages));
      })
      .catch(() => {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
        setSessionId(null);
      });
  }, [sessionId]);

  useEffect(() => {
    const currentId = selectedItem?.id ?? null;
    if (currentId === previousSelectedItemId.current) {
      return;
    }

    previousSelectedItemId.current = currentId;

    if (selectedItem) {
      selectAgentContext(sessionId, {
        id: selectedItem.id,
        name: selectedItem.name,
        season: selectedItem.season,
      })
        .then((response) => {
          if (response.session_id !== sessionId) {
            setSessionId(response.session_id);
          }
          refreshSessions();
        })
        .catch(() => undefined);
      return;
    }

    if (!sessionId) {
      return;
    }

    clearAgentContext(sessionId)
      .then(() => {
        refreshSessions();
      })
      .catch(() => undefined);
  }, [refreshSessions, selectedItem, sessionId]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) {
        return;
      }

      const userMessage: AgentMessageType = {
        id: `${Date.now()}-user`,
        role: "user",
        content: trimmed,
      };

      setMessages((prev) => [...prev, userMessage]);
      setLoading(true);
      setAgentState(inferPendingState(trimmed));

      try {
        const response = await sendAgentMessage({
          message: trimmed,
          session_id: sessionId,
          context: {
            current_item: selectedItem
              ? {
                  id: selectedItem.id,
                  name: selectedItem.name,
                  season: selectedItem.season,
                }
              : null,
            current_season: season,
            profile,
          },
        });

        setSessionId(response.session_id);
        setAgentState(response.agent_state);
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
        refreshSessions();
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-assistant-error`,
            role: "assistant",
            content: "Sorry, the agent could not complete that task. Please try again.",
          },
        ]);
      } finally {
        setLoading(false);
        setAgentState("complete");
      }
    },
    [loading, profile, refreshSessions, season, selectedItem, sessionId],
  );

  const continueSession = useCallback(async (nextSessionId: string) => {
    const session = await getAgentSession(nextSessionId);
    setSessionId(nextSessionId);
    setMessages(toUiMessages(session.messages));
  }, []);

  const clearContext = useCallback(async () => {
    const response = await clearAgentContext(sessionId);
    if (!sessionId && response.session_id) {
      setSessionId(response.session_id);
    }
    refreshSessions();
  }, [refreshSessions, sessionId]);

  const starterPrompts = useMemo(
    () => [
      selectedItem ? `Analyze ${selectedItem.name}` : "Tell me what you can do",
      selectedItem ? `What nutrients does ${selectedItem.name} have?` : "Suggest a seasonal food",
      selectedItem ? `Compare ${selectedItem.name} with banana` : "Build my day plan",
      "What is my BMI?",
    ],
    [selectedItem],
  );

  return {
    messages,
    loading,
    agentState,
    sessionId,
    sessions,
    starterPrompts,
    sendMessage,
    continueSession,
    clearContext,
  };
}
