import { useEffect, useState } from "react";
import { API_BASE_URL } from "../api/config";

// ── PHASE 4.1: Ritu Journal — one card per season

interface Journal {
  season: string;
  title: string;
  description: string;
  eat_more: string;
  avoid: string;
  dosha?: string;
  ayurvedic_note?: string;
}

interface RituResponse {
  current_season: string;
  journals: Journal[];
}

const SEASON_META: Record<string, { icon: string; label: string; range: string }> = {
  spring:    { icon: "🌸", label: "Vasanta Ritu · Spring",     range: "Feb 20 – Apr 20" },
  summer:    { icon: "☀️",  label: "Grishma Ritu · Summer",     range: "Apr 20 – Jun 20" },
  monsoon:   { icon: "🌧️", label: "Varsha Ritu · Monsoon",     range: "Jun 20 – Aug 20" },
  autumn:    { icon: "🍂", label: "Sharad Ritu · Autumn",      range: "Aug 20 – Oct 20" },
  prewinter: { icon: "🍃", label: "Hemanta Ritu · Pre-winter", range: "Oct 20 – Dec 20" },
  winter:    { icon: "❄️",  label: "Shishira Ritu · Winter",    range: "Dec 20 – Feb 20" },
};

interface Props {
  onAskAgent?: (prompt: string) => void;
}

export default function RituJournalPage({ onAskAgent }: Props) {
  const [data, setData]       = useState<RituResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE_URL}/ritu`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: RituResponse) => { if (!cancelled) { setData(d); setError(null); } })
      .catch(() => { if (!cancelled) setError("Couldn't load the Ritu Journal. Please try again."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="nm-centre-body" style={{ padding: 24 }}>
        <div style={{ opacity: 0.7 }}>Loading the Ritu Journal…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="nm-centre-body" style={{ padding: 24 }}>
        <div style={{ opacity: 0.8 }}>{error ?? "No journal data available."}</div>
      </div>
    );
  }

  return (
    <div className="nm-centre-body" style={{ padding: "16px 20px 32px" }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>🌱 Ritu Journal</h2>
        <p style={{ margin: "6px 0 0", opacity: 0.75, fontSize: 14 }}>
          Ayurvedic seasonal eating — six Ritus, six ways your body changes through the year.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
        {data.journals.map(j => {
          const meta = SEASON_META[j.season] ?? { icon: "🌿", label: j.season, range: "" };
          const isCurrent = j.season === data.current_season;
          return (
            <div
              key={j.season}
              style={{
                background: "var(--bg-card, #1e3a28)",
                border: isCurrent ? "1px solid #4ade80" : "1px solid transparent",
                borderRadius: 14,
                padding: "16px 16px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 26 }} aria-hidden="true">{meta.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{meta.label}</div>
                  <div style={{ fontSize: 12, opacity: 0.65 }}>{meta.range}</div>
                </div>
                {isCurrent && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: "#4ade80",
                    border: "1px solid #4ade80", borderRadius: 999, padding: "2px 8px",
                  }}>
                    NOW
                  </span>
                )}
              </div>

              <div style={{ fontSize: 13.5, opacity: 0.85, lineHeight: 1.45 }}>{j.description}</div>

              {j.dosha && (
                <div style={{ fontSize: 12.5 }}>
                  <span style={{ opacity: 0.65 }}>Dosha: </span>
                  <span style={{ fontWeight: 600 }}>{j.dosha}</span>
                </div>
              )}

              <div style={{ fontSize: 13 }}>
                <div style={{ marginBottom: 4 }}>
                  <span aria-hidden="true">✅</span> <strong>Eat more:</strong>{" "}
                  <span style={{ opacity: 0.85 }}>{j.eat_more}</span>
                </div>
                <div>
                  <span aria-hidden="true">❌</span> <strong>Avoid:</strong>{" "}
                  <span style={{ opacity: 0.85 }}>{j.avoid}</span>
                </div>
              </div>

              {j.ayurvedic_note && (
                <div style={{
                  fontSize: 12.5, opacity: 0.8, fontStyle: "italic",
                  borderLeft: "3px solid var(--bg-panel, #13261d)", paddingLeft: 10,
                }}>
                  🌿 {j.ayurvedic_note}
                </div>
              )}

              {onAskAgent && (
                <div style={{ display: "flex", gap: 8, marginTop: "auto", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="nm-hero-chip"
                    onClick={() => onAskAgent(`What should I eat in ${meta.label.split(" · ")[0]}?`)}
                  >
                    What to eat
                  </button>
                  <button
                    type="button"
                    className="nm-hero-chip"
                    onClick={() => onAskAgent(`Build me a ${meta.label.split(" · ")[1] ?? j.season} diet plan`)}
                  >
                    Build a plan
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}