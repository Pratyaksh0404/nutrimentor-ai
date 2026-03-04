from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.schemas.chat import ChatRequest
from app.database import get_db
from app.core.ai_agent import run_agent

router = APIRouter(prefix="/chat", tags=["Chatbot"])


@router.post("/")
def chat(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Main AI-powered chat endpoint.
    Uses Mistral 7B + RAG + Memory.
    """

    response = run_agent(
        message=request.message,
        context=request.context or {},
        db=db
    )

    return {
        "intent": "ai_response",
        "response": response
    }