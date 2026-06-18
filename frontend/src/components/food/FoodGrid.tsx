import { useState } from "react";
import type { Item } from "../../types/item";
import FoodCard from "./FoodCard";

interface FoodGridProps {
  items: Item[];
  selectedItem: Item | null;
  onHoverItem: (item: Item | null) => void;
  onSelectItem: (item: Item | null) => void;
}

export default function FoodGrid({
  items,
  selectedItem,
  onHoverItem,
  onSelectItem,
}: FoodGridProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div
      className="grid
        gap-8
        items-start
        grid-cols-1
        sm:grid-cols-2
        xl:grid-cols-3"
      style={{
        // 🔑 THIS is what fixes zoom-based columns
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
      }}
    >
      {items.map((item, index) => (
        <FoodCard
          key={item.id}
          item={item}
          active={hoveredIndex === index}
          dimmed={hoveredIndex !== null && hoveredIndex !== index}
          selected={selectedItem?.id === item.id}
          onHover={() => {
            setHoveredIndex(index);
            onHoverItem(item);
          }}
          onLeave={() => {
            setHoveredIndex(null);
            onHoverItem(null);
          }}
          onSelect={() => onSelectItem(selectedItem?.id === item.id ? null : item)}
        />
      ))}
    </div>
  );
}
