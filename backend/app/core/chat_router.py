from app.ml.intent_classifier import predict_intent


CONFIDENCE_THRESHOLD = 0.65


def detect_intent(message: str):
    result = predict_intent(message)

    intent = result["intent"]
    confidence = result["confidence"]

    # Fallback safety
    if confidence < CONFIDENCE_THRESHOLD:
        intent = "general"

    return intent


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
