from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.schemas.chat import ChatRequest
from app.database import get_db
from app.core.chat_router import detect_intent, extract_nutrient
from app.core.chat_engine import generate_response, summarize_diet
from app.core.diet_engine import analyze_diet_core

router = APIRouter(prefix="/chat", tags=["Chatbot"])


@router.post("/")
def chat(request: ChatRequest, db: Session = Depends(get_db)):
    intent = detect_intent(request.message)

    # 👉 Diet analysis intent
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

    # 👉 Explanation intent
    nutrient = extract_nutrient(request.message)
    context = {}
    if nutrient:
        context["nutrient"] = nutrient

    response = generate_response(intent, context)

    return {
        "intent": intent,
        "response": response
    }
