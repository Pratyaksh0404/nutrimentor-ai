import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, FileDown, PenSquare, Send, UserRound, X } from "lucide-react";
import { useChat } from "../../hooks/useChat";
import FeedbackModal from "../footer/FeedbackModal";
import type { AgentPanelProps, AgentProfile } from "../../types/chat";
import { generateDietPDF } from "../../utils/generateDietPDF";

const PKEY = "nutrimentor-agent-profile";
const DEF: AgentProfile = { allergies: [], health_cautions: [] };

function loadProfile(): AgentProfile {
  try { const r = localStorage.getItem(PKEY); return r ? { ...DEF, ...JSON.parse(r) } : DEF; }
  catch { return DEF; }
}

function bmi(p: AgentProfile): string | null {
  if (!p.height_cm || !p.weight_kg) return null;
  return (p.weight_kg / ((p.height_cm / 100) ** 2)).toFixed(1);
}

function greeting(): string {
  const h = new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCHours();
  if (h < 12) return "Good morning! 🌅";
  if (h < 17) return "Good afternoon! ☀️";
  return "Good evening! 🌙";
}

function status(state: string, loading: boolean): string {
  if (!loading) return "Ready";
  return state === "retrieving" ? "Retrieving…"
       : state === "calculating" ? "Calculating…"
       : state === "generating-plan" ? "Building plan…"
       : "Thinking…";
}

// Simple markdown → safe HTML
function md(t: string): string {
  return t
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^[•\-] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>(\n|$))+/g, m => `<ul>${m}</ul>`)
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^(?!<[uop])/, "<p>")
    .replace(/(?<![>])$/, "</p>");
}

function fmtTime(raw: string): string {
  if (!raw) return "";
  const ts = raw.includes("T") ? raw : raw.replace(" ", "T") + "Z";
  return new Date(ts).toLocaleString("en-IN", {
    day:"numeric", month:"short", hour:"2-digit", minute:"2-digit", hour12:true
  });
}

interface ExtProps extends AgentPanelProps {
  pendingMessage?: string | null;
  onPendingMessageSent?: () => void;
}

