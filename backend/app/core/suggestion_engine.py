def suggest_foods_for_deficiency(nutrient_name, deficit, items):
    suggestions = []

    for item in items:
        for item_nutrient in item.nutrients:
            if item_nutrient.nutrient.name == nutrient_name:
                suggestions.append({
                    "food": item.name,
                    "season": item.season,
                    "nutrient_per_100g": item_nutrient.amount_per_100g,
                    "note": f"Good source of {nutrient_name}"
                })

    return suggestions[:5]
