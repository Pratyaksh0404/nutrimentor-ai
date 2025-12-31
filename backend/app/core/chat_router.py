def detect_intent(message: str):
    message_lower = message.lower().strip()

    # 1️ Diet analysis (highest priority)
    if "analyze my diet" in message_lower or "check my diet" in message_lower:
        return "diet_analysis"

    # 2️ Food suggestions (specific)
    if (
        "what foods should i eat" in message_lower
        or "what should i eat" in message_lower
        or "food suggestions" in message_lower
        or "suggest foods" in message_lower
    ):
        return "food_suggestion"

    # 3️ Seasonal suggestions
    if "seasonal" in message_lower or "season" in message_lower:
        return "seasonal_suggestion"

    # 4️ Explanations
    if "why" in message_lower:
        return "explanation"

    # 5️ Deficiency questions
    if "deficiency" in message_lower or "lacking" in message_lower:
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
