import type { Item } from "../../types/item";
import FoodCard from "./FoodCard";

interface FoodGridProps {
  items: Item[];
}

export default function FoodGrid({ items }: FoodGridProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: "24px",
      }}
    >
      {items.map((item) => (
        <FoodCard key={item.id} item={item} />
      ))}
    </div>
  );
}
