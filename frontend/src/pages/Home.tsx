import { useState } from "react";
import ChatBox from "../components/chat/ChatBox";
import SeasonSelector from "../components/season/SeasonSelector";
import FoodGrid from "../components/food/FoodGrid";
import { useBackendHealth } from "../hooks/useBackendHealth";
import { useItems } from "../hooks/useItems";
import HeroHeader from "../components/layout/HeroHeader";
import LogoCenter from "../components/layout/LogoCenter";
import logo from "../components/layout/logo.png";
import { RITU_INFO } from "../constants/ritu";
import Footer from "../components/footer/Footer";
import Container from "../components/layout/Container";

export default function Home() {
  const backendStatus = useBackendHealth();
  const [season, setSeason] = useState<string>("all");

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
  const ritu = rituKey ? RITU_INFO[rituKey] : null;

  const { items, loading, error } = useItems(season);

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
      {/* MAIN CONTENT (flex-1 pushes footer down) */}
      <main className="flex-1">
        <div className="max-w-[1400px] mx-auto px-6 py-8 overflow-x-auto">
            <div className="min-w-[1200px] grid grid-cols-[420px_1fr_380px] gap-10 items-start">
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

              {!loading && !error && <FoodGrid items={items} />}
            </div>

            {/* CENTER */}
            <div className="flex flex-col items-center gap-4">
              <HeroHeader />
              <LogoCenter logoSrc={logo} />
            </div>

            {/* RIGHT COLUMN */}
            <div className="bg-white rounded-xl shadow-lg p-4 h-[600px] flex flex-col">
              <p className="text-lg italic font-semibold text-center mb-2 shrink-0">
                Need more info?
              </p>

              {/* Chat container */}
              <div className="flex-1 overflow-hidden">
                <ChatBox />
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* FOOTER ALWAYS AT BOTTOM */}
      <Footer />
    </Container>
  );
}
