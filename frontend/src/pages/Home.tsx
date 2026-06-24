import { useEffect, useMemo, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import ChatBox from "../components/chat/ChatBox";
import FoodGrid from "../components/food/FoodGrid";
import { useItems } from "../hooks/useItems";
import { RITU_INFO } from "../constants/ritu";
import logo from "../components/layout/logo.png";
import type { Item } from "../types/item";
import type { SeasonKey } from "../types/season";
import { API_BASE_URL } from "../api/config";

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

const NAV = [
  { id:"foods",     icon:"🥗", tip:"Foods"     },
  { id:"dashboard", icon:"📊", tip:"Dashboard" },
  { id:"ritu",      icon:"🌱", tip:"Ritu Journal" },
  { id:"log",       icon:"📝", tip:"Meal Log"  },
  { id:"settings",  icon:"⚙️",  tip:"Settings"  },
] as const;

export const EMOJI: Record<string, string> = {
  fruit:"🍎", vegetable:"🥦", grain:"🌾", dairy:"🥛",
  legume:"🫘", nut:"🥜", protein:"🍗", spice:"🌿",
};

interface MorningInsight {
  greeting?: string;
  insights: Array<{ message: string }>;
}

export default function Home() {
  const [season, setSeason]     = useState<SeasonKey>("all");
  const [selected, setSelected] = useState<Item | null>(null);
  const [light, setLight]       = useState(false);
  const [activeTab, setActiveTab] = useState<"foods"|"agent">("foods");
  const [showAvatar, setShowAvatar] = useState(false);
  const [pendingMsg, setPendingMsg] = useState<string | null>(null);
  const [morning, setMorning]   = useState<MorningInsight | null>(null);
  const avatarRef = useRef<HTMLDivElement>(null);

  const rituKey = RITU_KEY_MAP[season];
  const ritu    = rituKey ? RITU_INFO[rituKey] : null;
  const { items, loading } = useItems(season);

  // Season theme on html element
  useEffect(() => {
    document.documentElement.dataset.season = SEASON_KEY_MAP[season];
  }, [season]);

  // Light/dark class on html
  useEffect(() => {
    document.documentElement.classList.toggle("light", light);
  }, [light]);

  // Phase 2: Morning insight
  useEffect(() => {
    const pid = localStorage.getItem("nutrimentor-profile-id");
    if (!pid) return;
    const today = new Date().toISOString().split("T")[0];
    if (localStorage.getItem(`nm-morning-${today}`)) return;
    fetch(`${API_BASE_URL}/agent/morning/${pid}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.insights?.length) setMorning(d); })
      .catch(() => {});
  }, []);

  // Close avatar menu on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node))
        setShowAvatar(false);
    }
    if (showAvatar) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showAvatar]);

  function dismissMorning() {
    setMorning(null);
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem(`nm-morning-${today}`, "1");
  }

  function handleAskAgent(prompt: string) {
    setPendingMsg(prompt);
    setActiveTab("agent");
  }

  const heroChips = useMemo(() => [
    ritu ? `What should I eat in ${ritu.label}?` : "What should I eat today?",
    ritu ? `Build me a ${ritu.english} diet plan` : "Build my day plan",
    "What do you know about me?",
  ], [ritu]);

  return (
    <div className="nm-app">

      {/* ── Icon Sidebar ── */}
      <aside className="nm-sidebar" aria-label="Navigation">
        {/* Logo */}
        <div className="nm-sidebar-logo">
          <img src={logo} alt="NutriMentor AI" />
        </div>

        {/* Nav buttons */}
        {NAV.map(n => (
          <button key={n.id} type="button"
            className={`nm-nav-btn${activeTab === n.id ? " active" : ""}`}
            data-tip={n.tip}
            onClick={() => setActiveTab(n.id as any)}
            aria-label={n.tip}>
            <span aria-hidden="true">{n.icon}</span>
          </button>
        ))}

        <div className="nm-sidebar-spacer" />

        {/* Light/dark toggle */}
        <button type="button" className="nm-nav-btn" data-tip={light ? "Dark mode" : "Light mode"}
          onClick={() => setLight(l => !l)} aria-label="Toggle theme">
          {light ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Avatar / personal links */}
        <div ref={avatarRef} style={{ position:"relative" }}>
          <div className="nm-sidebar-avatar" onClick={() => setShowAvatar(v => !v)}
            role="button" tabIndex={0} aria-label="Profile & links"
            onKeyDown={e => e.key === "Enter" && setShowAvatar(v => !v)}>
            P
          </div>
          {showAvatar && (
            <div className="nm-avatar-menu" role="menu">
              <div style={{ padding:"6px 10px 4px", fontSize:"10px", color:"var(--text-3)", fontWeight:600, letterSpacing:".06em", textTransform:"uppercase" }}>
                Pratyaksh Agrawal
              </div>
              <div className="nm-avatar-divider" />
              <a href="https://www.linkedin.com/in/pratyaksh-agrawal-59b82928a/" target="_blank"
                rel="noopener noreferrer" className="nm-avatar-link" role="menuitem">
                <span aria-hidden="true">💼</span> LinkedIn
              </a>
              <a href="#" title="Portfolio coming soon" target="_blank"
                rel="noopener noreferrer" className="nm-avatar-link" role="menuitem">
                <span aria-hidden="true">🌐</span> Portfolio
              </a>
              <a href="https://github.com/Pratyaksh0404" target="_blank"
                rel="noopener noreferrer" className="nm-avatar-link" role="menuitem">
                <span aria-hidden="true">💻</span> GitHub
              </a>
              <div className="nm-avatar-divider" />
              <button type="button" className="nm-avatar-link" role="menuitem"
                onClick={() => { handleAskAgent("Send feedback"); setShowAvatar(false); }}>
                <span aria-hidden="true">💬</span> Send feedback
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Centre (Food Explorer) ── */}
      <main className={`nm-centre${activeTab === "foods" ? " tab-active" : ""}`}
        aria-label="Food explorer">

        {/* Season pills */}
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

        {/* Scrollable content */}
        <div className="nm-centre-body">

          {/* Season hero */}
          <div className="nm-hero" role="banner">
            <span className="nm-hero-icon" aria-hidden="true">
              {SEASONS.find(s => s.key === season)?.icon ?? "🌐"}
            </span>
            <div style={{ flex:1, minWidth:0 }}>
              <div className="nm-hero-label">
                {season === "all" ? "Year-round" : "Current season"}
              </div>
              <div className="nm-hero-title">
                {ritu ? `${ritu.label} · ${ritu.english}` : "All Seasons"}
              </div>
              {ritu && <div className="nm-hero-desc">{ritu.description}</div>}
              <div className="nm-hero-chips">
                {heroChips.map(c => (
                  <button key={c} type="button" className="nm-hero-chip"
                    onClick={() => handleAskAgent(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Food grid */}
          <FoodGrid
            items={items}
            loading={loading}
            season={season}
            selected={selected}
            onSelect={(item) => setSelected(item)}
            onAskAgent={handleAskAgent}
          />

        </div>
      </main>

      {/* ── Right: Chat ── */}
      <div className={`nm-chat${activeTab === "agent" ? " tab-active" : ""}`}
        aria-label="AI Agent">

        {/* Phase 2: morning banner */}
        {morning && (
          <div className="nm-banner" role="alert">
            <span className="nm-banner-icon" aria-hidden="true">🌅</span>
            <div className="nm-banner-content">
              <div className="nm-banner-title">{getISTGreeting()} · Nutrition insight</div>
              {morning.insights.slice(0,1).map((ins,i) => (
                <div key={i} className="nm-banner-body">{ins.message}</div>
              ))}
            </div>
            <button type="button" className="nm-banner-close" onClick={dismissMorning}
              aria-label="Dismiss">×</button>
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
      <nav className="nm-tabbar" role="navigation" aria-label="Main navigation"
        style={{ gridColumn:"1/-1" }}>
        {[
          { id:"foods", icon:"🥗", label:"Foods" },
          { id:"agent", icon:"💬", label:"Agent", badge: !!morning },
          { id:"log",   icon:"📝", label:"Log"   },
        ].map(t => (
          <button key={t.id} type="button"
            className={`nm-tab${activeTab === t.id ? " active" : ""}`}
            onClick={() => setActiveTab(t.id as any)}
            aria-label={t.label}>
            <span className="nm-tab-icon" aria-hidden="true">{t.icon}</span>
            <span className="nm-tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

    </div>
  );
}