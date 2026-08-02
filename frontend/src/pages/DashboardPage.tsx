import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { RefreshCw, Share2 } from "lucide-react";
import type { DashboardData, NutrientBreakdown } from "../hooks/useDashboard";
import { generateScoreCard } from "../utils/generateDietPDF";

// ── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 140 }: { score: number; size?: number }) {
  const radius = size * 0.4;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.min(score, 100) / 100) * circumference;
  const color = score >= 70 ? "#4ade80" : score >= 40 ? "#f59e0b" : "#f87171";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible" }}>
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--bg-card)" strokeWidth={size * 0.085} />
      <circle
        cx={cx} cy={cy} r={radius} fill="none"
        stroke={color} strokeWidth={size * 0.085}
        transform={`rotate(-90 ${cx} ${cy})`}
        strokeDashoffset={circumference - dash}
        strokeDasharray={circumference}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray .6s ease" }}
      />
      <text x={cx} y={cy - 6} textAnchor="middle" fill={color}
        fontSize={size * 0.22} fontWeight={800} fontFamily="inherit">{score}</text>
      <text x={cx} y={cy + size * 0.14} textAnchor="middle" fill="var(--text-3)"
        fontSize={size * 0.10} fontFamily="inherit">/ 100</text>
    </svg>
  );
}

// ── Streak fire ──────────────────────────────────────────────────────────────
function StreakBadge({ streak }: { streak: number }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      gap: 2, background: "var(--bg-card)", borderRadius: "var(--r-lg)",
      padding: "12px 18px", border: "1px solid var(--border)",
    }}>
      <span style={{ fontSize: 28 }}>🔥</span>
      <span style={{ fontSize: 22, fontWeight: 800, color: "#f59e0b" }}>{streak}</span>
      <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>day streak</span>
    </div>
  );
}

// ── Nutrient bar row ─────────────────────────────────────────────────────────
function NutrientRow({ n }: { n: NutrientBreakdown }) {
  const color = n.status === "good" ? "#4ade80" : n.status === "low" ? "#f59e0b" : "#f87171";
  // Bar width caps at 100% visually (a bar physically can't render wider than
  // its box) — the number on the right always shows the real percentage, so
  // 128%, 165%, and 340% are still distinguishable by their number even
  // though their bars all render full.
  const barWidth = Math.min(n.pct, 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <div style={{ width: 90, fontSize: 11, color: "var(--text-2)", fontWeight: 500, flexShrink: 0, textAlign: "right" }}>
        {n.nutrient}
      </div>
      <div style={{ flex: 1, height: 7, background: "var(--bg-card)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${barWidth}%`, height: "100%", background: color, borderRadius: 4, transition: "width .5s ease" }} />
      </div>
      <div style={{ width: 40, fontSize: 11, fontWeight: 700, color, textAlign: "right", flexShrink: 0 }}>
        {n.pct}%
      </div>
    </div>
  );
}

// ── Calorie bar chart ────────────────────────────────────────────────────────
function CalorieChart({ calByDate, target }: { calByDate: Record<string, number>; target?: number }) {
  const data = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().split("T")[0];
      return {
        day: d.toLocaleDateString("en-IN", { weekday: "short" }),
        cal: calByDate[key] ?? 0,
      };
    });
  }, [calByDate]);

  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={data} barSize={18} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
          formatter={(v: number) => [`${v} kcal`, "Calories"]}
          cursor={{ fill: "var(--accent-bg)" }}
        />
        {target && <Bar dataKey="cal" radius={[4, 4, 0, 0]} fill="var(--accent)">
          {data.map((d, i) => (
            <Cell key={i} fill={d.cal >= target * 0.7 ? "var(--accent)" : d.cal > 0 ? "#f59e0b" : "var(--bg-card)"} />
          ))}
        </Bar>}
        {!target && <Bar dataKey="cal" radius={[4, 4, 0, 0]} fill="var(--accent)" />}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────
function EmptyDashboard({ onAskAgent }: { onAskAgent?: (msg: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 52 }}>📊</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)" }}>No data yet</div>
      <div style={{ fontSize: 13, color: "var(--text-2)", maxWidth: 280, lineHeight: 1.7 }}>
        Log at least one meal to see your nutrition score, streaks, and 7-day charts.
      </div>
      <button type="button" className="nm-hero-chip" style={{ marginTop: 8 }}
        onClick={() => onAskAgent?.("I ate banana and oats for breakfast")}>
        📝 Log "I ate banana and oats"
      </button>
      <button type="button" className="nm-hero-chip"
        onClick={() => onAskAgent?.("Build my day plan")}>
        🗓️ Build a meal plan
      </button>
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────
interface DashboardPageProps {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onAskAgent?: (msg: string) => void;
}

const SEASON_ICONS: Record<string, string> = {
  spring: "🌸", summer: "☀️", monsoon: "🌧️",
  autumn: "🍂", prewinter: "🍃", winter: "❄️", all: "🌿",
};

const SEASON_LABELS: Record<string, string> = {
  spring: "Vasanta (Spring)", summer: "Grishma (Summer)",
  monsoon: "Varsha (Monsoon)", autumn: "Sharad (Autumn)",
  prewinter: "Hemanta (Pre-winter)", winter: "Shishira (Winter)",
  all: "Year-round",
};

