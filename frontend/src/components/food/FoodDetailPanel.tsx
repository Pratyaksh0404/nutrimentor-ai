import { useEffect, useState } from "react";
import type { Item } from "../../types/item";
import { getItemNutrients } from "../../api/items";

interface Nutrient {
  name: string;
  amount: number;
  unit: string;
  rda_amount?: number | null;
}

const SEASON_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  spring:    { label: "Vasanta (Spring)",     icon: "🌸", color: "bg-green-100 text-green-700" },
  summer:    { label: "Grishma (Summer)",     icon: "☀️", color: "bg-amber-100 text-amber-700" },
  monsoon:   { label: "Varsha (Monsoon)",     icon: "🌧️", color: "bg-blue-100 text-blue-700" },
  autumn:    { label: "Sharad (Autumn)",      icon: "🍂", color: "bg-orange-100 text-orange-700" },
  prewinter: { label: "Hemanta (Pre-winter)", icon: "🍃", color: "bg-teal-100 text-teal-700" },
  winter:    { label: "Shishira (Winter)",    icon: "❄️", color: "bg-indigo-100 text-indigo-700" },
  all:       { label: "All seasons",          icon: "🌐", color: "bg-slate-100 text-slate-600" },
};

function cleanUnit(u: string): string {
  return u.replace(/Â/g, "").replace(/ug$/i, "µg").trim();
}

function NutrientBar({ nutrient }: { nutrient: Nutrient }) {
  const unit = cleanUnit(nutrient.unit);
  const pct = nutrient.rda_amount && nutrient.rda_amount > 0
    ? Math.min(Math.round((nutrient.amount / nutrient.rda_amount) * 100), 100)
    : null;

  const barColor = pct === null ? "bg-slate-300"
    : pct >= 80 ? "bg-emerald-500"
    : pct >= 40 ? "bg-amber-400"
    : "bg-red-400";

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-baseline">
        <span className="text-[11px] font-medium text-slate-700">{nutrient.name}</span>
        <span className="text-[11px] text-slate-500">
          {nutrient.amount}{unit}
          {pct !== null && <span className="ml-1 text-slate-400">({pct}%)</span>}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: pct !== null ? `${pct}%` : "30%" }}
        />
      </div>
    </div>
  );
}

export default function FoodDetailPanel({
  item,
  onSelect,
  onClear,
  isSelected,
}: {
  item: Item;
  onSelect?: () => void;
  onClear?: () => void;
  isSelected?: boolean;
}) {
  const [nutrients, setNutrients] = useState<Nutrient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getItemNutrients(item.id)
      .then((data) => { if (mounted) setNutrients(data); })
      .catch(() => { if (mounted) setNutrients([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [item.id]);

  const season = SEASON_LABELS[item.season] ?? SEASON_LABELS.all;
  const imgSrc = item.image_url || "/images/placeholder.png";

  // Priority nutrients to show first
  const PRIORITY = ["Vitamin C", "Protein", "Fiber", "Iron", "Calcium", "Vitamin D", "Magnesium", "Potassium"];
  const sorted = [
    ...PRIORITY.map(name => nutrients.find(n => n.name === name)).filter(Boolean),
    ...nutrients.filter(n => !PRIORITY.includes(n.name)),
  ] as Nutrient[];

  return (
    <div className="flex flex-col h-full">
      {/* Food header */}
      <div className="flex gap-3 items-start p-4 border-b border-slate-100">
        <div className="h-16 w-16 flex-shrink-0 rounded-xl bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center overflow-hidden">
          <img
            src={imgSrc}
            alt={item.name}
            className="h-12 w-12 object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-slate-900 truncate">{item.name}</h3>
          {item.scientific_name && (
            <p className="text-[11px] italic text-slate-400 truncate">{item.scientific_name}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-700">
              {item.calories_per_100g} kcal
              <span className="font-normal text-slate-400">/100g</span>
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${season.color}`}>
              {season.icon} {season.label}
            </span>
          </div>
        </div>
      </div>

      {/* Nutrient bars */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Nutrients vs daily RDA
          </p>
          <p className="text-[10px] text-slate-300">per 100g</p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="space-y-1 animate-pulse">
                <div className="h-3 w-24 rounded bg-slate-100" />
                <div className="h-1.5 w-full rounded-full bg-slate-100" />
              </div>
            ))}
          </div>
        ) : sorted.length > 0 ? (
          sorted.map(n => <NutrientBar key={n.name} nutrient={n} />)
        ) : (
          <p className="text-xs text-slate-400 text-center py-4">No nutrient data available</p>
        )}
      </div>

      {/* Actions */}
      <div className="p-3 border-t border-slate-100 flex gap-2">
        {isSelected ? (
          <button
            type="button"
            onClick={onClear}
            className="flex-1 rounded-xl border border-slate-200 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Clear selection
          </button>
        ) : (
          <button
            type="button"
            onClick={onSelect}
            className="flex-1 rounded-xl bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            Ask agent about this
          </button>
        )}
      </div>
    </div>
  );
}