"""Auth routes: register, login, token."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status

from app.database import get_database
from app.models.schemas import Token, UserLogin, UserRegister
from app.utils.auth import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister):
    db = get_database()

    # Check email uniqueness if provided
    if data.email:
        existing = await db.users.find_one({"email": data.email})
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered")

    user_uuid = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    user_doc = {
        "uuid": user_uuid,
        "nickname": data.nickname,
        "bio": data.bio,
        "contact": data.contact,
        "email": data.email,
        "hashed_password": hash_password(data.password) if data.password else None,
        "avatar_config": data.avatar_config,
        "avatar_url": data.avatar_url,
        "skill_offer": data.skill_offer,
        "skill_want": data.skill_want,
        "interests": data.interests,
        "personality": None,
        "total_pats_received": 0,
        "current_bar_id": None,
        "agent_did": None,
        "agent_bound": False,
        "created_at": now,
        "last_seen_at": now,
    }
    await db.users.insert_one(user_doc)

    token = create_access_token({"sub": user_uuid})
    return Token(access_token=token)


@router.post("/login", response_model=Token)
async def login(data: UserLogin):
    db = get_database()
    user = await db.users.find_one({"email": data.email})
    if not user or not user.get("hashed_password"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not verify_password(data.password, user["hashed_password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token({"sub": user["uuid"]})
    return Token(access_token=token)
