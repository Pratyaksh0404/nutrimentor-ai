import type { SeasonKey } from "../../types/season";

interface SeasonConfig {
  key: SeasonKey;
  ritu: string;
  english: string;
  icon: string;
}

const SEASONS: SeasonConfig[] = [
  { key: "all",      ritu: "All",     english: "Year-round",  icon: "🌐" },
  { key: "spring",   ritu: "Vasanta", english: "Spring",      icon: "🌸" },
  { key: "summer",   ritu: "Grishma", english: "Summer",      icon: "☀️" },
  { key: "monsoon",  ritu: "Varsha",  english: "Monsoon",     icon: "🌧️" },
  { key: "autumn",   ritu: "Sharad",  english: "Autumn",      icon: "🍂" },
  { key: "prewinter",ritu: "Hemanta", english: "Pre-winter",  icon: "🍃" },
  { key: "winter",   ritu: "Shishira",english: "Winter",      icon: "❄️" },
];

interface Props {
  selectedSeason: SeasonKey;
  onChange: (season: SeasonKey) => void;
}

export default function SeasonSelector({ selectedSeason, onChange }: Props) {
  return (
    <>
      {SEASONS.map(s => (
        <button
          key={s.key}
          type="button"
          className={`season-pill${selectedSeason === s.key ? " active" : ""}`}
          onClick={() => onChange(s.key)}
          aria-pressed={selectedSeason === s.key}
          aria-label={`${s.ritu} — ${s.english}`}
        >
          <span className="season-pill-icon" aria-hidden="true">{s.icon}</span>
          <span className="season-pill-ritu">{s.ritu}</span>
          <span className="season-pill-eng">{s.english}</span>
        </button>
      ))}
    </>
  );
}