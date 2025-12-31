from fastapi import APIRouter
from app.schemas.chat import ChatRequest
from app.core.chat_router import detect_intent
from app.core.chat_engine import generate_response

router = APIRouter(prefix="/chat", tags=["Chatbot"])


@router.post("/")
def chat(request: ChatRequest):
    intent = detect_intent(request.message)
    response = generate_response(intent, request.context or {})
    return {
        "intent": intent,
        "response": response
    }
