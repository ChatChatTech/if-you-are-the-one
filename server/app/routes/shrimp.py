"""Shrimp / Lobster Pool routes — design doc §6 & §9.5.

Agent endpoints use DID in X-Agent-DID header (simplified; production would verify Ed25519 signature).
"""

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, Header, HTTPException, Query

from app.database import get_database
from app.models.schemas import (
    AgentLogOut, PinchOut, ShrimpBarCreate, ShrimpBarOut, ShrimpBind, ShrimpMessageCreate,
)
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/shrimp", tags=["Shrimp / Lobster Pool"])


async def _get_agent_did(x_agent_did: str = Header(...)) -> str:
    """Extract agent DID from header. In production, verify Ed25519 signature."""
    if not x_agent_did.startswith("did:"):
        raise HTTPException(status_code=400, detail="Invalid DID format")
    return x_agent_did


def _bar_to_out(doc: dict) -> ShrimpBarOut:
    return ShrimpBarOut(
        id=str(doc["_id"]),
        topic=doc["topic"],
        description=doc.get("description", ""),
        created_by_did=doc["created_by_did"],
        status=doc["status"],
        current_agents=doc.get("current_agents", []),
        message_count=doc.get("message_count", 0),
        created_at=doc.get("created_at"),
    )


# ── Bind agent to user ──

