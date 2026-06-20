import { useState } from "react";
import ChatBox from "../components/chat/ChatBox";
import SeasonSelector from "../components/season/SeasonSelector";
import FoodGrid from "../components/food/FoodGrid";
import FoodDetailPanel from "../components/food/FoodDetailPanel";
import Footer from "../components/footer/Footer";
import { useItems } from "../hooks/useItems";
import { RITU_INFO } from "../constants/ritu";
import logo from "../components/layout/logo.png";
import type { Item } from "../types/item";
import type { SeasonKey } from "../types/season";

const RITU_KEY_MAP: Record<SeasonKey, keyof typeof RITU_INFO | null> = {
  spring: "vasanta", summer: "grishma", monsoon: "varsha",
  autumn: "sharad", prewinter: "hemanta", winter: "shishira", all: null,
};

const SEASON_BG: Record<SeasonKey, string> = {
  all: "from-slate-50 to-white",
  spring: "from-green-50 to-white",
  summer: "from-amber-50 to-white",
  monsoon: "from-blue-50 to-white",
  autumn: "from-orange-50 to-white",
  prewinter: "from-teal-50 to-white",
  winter: "from-indigo-50 to-white",
};

export default function Home() {
  const [season, setSeason] = useState<SeasonKey>("all");
  const [hoveredItem, setHoveredItem] = useState<Item | null>(null);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  const rituKey = RITU_KEY_MAP[season];
  const ritu = rituKey ? RITU_INFO[rituKey] : null;
  const { items, loading } = useItems(season);

  const displayItem = hoveredItem ?? selectedItem;
  const bg = SEASON_BG[season];

  function handleSelectItem(item: Item) {
    setSelectedItem(item);
  }

  function handleClearItem() {
    setSelectedItem(null);
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br ${bg} transition-colors duration-500`}>
      {/* ── Top nav ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-white/80 border-b border-slate-200/60">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="NutriMentor AI" className="h-8 w-8 rounded-lg object-cover" />
            <span className="text-sm font-semibold text-slate-900 tracking-tight">NutriMentor AI</span>
            <span className="hidden sm:inline text-[10px] text-slate-400 border border-slate-200 rounded-full px-2 py-0.5">
              Season-aware nutrition
            </span>
          </div>
          {ritu && (
            <p className="hidden md:block text-xs text-slate-500 italic max-w-xs truncate">
              {ritu.label} · {ritu.description}
            </p>
          )}
        </div>
      </header>

      {/* ── Main layout ──────────────────────────────────────────────────── */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">

        {/* Season pills row */}
        <div className="mb-5">
          <SeasonSelector selectedSeason={season} onChange={setSeason} />
        </div>

        {/* Three column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_360px] gap-5 items-start">

          {/* ── LEFT: Food grid ───────────────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {season === "all" ? "All foods" : `${ritu?.label ?? season} foods`}
              </h2>
              {!loading && (
                <span className="text-xs text-slate-400">{items.length} items</span>
              )}
            </div>

            {loading ? (
              <div className="grid grid-cols-2 gap-2.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-36 rounded-2xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : (
              <FoodGrid
                items={items}
                selectedItem={selectedItem}
                onHoverItem={setHoveredItem}
                onSelectItem={handleSelectItem}
              />
            )}
          </div>

          {/* ── CENTRE: Detail panel ─────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            {displayItem ? (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <FoodDetailPanel
                  item={displayItem}
                  isSelected={selectedItem?.id === displayItem.id}
                  onSelect={() => handleSelectItem(displayItem)}
                  onClear={handleClearItem}
                />
              </div>
            ) : (
              /* Empty state */
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 flex flex-col items-center justify-center text-center gap-3 min-h-[320px]">
                <div className="text-4xl">🥦</div>
                <div>
                  <p className="text-sm font-medium text-slate-700">Select a food to explore</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    Click any food card to see its nutrients, seasonal fit, and ask the agent about it.
                  </p>
                </div>
                {ritu && (
                  <div className="mt-2 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-left max-w-sm">
                    <p className="text-[11px] font-semibold text-slate-600">{ritu.label} ({ritu.english})</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{ritu.description}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT: Agent panel ───────────────────────────────────────── */}
          <div className="lg:sticky lg:top-20 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
               style={{ height: "calc(100vh - 100px)", maxHeight: "760px" }}>
            <ChatBox
              selectedItem={selectedItem}
              season={season}
              onClearSelectedItem={handleClearItem}
            />
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}