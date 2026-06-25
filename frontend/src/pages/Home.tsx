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

const SEASON_LABELS_UI: Record<string, string> = {
  spring:"Vasanta Ritu (Spring)", summer:"Grishma Ritu (Summer)",
  monsoon:"Varsha Ritu (Monsoon)", autumn:"Sharad Ritu (Autumn)",
  prewinter:"Hemanta Ritu (Pre-winter)", winter:"Shishira Ritu (Winter)",
};

const NAV = [
  { id:"foods",     icon:"🥗", tip:"Foods"       },
  { id:"dashboard", icon:"📊", tip:"Dashboard"   },
  { id:"ritu",      icon:"🌱", tip:"Ritu Journal" },
  { id:"log",       icon:"📝", tip:"Meal Log"    },
  { id:"settings",  icon:"⚙️",  tip:"Settings"    },
] as const;

export const EMOJI: Record<string, string> = {
  fruit:"🍎", vegetable:"🥦", grain:"🌾", dairy:"🥛",
  legume:"🫘", nut:"🥜", protein:"🍗", spice:"🌿",
};

interface MorningInsight {
  greeting?: string;
  insights: Array<{ message: string }>;
}

interface SeasonTransition {
  changed: boolean;
  from?: string;
  to?: string;
  journal?: {
    title: string;
    description: string;
    eat_more: string;
    avoid: string;
    dosha?: string;
    ayurvedic_note?: string;
  };
}

// ── Tab placeholder data ──────────────────────────────────────────────────────
const TAB_INFO: Record<string, { icon: string; title: string; desc: string; phase: string }> = {
  dashboard: { icon:"📊", title:"Dashboard",  desc:"Your weekly nutrition score, 7-day charts, and deficiency alerts.", phase:"Phase 3" },
  ritu:      { icon:"🌱", title:"Ritu Journal",desc:"Deep dives into all 6 Ritu seasons — what to eat, what to avoid, and Ayurvedic wisdom.", phase:"Phase 4" },
  log:       { icon:"📝", title:"Meal Log",   desc:"View, edit, and delete your logged meals.", phase:"Phase 3" },
  settings:  { icon:"⚙️",  title:"Settings",   desc:"Profile settings, clear memory, preferences.", phase:"Phase 5" },
};

