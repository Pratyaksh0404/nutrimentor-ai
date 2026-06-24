import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import type { Item } from "../../types/item";
import { getItemNutrients } from "../../api/items";
import { EMOJI } from "../../pages/Home";

interface Nutrient {
  name: string; amount: number; unit: string; rda_amount?: number | null;
}

interface Props {
  item: Item;
  onClear: () => void;
  onAskAgent: (prompt: string) => void;
}

function clean(u: string) { return u.replace(/Â/g,"").replace(/ug$/i,"µg").trim(); }

function NutrientRow({ n }: { n: Nutrient }) {
  const unit = clean(n.unit);
  const pct  = n.rda_amount && n.rda_amount > 0
    ? Math.round((n.amount / n.rda_amount) * 100) : null;
  const capped = pct !== null ? Math.min(pct, 100) : null;
  const barCls = pct === null ? "nm-bar-red"   : pct >= 80 ? "nm-bar-green" : pct >= 40 ? "nm-bar-amber" : "nm-bar-red";
  const pctCls = pct === null ? "nm-pct-none"  : pct >= 80 ? "nm-pct-green" : pct >= 40 ? "nm-pct-amber" : "nm-pct-red";

  return (
    <div className="nm-nutrient-row">
      <div className="nm-nutrient-name">{n.name}</div>
      <div className="nm-bar-track"
        role="progressbar" aria-valuenow={capped ?? 0} aria-valuemin={0} aria-valuemax={100}
        aria-label={`${n.name}: ${pct ?? 0}% of daily requirement`}>
        <div className={`nm-bar-fill ${barCls}`}
          style={{ width: capped !== null ? `${capped}%` : "2%" }} />
      </div>
      <div className="nm-nutrient-right">
        <div className="nm-nutrient-val">{n.amount}{unit}</div>
        {pct !== null && <div className={`nm-nutrient-pct ${pctCls}`}>{pct}%</div>}
      </div>
    </div>
  );
}

export default function FoodDetailPanel({ item, onClear, onAskAgent }: Props) {
  const [nutrients, setNutrients] = useState<Nutrient[]>([]);
  const [loading, setLoading]     = useState(false);
  const [imgErr, setImgErr]       = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true); setNutrients([]); setImgErr(false);
    getItemNutrients(item.id)
      .then(d => { if (mounted) setNutrients(d); })
      .catch(() => { if (mounted) setNutrients([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [item.id]);

  const emoji = EMOJI[item.category] ?? "🥗";
  const SEASON_LABELS: Record<string, string> = {
    spring:"Vasanta (Spring)", summer:"Grishma (Summer)", monsoon:"Varsha (Monsoon)",
    autumn:"Sharad (Autumn)", prewinter:"Hemanta (Pre-winter)", winter:"Shishira (Winter)",
    all:"All seasons",
  };

  const askPrompts = [
    `Should I eat ${item.name}?`,
    `Compare ${item.name} with banana`,
    `Add ${item.name} to my diet plan`,
  ];

  return (
    <div className="nm-detail nm-anim-in" role="region" aria-label={`${item.name} details`}>

      {/* Header */}
      <div className="nm-detail-header">
        <div className="nm-detail-icon" aria-hidden="true">
          {item.image_url && !imgErr ? (
            <img src={item.image_url} alt={item.name}
              style={{ width:36, height:36, objectFit:"contain" }}
              onError={() => setImgErr(true)} />
          ) : emoji}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div className="nm-detail-name">{item.name}</div>
          {(item as any).scientific_name && (
            <div className="nm-detail-sci">{(item as any).scientific_name}</div>
          )}
          <div className="nm-detail-badges">
            <span className="nm-badge nm-badge-neutral">{item.calories_per_100g} kcal / 100g</span>
            <span className="nm-badge nm-badge-accent">{SEASON_LABELS[item.season] ?? item.season}</span>
          </div>
          <div className="nm-detail-actions">
            <button type="button" className="nm-detail-btn primary"
              onClick={() => onAskAgent(`Tell me about ${item.name}`)}>
              <MessageCircle size={12} aria-hidden="true" /> Ask agent
            </button>
            <button type="button" className="nm-detail-btn" onClick={onClear}
              aria-label="Close detail">
              <X size={12} aria-hidden="true" /> Close
            </button>
          </div>
        </div>
      </div>

      {/* Nutrients */}
      <div style={{ padding:"10px 16px 6px", borderBottom:"1px solid var(--border)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:"9px", fontWeight:600, textTransform:"uppercase", letterSpacing:".07em", color:"var(--text-3)" }}>
            Nutrients vs daily RDA
          </span>
          <span style={{ fontSize:"9px", color:"var(--text-3)" }}>per 100g</span>
        </div>
      </div>

      <div className="nm-nutrients" role="list" aria-label="Nutrient breakdown">
        {loading ? (
          Array.from({length:8}).map((_,i) => (
            <div key={i} style={{ height:32, borderRadius:"var(--r-md)", background:"var(--bg-card)", animation:"nm-pulse 1.5s ease-in-out infinite" }} aria-hidden="true" />
          ))
        ) : nutrients.length === 0 ? (
          <p style={{ fontSize:"11px", color:"var(--text-3)", textAlign:"center", padding:"12px" }}>No nutrient data</p>
        ) : (
          nutrients.map(n => <NutrientRow key={n.name} n={n} />)
        )}
      </div>

      {/* Ritu note */}
      {(item as any).ritu_note && (
        <div className="nm-ritu-note">
          <div className="nm-ritu-note-label">Ayurvedic note</div>
          {(item as any).ritu_note}
        </div>
      )}

      {/* Quick agent prompts */}
      <div style={{ padding:"6px 16px 14px", display:"flex", flexWrap:"wrap", gap:"5px" }}>
        {askPrompts.map(p => (
          <button key={p} type="button" className="nm-task-chip" onClick={() => onAskAgent(p)}>
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}