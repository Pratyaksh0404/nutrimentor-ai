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
