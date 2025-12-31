def detect_intent(message: str):
    message = message.lower()

    if "deficiency" in message or "lacking" in message:
        return "deficiency"
    if "eat" in message:
        return "suggestion"
    if "why" in message:
        return "explanation"
    if "season" in message:
        return "season"

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
