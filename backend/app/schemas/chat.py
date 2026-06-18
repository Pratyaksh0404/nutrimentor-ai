from typing import Any

from pydantic import BaseModel, Field


class AgentProfile(BaseModel):
    age: int | None = None
    sex: str | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    activity_level: str | None = None
    goal: str | None = None
    dietary_preference: str | None = None
    allergies: list[str] = Field(default_factory=list)
    health_cautions: list[str] = Field(default_factory=list)


class AgentContextItem(BaseModel):
    id: int
    name: str
    season: str | None = None


class AgentContext(BaseModel):
    current_item: AgentContextItem | None = None
    current_season: str | None = None
    consumed_items: list[dict[str, Any]] = Field(default_factory=list)
    profile: AgentProfile | None = None


class AgentMessageRequest(BaseModel):
    message: str
    session_id: str | None = None
    context: AgentContext | None = None


class AgentCard(BaseModel):
    type: str
    title: str
    body: str


class AgentMessageResponse(BaseModel):
    session_id: str
    message: str
    mode: str
    task_type: str
    agent_state: str
    used_profile: bool = False
    used_selected_item: bool = False
    citations: list[str] = Field(default_factory=list)
    cards: list[AgentCard] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)
    selected_item: AgentContextItem | None = None


class AgentContextSelectionRequest(BaseModel):
    session_id: str | None = None
    item: AgentContextItem | None = None


class AgentSessionSummary(BaseModel):
    session_id: str
    title: str
    updated_at: str
    message_count: int
    preview: str


class AgentSessionDetail(BaseModel):
    session_id: str
    title: str
    current_item: AgentContextItem | None = None
    profile: AgentProfile | None = None
    messages: list[dict[str, Any]] = Field(default_factory=list)
    created_at: str
    updated_at: str