@router.post("/bind")
async def bind_agent(data: ShrimpBind):
    db = get_database()
    user = await db.users.find_one({"uuid": data.owner_uuid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check DID not already bound to another user
    existing = await db.users.find_one({"agent_did": data.agent_did, "uuid": {"$ne": data.owner_uuid}})
    if existing:
        raise HTTPException(status_code=409, detail="DID already bound to another user")

    await db.users.update_one(
        {"uuid": data.owner_uuid},
        {"$set": {"agent_did": data.agent_did, "agent_bound": True}},
    )
    return {"message": "Agent bound", "owner_uuid": data.owner_uuid, "agent_did": data.agent_did}


# ── Lobster pool bars ──

@router.get("/bars", response_model=list[ShrimpBarOut])
async def list_shrimp_bars(agent_did: str = Depends(_get_agent_did)):
    db = get_database()
    cursor = db.shrimp_bars.find({"status": "active"}).sort("created_at", -1)
    return [_bar_to_out(doc) async for doc in cursor]


@router.post("/bars", response_model=ShrimpBarOut, status_code=201)
async def create_shrimp_bar(data: ShrimpBarCreate, agent_did: str = Depends(_get_agent_did)):
    db = get_database()
    now = datetime.now(timezone.utc)
    doc = {
        "topic": data.topic,
        "description": data.description,
        "created_by_did": agent_did,
        "status": "active",
        "current_agents": [agent_did],
        "message_count": 0,
        "created_at": now,
    }
    result = await db.shrimp_bars.insert_one(doc)
    doc["_id"] = result.inserted_id

    await _log_action(db, agent_did, "create_bar", {"bar_id": str(result.inserted_id), "bar_topic": data.topic})
    return _bar_to_out(doc)


@router.post("/bars/{bar_id}/join")
async def join_shrimp_bar(bar_id: str, agent_did: str = Depends(_get_agent_did)):
    db = get_database()
    bar = await db.shrimp_bars.find_one({"_id": ObjectId(bar_id)})
    if not bar:
        raise HTTPException(status_code=404, detail="Bar not found")

    await db.shrimp_bars.update_one(
        {"_id": ObjectId(bar_id)},
        {"$addToSet": {"current_agents": agent_did}},
    )
    await _log_action(db, agent_did, "join_bar", {"bar_id": bar_id, "bar_topic": bar["topic"]})
    return {"message": "Joined", "bar_id": bar_id}


@router.post("/bars/{bar_id}/leave")
async def leave_shrimp_bar(bar_id: str, agent_did: str = Depends(_get_agent_did)):
    db = get_database()
    bar = await db.shrimp_bars.find_one({"_id": ObjectId(bar_id)})
    if not bar:
        raise HTTPException(status_code=404, detail="Bar not found")

    await db.shrimp_bars.update_one(
        {"_id": ObjectId(bar_id)},
        {"$pull": {"current_agents": agent_did}},
    )
    await _log_action(db, agent_did, "leave_bar", {"bar_id": bar_id, "bar_topic": bar["topic"]})
    return {"message": "Left", "bar_id": bar_id}


@router.post("/bars/{bar_id}/speak", status_code=201)
async def speak_in_shrimp_bar(
    bar_id: str, data: ShrimpMessageCreate, agent_did: str = Depends(_get_agent_did),
):
    db = get_database()
    bar = await db.shrimp_bars.find_one({"_id": ObjectId(bar_id)})
    if not bar:
        raise HTTPException(status_code=404, detail="Bar not found")
    if agent_did not in bar.get("current_agents", []):
        raise HTTPException(status_code=403, detail="Agent not in this bar")

    # Resolve alias
    owner = await db.users.find_one({"agent_did": agent_did})
    alias = f"{owner['nickname']}的龙虾" if owner else agent_did

    now = datetime.now(timezone.utc)
    msg_doc = {
        "bar_id": ObjectId(bar_id),
        "agent_did": agent_did,
        "agent_alias": alias,
        "content": data.content,
        "created_at": now,
    }
    await db.shrimp_messages.insert_one(msg_doc)
    await db.shrimp_bars.update_one({"_id": ObjectId(bar_id)}, {"$inc": {"message_count": 1}})

    await _log_action(db, agent_did, "speak", {
        "bar_id": bar_id, "bar_topic": bar["topic"], "message": data.content[:100],
    })
    return {"message": "Sent"}


# ── Pinch ──

@router.post("/pinch", status_code=201)
async def pinch_agent(
    target_did: str = Query(...),
    agent_did: str = Depends(_get_agent_did),
):
    db = get_database()
    if agent_did == target_did:
        raise HTTPException(status_code=400, detail="Cannot pinch yourself")

    # Resolve owners
    from_owner = await db.users.find_one({"agent_did": agent_did})
    to_owner = await db.users.find_one({"agent_did": target_did})

    now = datetime.now(timezone.utc)
    await db.pinches.update_one(
        {"from_did": agent_did, "to_did": target_did},
        {
            "$inc": {"count": 1},
            "$set": {
                "last_pinch_at": now,
                "from_owner_uuid": from_owner["uuid"] if from_owner else "",
                "to_owner_uuid": to_owner["uuid"] if to_owner else "",
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )

    await _log_action(db, agent_did, "pinch", {
        "target_did": target_did,
        "target_owner_nickname": to_owner["nickname"] if to_owner else "unknown",
    })
    return {"message": "Pinched!"}


@router.get("/pinches/{did}", response_model=list[PinchOut])
async def get_pinches(did: str, agent_did: str = Depends(_get_agent_did)):
    db = get_database()
    cursor = db.pinches.find({"$or": [{"from_did": did}, {"to_did": did}]}).sort("last_pinch_at", -1)
    results = []
    async for doc in cursor:
        results.append(PinchOut(
            from_did=doc["from_did"],
            to_did=doc["to_did"],
            from_owner_uuid=doc.get("from_owner_uuid", ""),
            to_owner_uuid=doc.get("to_owner_uuid", ""),
            count=doc["count"],
            last_pinch_at=doc.get("last_pinch_at"),
        ))
    return results


# ── Agent logs ──

@router.get("/log/{owner_uuid}", response_model=list[AgentLogOut])
async def get_agent_logs(
    owner_uuid: str,
    limit: int = Query(50, le=200),
    user: dict = Depends(get_current_user),
):
    if user["uuid"] != owner_uuid:
        raise HTTPException(status_code=403, detail="Can only view your own agent's logs")

    db = get_database()
    cursor = db.agent_logs.find({"owner_uuid": owner_uuid}).sort("created_at", -1).limit(limit)
    return [AgentLogOut(
        agent_did=doc["agent_did"],
        action=doc["action"],
        detail=doc.get("detail", {}),
        created_at=doc.get("created_at"),
    ) async for doc in cursor]


# ── Helpers ──

async def _log_action(db, agent_did: str, action: str, detail: dict):
    owner = await db.users.find_one({"agent_did": agent_did})
    await db.agent_logs.insert_one({
        "agent_did": agent_did,
        "owner_uuid": owner["uuid"] if owner else "",
        "action": action,
        "detail": detail,
        "created_at": datetime.now(timezone.utc),
    })
