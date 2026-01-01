def detect_intent(message: str):
    message = message.lower().strip()

    # 1️ Diet analysis (highest priority)
    if "analyze my diet" in message or "check my diet" in message:
        return "diet_analysis"

    # 2️ Food suggestions (specific)
    if (
        "what foods should i eat" in message
        or "what should i eat" in message
        or "food suggestions" in message
        or "suggest foods" in message
    ):
        return "food_suggestion"

    # 3️ Seasonal suggestions
    if "seasonal" in message or "season" in message:
        return "seasonal_suggestion"

    # 4️ Explanations
    if "why" in message:
        return "explanation"

    # 5️ Deficiency questions
    if "deficiency" in message or "lacking" in message:
        return "deficiency"

    if " vs " in message or "compare" in message:
        return "food_comparison"
    if "how often" in message or "how many times" in message:
        if context and "suggestions" in context.get("details", {}):
            return "food_suggestion"

    # 6️ Fallback
    return "general"


def extract_nutrient(message: str):
    message = message.lower()
    if "vitamin c" in message:
        return "Vitamin C"
    if "iron" in message:
        return "Iron"
    if "calcium" in message:
        return "Calcium"
    return None


def extract_foods(message: str):
    message = message.lower()

    if "apple" in message and "orange" in message:
        return "Apple", "Orange"
    if "banana" in message and "apple" in message:
        return "Banana", "Apple"

    return None, None
