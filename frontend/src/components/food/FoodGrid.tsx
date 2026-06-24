import { useMemo, useState } from "react";
import type { Item } from "../../types/item";
import type { SeasonKey } from "../../types/season";
import { EMOJI } from "../../pages/Home";
import FoodDetailPanel from "./FoodDetailPanel";

const CATS = [
  { key:"all", label:"All", icon:"🌐" },
  { key:"fruit", label:"Fruit", icon:"🍎" },
  { key:"vegetable", label:"Veg", icon:"🥦" },
  { key:"grain", label:"Grain", icon:"🌾" },
  { key:"dairy", label:"Dairy", icon:"🥛" },
  { key:"legume", label:"Legume", icon:"🫘" },
  { key:"nut", label:"Nut", icon:"🥜" },
  { key:"protein", label:"Protein", icon:"🍗" },
];

interface Props {
  items: Item[];
  loading: boolean;
  season: SeasonKey;
  selected: Item | null;
  onSelect: (item: Item | null) => void;
  onAskAgent: (prompt: string) => void;
}

export default function FoodGrid({ items, loading, season, selected, onSelect, onAskAgent }: Props) {
  const [search, setSearch] = useState("");
  const [cat, setCat]       = useState("all");

  const availCats = useMemo(() => {
    const present = new Set(items.map(i => i.category));
    return CATS.filter(c => c.key === "all" || present.has(c.key));
  }, [items]);

  const filtered = useMemo(() => {
    let r = items;
    if (cat !== "all") r = r.filter(i => i.category === cat);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(i => i.name.toLowerCase().includes(q) || i.category.includes(q));
    }
    return r;
  }, [items, cat, search]);

  const label = season === "all" ? "All foods" : `${season.charAt(0).toUpperCase()}${season.slice(1)} foods`;

  return (
    <>
      {/* Controls */}
      <div className="nm-food-browser">
        <div className="nm-food-controls">
          <div className="nm-search">
            <span className="nm-search-icon" aria-hidden="true">🔍</span>
            <input type="search" placeholder="Search foods…" value={search}
              onChange={e => setSearch(e.target.value)} aria-label="Search foods" />
          </div>
        </div>
        <div className="nm-cat-tabs" role="tablist">
          {availCats.map(c => (
            <button key={c.key} type="button" role="tab"
              aria-selected={cat === c.key}
              className={`nm-cat-tab${cat === c.key ? " active" : ""}`}
              onClick={() => setCat(c.key)}>
              <span aria-hidden="true">{c.icon}</span>{c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="nm-section-header">
        <span className="nm-section-label">{label}</span>
        {!loading && (
          <span className="nm-section-count">{filtered.length} item{filtered.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="nm-food-grid">
          {Array.from({length:10}).map((_,i) => (
            <div key={i} className="nm-skeleton" aria-hidden="true" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:"center", padding:"24px 16px", color:"var(--text-3)", fontSize:"12px" }}>
          {search ? `No foods matching "${search}"` : "No foods for this season"}
          {search && (
            <button onClick={() => setSearch("")} style={{
              display:"block", margin:"8px auto 0", fontSize:"11px", color:"var(--accent)",
              background:"none", border:"none", cursor:"pointer", textDecoration:"underline"
            }}>Clear search</button>
          )}
        </div>
      ) : (
        <div className="nm-food-grid" role="list" aria-label="Food items">
          {filtered.map(item => (
            <FoodCard key={item.id} item={item}
              selected={selected?.id === item.id}
              onSelect={() => onSelect(item)}
              onDeselect={() => onSelect(null)} />
          ))}
        </div>
      )}

      {/* Inline detail panel — expands below grid when food is selected */}
      {selected && (
        <FoodDetailPanel
          item={selected}
          onClear={() => onSelect(null)}
          onAskAgent={onAskAgent}
        />
      )}
    </>
  );
}

/* ── Food Card ── */
function FoodCard({ item, selected, onSelect, onDeselect }: {
  item: Item; selected: boolean; onSelect: () => void; onDeselect: () => void;
}) {
  const emoji = EMOJI[item.category] ?? "🥗";
  const [imgErr, setImgErr] = useState(false);

  return (
    <button type="button" role="listitem"
      className={`nm-food-card${selected ? " selected" : ""}`}
      onClick={selected ? onDeselect : onSelect}
      aria-label={`${item.name}, ${item.calories_per_100g} kcal`}
      aria-pressed={selected}>
      {selected && <span className="nm-card-check" aria-hidden="true">✓</span>}
      <span className="nm-card-emoji" aria-hidden="true">
        {item.image_url && !imgErr ? (
          <img src={item.image_url} alt="" style={{ width:28, height:28, objectFit:"contain" }}
            onError={() => setImgErr(true)} />
        ) : emoji}
      </span>
      <div className="nm-card-name">{item.name}</div>
      <div className="nm-card-kcal">{item.calories_per_100g} kcal</div>
    </button>
  );
}