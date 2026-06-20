import type { Item } from "../../types/item";

interface FoodCardProps {
  item: Item;
  active: boolean;
  dimmed: boolean;
  selected: boolean;
  onHover: () => void;
  onLeave: () => void;
  onSelect: () => void;
}

export default function FoodCard({ item, active, dimmed, selected, onHover, onLeave, onSelect }: FoodCardProps) {
  const imgSrc = item.image_url || "/images/placeholder.png";

  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onSelect}
      className={`
        group relative w-full rounded-2xl border bg-white text-left
        transition-all duration-200 overflow-hidden
        ${active ? "shadow-lg scale-[1.03] border-emerald-300" : "shadow-sm border-slate-200"}
        ${selected ? "ring-2 ring-emerald-500 border-emerald-400" : ""}
        ${dimmed ? "opacity-50" : "opacity-100"}
        hover:shadow-md hover:border-slate-300
      `}
    >
      {/* Image area */}
      <div className="relative h-28 flex items-center justify-center bg-gradient-to-b from-slate-50 to-white pt-3 pb-1">
        <img
          src={imgSrc}
          alt={item.name}
          className="h-20 w-20 object-contain drop-shadow-sm transition-transform duration-200 group-hover:scale-105"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.onerror = null;
            target.style.display = "none";
            const parent = target.parentElement;
            if (parent && !parent.querySelector(".emoji-fallback")) {
              const span = document.createElement("span");
              span.className = "emoji-fallback text-4xl";
              span.textContent = "🥗";
              parent.appendChild(span);
            }
          }}
        />
        {selected && (
          <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px]">
            ✓
          </span>
        )}
      </div>

      {/* Name + meta */}
      <div className="px-2 pb-2.5 text-center">
        <p className="text-xs font-semibold text-slate-800 truncate">{item.name}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">{item.calories_per_100g} kcal</p>
      </div>
    </button>
  );
}