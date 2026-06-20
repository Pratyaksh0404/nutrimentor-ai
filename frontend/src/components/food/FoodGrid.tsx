import { useState } from "react";
import type { Item } from "../../types/item";
import FoodCard from "./FoodCard";

interface FoodGridProps {
  items: Item[];
  selectedItem: Item | null;
  onHoverItem: (item: Item | null) => void;
  onSelectItem: (item: Item) => void;
}

export default function FoodGrid({ items, selectedItem, onHoverItem, onSelectItem }: FoodGridProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
        <span className="text-2xl">🌿</span>
        <p className="text-xs text-slate-500">No foods found for this season</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {items.map((item, index) => (
        <FoodCard
          key={item.id}
          item={item}
          active={hoveredIndex === index}
          dimmed={hoveredIndex !== null && hoveredIndex !== index}
          selected={selectedItem?.id === item.id}
          onHover={() => { setHoveredIndex(index); onHoverItem(item); }}
          onLeave={() => { setHoveredIndex(null); onHoverItem(null); }}
          onSelect={() => onSelectItem(item)}
        />
      ))}
    </div>
  );
}