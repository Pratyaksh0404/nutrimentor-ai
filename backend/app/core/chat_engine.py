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
        "zinc",
        "protein",
        "fiber",
        "potassium",
    ]

    for nutrient in known_nutrients:
        if nutrient in message:
            return nutrient.title()

    return None


def generate_response(intent, data):
    context = data.get("context", {})
    message = data.get("message", "")
    db = data.get("db")

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
            "Seasonal fruits like mango in summer, orange in winter, "
            "and watermelon in summer are good options."
            + safety_note()
        )

    if intent == "food_comparison":
        words = message.lower().split()
        foods = []

        for word in words:
            item = db.query(Item).filter(Item.name.ilike(f"%{word}%")).first()
            if item:
                foods.append(item.name)

        if len(foods) >= 2:
            return compare_foods(foods[0], foods[1], db)

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
            "If you're feeling unwell, choose light and easy-to-digest foods like banana, "
            "rice, toast, curd, or soups. Stay hydrated and consult a doctor if symptoms persist."
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
        return "This nutrient plays an important role in maintaining good health."

    current_item = context.get("current_item")
    if current_item:
        lower_msg = message.lower()
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

        return f"{current_item['name']} is a nutritious choice." + safety_note()

    return (
        "I can help with food nutrition, diet planning, seasonal foods, "
        "and health guidance. What would you like to know?"
    )


def respond_food_suggestions(details):
    suggestions = details.get("suggestions", {})

    if not suggestions:
        return "I don't have enough information yet to suggest foods."

    response = "Here are some foods that may help improve your nutrient intake:\n"

    for nutrient, foods in suggestions.items():
        response += f"\nFor {nutrient}:\n"
        for food in foods:
            response += f"- {food['food']} ({food['nutrient_per_100g']} per 100g)\n"

    return response + safety_note()


def respond_seasonal_suggestions(details):
    suggestions = details.get("suggestions", {})

    if not suggestions:
        return "I don't have seasonal suggestions right now."

    response = "Here are some seasonal foods you can consider:\n"

    for nutrient, foods in suggestions.items():
        response += f"\nFor {nutrient}:\n"
        for food in foods:
            response += f"- {food['food']} (best during {food['season']})\n"

    return response + safety_note()


def deficiency_reassurance(nutrient):
    return (
        f"Mild {nutrient} deficiencies are common and can often be improved "
        "with balanced dietary choices."
    )


def safety_note():
    return (
        "\n\nNote: This guidance is based on general nutrition information "
        "and should not replace professional medical advice."
    )


def compare_foods(food1, food2, db, nutrient_name=None):
    item1 = db.query(Item).filter(Item.name.ilike(f"%{food1}%")).first()
    item2 = db.query(Item).filter(Item.name.ilike(f"%{food2}%")).first()

    if not item1 or not item2:
        return "I couldn't find enough data to compare these foods."

    def get_nutrient(item, nutrient):
        for nutrient_row in item.nutrients:
            if nutrient_row.nutrient.name.lower() == nutrient.lower():
                return nutrient_row.amount_per_100g
        return None

    key_nutrients = [
        "Protein",
        "Fiber",
        "Iron",
        "Magnesium",
    ]

    response = f"{item1.name} vs {item2.name} (per 100g)\n\n"

    for nutrient in key_nutrients:
        value_1 = get_nutrient(item1, nutrient)
        value_2 = get_nutrient(item2, nutrient)

        if value_1 is None and value_2 is None:
            continue

        response += (
            f"{nutrient}:\n"
            f"- {item1.name}: {value_1 if value_1 else 0}\n"
            f"- {item2.name}: {value_2 if value_2 else 0}\n\n"
        )

    return response.strip() + safety_note()
