from app.core.nutrient_info import NUTRIENT_INFO


def generate_response(intent, data):
    if intent == "deficiency":
        return "Based on your diet, here are the nutrients you may be lacking."

    if intent == "suggestion":
        return "Here are some foods you can include to improve your nutrition."

    if intent == "explanation":
        nutrient = data.get("nutrient")
        info = NUTRIENT_INFO.get(nutrient)
        if info:
            return info["benefits"]
        return "This nutrient plays an important role in your health."

    return "I can help you analyze your diet and suggest improvements."
