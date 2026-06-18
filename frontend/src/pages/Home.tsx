import { useState } from "react";
import ChatBox from "../components/chat/ChatBox";
import SeasonSelector from "../components/season/SeasonSelector";
import FoodGrid from "../components/food/FoodGrid";
import FoodDetailPanel from "../components/food/FoodDetailPanel";
import { useBackendHealth } from "../hooks/useBackendHealth";
import { useItems } from "../hooks/useItems";
import HeroHeader from "../components/layout/HeroHeader";
import LogoCenter from "../components/layout/LogoCenter";
import logo from "../components/layout/logo.png";
import { RITU_INFO } from "../constants/ritu";
import Footer from "../components/footer/Footer";
import Container from "../components/layout/Container";
import type { Item } from "../types/item";

type SeasonKey =
  | "all"
  | "spring"
  | "summer"
  | "monsoon"
  | "autumn"
  | "prewinter"
  | "winter";

export default function Home() {
  const backendStatus = useBackendHealth();
  const [season, setSeason] = useState<SeasonKey>("all");
  const [hoveredItem, setHoveredItem] = useState<Item | null>(null);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  const rituKeyMap = {
    spring: "vasanta",
    summer: "grishma",
    monsoon: "varsha",
    autumn: "sharad",
    winter: "shishira",
    prewinter: "hemanta",
    all: null,
  } as const;

  const rituKey = rituKeyMap[season];
  const ritu = rituKey
    ? RITU_INFO[rituKey]
    : null;

  const { items, loading, error } = useItems(season);
  const displayItem = hoveredItem ?? selectedItem;

  if (backendStatus === "loading") {
    return <div className="min-h-screen flex items-center justify-center">
      Connecting to NutriMentor AI…
    </div>;
  }

  if (backendStatus === "error") {
    return <div className="min-h-screen flex items-center justify-center text-red-600">
      Backend not reachable. Please start the server.
    </div>;
  }

  return (
    <Container>
      <main className="flex-1">
        {/* ⬅️ horizontal scroll allowed here */}
        <div className="w-full px-4 py-8 overflow-x-auto">
            <div className="min-w-[1200px] mx-auto grid grid-cols-[420px_1fr_380px] gap-8">
            {/* LEFT */}
            <div className="flex flex-col gap-6">
              <h2 className="text-xl font-semibold">
                Explore seasonal fruits & veggies
              </h2>

              <SeasonSelector selectedSeason={season} onChange={setSeason} />

              {ritu && (
                <div className="rounded-xl border bg-white px-4 py-3 shadow-sm">
                  <div className="text-sm font-medium">
                    {ritu.label} ({ritu.english})
                  </div>
                  <p className="mt-1 text-xs text-gray-600">
                    {ritu.description}
                  </p>
                </div>
              )}

              {!loading && !error && (
                <FoodGrid
                  items={items}
                  selectedItem={selectedItem}
                  onHoverItem={setHoveredItem}
                  onSelectItem={setSelectedItem}
                />
              )}
            </div>

            {/* CENTER */}
            <div className="flex flex-col items-center gap-4">
              <HeroHeader />
              <LogoCenter logoSrc={logo} />

              {/* 🔥 Spotlight panel */}
              {displayItem && (
                <div className="w-full max-w-md mt-4 rounded-xl border bg-white p-4 shadow-md">
                  {selectedItem && displayItem.id === selectedItem.id && (
                    <div className="mb-3 flex items-center justify-between gap-3 border-b pb-2">
                      <span className="text-xs font-medium text-gray-600">
                        Selected for agent context
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedItem(null)}
                        className="rounded border px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                  <FoodDetailPanel item={displayItem} />
                </div>
              )}
            </div>

            {/* RIGHT */}
            <div className="bg-white rounded-xl shadow-lg p-4 h-[600px] flex flex-col">
              <p className="text-lg italic font-semibold text-center mb-2">
                Nutrition Agent
              </p>
              <div className="flex-1 overflow-hidden">
                <ChatBox
                  selectedItem={selectedItem}
                  season={season}
                  onClearSelectedItem={() => setSelectedItem(null)}
                />
              </div>
            </div>

          </div>
        </div>
      </main>

      <Footer />
    </Container>
  );
}
