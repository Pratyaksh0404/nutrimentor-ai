from app.models.item import Item
from app.models.rda import RDA
from app.core.nutrition_engine import compute_deficiencies
from app.core.suggestion_engine import suggest_foods_for_deficiency


def analyze_diet_core(consumed_items, db):
    consumed_totals = {}

    for consumed in consumed_items:
        item = db.query(Item).filter(Item.id == consumed["item_id"]).first()
        if not item:
            continue

        for nutrient in item.nutrients:
            amount = nutrient.amount_per_100g * consumed["quantity_in_grams"] / 100
            consumed_totals[nutrient.name] = (
                consumed_totals.get(nutrient.name, 0) + amount
            )

    rda_values = db.query(RDA).all()
    deficiencies = compute_deficiencies(consumed_totals, rda_values)

    suggestions = {}
    all_items = db.query(Item).all()

    for d in deficiencies:
        nutrient = d["nutrient"]
        suggestions[nutrient] = suggest_foods_for_deficiency(
            nutrient,
            d["deficit"],
            all_items
        )

    return {
        "consumed_nutrients": consumed_totals,
        "deficiencies": deficiencies,
        "suggestions": suggestions
    }
