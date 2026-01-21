import type { Item } from "../../types/item";
import FoodCard from "./FoodCard";

interface FoodGridProps {
  items: Item[];
}

export default function FoodGrid({ items }: FoodGridProps) {
  return (
    <div
      className="grid gap-6"
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      }}
    >
      {items.map((item) => (
        <FoodCard key={item.id} item={item} />
      ))}
    </div>
  );
}