// ── Main Dashboard page ──────────────────────────────────────────────────────
export default function DashboardPage({ data, loading, error, onRefresh, onAskAgent }: DashboardPageProps) {
  const [exporting, setExporting] = useState(false);

  async function handleShareScore() {
    if (!data) return;
    setExporting(true);
    try {
      const top = data.breakdown.filter(n => n.status === "good").map(n => n.nutrient).slice(0, 3);
      const low = data.breakdown.filter(n => n.status === "deficient").map(n => n.nutrient).slice(0, 2);
      await generateScoreCard(data.score, data.current_season, SEASON_LABELS[data.current_season] ?? data.current_season, top, low);
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
        <div className="nm-anim-in" style={{ fontSize: 32 }}>📊</div>
        <div style={{ fontSize: 13, color: "var(--text-3)" }}>Loading your dashboard…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, padding: 24 }}>
        <div style={{ fontSize: 32 }}>⚠️</div>
        <div style={{ fontSize: 13, color: "var(--text-2)" }}>{error}</div>
        <button type="button" className="nm-hero-chip" onClick={onRefresh}>Try again</button>
      </div>
    );
  }

  if (!data?.has_data) return <EmptyDashboard onAskAgent={onAskAgent} />;

  const scoreColor = data.score >= 70 ? "#4ade80" : data.score >= 40 ? "#f59e0b" : "#f87171";
  const scoreLabel = data.score >= 70 ? "Great" : data.score >= 40 ? "Good" : "Needs attention";

  return (
    <div className="nm-centre-body" style={{ gap: 14 }}>

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>Weekly Dashboard</div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
            {SEASON_ICONS[data.current_season]} {SEASON_LABELS[data.current_season] ?? data.current_season} · last {data.days_logged} day{data.days_logged !== 1 ? "s" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" title="Refresh" onClick={onRefresh}
            style={{ background: "none", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "5px 8px", cursor: "pointer", color: "var(--text-3)" }}>
            <RefreshCw size={13} />
          </button>
          <button type="button" title="Download score card" onClick={handleShareScore} disabled={exporting}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--accent-bg)", border: "1px solid var(--accent-border)", borderRadius: "var(--r-sm)", padding: "5px 10px", cursor: "pointer", color: "var(--accent)", fontSize: 11, fontWeight: 600 }}>
            {exporting ? <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Share2 size={12} />}
            Score card
          </button>
        </div>
      </div>

      {/* Score row: ring + stat cards */}
      <div style={{ display: "flex", gap: 12, alignItems: "stretch", flexShrink: 0 }}>
        {/* Score ring card */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "16px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 160 }}>
          <ScoreRing score={data.score} size={120} />
          <div style={{ fontSize: 13, fontWeight: 700, color: scoreColor }}>{scoreLabel}</div>
          <div style={{ fontSize: 10, color: "var(--text-3)" }}>weekly nutrition score</div>
        </div>

        {/* Stat cards */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <StreakBadge streak={data.streak} />
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "10px 14px" }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--text-3)", fontWeight: 700 }}>Seasonal match</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: data.seasonal_compliance >= 60 ? "#4ade80" : "#f59e0b" }}>{data.seasonal_compliance}%</span>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>of meals</span>
            </div>
          </div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "10px 14px" }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--text-3)", fontWeight: 700 }}>Days logged</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", marginTop: 4 }}>{data.days_logged}</div>
          </div>
        </div>
      </div>

      {/* Calorie chart */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "14px 16px", flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", marginBottom: 10 }}>📈 7-day calorie intake</div>
        <CalorieChart calByDate={data.calorie_by_date} />
      </div>

      {/* Nutrient breakdown */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "14px 16px", flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", marginBottom: 12 }}>💊 Nutrient breakdown (% of RDA)</div>
        {data.breakdown.map(n => <NutrientRow key={n.nutrient} n={n} />)}
      </div>

      {/* Deficiency alerts */}
      {data.deficiencies.length > 0 && (
        <div style={{ background: "color-mix(in srgb, #f8711510 80%, var(--bg-card))", border: "1px solid #f8711530", borderRadius: "var(--r-xl)", padding: "14px 16px", flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171", marginBottom: 8 }}>
            ⚠️ Nutrient deficiencies ({data.deficiencies.length})
          </div>
          <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 10, lineHeight: 1.5 }}>
            You've been low on these nutrients over the past week:
            <strong> {data.deficiencies.join(", ")}</strong>.
          </div>
          <button type="button" className="nm-hero-chip"
            onClick={() => onAskAgent?.(`I'm low on ${data.deficiencies[0]} — what foods can help?`)}>
            💡 Fix my {data.deficiencies[0]} gap
          </button>
        </div>
      )}

      {/* Seasonal compliance callout */}
      {data.seasonal_compliance < 50 && (
        <div style={{ background: "var(--accent-bg)", border: "1px solid var(--accent-border)", borderRadius: "var(--r-xl)", padding: "14px 16px", flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 6 }}>
            🌿 Eat more seasonal foods
          </div>
          <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5, marginBottom: 10 }}>
            Only {data.seasonal_compliance}% of your logged meals match {SEASON_LABELS[data.current_season]}. Seasonal eating improves digestion and nutrient absorption.
          </div>
          <button type="button" className="nm-hero-chip"
            onClick={() => onAskAgent?.(`What should I eat in ${SEASON_LABELS[data.current_season]}?`)}>
            What to eat in {SEASON_LABELS[data.current_season]}?
          </button>
        </div>
      )}

    </div>
  );
}