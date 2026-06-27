import { Trash2, RefreshCw } from "lucide-react";
import type { MealLogEntry, TodayLog, WeekLog } from "../hooks/useDashboard";

// ── Meal slot label ──────────────────────────────────────────────────────────
const SLOT_ICONS: Record<string, string> = {
  breakfast: "🌅", mid_morning: "🍎", lunch: "🍱", evening: "🫖", dinner: "🌙", general: "🍽️",
};
const SLOT_LABELS: Record<string, string> = {
  breakfast: "Breakfast", mid_morning: "Mid-morning", lunch: "Lunch",
  evening: "Evening", dinner: "Dinner", general: "Meal",
};

// ── Single log entry row ─────────────────────────────────────────────────────
function MealRow({ entry, onDelete }: { entry: MealLogEntry; onDelete: (id: number) => void }) {
  const cal = Math.round((entry.calories_per_100g * entry.amount_g) / 100);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 12px", borderRadius: "var(--r-md)",
      background: "var(--bg-card)", border: "1px solid var(--border)", marginBottom: 6,
    }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>
        {SLOT_ICONS[entry.meal_slot] ?? "🍽️"}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{entry.name}</div>
        <div style={{ fontSize: 11, color: "var(--text-3)" }}>
          {SLOT_LABELS[entry.meal_slot] ?? entry.meal_slot} · {entry.amount_g}g
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", flexShrink: 0 }}>{cal} kcal</div>
      <button type="button" title="Remove meal"
        onClick={() => onDelete(entry.id)}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: "4px", borderRadius: "var(--r-sm)", flexShrink: 0 }}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ── Day section ──────────────────────────────────────────────────────────────
function DaySection({ date, entries, onDelete }: { date: string; entries: MealLogEntry[]; onDelete: (id: number) => void }) {
  const totalCal = Math.round(entries.reduce((s, e) => s + (e.calories_per_100g * e.amount_g) / 100, 0));
  const isToday  = date === new Date().toISOString().split("T")[0];
  const label    = isToday ? "Today" : new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: isToday ? "var(--accent)" : "var(--text-2)", letterSpacing: ".04em" }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)" }}>{totalCal} kcal total</div>
      </div>
      {entries.map(e => <MealRow key={e.id} entry={e} onDelete={onDelete} />)}
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────
interface MealLogPageProps {
  todayLog:  TodayLog | null;
  weekLog:   WeekLog | null;
  loading:   boolean;
  error:     string | null;
  onDelete:  (id: number) => void;
  onRefresh: () => void;
  onAskAgent?: (msg: string) => void;
}

// ── Main MealLog page ────────────────────────────────────────────────────────
export default function MealLogPage({ todayLog, weekLog, loading, error, onDelete, onRefresh, onAskAgent }: MealLogPageProps) {

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, flexDirection: "column" }}>
        <div style={{ fontSize: 32 }}>📝</div>
        <div style={{ fontSize: 13, color: "var(--text-3)" }}>Loading meal log…</div>
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

  const allLogs = weekLog?.logs ?? [];
  const hasData = allLogs.length > 0 || (todayLog?.logs?.length ?? 0) > 0;

  if (!hasData) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 52 }}>📝</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)" }}>No meals logged yet</div>
        <div style={{ fontSize: 13, color: "var(--text-2)", maxWidth: 280, lineHeight: 1.7 }}>
          Tell the agent what you ate and it will log it automatically.
        </div>
        <button type="button" className="nm-hero-chip" style={{ marginTop: 8 }}
          onClick={() => onAskAgent?.("I ate banana and oats for breakfast")}>
          📝 Log my breakfast
        </button>
      </div>
    );
  }

  // Group all logs by date
  const byDate: Record<string, MealLogEntry[]> = {};
  for (const entry of allLogs) {
    if (!byDate[entry.logged_date]) byDate[entry.logged_date] = [];
    byDate[entry.logged_date].push(entry);
  }
  const sortedDates = Object.keys(byDate).sort().reverse();

  return (
    <div className="nm-centre-body" style={{ gap: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>Meal Log</div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>Last 7 days</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {todayLog && (
            <div style={{ fontSize: 11, color: "var(--text-2)", background: "var(--accent-bg)", border: "1px solid var(--accent-border)", borderRadius: "var(--r-pill)", padding: "3px 10px" }}>
              Today: {todayLog.total_calories} kcal
            </div>
          )}
          <button type="button" title="Refresh" onClick={onRefresh}
            style={{ background: "none", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "5px 8px", cursor: "pointer", color: "var(--text-3)" }}>
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Log entries by date */}
      {sortedDates.map(date => (
        <DaySection key={date} date={date} entries={byDate[date]} onDelete={onDelete} />
      ))}

      {/* Quick log shortcut */}
      <div style={{ marginTop: 8, flexShrink: 0 }}>
        <button type="button" className="nm-hero-chip"
          onClick={() => onAskAgent?.("Log my meals")}>
          + Log more meals
        </button>
      </div>
    </div>
  );
}