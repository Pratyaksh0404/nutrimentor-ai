import type { Item } from "../types/item";
import FoodCard from "./FoodCard";

interface Props {
  items: Item[];
  loading: boolean;
}

export default function FoodGrid({ items, loading }: Props) {
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        Loading seasonal foods…
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        No foods found for this season
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {items.map((item) => (
        <FoodCard key={item.id} item={item} />
      ))}
    </div>
  );
}


/*
export default function FoodGrid({ items }: Props) {
  if (!items.length) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        No foods available for this season
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {items.map((item) => (
        <FoodCard key={item.id} item={item} />
      ))}
    </div>
  );
}
*/