import type { Item } from "../../types/item";

interface FoodCardProps {
  item: Item;
  active: boolean;
  dimmed: boolean;
  onHover: () => void;
  onLeave: () => void;
}

export default function FoodCard({
  item,
  active,
  dimmed,
  onHover,
  onLeave,
}: FoodCardProps) {
  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={`
        bg-white
        border
        rounded-xl
        cursor-pointer
        transition-all
        duration-300
        flex
        flex-col
        items-center
        justify-center
        ${
          active
            ? "scale-[1.06] shadow-xl"
            : dimmed
            ? "opacity-60"
            : "opacity-100 shadow-sm"
        }
      `}
      style={{
        width: "180px",
        height: "190px",
      }}
    >
      <img
        src={item.image_url || "/images/placeholder.png"}
        alt={item.name}
        className="h-24 object-contain"
      />

      <p className="mt-3 font-medium text-sm text-center">
        {item.name}
      </p>
    </div>
  );
}
