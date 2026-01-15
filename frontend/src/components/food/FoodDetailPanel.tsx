import type { Item } from "../../types/item";

interface Props {
  item: Item;
}

export default function FoodDetailPanel({ item }: Props) {
  return (
    <div className="text-sm text-gray-700 space-y-1">
      <p>
        <strong>Scientific name:</strong>{" "}
        <em>Not available</em>
      </p>
      <p>
        <strong>Calories:</strong> {item.calories_per_100g} kcal / 100g
      </p>
      <p>
        <strong>Category:</strong> {item.category}
      </p>
    </div>
  );
}
