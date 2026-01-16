import { useState } from "react";
import ChatBox from "../components/chat/ChatBox";
import SeasonSelector from "../components/season/SeasonSelector";
import FoodGrid from "../components/food/FoodGrid";
import { useBackendHealth } from "../hooks/useBackendHealth";
import { useItems } from "../hooks/useItems";
import HeroHeader from "../components/layout/HeroHeader";
import LogoCenter from "../components/layout/LogoCenter";
import logo from "../components/layout/logo.png"; // adjust path if needed

export default function Home() {
  const backendStatus = useBackendHealth();

  const [season, setSeason] = useState<string>("all");

  const { items, loading, error } = useItems(season);

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

      {/* TOP HERO SECTION */}
      <div className="grid grid-cols-12 gap-6 items-start mb-12">

        {/* LEFT: Season + Food */}
        <div className="col-span-4 space-y-6">
          <h2 className="text-xl font-semibold">
            Explore seasonal fruits & veggies
          </h2>

          <SeasonSelector
            selectedSeason={season}
            onChange={setSeason}
          />

          <p className="text-gray-600">
            Selected season: <strong>{season}</strong>
          </p>

          <div className="bg-white rounded-xl p-4 min-h-[60vh]">
            {loading && <p>Loading foods…</p>}
            {error && <p className="text-red-500">{error}</p>}
            {!loading && !error && <FoodGrid items={items} />}
          </div>
        </div>

        {/* CENTER: TITLE + LOGO */}
        <div className="col-span-4 flex flex-col items-center">
          <HeroHeader />
          <LogoCenter logoSrc={logo} />
        </div>

        {/* RIGHT: CHAT */}
        <div className="col-span-4 bg-white rounded-xl shadow p-4 h-[80vh] flex flex-col">
          <p className="text-lg italic font-semibold mt-6 text-center">
            Need more info?
          </p>
          <ChatBox />
        </div>


      </div>

    </div>
  </div>
);

}