export default function ChatBox({ selectedItem, season, onClearSelectedItem, pendingMessage, onPendingMessageSent }: ExtProps) {
  const [input,    setInput]    = useState("");
  const [profile,  setProfile]  = useState<AgentProfile>(loadProfile);
  const [showProf, setShowProf] = useState(false);
  const [showSess,     setShowSess]     = useState(false);
  const [pdfLoading,   setPdfLoading]   = useState<string | null>(null); // msg id being downloaded
  const [showTask, setShowTask] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const msgRef  = useRef<HTMLDivElement>(null);
  const inpRef  = useRef<HTMLTextAreaElement>(null);

  const { messages, loading, agentState, sessionId, sessions,
          starterPrompts, sendMessage, continueSession, clearContext, startNewChat }
    = useChat({ selectedItem, season, profile });

  useEffect(() => { localStorage.setItem(PKEY, JSON.stringify(profile)); }, [profile]);
  useEffect(() => { const el = msgRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, loading]);

  // Handle prompts from centre panel
  useEffect(() => {
    if (pendingMessage && !loading) {
      sendMessage(pendingMessage);
      onPendingMessageSent?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMessage]);

  function resize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  }

  async function send() {
    const t = input.trim(); if (!t || loading) return;
    setInput(""); if (inpRef.current) inpRef.current.style.height = "38px";
    await sendMessage(t);
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  async function handleClear() { await clearContext(); onClearSelectedItem(); }
  function upd(p: Partial<AgentProfile>) { setProfile(prev => ({ ...prev, ...p })); }

  const BMI = useMemo(() => bmi(profile), [profile]);

  return (
    <div className="nm-chat" style={{ height:"100%" }}>

      {/* Header */}
      <div className="nm-chat-header">
        <div className="nm-chat-header-row">
          <div>
            <div className="nm-chat-title">NutriMentor AI</div>
            <div className={`nm-chat-status${loading ? " thinking" : ""}`}>{status(agentState, loading)}</div>
          </div>
          <div className="nm-chat-btns">
            <button type="button" className="nm-chat-btn" onClick={startNewChat}
              title="New chat" aria-label="New chat">
              <PenSquare size={13} />
            </button>
            <button type="button" className={`nm-chat-btn${showProf ? " on" : ""}`}
              onClick={() => setShowProf(v => !v)} aria-label="Profile" aria-expanded={showProf}>
              <UserRound size={13} />
            </button>
          </div>
        </div>
        <div className="nm-ctx-chips">
          {selectedItem ? (
            <span className="nm-ctx-chip food">
              🌿 {selectedItem.name}
              <button type="button" className="nm-ctx-chip-x" onClick={handleClear}
                aria-label={`Remove ${selectedItem.name}`}>
                <X size={10} />
              </button>
            </span>
          ) : (
            <span className="nm-ctx-chip">No food selected</span>
          )}
          {sessionId && <span className="nm-ctx-chip">Session active</span>}
        </div>
      </div>

      {/* Profile */}
      {showProf && (
        <div className="nm-profile-panel">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
            <div>
              <div className="nm-profile-label">Profile memory</div>
              <div className="nm-profile-sub">Used for BMI, calories & plans.</div>
            </div>
            {BMI && <div><div className="nm-profile-bmi-label">BMI</div><div className="nm-profile-bmi">{BMI}</div></div>}
          </div>
          <div className="nm-profile-grid">
            <input className="nm-field" placeholder="Age" type="number"
              value={profile.age ?? ""} onChange={e => upd({ age: e.target.value ? +e.target.value : undefined })} />
            <select className="nm-field" value={profile.sex ?? ""}
              onChange={e => upd({ sex: e.target.value || undefined })}>
              <option value="">Sex</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
            <input className="nm-field" placeholder="Height (cm)" type="number"
              value={profile.height_cm ?? ""} onChange={e => upd({ height_cm: e.target.value ? +e.target.value : undefined })} />
            <input className="nm-field" placeholder="Weight (kg)" type="number"
              value={profile.weight_kg ?? ""} onChange={e => upd({ weight_kg: e.target.value ? +e.target.value : undefined })} />
            <select className="nm-field" value={profile.goal ?? ""}
              onChange={e => upd({ goal: e.target.value || undefined })}>
              <option value="">Goal</option>
              <option value="maintain weight">Maintain</option>
              <option value="lose weight">Lose weight</option>
              <option value="gain weight">Gain weight</option>
              <option value="better energy">Better energy</option>
            </select>
            <select className="nm-field" value={profile.activity_level ?? ""}
              onChange={e => upd({ activity_level: e.target.value || undefined })}>
              <option value="">Activity</option>
              <option value="sedentary">Sedentary</option>
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
      )}

      {/* Sessions */}
      <div className="nm-section">
        <button type="button" className="nm-section-btn"
          onClick={() => setShowSess(v => !v)} aria-expanded={showSess}>
          <span className="nm-section-lbl">
            <span aria-hidden="true">🕐</span> Sessions
            {sessions.length > 0 && <span className="nm-section-badge">{sessions.length}</span>}
          </span>
          {showSess ? <ChevronUp size={12} color="var(--text-3)" /> : <ChevronDown size={12} color="var(--text-3)" />}
        </button>
        {showSess && (
          <div className="nm-section-body">
            <button type="button" className="nm-new-chat" onClick={startNewChat}>
              <PenSquare size={12} /> New chat
            </button>
            {sessions.length === 0
              ? <p className="nm-empty-sessions">No previous sessions</p>
              : <div className="nm-session-scroll">{sessions.map(s => {
                  const active = s.session_id === sessionId;
                  const preview = (s as any).first_message || s.title || "Chat session";
                  return (
                    <button key={s.session_id} type="button"
                      className={`nm-session-item${active ? " current" : ""}`}
                      onClick={() => continueSession(s.session_id)}>
                      <div className="nm-session-title">{preview.slice(0,42)}{preview.length > 42 ? "…" : ""}</div>
                      <div className="nm-session-meta">
                        <span className="nm-session-time">{fmtTime(s.updated_at)}</span>
                        {active && <span className="nm-session-now">now</span>}
                      </div>
                    </button>
                  );
                })}</div>
            }
          </div>
        )}
      </div>

      {/* Quick tasks */}
      <div className="nm-section">
        <button type="button" className="nm-section-btn"
          onClick={() => setShowTask(v => !v)} aria-expanded={showTask}>
          <span className="nm-section-lbl"><span aria-hidden="true">⚡</span> Quick tasks</span>
          {showTask ? <ChevronUp size={12} color="var(--text-3)" /> : <ChevronDown size={12} color="var(--text-3)" />}
        </button>
        {showTask && (
          <div className="nm-tasks">
            {starterPrompts.map(p => (
              <button key={p} type="button" className="nm-task-chip"
                onClick={() => { sendMessage(p); setShowTask(false); }}>{p}</button>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="nm-messages" ref={msgRef} role="log" aria-live="polite">

        {messages.length === 0 && !loading && (
          <div className="nm-empty nm-anim-in">
            <span className="nm-empty-icon" aria-hidden="true">🌿</span>
            <p className="nm-empty-greeting">{greeting()}</p>
            <p className="nm-empty-sub">
              I'm NutriMentor AI — your seasonal nutrition companion. Select a food, ask anything, or try a quick task.
            </p>
            <div className="nm-empty-chips">
              {starterPrompts.slice(0,3).map(p => (
                <button key={p} type="button" className="nm-task-chip" onClick={() => sendMessage(p)}>{p}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`nm-msg-row ${msg.role}`}>
            <div className={`nm-bubble ${msg.role}`}>
              {msg.role === "assistant"
                ? <div dangerouslySetInnerHTML={{ __html: md(msg.content) }} />
                : msg.content
              }
              {msg.nextActions && msg.nextActions.length > 0 && (
                <div className="nm-next-actions">
                  {msg.nextActions.map(a => (
                    <button key={a} type="button" className="nm-next-chip"
                      onClick={() => sendMessage(a)}>{a}</button>
                  ))}
                </div>
              )}
              {msg.wantsPdf && msg.planData && (
                <div className="nm-pdf-btn-row">
                  <button type="button" className="nm-pdf-btn"
                    disabled={pdfLoading === msg.id}
                    onClick={async () => {
                      setPdfLoading(msg.id);
                      try {
                        await generateDietPDF({
                          ...msg.planData,
                          season: msg.planData.season ?? "all",
                          season_label: msg.planData.season_label ?? "All Seasons",
                          goal: msg.planData.goal ?? profile.goal ?? "balanced",
                          calorie_target: msg.planData.calorie_target ?? 1600,
                          vegetarian: msg.planData.vegetarian ?? (profile.dietary_preference === "vegetarian"),
                          excluded_foods: msg.planData.excluded_foods ?? [],
                          days: (msg.planData.days ?? []).map((d: any, i: number) => ({
                            day: i + 1,
                            day_label: d.day_label ?? ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][i] ?? `Day ${i+1}`,
                            calorie_target: d.calorie_estimate ?? msg.planData.calorie_target ?? 1600,
                            meals: {
                              breakfast:   { foods: d.meals?.breakfast?.foods  ?? [], note: "" },
                              mid_morning: { foods: d.meals?.mid_morning?.foods ?? [], note: "" },
                              lunch:       { foods: d.meals?.lunch?.foods      ?? [], note: "" },
                              evening:     { foods: d.meals?.evening?.foods    ?? [], note: "" },
                              dinner:      { foods: d.meals?.dinner?.foods     ?? [], note: "" },
                            },
                          })),
                        });
                      } finally { setPdfLoading(null); }
                    }}>
                    {pdfLoading === msg.id
                      ? <><span style={{ animation:"spin 1s linear infinite", display:"inline-block" }}>⏳</span> Generating PDF…</>
                      : <><FileDown size={13} style={{ marginRight:4 }} /> Download 7-day PDF</>
                    }
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="nm-typing" aria-label="Agent is thinking">
            <div className="nm-typing-bubble">
              <span className="nm-dot" /><span className="nm-dot" /><span className="nm-dot" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="nm-input-bar">
        <textarea ref={inpRef} className="nm-input" rows={1}
          placeholder="Ask about food, nutrients, season, plan…"
          value={input} onChange={resize} onKeyDown={onKey} aria-label="Message" />
        <button type="button" className="nm-send"
          onClick={send} disabled={loading || !input.trim()} aria-label="Send">
          <Send size={14} />
        </button>
      </div>

      {/* Branding footer */}
      <div className="nm-footer">
        <span className="nm-footer-copy">Built by Pratyaksh Agrawal</span>
        <div className="nm-footer-links">
          <a href="https://www.linkedin.com/in/pratyaksh-agrawal/" target="_blank"
            rel="noopener noreferrer" className="nm-footer-link">LinkedIn</a>
          <a href="#" title="Portfolio coming soon" target="_blank"
            rel="noopener noreferrer" className="nm-footer-link">Portfolio</a>
          <button type="button" className="nm-footer-link"
            onClick={() => setShowFeedback(true)}>
            Feedback
          </button>
        </div>
      </div>
      {/* Feedback modal */}
      <FeedbackModal open={showFeedback} onClose={() => setShowFeedback(false)} />
    </div>
  );
}