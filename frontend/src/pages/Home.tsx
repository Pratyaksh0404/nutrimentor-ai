import { useEffect, useMemo, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import ChatBox from "../components/chat/ChatBox";
import FoodGrid from "../components/food/FoodGrid";
import DashboardPage from "./DashboardPage";
import MealLogPage from "./MealLogPage";
import { useItems } from "../hooks/useItems";
import { useDashboard } from "../hooks/useDashboard";
import { RITU_INFO } from "../constants/ritu";
import logo from "../components/layout/logo.png";
import type { Item } from "../types/item";
import type { SeasonKey } from "../types/season";
import { API_BASE_URL } from "../api/config";

const PROFILE_KEY = "nutrimentor-profile-id";
function getProfileId(): string {
  let id = localStorage.getItem(PROFILE_KEY);
  if (!id) { id = crypto.randomUUID().replace(/-/g, ""); localStorage.setItem(PROFILE_KEY, id); }
  return id;
}

function getISTGreeting(): string {
  const h = new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCHours();
  if (h < 12) return "Good morning! 🌅";
  if (h < 17) return "Good afternoon! ☀️";
  return "Good evening! 🌙";
}

const SEASON_KEY_MAP: Record<SeasonKey, string> = {
  all:"all", spring:"spring", summer:"summer",
  monsoon:"monsoon", autumn:"autumn", prewinter:"prewinter", winter:"winter",
};
const RITU_KEY_MAP: Record<SeasonKey, keyof typeof RITU_INFO | null> = {
  spring:"vasanta", summer:"grishma", monsoon:"varsha",
  autumn:"sharad", prewinter:"hemanta", winter:"shishira", all:null,
};
const SEASONS = [
  { key:"all",       icon:"🌐", ritu:"All",      eng:"Year-round" },
  { key:"spring",    icon:"🌸", ritu:"Vasanta",  eng:"Spring"     },
  { key:"summer",    icon:"☀️",  ritu:"Grishma",  eng:"Summer"     },
  { key:"monsoon",   icon:"🌧️", ritu:"Varsha",   eng:"Monsoon"    },
  { key:"autumn",    icon:"🍂", ritu:"Sharad",   eng:"Autumn"     },
  { key:"prewinter", icon:"🍃", ritu:"Hemanta",  eng:"Pre-winter" },
  { key:"winter",    icon:"❄️",  ritu:"Shishira", eng:"Winter"     },
] as const;
const SEASON_LABELS_UI: Record<string, string> = {
  spring:"Vasanta Ritu (Spring)", summer:"Grishma Ritu (Summer)",
  monsoon:"Varsha Ritu (Monsoon)", autumn:"Sharad Ritu (Autumn)",
  prewinter:"Hemanta Ritu (Pre-winter)", winter:"Shishira Ritu (Winter)",
};
const NAV = [
  { id:"foods",     icon:"🥗", tip:"Foods"        },
  { id:"dashboard", icon:"📊", tip:"Dashboard"    },
  { id:"ritu",      icon:"🌱", tip:"Ritu Journal"  },
  { id:"log",       icon:"📝", tip:"Meal Log"     },
  { id:"settings",  icon:"⚙️",  tip:"Settings"     },
] as const;

export const EMOJI: Record<string, string> = {
  fruit:"🍎", vegetable:"🥦", grain:"🌾", dairy:"🥛",
  legume:"🫘", nut:"🥜", protein:"🍗", spice:"🌿",
};

// Phase-3 coming-soon tabs that don't have real pages yet
const COMING_SOON: Record<string, { icon: string; title: string; desc: string; phase: string }> = {
  ritu:     { icon:"🌱", title:"Ritu Journal",  desc:"Deep dives into all 6 Ritu seasons — eat, avoid, Ayurvedic wisdom.", phase:"Phase 4" },
  settings: { icon:"⚙️",  title:"Settings",      desc:"Profile settings, clear memory, preferences.", phase:"Phase 5" },
};

interface MorningInsight { insights: Array<{ message: string }>; }
interface SeasonTransition {
  changed: boolean; from?: string; to?: string;
  journal?: { title: string; description: string; eat_more: string; avoid: string; dosha?: string; };
}

export default function Home() {
  const profileId = useMemo(() => getProfileId(), []);

  const [season, setSeason]       = useState<SeasonKey>("all");
  const [selected, setSelected]   = useState<Item | null>(null);
  const [light, setLight]         = useState(false);
  const [activeTab, setActiveTab] = useState<string>("foods");
  const [showAvatar, setShowAvatar] = useState(false);
  const [pendingMsg, setPendingMsg] = useState<string | null>(null);
  const [morning, setMorning]     = useState<MorningInsight | null>(null);
  const [seasonTransition, setSeasonTransition] = useState<SeasonTransition | null>(null);
  const avatarRef = useRef<HTMLDivElement>(null);

  const rituKey = RITU_KEY_MAP[season];
  const ritu    = rituKey ? RITU_INFO[rituKey] : null;
  const { items, loading: itemsLoading } = useItems(season);

  // Dashboard data — always loaded so the badge is live
  const { dashboard, todayLog, weekLog, loading: dashLoading, error: dashError, refresh: dashRefresh, deleteMeal } = useDashboard(profileId);

  useEffect(() => { document.documentElement.dataset.season = SEASON_KEY_MAP[season]; }, [season]);
  useEffect(() => { document.documentElement.classList.toggle("light", light); }, [light]);

  // Morning insight
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    if (localStorage.getItem(`nm-morning-${today}`)) return;
    fetch(`${API_BASE_URL}/agent/morning/${profileId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.insights?.length) setMorning(d); })
      .catch(() => {});
  }, [profileId]);

  // Season transition
  useEffect(() => {
    const lastFrom = localStorage.getItem("nm-season-transition-from");
    fetch(`${API_BASE_URL}/agent/season-check/${profileId}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: SeasonTransition | null) => {
        if (d?.changed && d.from && d.to && lastFrom !== d.from) setSeasonTransition(d);
      })
      .catch(() => {});
  }, [profileId]);

  // Close avatar on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) setShowAvatar(false);
    }
    if (showAvatar) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showAvatar]);

  function dismissMorning() {
    setMorning(null);
    localStorage.setItem(`nm-morning-${new Date().toISOString().split("T")[0]}`, "1");
  }
  function dismissSeasonTransition() {
    if (seasonTransition?.from) localStorage.setItem("nm-season-transition-from", seasonTransition.from);
    setSeasonTransition(null);
  }
  function handleAskAgent(prompt: string) {
    setPendingMsg(prompt);
    // Also switch to foods view so the user sees the chat response
  }

  const heroChips = useMemo(() => [
    ritu ? `What should I eat in ${ritu.label}?` : "What should I eat today?",
    ritu ? `Build me a ${ritu.english} diet plan` : "Build my day plan",
    "What do you know about me?",
  ], [ritu]);

  const getSeasonIcon = (s: string) => SEASONS.find(x => x.key === s)?.icon ?? "🌿";

  // ── Centre content ───────────────────────────────────────────────────────────
  function renderCentre() {
    // ── FOODS ──
    if (activeTab === "foods") {
      return (
        <>
          <div className="nm-season-bar" role="navigation" aria-label="Season filter">
            {SEASONS.map(s => (
              <button key={s.key} type="button"
                className={`nm-season-pill${season === s.key ? " active" : ""}`}
                onClick={() => { setSeason(s.key as SeasonKey); setSelected(null); }}
                aria-pressed={season === s.key}>
                <span aria-hidden="true">{s.icon}</span>
                <span style={{ fontWeight:600 }}>{s.ritu}</span>
                <span style={{ opacity:.7 }}>{s.eng}</span>
              </button>
            ))}
          </div>
          <div className="nm-centre-body">
            {/* Season transition banner */}
            {seasonTransition?.changed && seasonTransition.journal && (
              <div className="nm-season-transition" role="alert">
                <span className="nm-season-transition-icon">{getSeasonIcon(seasonTransition.to ?? "")}</span>
                <div className="nm-season-transition-body">
                  <div className="nm-season-transition-label">Season change</div>
                  <div className="nm-season-transition-title">
                    Welcome to {SEASON_LABELS_UI[seasonTransition.to ?? ""] ?? seasonTransition.journal.title}!
                  </div>
                  <div className="nm-season-transition-desc">{seasonTransition.journal.description}</div>
                  <div className="nm-season-transition-chips">
                    <button type="button" className="nm-season-transition-chip"
                      onClick={() => { handleAskAgent(`What should I eat in ${SEASON_LABELS_UI[seasonTransition.to ?? ""] ?? "this season"}?`); dismissSeasonTransition(); }}>
                      🌿 What to eat now
                    </button>
                    <button type="button" className="nm-season-transition-chip"
                      onClick={() => { handleAskAgent(`Build me a ${SEASON_LABELS_UI[seasonTransition.to ?? ""] ?? "seasonal"} diet plan`); dismissSeasonTransition(); }}>
                      📋 Build a season plan
                    </button>
                  </div>
                </div>
                <button type="button" className="nm-season-transition-close" onClick={dismissSeasonTransition}>×</button>
              </div>
            )}

            {/* Hero */}
            <div className="nm-hero" role="banner">
              <span className="nm-hero-icon">{SEASONS.find(s => s.key === season)?.icon ?? "🌐"}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div className="nm-hero-label">{season === "all" ? "Year-round" : "Current season"}</div>
                <div className="nm-hero-title">{ritu ? `${ritu.label} · ${ritu.english}` : "All Seasons"}</div>
                {ritu && <div className="nm-hero-desc">{ritu.description}</div>}
                <div className="nm-hero-chips">
                  {heroChips.map(c => (
                    <button key={c} type="button" className="nm-hero-chip" onClick={() => handleAskAgent(c)}>{c}</button>
                  ))}
                </div>
              </div>
            </div>

            <FoodGrid items={items} loading={itemsLoading} season={season}
              selected={selected} onSelect={i => setSelected(i)} onAskAgent={handleAskAgent} />
          </div>
        </>
      );
    }

    // ── DASHBOARD (Phase 3 — live) ──
    if (activeTab === "dashboard") {
      return (
        <DashboardPage
          data={dashboard}
          loading={dashLoading}
          error={dashError}
          onRefresh={dashRefresh}
          onAskAgent={handleAskAgent}
        />
      );
    }

    // ── MEAL LOG (Phase 3 — live) ──
    if (activeTab === "log") {
      return (
        <MealLogPage
          todayLog={todayLog}
          weekLog={weekLog}
          loading={dashLoading}
          error={dashError}
          onDelete={deleteMeal}
          onRefresh={dashRefresh}
          onAskAgent={handleAskAgent}
        />
      );
    }

    // ── COMING SOON (ritu, settings) ──
    const info = COMING_SOON[activeTab];
    if (!info) return null;
    return (
      <div className="nm-centre-body" style={{ alignItems:"center", justifyContent:"center", textAlign:"center" }}>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:16, maxWidth:340, margin:"auto", padding:"40px 0" }}>
          <div style={{ fontSize:56, lineHeight:1 }}>{info.icon}</div>
          <div style={{ fontSize:20, fontWeight:700, color:"var(--text-1)" }}>{info.title}</div>
          <div style={{ fontSize:13, color:"var(--text-2)", lineHeight:1.7 }}>{info.desc}</div>
          <div style={{ fontSize:11, fontWeight:600, letterSpacing:".1em", textTransform:"uppercase", color:"var(--accent)", background:"var(--accent-bg)", border:"1px solid var(--accent-border)", borderRadius:"var(--r-pill)", padding:"4px 14px" }}>
            Coming in {info.phase}
          </div>
          <button type="button" className="nm-hero-chip" style={{ marginTop:8 }} onClick={() => setActiveTab("foods")}>
            ← Back to Foods
          </button>
        </div>
      </div>
    );
  }

  // ── Dashboard badge — show score if available ──────────────────────────────
  const dashScore = dashboard?.has_data ? dashboard.score : null;

  return (
    <div className="nm-app">

      {/* Sidebar */}
      <aside className="nm-sidebar" aria-label="Navigation">
        <div className="nm-sidebar-logo">
          <img src={logo} alt="NutriMentor AI" />
        </div>

        {NAV.map(n => (
          <div key={n.id} style={{ position:"relative" }}>
            <button type="button"
              className={`nm-nav-btn${activeTab === n.id ? " active" : ""}`}
              data-tip={n.tip} onClick={() => setActiveTab(n.id)} aria-label={n.tip}>
              <span aria-hidden="true">{n.icon}</span>
            </button>
            {/* Live score badge on dashboard icon */}
            {n.id === "dashboard" && dashScore !== null && (
              <div style={{
                position:"absolute", top:4, right:4, fontSize:8, fontWeight:800,
                background: dashScore >= 70 ? "#4ade80" : dashScore >= 40 ? "#f59e0b" : "#f87171",
                color: dashScore >= 70 ? "#052e16" : "#1a0a00",
                borderRadius:10, padding:"1px 4px", lineHeight:1.4, pointerEvents:"none",
              }}>
                {dashScore}
              </div>
            )}
          </div>
        ))}

        <div className="nm-sidebar-spacer" />

        <button type="button" className="nm-nav-btn" data-tip={light ? "Dark mode" : "Light mode"}
          onClick={() => setLight(l => !l)} aria-label="Toggle theme">
          {light ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div ref={avatarRef} style={{ position:"relative" }}>
          <div className="nm-sidebar-avatar" onClick={() => setShowAvatar(v => !v)}
            role="button" tabIndex={0} aria-label="Profile"
            onKeyDown={e => e.key === "Enter" && setShowAvatar(v => !v)}>P</div>
          {showAvatar && (
            <div className="nm-avatar-menu" role="menu">
              <div style={{ padding:"6px 10px 4px", fontSize:"10px", color:"var(--text-3)", fontWeight:600, letterSpacing:".06em", textTransform:"uppercase" }}>
                Pratyaksh Agrawal
              </div>
              <div className="nm-avatar-divider" />
              <a href="https://www.linkedin.com/in/pratyaksh-agrawal/" target="_blank"
                rel="noopener noreferrer" className="nm-avatar-link" role="menuitem">
                <span aria-hidden="true">🔗</span> LinkedIn
              </a>
              <a href="https://github.com/Pratyaksh0404" target="_blank"
                rel="noopener noreferrer" className="nm-avatar-link" role="menuitem">
                <span aria-hidden="true">💻</span> Github
              </a>
              <a href="#" title="Portfolio coming soon" target="_blank"
                rel="noopener noreferrer" className="nm-avatar-link" role="menuitem">
                <span aria-hidden="true">🌐</span> Portfolio
              </a>
            </div>
          )}
        </div>
      </aside>

      {/* Centre column — always column 2 */}
      <main className="nm-centre" aria-label={activeTab}>
        {renderCentre()}
      </main>

      {/* Chat — always column 3 */}
      <div className="nm-chat" aria-label="AI Agent">
        {morning && (
          <div className="nm-banner" role="alert">
            <span className="nm-banner-icon">🌅</span>
            <div className="nm-banner-content">
              <div className="nm-banner-title">{getISTGreeting()} · Nutrition insight</div>
              {morning.insights.slice(0,1).map((ins,i) => (
                <div key={i} className="nm-banner-body">{ins.message}</div>
              ))}
            </div>
            <button type="button" className="nm-banner-close" onClick={dismissMorning}>×</button>
          </div>
        )}
        <ChatBox
          selectedItem={selected}
          season={season}
          onClearSelectedItem={() => setSelected(null)}
          pendingMessage={pendingMsg}
          onPendingMessageSent={() => setPendingMsg(null)}
        />
      </div>

      {/* Mobile tab bar */}
      <nav className="nm-tabbar" role="navigation" style={{ gridColumn:"1/-1" }}>
        {[
          { id:"foods", icon:"🥗", label:"Foods" },
          { id:"agent", icon:"💬", label:"Agent" },
          { id:"log",   icon:"📝", label:"Log"   },
        ].map(t => (
          <button key={t.id} type="button"
            className={`nm-tab${activeTab === t.id ? " active" : ""}`}
            onClick={() => setActiveTab(t.id)} aria-label={t.label}>
            <span className="nm-tab-icon">{t.icon}</span>
            <span className="nm-tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}