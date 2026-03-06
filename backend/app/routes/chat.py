from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.schemas.chat import ChatRequest
from app.database import get_db
from app.core.agent_router import route_message

router = APIRouter(prefix="/chat", tags=["Chatbot"])


@router.post("/")
def chat(request: ChatRequest, db: Session = Depends(get_db)):

    response = route_message(request.message, db)

    return {
        "response": response
    }