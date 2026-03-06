from app.core.preprocessor import clean_text, is_garbage
from app.core.entity_detector import detect_food_entities
from app.core.memory_store import add_to_history, get_recent_history
from app.ml.intent_classifier import predict_intent
from app.core.llm_engine import generate_response
from app.core.chat_engine import compare_foods
from app.core.tools import get_nutrients_for_item
from app.models.item import Item


def route_message(message: str, db):

    # -----------------------------
    # Step 1: Preprocess input
    # -----------------------------
    cleaned_message = clean_text(message)

    if is_garbage(cleaned_message):
        return "I couldn't understand that. Could you ask a nutrition-related question?"

    # -----------------------------
    # Step 2: Greeting detection
    # -----------------------------
    greetings = ["hi", "hello", "hey", "yo"]

    if cleaned_message in greetings:
        return "Hello! I am NutriMentor AI. How can I help you with your nutrition today?"
    # Common conversational replies
    if cleaned_message in ["thanks", "thank you", "thx"]:
        return "You're welcome! Let me know if you need any nutrition advice."

    if cleaned_message in ["bye", "bye bye", "goodbye", "see you"]:
        return "Goodbye! Stay healthy."

    if cleaned_message in ["help", "what can you do"]:
        return "I can help with nutrition advice, food comparisons, diet analysis, and nutrient information."
    # -----------------------------
    # Step 3: Identity questions
    # -----------------------------
    if "who are you" in cleaned_message:
        return "I am NutriMentor AI, your AI-powered nutrition mentor."

    # -----------------------------
    # Step 4: Detect foods
    # -----------------------------
    foods = detect_food_entities(cleaned_message, db)

    # -----------------------------
    # Step 5: Food comparison
    # -----------------------------
    if len(foods) == 2:
        return compare_foods(foods[0].name, foods[1].name, db)

    # -----------------------------
    # Step 6: Nutrient lookup
    # -----------------------------
    if len(foods) == 1:

        nutrients = get_nutrients_for_item(foods[0].id, db)

        if nutrients:
            response = f"{foods[0].name} nutrients per 100g:\n"
            response += f"Calories: {foods[0].calories_per_100g}\n"

            for n in nutrients:
                response += f"- {n['name']}: {n['amount']} {n['unit']}\n"

            return response.strip()

    # -----------------------------
    # Step 7: Intent classification
    # -----------------------------
    prediction = predict_intent(cleaned_message)

    intent = prediction["intent"]

    # -----------------------------
    # Step 8: Advice queries
    # -----------------------------
    if intent in [
        "food_suggestion",
        "goal_based_advice",
        "medical_concern",
        "explanation",
        "deficiency",
        "general"
    ]:

        history = get_recent_history()

        response = generate_response(cleaned_message, history)

        add_to_history(cleaned_message, response)

        return response

    # -----------------------------
    # Step 9: Fallback
    # -----------------------------
    return "I can help with nutrition and food-related questions."