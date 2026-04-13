"""Pat routes — design doc §5 & §9.4."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.database import get_database
from app.models.schemas import PatQuota, PatRecord
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/pats", tags=["Pats"])

INITIAL_QUOTA = 3


@router.post("/{target_uuid}", status_code=201)
async def pat_user(target_uuid: str, user: dict = Depends(get_current_user)):
    """Pat someone. quota(A→B) = 3 + count(B→A) - count(A→B)."""
    db = get_database()
    from_uuid = user["uuid"]

    if from_uuid == target_uuid:
        raise HTTPException(status_code=400, detail="Cannot pat yourself")

    # Check target exists
    target = await db.users.find_one({"uuid": target_uuid})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Get current pat counts
    sent_doc = await db.pats.find_one({"from_uuid": from_uuid, "to_uuid": target_uuid})
    recv_doc = await db.pats.find_one({"from_uuid": target_uuid, "to_uuid": from_uuid})
    sent_count = sent_doc["count"] if sent_doc else 0
    recv_count = recv_doc["count"] if recv_doc else 0

    remaining = INITIAL_QUOTA + recv_count - sent_count
    if remaining <= 0:
        raise HTTPException(status_code=400, detail="No pat quota remaining — wait for them to pat you")

    now = datetime.now(timezone.utc)
    # Upsert pat record
    await db.pats.update_one(
        {"from_uuid": from_uuid, "to_uuid": target_uuid},
        {"$inc": {"count": 1}, "$set": {"last_pat_at": now}, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    # Increment target's total
    await db.users.update_one({"uuid": target_uuid}, {"$inc": {"total_pats_received": 1}})

    new_remaining = remaining - 1
    return {"message": f"Patted {target['nickname']}!", "remaining_quota": new_remaining}


@router.get("/received", response_model=list[PatRecord])
async def get_received_pats(user: dict = Depends(get_current_user)):
    """Who patted me — only visible to self."""
    db = get_database()
    cursor = db.pats.find({"to_uuid": user["uuid"], "count": {"$gt": 0}}).sort("last_pat_at", -1)
    records = []
    async for doc in cursor:
        from_user = await db.users.find_one({"uuid": doc["from_uuid"]})
        records.append(PatRecord(
            from_uuid=doc["from_uuid"],
            from_nickname=from_user["nickname"] if from_user else "Unknown",
            count=doc["count"],
            last_pat_at=doc.get("last_pat_at"),
        ))
    return records


@router.get("/quota/{target_uuid}", response_model=PatQuota)
async def get_quota(target_uuid: str, user: dict = Depends(get_current_user)):
    db = get_database()
    from_uuid = user["uuid"]
    sent_doc = await db.pats.find_one({"from_uuid": from_uuid, "to_uuid": target_uuid})
    recv_doc = await db.pats.find_one({"from_uuid": target_uuid, "to_uuid": from_uuid})
    sent = sent_doc["count"] if sent_doc else 0
    received = recv_doc["count"] if recv_doc else 0
    remaining = max(0, INITIAL_QUOTA + received - sent)
    return PatQuota(target_uuid=target_uuid, remaining=remaining, sent=sent, received_from_target=received)
