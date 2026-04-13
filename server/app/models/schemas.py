"""Pydantic schemas for Agent://Night — aligned with design doc §8."""

from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


# ── Auth ──

class UserRegister(BaseModel):
    nickname: str = Field(..., min_length=1, max_length=30)
    bio: str = Field("", max_length=200)
    contact: dict[str, str] = Field(default_factory=dict)
    skill_offer: list[str] = Field(default_factory=list)
    skill_want: list[str] = Field(default_factory=list)
    interests: list[str] = Field(default_factory=list)
    avatar_config: dict[str, Any] = Field(default_factory=dict)
    avatar_url: str = ""
    email: Optional[str] = None
    password: Optional[str] = None


class UserLogin(BaseModel):
    email: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── User ──

class PersonalityResult(BaseModel):
    test_type: str  # "mbti" | "sbti"
    result: str  # e.g. "ENFP" or "GOGO"
    result_cn: str = ""
    sbti_dimensions: Optional[dict[str, str]] = None  # e.g. {"S1": "H", "S2": "M", ...}


class UserOut(BaseModel):
    uuid: str
    nickname: str
    bio: str = ""
    contact: dict[str, str] = Field(default_factory=dict)
    skill_offer: list[str] = Field(default_factory=list)
    skill_want: list[str] = Field(default_factory=list)
    interests: list[str] = Field(default_factory=list)
    avatar_config: dict[str, Any] = Field(default_factory=dict)
    avatar_url: str = ""
    personality: Optional[PersonalityResult] = None
    mbti: Optional[PersonalityResult] = None
    sbti: Optional[PersonalityResult] = None
    total_pats_received: int = 0
    current_bar_id: Optional[str] = None
    agent_did: Optional[str] = None
    agent_bound: bool = False
    created_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None


class UserPublic(BaseModel):
    """What others see — no pat details, no contact details."""
    uuid: str
    nickname: str
    bio: str = ""
    skill_offer: list[str] = Field(default_factory=list)
    skill_want: list[str] = Field(default_factory=list)
    interests: list[str] = Field(default_factory=list)
    avatar_url: str = ""
    personality: Optional[PersonalityResult] = None
    mbti: Optional[PersonalityResult] = None
    sbti: Optional[PersonalityResult] = None
    total_pats_received: int = 0
    agent_bound: bool = False


class UserUpdate(BaseModel):
    nickname: Optional[str] = None
    bio: Optional[str] = None
    contact: Optional[dict[str, str]] = None
    skill_offer: Optional[list[str]] = None
    skill_want: Optional[list[str]] = None
    interests: Optional[list[str]] = None
    avatar_config: Optional[dict[str, Any]] = None
    avatar_url: Optional[str] = None


# ── Personality ──

class PersonalitySubmit(BaseModel):
    test_type: str  # "mbti" | "sbti"
    answers: dict[str, Any]  # question_id -> answer value


# ── Bar ──

class BarCreate(BaseModel):
    topic: str = Field(..., min_length=1, max_length=60)
    description: str = Field("", max_length=200)


class BarOut(BaseModel):
    id: str
    topic: str
    description: str = ""
    created_by: str
    status: str  # active | cooling | sealed
    current_users: list[str] = Field(default_factory=list)
    max_seats: int = 12
    message_count: int = 0
    cooling_since: Optional[datetime] = None
    sealed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


class MessageOut(BaseModel):
    id: str
    bar_id: str
    user_uuid: str
    nickname: str
    avatar_url: str = ""
    content: str
    created_at: Optional[datetime] = None


class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


# ── Pat ──

class PatRecord(BaseModel):
    from_uuid: str
    from_nickname: str
    count: int
    last_pat_at: Optional[datetime] = None


class PatQuota(BaseModel):
    target_uuid: str
    remaining: int
    sent: int
    received_from_target: int


# ── Shrimp / Lobster Pool ──

class ShrimpBind(BaseModel):
    owner_uuid: str
    agent_did: str


class ShrimpBarCreate(BaseModel):
    topic: str = Field(..., min_length=1, max_length=60)
    description: str = Field("", max_length=200)


class ShrimpBarOut(BaseModel):
    id: str
    topic: str
    description: str = ""
    created_by_did: str
    status: str
    current_agents: list[str] = Field(default_factory=list)
    message_count: int = 0
    created_at: Optional[datetime] = None


class ShrimpMessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


class PinchOut(BaseModel):
    from_did: str
    to_did: str
    from_owner_uuid: str
    to_owner_uuid: str
    count: int
    last_pinch_at: Optional[datetime] = None


class AgentLogOut(BaseModel):
    agent_did: str
    action: str
    detail: dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None
