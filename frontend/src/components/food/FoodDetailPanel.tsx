import { useEffect, useState } from "react";
import type { Item } from "../../types/item";
import { getItemNutrients } from "../../api/items";

interface Nutrient {
  name: string;
  amount_per_100g: number;
  unit: string;
}

export default function FoodDetailPanel({ item }: { item: Item }) {
  const [nutrients, setNutrients] = useState<Nutrient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    getItemNutrients(item.id)
      .then((data) => {
        if (mounted) setNutrients(data.slice(0, 3));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [item.id]);

  return (
    <div className="text-sm text-left space-y-1">
      <p>
        <span className="font-medium">Scientific name:</span>{" "}
        <em>{item.scientific_name}</em>
      </p>

      <p>
        <span className="font-medium">Calories:</span>{" "}
        {item.calories_per_100g} kcal / 100g
      </p>

      <p>
        <span className="font-medium">Category:</span> {item.category}
      </p>

      {!loading && nutrients.length > 0 && (
        <p className="pt-1">
          <span className="font-medium">Key nutrients:</span>{" "}
          {nutrients
            .map((n) => `${n.name} (${n.amount_per_100g}${n.unit})`)
            .join(", ")}
        </p>
      )}
    </div>
  );
}
