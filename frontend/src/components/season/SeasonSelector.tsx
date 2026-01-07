interface SeasonSelectorProps {
  selectedSeason: "all" | "winter" | "summer" | "monsoon";
  onChange: (season: "all" | "winter" | "summer" | "monsoon") => void;
}

export default function SeasonSelector({
  selectedSeason,
  onChange,
}: SeasonSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-700">
        Select season
      </label>

      <select
  value={selectedSeason}
  onChange={(e) => onChange(e.target.value as any)}
  className="
    border
    rounded
    px-3
    py-2
    text-sm
    w-fit
    min-w-[140px]
    bg-white
  "
>

        <option value="all">All</option>
        <option value="winter">Winter</option>
        <option value="summer">Summer</option>
        <option value="monsoon">Monsoon</option>
      </select>
    </div>
  );
}
