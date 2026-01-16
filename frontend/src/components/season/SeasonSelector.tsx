import { RITU_SEASONS } from "../../constants/rituSeasons";

interface SeasonSelectorProps {
  selectedSeason: string;
  onChange: (season: any) => void;
}

export default function SeasonSelector({
  selectedSeason,
  onChange,
}: SeasonSelectorProps) {
  return (
    <div className="flex flex-col gap-1 w-fit">
      <label className="text-sm font-medium text-gray-700">
        Select season
      </label>

      <select
        value={selectedSeason}
        onChange={(e) => onChange(e.target.value)}
        className="
          px-3 py-2
          rounded-lg
          border border-gray-300
          bg-white
          text-sm
          shadow-sm
          focus:outline-none
          focus:ring-2 focus:ring-green-400
        "
      >
        {RITU_SEASONS.map((season) => (
          <option key={season.value} value={season.value}>
            {season.label}
          </option>
        ))}
      </select>
    </div>
  );
}
