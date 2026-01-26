import { useState } from "react";
import type { Item } from "../../types/item";
import FoodDetailPanel from "./FoodDetailPanel";

interface FoodCardProps {
  item: Item;
}

export default function FoodCard({ item }: FoodCardProps) {
  const [expanded, setExpanded] = useState(false);

  const imageSrc = `/images/${item.name.toLowerCase()}.png`;

  return (
    <div
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{
        borderRadius: "16px",
        padding: "16px",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
        transition: "all 0.3s ease",
        minHeight: "210px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* NAME — ALWAYS VISIBLE */}
      <h3 className="text-lg font-semibold text-center mb-3">
        {item.name}
      </h3>

      {/* FIXED CONTENT SLOT */}
      <div className="relative flex-1 flex items-center justify-center">
        {/* IMAGE */}
        <img
          src={imageSrc}
          alt={item.name}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              "/images/placeholder.png";
          }}
          className={`
            absolute
            max-h-28
            max-w-full
            object-contain
            transition-opacity
            duration-300
            ${expanded ? "opacity-0" : "opacity-100"}
          `}
        />

        {/* DETAILS */}
        <div
          className={`
            absolute
            w-full
            transition-opacity
            duration-300
            ${expanded ? "opacity-100" : "opacity-0"}
          `}
        >
          <FoodDetailPanel item={item} />
        </div>
      </div>
    </div>
  );
}