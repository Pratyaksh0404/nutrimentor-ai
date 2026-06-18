from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from typing import Any
from uuid import uuid4


agent_memory: dict[str, Any] = {
    "sessions": {},
    "order": [],
}


def _utc_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def create_session() -> dict[str, Any]:
    session_id = uuid4().hex
    session = {
        "session_id": session_id,
        "title": "New nutrition session",
        "messages": [],
        "current_item": None,
        "profile": None,
        "created_at": _utc_now(),
        "updated_at": _utc_now(),
    }
    agent_memory["sessions"][session_id] = session
    agent_memory["order"].insert(0, session_id)
    return deepcopy(session)


def ensure_session(session_id: str | None = None) -> dict[str, Any]:
    if session_id and session_id in agent_memory["sessions"]:
        return agent_memory["sessions"][session_id]
    return agent_memory["sessions"][create_session()["session_id"]]


def get_session(session_id: str | None) -> dict[str, Any] | None:
    if not session_id:
        return None
    session = agent_memory["sessions"].get(session_id)
    return deepcopy(session) if session else None


def list_sessions() -> list[dict[str, Any]]:
    summaries: list[dict[str, Any]] = []
    for session_id in agent_memory["order"]:
        session = agent_memory["sessions"][session_id]
        last_message = next(
            (message for message in reversed(session["messages"]) if message["role"] == "user"),
            None,
        )
        summaries.append(
            {
                "session_id": session_id,
                "title": session["title"],
                "updated_at": session["updated_at"],
                "message_count": len(session["messages"]),
                "preview": last_message["content"] if last_message else "No messages yet",
            }
        )
    return summaries


def save_profile(session_id: str, profile: dict[str, Any] | None) -> dict[str, Any]:
    session = ensure_session(session_id)
    session["profile"] = deepcopy(profile) if profile else None
    session["updated_at"] = _utc_now()
    return deepcopy(session)


def set_current_item(session_id: str, current_item: dict[str, Any] | None) -> dict[str, Any]:
    session = ensure_session(session_id)
    session["current_item"] = deepcopy(current_item) if current_item else None
    session["updated_at"] = _utc_now()
    return deepcopy(session)


def clear_current_item(session_id: str) -> dict[str, Any]:
    return set_current_item(session_id, None)


def add_message(
    session_id: str,
    role: str,
    content: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    session = ensure_session(session_id)
    session["messages"].append(
        {
            "role": role,
            "content": content,
            "metadata": deepcopy(metadata) if metadata else {},
            "created_at": _utc_now(),
        }
    )
    if role == "user" and content:
        session["title"] = content[:48]
    session["updated_at"] = _utc_now()
    return deepcopy(session)
