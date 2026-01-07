import type { Item } from "../types/item";

interface Props {
  item: Item;
}

export default function FoodCard({ item }: Props) {
  return (
    <div className="border rounded-lg p-4 bg-white hover:shadow transition cursor-pointer">
      <h3 className="font-semibold">{item.name}</h3>
      <p className="text-sm text-gray-500 capitalize">{item.category}</p>
      <p className="text-xs text-gray-400 mt-1">
        {item.calories_per_100g} kcal / 100g
      </p>
    </div>
  );
}
