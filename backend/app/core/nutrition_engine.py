from collections import defaultdict
from app.models.item import Item


def compute_consumed_nutrients(consumed_items, db):
    """
    Returns total nutrients consumed from given items.
    consumed_items: [{ "item_id": int, "quantity_in_grams": float }]
    """
    total_nutrients = defaultdict(float)

    for entry in consumed_items:
        item = db.query(Item).filter(Item.id == entry["item_id"]).first()
        if not item:
            continue

        for item_nutrient in item.nutrients:
            nutrient_name = item_nutrient.nutrient.name

            scaled_amount = (
                item_nutrient.amount_per_100g
                * entry["quantity_in_grams"]
                / 100
            )

            total_nutrients[nutrient_name] += scaled_amount

    return total_nutrients


def compute_deficiencies(consumed_nutrients, rda_list):
    deficiencies = []

    for rda in rda_list:
        consumed = consumed_nutrients.get(rda.nutrient_name, 0)

        if consumed < rda.daily_amount:
            deficiencies.append({
                "nutrient": rda.nutrient_name,
                "consumed": round(consumed, 2),
                "required": rda.daily_amount,
                "unit": rda.unit,
                "deficit": round(rda.daily_amount - consumed, 2),
                "message": f"Your intake of {rda.nutrient_name} is below the recommended level."
            })

    return deficiencies
