"""User routes: me, update, view others."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.database import get_database
from app.models.schemas import UserOut, UserPublic, UserUpdate
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/users", tags=["Users"])


def _user_to_out(u: dict) -> UserOut:
    return UserOut(
        uuid=u["uuid"],
        nickname=u["nickname"],
        bio=u.get("bio", ""),
        contact=u.get("contact", {}),
        skill_offer=u.get("skill_offer", []),
        skill_want=u.get("skill_want", []),
        interests=u.get("interests", []),
        avatar_config=u.get("avatar_config", {}),
        avatar_url=u.get("avatar_url", ""),
        personality=u.get("personality"),
        mbti=u.get("mbti"),
        sbti=u.get("sbti"),
        total_pats_received=u.get("total_pats_received", 0),
        current_bar_id=u.get("current_bar_id"),
        agent_did=u.get("agent_did"),
        agent_bound=u.get("agent_bound", False),
        created_at=u.get("created_at"),
        last_seen_at=u.get("last_seen_at"),
    )


def _user_to_public(u: dict) -> UserPublic:
    return UserPublic(
        uuid=u["uuid"],
        nickname=u["nickname"],
        bio=u.get("bio", ""),
        skill_offer=u.get("skill_offer", []),
        skill_want=u.get("skill_want", []),
        interests=u.get("interests", []),
        avatar_url=u.get("avatar_url", ""),
        personality=u.get("personality"),
        mbti=u.get("mbti"),
        sbti=u.get("sbti"),
        total_pats_received=u.get("total_pats_received", 0),
        agent_bound=u.get("agent_bound", False),
    )


@router.get("/me", response_model=UserOut)
async def get_me(user: dict = Depends(get_current_user)):
    return _user_to_out(user)


@router.patch("/me", response_model=UserOut)
async def update_me(data: UserUpdate, user: dict = Depends(get_current_user)):
    db = get_database()
    update = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    if not update:
        return _user_to_out(user)

    update["last_seen_at"] = datetime.now(timezone.utc)
    await db.users.update_one({"uuid": user["uuid"]}, {"$set": update})
    updated = await db.users.find_one({"uuid": user["uuid"]})
    return _user_to_out(updated)


@router.get("/{uuid}", response_model=UserPublic)
async def get_user(uuid: str):
    db = get_database()
    user = await db.users.find_one({"uuid": uuid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_to_public(user)
