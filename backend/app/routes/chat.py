from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.agent_router import route_message
from app.core.memory_store import (
    add_message,
    clear_current_item,
    ensure_session,
    get_session,
    list_sessions,
    save_profile,
    set_current_item,
)
from app.database import get_db
from app.models.item import Item
from app.schemas.chat import (
    AgentContextSelectionRequest,
    AgentMessageRequest,
    AgentMessageResponse,
    AgentSessionDetail,
    AgentSessionSummary,
)

router = APIRouter(prefix="/agent", tags=["Agent"])
legacy_router = APIRouter(prefix="/chat", tags=["Chatbot"])


@router.post("/message", response_model=AgentMessageResponse)
def agent_message(request: AgentMessageRequest, db: Session = Depends(get_db)):
    session = ensure_session(request.session_id)
    session_id = session["session_id"]
    request_context = request.context.model_dump() if request.context else {}

    if request_context.get("profile"):
        save_profile(session_id, request_context["profile"])

    selected_item = request_context.get("current_item")
    if selected_item:
        set_current_item(session_id, selected_item)
    else:
        current_item = get_session(session_id).get("current_item")
        if current_item:
            request_context["current_item"] = current_item

    profile = get_session(session_id).get("profile")
    if profile and not request_context.get("profile"):
        request_context["profile"] = profile

    add_message(session_id, "user", request.message, {"context": request_context})
    response = route_message(
        request.message,
        db,
        session_id=session_id,
        context=request_context,
    )
    add_message(
        session_id,
        "assistant",
        response["message"],
        {
            "task_type": response["task_type"],
            "mode": response["mode"],
        },
    )
    return response


@router.post("/context/select")
def select_context(request: AgentContextSelectionRequest, db: Session = Depends(get_db)):
    session = ensure_session(request.session_id)
    if not request.item:
        raise HTTPException(status_code=400, detail="item is required")

    item = db.query(Item).filter(Item.id == request.item.id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    session = set_current_item(
        session["session_id"],
        {
            "id": item.id,
            "name": item.name,
            "season": item.season,
        },
    )
    return {
        "session_id": session["session_id"],
        "selected_item": session["current_item"],
    }


@router.post("/context/clear")
def clear_context(request: AgentContextSelectionRequest):
    session = ensure_session(request.session_id)
    session = clear_current_item(session["session_id"])
    return {
        "session_id": session["session_id"],
        "selected_item": None,
    }


@router.get("/sessions", response_model=list[AgentSessionSummary])
def get_sessions():
    return list_sessions()


@router.get("/sessions/{session_id}", response_model=AgentSessionDetail)
def get_session_detail(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@legacy_router.post("/")
def legacy_chat(request: AgentMessageRequest, db: Session = Depends(get_db)):
    response = agent_message(request, db)
    return {
        "response": response["message"],
        "session_id": response["session_id"],
        "task_type": response["task_type"],
    }
