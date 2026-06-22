import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, History, PenSquare, Send, Sparkles, UserRound, X, Zap } from "lucide-react";
import { useChat } from "../../hooks/useChat";
import type { AgentPanelProps, AgentProfile } from "../../types/chat";

const defaultProfile: AgentProfile = { allergies: [], health_cautions: [] };
const PROFILE_KEY = "nutrimentor-agent-profile";

function computeBmi(p: AgentProfile): string | null {
  if (!p.height_cm || !p.weight_kg) return null;
  return (p.weight_kg / ((p.height_cm / 100) ** 2)).toFixed(1);
}

function loadProfile(): AgentProfile {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    return raw ? { ...defaultProfile, ...JSON.parse(raw) } : defaultProfile;
  } catch {
    return defaultProfile;
  }
}

function agentStateLabel(state: string) {
  switch (state) {
    case "retrieving":      return "Retrieving data…";
    case "calculating":     return "Calculating…";
    case "generating-plan": return "Building plan…";
    case "thinking":        return "Thinking…";
    default:                return "Ready";
  }
}

export default function ChatBox({ selectedItem, season, onClearSelectedItem }: AgentPanelProps) {
  const [input, setInput]             = useState("");
  const [profile, setProfile]         = useState<AgentProfile>(loadProfile);
  const [showProfile, setShowProfile] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [showTasks, setShowTasks]     = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  const { messages, loading, agentState, sessionId, sessions, starterPrompts,
          sendMessage, continueSession, clearContext, startNewChat } = useChat({ selectedItem, season, profile });

  useEffect(() => {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const bmi = useMemo(() => computeBmi(profile), [profile]);

  async function handleSend() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await sendMessage(text);
  }

  async function handleClear() {
    await clearContext();
    onClearSelectedItem();
  }

  function updateProfile(patch: Partial<AgentProfile>) {
    setProfile((prev) => ({ ...prev, ...patch }));
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">

      {/* ── TOP BAR: title + status + context chips ───────────────────── */}
      <div className="shrink-0 border-b border-slate-100 px-4 pt-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 leading-tight">NutriMentor AI Agent</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {loading ? agentStateLabel(agentState) : "Ready"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {/* New chat */}
            <button
              type="button"
              onClick={startNewChat}
              title="New chat"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
            >
              <PenSquare className="h-3.5 w-3.5" />
            </button>
            {/* Profile toggle */}
            <button
              type="button"
              onClick={() => setShowProfile((p) => !p)}
              title="Profile"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-slate-500 transition-colors ${
                showProfile ? "border-blue-200 bg-blue-50 text-blue-600" : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <UserRound className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Context chips row */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {selectedItem ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 pl-2 pr-1 py-0.5 text-[11px] font-medium text-emerald-700">
              <Sparkles className="h-3 w-3" />
              {selectedItem.name}
              <button
                type="button"
                onClick={handleClear}
                className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-emerald-200 transition-colors"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-slate-500">
              No food selected
            </span>
          )}
          {sessionId && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-slate-500">
              Session active
            </span>
          )}
        </div>
      </div>

      {/* ── PROFILE DRAWER (collapses) ────────────────────────────────── */}
      {showProfile && (
        <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-800">Profile memory</p>
              <p className="text-[11px] text-slate-400">Used for BMI and plan guidance.</p>
            </div>
            {bmi && (
              <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">BMI</p>
                <p className="text-sm font-semibold text-slate-800">{bmi}</p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <input
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
              placeholder="Age"
              type="number"
              value={profile.age ?? ""}
              onChange={(e) => updateProfile({ age: e.target.value ? +e.target.value : undefined })}
            />
            <select
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
              value={profile.sex ?? ""}
              onChange={(e) => updateProfile({ sex: e.target.value || undefined })}
            >
              <option value="">Sex</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
            <input
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
              placeholder="Height (cm)"
              type="number"
              value={profile.height_cm ?? ""}
              onChange={(e) => updateProfile({ height_cm: e.target.value ? +e.target.value : undefined })}
            />
            <input
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
              placeholder="Weight (kg)"
              type="number"
              value={profile.weight_kg ?? ""}
              onChange={(e) => updateProfile({ weight_kg: e.target.value ? +e.target.value : undefined })}
            />
            <select
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
              value={profile.goal ?? ""}
              onChange={(e) => updateProfile({ goal: e.target.value || undefined })}
            >
              <option value="">Goal</option>
              <option value="maintain weight">Maintain</option>
              <option value="lose weight">Lose weight</option>
              <option value="gain weight">Gain weight</option>
              <option value="better energy">Better energy</option>
            </select>
            <select
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
              value={profile.activity_level ?? ""}
              onChange={(e) => updateProfile({ activity_level: e.target.value || undefined })}
            >
              <option value="">Activity</option>
              <option value="sedentary">Sedentary</option>
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
      )}

      {/* ── COLLAPSIBLE: SESSION HISTORY ─────────────────────────────── */}
      <div className="shrink-0 border-b border-slate-100">
        <button
          type="button"
          onClick={() => setShowSessions((p) => !p)}
          className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-slate-50 transition-colors"
        >
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <History className="h-3 w-3" />
            Sessions
            {sessions.length > 0 && (
              <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-medium text-slate-600">
                {sessions.length}
              </span>
            )}
          </span>
          {showSessions ? <ChevronUp className="h-3 w-3 text-slate-400" /> : <ChevronDown className="h-3 w-3 text-slate-400" />}
        </button>

        {showSessions && (
          <div className="px-3 pb-2 flex flex-col gap-1.5">
            {/* New chat button */}
            <button
              type="button"
              onClick={startNewChat}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[11px] text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              <PenSquare className="h-3 w-3" />
              Start a new chat
            </button>

            {sessions.length === 0 ? (
              <p className="px-1 text-[11px] text-slate-400 text-center py-1">
                No previous sessions yet
              </p>
            ) : (
              sessions.slice(0, 5).map((s) => {
                const isActive = s.session_id === sessionId;
                // D1 stores datetime('now') as UTC without Z suffix
                // Append Z so JS parses as UTC, then display in user's local timezone (IST)
                const rawTs = s.updated_at
                  ? s.updated_at.includes("T") ? s.updated_at : s.updated_at.replace(" ", "T") + "Z"
                  : null;
                const time = rawTs
                  ? new Date(rawTs).toLocaleString("en-IN", {
                      day: "numeric", month: "short",
                      hour: "2-digit", minute: "2-digit",
                      hour12: true,
                    })
                  : "";
                const preview = (s as any).first_message || s.title || "Chat session";
                return (
                  <button
                    key={s.session_id}
                    type="button"
                    onClick={() => continueSession(s.session_id)}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                      isActive
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-[11px] font-medium truncate ${isActive ? "text-emerald-700" : "text-slate-800"}`}>
                        {preview.slice(0, 40)}{preview.length > 40 ? "…" : ""}
                      </p>
                      {isActive && (
                        <span className="shrink-0 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] text-white font-medium">
                          now
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">{time}</p>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ── COLLAPSIBLE: QUICK TASKS ──────────────────────────────────── */}
      <div className="shrink-0 border-b border-slate-100">
        <button
          type="button"
          onClick={() => setShowTasks((p) => !p)}
          className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-slate-50 transition-colors"
        >
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <Zap className="h-3 w-3" />
            Quick tasks
          </span>
          {showTasks ? <ChevronUp className="h-3 w-3 text-slate-400" /> : <ChevronDown className="h-3 w-3 text-slate-400" />}
        </button>

        {showTasks && (
          <div className="px-3 pb-2.5 flex flex-wrap gap-1.5">
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => { sendMessage(prompt); setShowTasks(false); }}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── MESSAGES (fills remaining height) ────────────────────────── */}
      <div ref={messagesRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6 py-8">
            <div className="text-2xl">🥦</div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Select a food from the grid, or ask a nutrition question, request a diet plan, or compare two foods.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5 mt-1">
              {starterPrompts.slice(0, 3).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => sendMessage(p)}
                  className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className={`max-w-[88%] flex flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}>
              {/* Bubble */}
              <div
                className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-slate-100 text-slate-800 rounded-bl-sm"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>

              {/* Cards */}
              {msg.cards?.map((card) => (
                <div
                  key={`${msg.id}-${card.title}`}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm"
                >
                  <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">{card.title}</p>
                  <p className="mt-1 text-xs text-slate-600">{card.body}</p>
                </div>
              ))}

              {/* Next action chips */}
              {msg.nextActions?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {msg.nextActions.map((action) => (
                    <button
                      key={`${msg.id}-${action}`}
                      type="button"
                      onClick={() => sendMessage(action)}
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── INPUT BAR ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-slate-100 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <input
            className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none transition-colors"
            placeholder="Ask about food, nutrients, season, plan…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-700 active:scale-95 transition-all"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}