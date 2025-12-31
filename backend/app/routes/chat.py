from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.schemas.chat import ChatRequest
from app.database import get_db
from app.core.chat_router import detect_intent, extract_nutrient
from app.core.chat_engine import generate_response, summarize_diet, respond_food_suggestions, respond_seasonal_suggestions
from app.core.diet_engine import analyze_diet_core

router = APIRouter(prefix="/chat", tags=["Chatbot"])


@router.post("/")
def chat(request: ChatRequest, db: Session = Depends(get_db)):
    intent = detect_intent(request.message)

    # Diet analysis intent
    if intent == "diet_analysis":
        consumed_items = (
            request.context.get("consumed_items", [])
            if request.context else []
        )

        if not consumed_items:
            return {
                "intent": intent,
                "response": "Please provide consumed_items in context to analyze your diet."
            }

        result = analyze_diet_core(consumed_items, db)
        summary = summarize_diet(result)

        return {
            "intent": intent,
            "response": summary["text"],
            "next_actions": summary["next_actions"],
            "details": result
        }

    # Food suggestion follow-up
    if intent == "food_suggestion":
        if not request.context or "details" not in request.context:
            return {
                "intent": intent,
                "response": "Please analyze your diet first so I can suggest foods."
            }

        response = respond_food_suggestions(request.context["details"])
        return {
            "intent": intent,
            "response": response
        }

    # Seasonal suggestion follow-up
    if intent == "seasonal_suggestion":
        if not request.context or "details" not in request.context:
            return {
                "intent": intent,
                "response": "Please analyze your diet first to see seasonal options."
            }

        response = respond_seasonal_suggestions(request.context["details"])
        return {
            "intent": intent,
            "response": response
        }

    # Explanation intent
    nutrient = extract_nutrient(request.message)
    context = {}
    if nutrient:
        context["nutrient"] = nutrient

    response = generate_response(intent, context)

    return {
        "intent": intent,
        "response": response
    }
