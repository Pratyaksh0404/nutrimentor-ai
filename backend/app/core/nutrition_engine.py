from collections import defaultdict


def compute_consumed_nutrients(consumed_items, db):
    """
    Returns total nutrients consumed from given items.
    """
    total_nutrients = defaultdict(float)

    for entry in consumed_items:
        item = db.query(type(entry["item"])).get(entry["item_id"])
        for nutrient in item.nutrients:
            # Scale nutrient by quantity eaten
            scaled_amount = (
                nutrient.amount_per_100g * entry["quantity_in_grams"] / 100
            )
            total_nutrients[nutrient.name] += scaled_amount

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