export default function Home() {
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
  const { items, loading } = useItems(season);

  // Season theme
  useEffect(() => {
    document.documentElement.dataset.season = SEASON_KEY_MAP[season];
  }, [season]);

  // Light/dark
  useEffect(() => {
    document.documentElement.classList.toggle("light", light);
  }, [light]);

  // Morning insight
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

  // Season transition check
  useEffect(() => {
    const pid = localStorage.getItem("nutrimentor-profile-id");
    if (!pid) return;
    const lastShownFrom = localStorage.getItem("nm-season-transition-from");
    fetch(`${API_BASE_URL}/agent/season-check/${pid}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: SeasonTransition | null) => {
        if (d?.changed && d.from && d.to && lastShownFrom !== d.from)
          setSeasonTransition(d);
      })
      .catch(() => {});
  }, []);

  // Close avatar on outside click
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
    localStorage.setItem(`nm-morning-${new Date().toISOString().split("T")[0]}`, "1");
  }

  function dismissSeasonTransition() {
    if (seasonTransition?.from) localStorage.setItem("nm-season-transition-from", seasonTransition.from);
    setSeasonTransition(null);
  }

  function handleAskAgent(prompt: string) {
    setPendingMsg(prompt);
  }

  const heroChips = useMemo(() => [
    ritu ? `What should I eat in ${ritu.label}?` : "What should I eat today?",
    ritu ? `Build me a ${ritu.english} diet plan` : "Build my day plan",
    "What do you know about me?",
  ], [ritu]);

  const getSeasonIcon = (s: string) => SEASONS.find(x => x.key === s)?.icon ?? "🌿";

  // ── Centre content: which panel to show ─────────────────────────────────────
  function renderCentre() {
    // Foods tab
    if (activeTab === "foods") {
      return (
        <>
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

          <div className="nm-centre-body">
            {/* Season transition banner */}
            {seasonTransition?.changed && seasonTransition.journal && (
              <div className="nm-season-transition" role="alert">
                <span className="nm-season-transition-icon" aria-hidden="true">
                  {getSeasonIcon(seasonTransition.to ?? "")}
                </span>
                <div className="nm-season-transition-body">
                  <div className="nm-season-transition-label">Season change</div>
                  <div className="nm-season-transition-title">
                    Welcome to {SEASON_LABELS_UI[seasonTransition.to ?? ""] ?? seasonTransition.journal.title}!
                  </div>
                  <div className="nm-season-transition-desc">
                    {seasonTransition.journal.description}
                    {seasonTransition.journal.dosha && <> Governed by the <strong>{seasonTransition.journal.dosha}</strong> dosha.</>}
                  </div>
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
                <button type="button" className="nm-season-transition-close"
                  onClick={dismissSeasonTransition} aria-label="Dismiss">×</button>
              </div>
            )}

            {/* Season hero */}
            <div className="nm-hero" role="banner">
              <span className="nm-hero-icon" aria-hidden="true">
                {SEASONS.find(s => s.key === season)?.icon ?? "🌐"}
              </span>
              <div style={{ flex:1, minWidth:0 }}>
                <div className="nm-hero-label">{season === "all" ? "Year-round" : "Current season"}</div>
                <div className="nm-hero-title">
                  {ritu ? `${ritu.label} · ${ritu.english}` : "All Seasons"}
                </div>
                {ritu && <div className="nm-hero-desc">{ritu.description}</div>}
                <div className="nm-hero-chips">
                  {heroChips.map(c => (
                    <button key={c} type="button" className="nm-hero-chip" onClick={() => handleAskAgent(c)}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Food grid */}
            <FoodGrid
              items={items} loading={loading} season={season}
              selected={selected}
              onSelect={item => setSelected(item)}
              onAskAgent={handleAskAgent}
            />
          </div>
        </>
      );
    }

    // Coming-soon tabs: dashboard, ritu, log, settings
    const info = TAB_INFO[activeTab];
    if (!info) return null;
    return (
      <div className="nm-centre-body" style={{ alignItems:"center", justifyContent:"center", textAlign:"center" }}>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:16, maxWidth:340, margin:"auto", padding:"40px 0" }}>
          <div style={{ fontSize:56, lineHeight:1 }}>{info.icon}</div>
          <div style={{ fontSize:20, fontWeight:700, color:"var(--text-1)" }}>{info.title}</div>
          <div style={{ fontSize:13, color:"var(--text-2)", lineHeight:1.7 }}>{info.desc}</div>
          <div style={{
            fontSize:11, fontWeight:600, letterSpacing:".1em", textTransform:"uppercase",
            color:"var(--accent)", background:"var(--accent-bg)", border:"1px solid var(--accent-border)",
            borderRadius:"var(--r-pill)", padding:"4px 14px",
          }}>
            Coming in {info.phase}
          </div>
          <button type="button" className="nm-hero-chip" style={{ marginTop:8 }}
            onClick={() => setActiveTab("foods")}>
            ← Back to Foods
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="nm-app">

      {/* ── Sidebar ── */}
      <aside className="nm-sidebar" aria-label="Navigation">
        <div className="nm-sidebar-logo">
          <img src={logo} alt="NutriMentor AI" />
        </div>

        {NAV.map(n => (
          <button key={n.id} type="button"
            className={`nm-nav-btn${activeTab === n.id ? " active" : ""}`}
            data-tip={n.tip}
            onClick={() => setActiveTab(n.id)}
            aria-label={n.tip}>
            <span aria-hidden="true">{n.icon}</span>
          </button>
        ))}

        <div className="nm-sidebar-spacer" />

        <button type="button" className="nm-nav-btn" data-tip={light ? "Dark mode" : "Light mode"}
          onClick={() => setLight(l => !l)} aria-label="Toggle theme">
          {light ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div ref={avatarRef} style={{ position:"relative" }}>
          <div className="nm-sidebar-avatar"
            onClick={() => setShowAvatar(v => !v)}
            role="button" tabIndex={0} aria-label="Profile"
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

      {/* ── Centre column — always column 2, shows whichever tab is active ── */}
      <main className="nm-centre" aria-label={activeTab}>
        {renderCentre()}
      </main>

      {/* ── Right: Chat — always column 3, never moves ── */}
      <div className="nm-chat" aria-label="AI Agent">
        {/* Morning insight banner */}
        {morning && (
          <div className="nm-banner" role="alert">
            <span className="nm-banner-icon" aria-hidden="true">🌅</span>
            <div className="nm-banner-content">
              <div className="nm-banner-title">{getISTGreeting()} · Nutrition insight</div>
              {morning.insights.slice(0,1).map((ins,i) => (
                <div key={i} className="nm-banner-body">{ins.message}</div>
              ))}
            </div>
            <button type="button" className="nm-banner-close"
              onClick={dismissMorning} aria-label="Dismiss">×</button>
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

      {/* ── Mobile tab bar ── */}
      <nav className="nm-tabbar" role="navigation" aria-label="Main navigation"
        style={{ gridColumn:"1/-1" }}>
        {[
          { id:"foods", icon:"🥗", label:"Foods" },
          { id:"agent", icon:"💬", label:"Agent"  },
          { id:"log",   icon:"📝", label:"Log"    },
        ].map(t => (
          <button key={t.id} type="button"
            className={`nm-tab${activeTab === t.id ? " active" : ""}`}
            onClick={() => setActiveTab(t.id)}
            aria-label={t.label}>
            <span className="nm-tab-icon" aria-hidden="true">{t.icon}</span>
            <span className="nm-tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}