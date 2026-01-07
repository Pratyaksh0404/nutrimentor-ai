import { useState } from "react";
import ChatBox from "../components/chat/ChatBox";
import SeasonSelector from "../components/season/SeasonSelector";
import { useBackendHealth } from "../hooks/useBackendHealth";

export default function Home() {
  const backendStatus = useBackendHealth();

  const [season, setSeason] = useState<
    "all" | "winter" | "summer" | "monsoon"
  >("all");

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
          <div className="border rounded-xl p-6 text-gray-500 bg-white h-[60vh] flex items-center justify-center">
  Seasonal food cards will appear here
</div>


          {/* 🔜 FoodGrid will be rendered here (next step) */}
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
