import { useState } from "react";
import ChatBox from "../components/chat/ChatBox";
import SeasonSelector from "../components/season/SeasonSelector";
import { useBackendHealth } from "../hooks/useBackendHealth";
import { useItems } from "../hooks/useItems";
import FoodGrid from "../components/food/FoodGrid";

export default function Home() {
  const backendStatus = useBackendHealth();

  const [season, setSeason] = useState<
    "all" | "winter" | "summer" | "monsoon"
  >("all");

  // ✅ FETCH ITEMS BASED ON SEASON
  const { items, loading } = useItems(season);

  if (backendStatus === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Connecting to NutriMentor AI…
      </div>
    );
  }

  if (backendStatus === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-600">
        Backend not reachable. Please start the server.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-12 gap-6">

          {/* LEFT: Food exploration */}
          <div className="col-span-8 space-y-6">
            <h1 className="text-2xl font-bold">Explore Seasonal Foods</h1>

            <SeasonSelector
              selectedSeason={season}
              onChange={setSeason}
            />

            <p className="text-gray-600">
              Selected season: <strong>{season}</strong>
            </p>

            {/* ✅ FOOD GRID (Step 12.2) */}
            <div className="border rounded-xl p-6 bg-white h-[60vh] overflow-y-auto">
              <FoodGrid items={items} loading={loading} />
            </div>
          </div>

          {/* RIGHT: Chatbot */}
          <div className="col-span-4 bg-white rounded-xl shadow p-4 h-[80vh] flex flex-col">
            <ChatBox />
          </div>

        </div>
      </div>
    </div>
  );
}
