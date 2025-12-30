def suggest_foods_for_deficiency(nutrient_name, deficit, items):
    suggestions = []

    for item in items:
        for nutrient in item.nutrients:
            if nutrient.name == nutrient_name:
                suggestions.append({
                    "food": item.name,
                    "season": item.season,
                    "nutrient_per_100g": nutrient.amount_per_100g,
                    "note": f"Good source of {nutrient_name}"
                })

    return suggestions[:5]
