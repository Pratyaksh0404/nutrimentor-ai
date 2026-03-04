from app.core.nutrient_info import NUTRIENT_INFO
from app.models.item import Item

def extract_nutrient_from_message(message: str):
    message = message.lower()

    known_nutrients = [
        "vitamin a",
        "vitamin b",
        "vitamin b12",
        "vitamin c",
        "vitamin d",
        "vitamin e",
        "iron",
        "calcium",
        "magnesium",
        "zinc"
    ]

    for nutrient in known_nutrients:
        if nutrient in message:
            return nutrient.title()

    return None


def generate_response(intent, data):
    context = data.get("context", {})
    message = data.get("message", "")

    if intent == "diet_analysis":
        if not context.get("consumed_items"):
            return "Please provide what you have eaten so I can analyze your diet."

        return "Analyzing your diet..."


    if intent == "food_suggestion":
        details = context.get("details", {})
        if details.get("suggestions"):
            return respond_food_suggestions(details)

        return (
            "You can include fruits like orange, banana, apple, or leafy vegetables "
            "to improve overall nutrition."
            + safety_note()
        )


    if intent == "seasonal_suggestion":
        details = context.get("details", {})
        if details.get("suggestions"):
            return respond_seasonal_suggestions(details)

        return (
            "Seasonal fruits like mango (summer), orange (winter), "
            "and watermelon (summer) are good options."
            + safety_note()
        )


    if intent == "food_comparison":
        from app.core.chat_router import extract_foods

        food1, food2 = extract_foods(message)
        if food1 and food2:
            db = data.get("db")
            return compare_foods(food1, food2, db)

        return "Please mention two foods you would like me to compare."


    if intent == "deficiency":
        deficiencies = context.get("details", {}).get("deficiencies", [])

        if deficiencies:
            nutrient = deficiencies[0].get("nutrient", "this nutrient")
            return (
                f"You may be low in {nutrient}. "
                + deficiency_reassurance(nutrient)
                + safety_note()
            )

        nutrient = extract_nutrient_from_message(message)
        if nutrient:
            return (
                f"If you suspect low {nutrient}, including nutrient-rich foods "
                f"can help gradually improve levels."
                + safety_note()
            )

        return "Deficiencies can often be improved with a balanced diet."


    if intent == "medical_concern":
        return (
            "If you're feeling unwell, light and easy-to-digest foods like banana, "
            "rice, toast, and soups may help. Stay hydrated and consult a doctor "
            "if symptoms persist."
            + safety_note()
        )


    if intent == "goal_based_advice":
        return (
            "For your health goal, include balanced meals with fruits, vegetables, "
            "protein sources, and adequate hydration."
            + safety_note()
        )


    if intent == "explanation":
        nutrient = extract_nutrient_from_message(message)
        if nutrient:
            info = NUTRIENT_INFO.get(nutrient)
            if info:
                return info["benefits"]

        return "This nutrient plays an important role in your health."

    current_item = context.get("current_item")

    if current_item:
        lower_msg = message.lower()

        if any(word in lower_msg for word in ["this", "it", "this one", "this fruit"]):
            nutrient = extract_nutrient_from_message(message)

            if nutrient:
                return (
                    f"{current_item['name']} contains {nutrient}, which supports important body functions."
                    + safety_note()
                )

            if "immunity" in lower_msg:
                return (
                    f"{current_item['name']} can support immunity, especially if it contains Vitamin C or antioxidants."
                    + safety_note()
                )

            if "nutrient" in lower_msg:
                return (
                    f"{current_item['name']} provides essential vitamins and minerals beneficial for health."
                    + safety_note()
                )

            return (
                f"{current_item['name']} is a nutritious choice. "
                "Tell me your health goal and I can guide you better."
                + safety_note()
            )

    return "Hello! I can help with diet analysis, food comparisons, seasonal suggestions, and health guidance."


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

    def get_nutrient_amount(item, nutrient):
        for item_nutrient in item.nutrients:
            if item_nutrient.nutrient.name.lower() == nutrient.lower():
                return item_nutrient.amount_per_100g
        return 0

    nutrient = nutrient_name or "Vitamin C"

    v1 = get_nutrient_amount(item1, nutrient)
    v2 = get_nutrient_amount(item2, nutrient)

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
