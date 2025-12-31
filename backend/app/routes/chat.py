from fastapi import APIRouter
from app.schemas.chat import ChatRequest
from app.core.chat_router import detect_intent, extract_nutrient
from app.core.chat_engine import generate_response

router = APIRouter(prefix="/chat", tags=["Chatbot"])


@router.post("/")
def chat(request: ChatRequest):
    intent = detect_intent(request.message)
    nutrient = extract_nutrient(request.message)

    context = {}
    if nutrient:
        context["nutrient"] = nutrient

    response = generate_response(intent, context)

    return {
        "intent": intent,
        "response": response
    }
