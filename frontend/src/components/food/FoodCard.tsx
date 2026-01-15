import { useState } from "react";
import type { Item } from "../../types/item";
import FoodDetailPanel from "./FoodDetailPanel";

interface FoodCardProps {
  item: Item;
}

export default function FoodCard({ item }: FoodCardProps) {
  const [expanded, setExpanded] = useState(false);

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
  maxWidth: "100%",
}}

>


      <h3 className="text-lg font-semibold">{item.name}</h3>
      <p className="text-sm text-gray-500">{item.category}</p>
      <p className="text-sm text-gray-600">
        {item.calories_per_100g} kcal / 100g
      </p>

      <div
        className={`
          overflow-hidden
          transition-all
          duration-300
          ease-in-out
          ${expanded ? "max-h-60 mt-4 opacity-100" : "max-h-0 opacity-0"}
        `}
      >
        <FoodDetailPanel item={item} />
      </div>
    </div>
  );
}
