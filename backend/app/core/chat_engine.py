from app.core.nutrient_info import NUTRIENT_INFO
from app.models.item import Item


def generate_response(intent, data):
    if intent == "deficiency":
        deficiencies = data.get("details", {}).get("deficiencies", [])

        if not deficiencies:
            return "Your diet does not show any major nutrient deficiencies."

        nutrient = deficiencies[0].get("nutrient", "this nutrient")

        response = (
                f"Based on your diet, you may be low in {nutrient}. "
                + deficiency_reassurance(nutrient)
        )

        return response + safety_note()

    if intent == "suggestion":
        return "Here are some foods you can include to improve your nutrition."

    if intent == "explanation":
        nutrient = data.get("nutrient")
        info = NUTRIENT_INFO.get(nutrient)
        if info:
            return info["benefits"]
        return "This nutrient plays an important role in your health."

    return "I can help you analyze your diet and suggest improvements."


def summarize_diet(result):
    deficiencies = result["deficiencies"]

    if not deficiencies:
        return {
            "text": "Great news! Your diet looks well-balanced. Keep up the good work",
            "next_actions": []
        }

    text = "I’ve looked at your diet, and here’s what I found 👇\n\n"
    text += "You may be low on the following nutrients:\n"

    for d in deficiencies:
        text += (
            f"- {d['nutrient']} "
            f"(about {d['deficit']} {d['unit']} below the recommended level)\n"
        )

    text += "\nDon’t worry — this is quite common and can be improved with the right food choices"

    next_actions = [
        "What foods should I eat?",
        "Why is this nutrient important?",
        "Show seasonal food options"
    ]

    return {
        "text": text + safety_note(),
        "next_actions": next_actions
    }


def respond_food_suggestions(details):
    suggestions = details.get("suggestions", {})

    if not suggestions:
        return "I don’t have enough information yet to suggest foods. Try analyzing your diet first."

    response = "Here are some foods you can include to help improve your nutrient intake 🥗:\n"

    for nutrient, foods in suggestions.items():
        response += f"\nFor {nutrient}:\n"
        for f in foods:
            response += (
                f"- {f['food']} "
                f"(around {f['nutrient_per_100g']} per 100g)\n"
            )

    response += "\nIncluding one or more of these regularly can help reduce the gap"

    nutrients = list(suggestions.keys())
    if nutrients:
        response += habit_hint(nutrients[0])

    return response + safety_note()


def respond_seasonal_suggestions(details):
    suggestions = details.get("suggestions", {})

    if not suggestions:
        return "I don’t have seasonal suggestions right now. Try analyzing your diet first."

    response = "Seasonal foods are often fresher and easier to include. Here are some good options:\n"

    for nutrient, foods in suggestions.items():
        response += f"\nFor {nutrient}:\n"
        for f in foods:
            response += f"- {f['food']} (best during {f['season']})\n"

    nutrients = list(suggestions.keys())
    if nutrients:
        response += habit_hint(nutrients[0])

    return response + safety_note()


def deficiency_reassurance(nutrient):
    return (
        f"Mild {nutrient} deficiencies are quite common and usually improve "
        "gradually with consistent dietary choices."
    )


def safety_note():
    return (
        "\n\nℹ️ This guidance is based on general nutrition recommendations "
        "and is not a medical diagnosis. For specific health concerns, "
        "consider consulting a qualified healthcare professional."
    )


def habit_hint(nutrient):
    return (
        f"\n\n💡 Tip: Including at least one serving of foods rich in {nutrient} "
        "a few times a week can gradually help improve your intake."
    )


def compare_foods(food1, food2, db, nutrient_name=None):
    item1 = db.query(Item).filter(Item.name.ilike(f"%{food1}%")).first()
    item2 = db.query(Item).filter(Item.name.ilike(f"%{food2}%")).first()

    if not item1 or not item2:
        return "I couldn’t find enough data to compare these foods."

    def get_nutrient(item, nutrient):
        for n in item.nutrients:
            if n.name == nutrient:
                return n.amount_per_100g
        return 0

    nutrient = nutrient_name or "Vitamin C"

    v1 = get_nutrient(item1, nutrient)
    v2 = get_nutrient(item2, nutrient)

    if v1 == 0 and v2 == 0:
        return f"I don’t have {nutrient} data for these foods yet."

    better = food1 if v1 > v2 else food2

    response = (
        f"When comparing {food1} and {food2} for {nutrient}:\n"
        f"- {food1}: {v1} per 100g\n"
        f"- {food2}: {v2} per 100g\n\n"
        f"{better} provides more {nutrient} per 100g."
    )

    return response + safety_note()
