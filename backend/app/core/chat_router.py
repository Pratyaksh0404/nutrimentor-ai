def detect_intent(message: str):
    message = message.lower()

    if "deficiency" in message or "lacking" in message:
        return "deficiency"
    if "what should i eat" in message or "eat" in message:
        return "suggestion"
    if "why" in message:
        return "explanation"
    if "season" in message:
        return "season"

    return "general"
