import type { SeasonKey } from "../../types/season";

const SEASONS: { key: SeasonKey; label: string; sub: string; icon: string; color: string; active: string }[] = [
  { key: "all",       label: "All",       sub: "Year-round",  icon: "🌐", color: "bg-slate-100 text-slate-600 border-slate-200",       active: "bg-slate-800 text-white border-slate-800" },
  { key: "spring",    label: "Vasanta",   sub: "Spring",      icon: "🌸", color: "bg-green-50 text-green-700 border-green-200",         active: "bg-green-600 text-white border-green-600" },
  { key: "summer",    label: "Grishma",   sub: "Summer",      icon: "☀️", color: "bg-amber-50 text-amber-700 border-amber-200",         active: "bg-amber-500 text-white border-amber-500" },
  { key: "monsoon",   label: "Varsha",    sub: "Monsoon",     icon: "🌧️", color: "bg-blue-50 text-blue-700 border-blue-200",            active: "bg-blue-600 text-white border-blue-600" },
  { key: "autumn",    label: "Sharad",    sub: "Autumn",      icon: "🍂", color: "bg-orange-50 text-orange-700 border-orange-200",      active: "bg-orange-500 text-white border-orange-500" },
  { key: "prewinter", label: "Hemanta",   sub: "Pre-winter",  icon: "🍃", color: "bg-teal-50 text-teal-700 border-teal-200",            active: "bg-teal-600 text-white border-teal-600" },
  { key: "winter",    label: "Shishira",  sub: "Winter",      icon: "❄️", color: "bg-indigo-50 text-indigo-700 border-indigo-200",      active: "bg-indigo-600 text-white border-indigo-600" },
];

interface Props {
  selectedSeason: SeasonKey;
  onChange: (s: SeasonKey) => void;
}

export default function SeasonSelector({ selectedSeason, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {SEASONS.map((s) => {
        const isActive = selectedSeason === s.key;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onChange(s.key)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium
              transition-all duration-150 select-none
              ${isActive ? s.active : s.color + " hover:opacity-80"}
            `}
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
            <span className={`hidden sm:inline opacity-70`}>{s.sub}</span>
          </button>
        );
      })}
    </div>
  );
}