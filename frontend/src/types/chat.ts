import type { Item } from "./item";

export type ChatRole = "user" | "assistant";
export type AgentMode = "tool" | "retrieval" | "llm-assisted";
export type AgentState = "idle" | "thinking" | "retrieving" | "calculating" | "generating-plan" | "complete";

export interface AgentProfile {
  age?: number;
  sex?: string;
  height_cm?: number;
  weight_kg?: number;
  activity_level?: string;
  goal?: string;
  dietary_preference?: string;
  allergies: string[];
  health_cautions: string[];
}

export interface AgentContextItem {
  id: number;
  name: string;
  season?: string;
}

export interface AgentContext {
  current_item?: AgentContextItem | null;
  current_season?: string;
  consumed_items?: Array<{
    item_id: number;
    quantity_in_grams: number;
  }>;
  profile?: AgentProfile;
}

export interface AgentCard {
  type: string;
  title: string;
  body: string;
}

export interface AgentResponse {
  session_id: string;
  message: string;
  mode: AgentMode;
  task_type: string;
  agent_state: Exclude<AgentState, "idle">;
  used_profile: boolean;
  used_selected_item: boolean;
  citations: string[];
  cards: AgentCard[];
  next_actions: string[];
  selected_item?: AgentContextItem | null;
}

export interface AgentMessageType {
  id: string;
  role: ChatRole;
  content: string;
  cards?: AgentCard[];
  nextActions?: string[];
  metadata?: {
    mode?: AgentMode;
    taskType?: string;
    citations?: string[];
  };
}

export interface AgentSessionSummary {
  session_id: string;
  title: string;
  updated_at: string;
  message_count: number;
  preview: string;
}

export interface AgentSessionDetail {
  session_id: string;
  title: string;
  current_item?: AgentContextItem | null;
  profile?: AgentProfile | null;
  messages: Array<{
    role: ChatRole;
    content: string;
    metadata?: {
      mode?: AgentMode;
      task_type?: string;
      citations?: string[];
    };
    created_at: string;
  }>;
  created_at: string;
  updated_at: string;
}

export interface AgentPanelProps {
  selectedItem: Item | null;
  season: string;
  onClearSelectedItem: () => void;
}
