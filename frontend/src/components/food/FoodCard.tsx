import type { Item } from "../../types/item";

interface Props {
  item: Item;
}

export default function FoodCard({ item }: Props) {
  return (
    <div className="border rounded-lg p-4 bg-white hover:shadow cursor-pointer">
      <h3 className="font-semibold text-lg">{item.name}</h3>
      <p className="text-sm text-gray-500">{item.category}</p>
      <p className="text-sm mt-2">
        {item.calories_per_100g} kcal / 100g
      </p>
    </div>
  );
}
