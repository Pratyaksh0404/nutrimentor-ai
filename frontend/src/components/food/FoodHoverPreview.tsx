import type { Item } from "../../types/item";
import FoodDetailPanel from "./FoodDetailPanel";

interface Props {
  item: Item | null;
}

export default function FoodHoverPreview({ item }: Props) {
  if (!item) return null;

  return (
    <div
      className="
        absolute
        top-24
        left-1/2
        -translate-x-1/2
        w-[360px]
        bg-white
        border
        rounded-2xl
        shadow-2xl
        p-6
        z-40
        animate-fade-in
      "
    >
      <div className="flex items-center gap-4 mb-4">
        <img
          src={item.image_url || "/images/placeholder.png"}
          alt={item.name}
          className="h-16 object-contain"
        />

        <h2 className="text-lg font-semibold">
          {item.name}
        </h2>
      </div>

      <FoodDetailPanel item={item} />
    </div>
  );
}
