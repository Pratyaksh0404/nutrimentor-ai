import type { Item } from "../../types/item";

const EMOJI: Record<string, string> = {
  fruit:"🍎", vegetable:"🥦", grain:"🌾", dairy:"🥛",
  legume:"🫘", nut:"🥜", protein:"🍗", spice:"🌿",
};

interface Props { item: Item | null; }

export default function FoodHoverPreview({ item }: Props) {
  if (!item) return null;
  return (
    <div style={{
      position:"absolute", top:"calc(100% + 8px)", left:"50%",
      transform:"translateX(-50%)", zIndex:50,
      background:"var(--bg-panel)", border:"1px solid var(--border-2)",
      borderRadius:"var(--r-lg)", padding:"8px 12px",
      boxShadow:"0 8px 24px rgba(0,0,0,.4)", whiteSpace:"nowrap",
      fontSize:"12px", color:"var(--text-1)",
      display:"flex", alignItems:"center", gap:"8px",
      pointerEvents:"none",
    }}>
      <span style={{ fontSize:"20px" }}>{EMOJI[item.category] ?? "🥗"}</span>
      <div>
        <div style={{ fontWeight:600 }}>{item.name}</div>
        <div style={{ color:"var(--text-3)", fontSize:"11px" }}>
          {item.calories_per_100g} kcal · {item.category}
        </div>
      </div>
    </div>
  );
}