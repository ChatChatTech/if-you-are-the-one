"""Bar routes + WebSocket real-time chat — design doc §9.3 & §10."""

from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect

from app.database import get_database
from app.models.schemas import BarCreate, BarOut, MessageCreate, MessageOut
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/bars", tags=["Bars"])

# ── WebSocket connection manager ──
_bar_connections: dict[str, list[WebSocket]] = {}


def _bar_doc_to_out(doc: dict) -> BarOut:
    return BarOut(
        id=str(doc["_id"]),
        topic=doc["topic"],
        description=doc.get("description", ""),
        created_by=doc["created_by"],
        status=doc["status"],
        current_users=doc.get("current_users", []),
        max_seats=doc.get("max_seats", 12),
        message_count=doc.get("message_count", 0),
        cooling_since=doc.get("cooling_since"),
        sealed_at=doc.get("sealed_at"),
        created_at=doc.get("created_at"),
    )


def _msg_doc_to_out(doc: dict) -> MessageOut:
    return MessageOut(
        id=str(doc["_id"]),
        bar_id=str(doc["bar_id"]),
        user_uuid=doc["user_uuid"],
        nickname=doc["nickname"],
        avatar_url=doc.get("avatar_url", ""),
        content=doc["content"],
        created_at=doc.get("created_at"),
    )


# ── REST endpoints ──

@router.get("", response_model=list[BarOut])
async def list_bars(
    status_filter: Optional[str] = Query(None, alias="status"),
):
    db = get_database()
    query: dict = {}
    if status_filter:
        query["status"] = status_filter
    cursor = db.bars.find(query).sort("created_at", -1)
    return [_bar_doc_to_out(doc) async for doc in cursor]


@router.post("", response_model=BarOut, status_code=201)
async def create_bar(data: BarCreate, user: dict = Depends(get_current_user)):
    db = get_database()
    now = datetime.now(timezone.utc)
    doc = {
        "topic": data.topic,
        "description": data.description,
        "created_by": user["uuid"],
        "status": "active",
        "current_users": [user["uuid"]],
        "max_seats": 12,
        "message_count": 0,
        "cooling_since": None,
        "sealed_at": None,
        "created_at": now,
        "updated_at": now,
    }
    # Leave current bar first
    await _leave_current_bar(db, user["uuid"])
    result = await db.bars.insert_one(doc)
    doc["_id"] = result.inserted_id
    await db.users.update_one({"uuid": user["uuid"]}, {"$set": {"current_bar_id": str(result.inserted_id)}})
    return _bar_doc_to_out(doc)


@router.get("/{bar_id}", response_model=BarOut)
async def get_bar(bar_id: str):
    db = get_database()
    try:
        oid = ObjectId(bar_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Bar not found")
    doc = await db.bars.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Bar not found")
    return _bar_doc_to_out(doc)


@router.get("/{bar_id}/messages", response_model=list[MessageOut])
async def get_messages(
    bar_id: str,
    before: Optional[str] = None,
    limit: int = Query(50, le=100),
):
    db = get_database()
    query: dict = {"bar_id": ObjectId(bar_id)}
    if before:
        query["_id"] = {"$lt": ObjectId(before)}
    cursor = db.messages.find(query).sort("created_at", -1).limit(limit)
    msgs = [_msg_doc_to_out(doc) async for doc in cursor]
    msgs.reverse()
    return msgs


@router.post("/{bar_id}/join", response_model=BarOut)
async def join_bar(bar_id: str, user: dict = Depends(get_current_user)):
    db = get_database()
    bar = await db.bars.find_one({"_id": ObjectId(bar_id)})
    if not bar:
        raise HTTPException(status_code=404, detail="Bar not found")
    if bar["status"] == "sealed":
        raise HTTPException(status_code=400, detail="Bar is sealed")
    if len(bar.get("current_users", [])) >= bar.get("max_seats", 12):
        raise HTTPException(status_code=400, detail="Bar is full")
    if user["uuid"] in bar.get("current_users", []):
        return _bar_doc_to_out(bar)

    # Leave current bar
    await _leave_current_bar(db, user["uuid"])

    now = datetime.now(timezone.utc)
    update: dict = {
        "$addToSet": {"current_users": user["uuid"]},
        "$set": {"updated_at": now},
    }
    # Reactivate if cooling
    if bar["status"] == "cooling":
        update["$set"]["status"] = "active"
        update["$set"]["cooling_since"] = None

    await db.bars.update_one({"_id": ObjectId(bar_id)}, update)
    await db.users.update_one({"uuid": user["uuid"]}, {"$set": {"current_bar_id": bar_id}})

    updated_bar = await db.bars.find_one({"_id": ObjectId(bar_id)})
    # Broadcast join event
    await _broadcast(bar_id, {
        "event": "user.joined",
        "data": {"user_uuid": user["uuid"], "nickname": user["nickname"],
                 "seat_count": len(updated_bar.get("current_users", []))},
    })
    return _bar_doc_to_out(updated_bar)


@router.post("/{bar_id}/leave", response_model=BarOut)
async def leave_bar(bar_id: str, user: dict = Depends(get_current_user)):
    db = get_database()
    bar = await db.bars.find_one({"_id": ObjectId(bar_id)})
    if not bar:
        raise HTTPException(status_code=404, detail="Bar not found")

    now = datetime.now(timezone.utc)
    await db.bars.update_one({"_id": ObjectId(bar_id)}, {
        "$pull": {"current_users": user["uuid"]},
        "$set": {"updated_at": now},
    })
    await db.users.update_one({"uuid": user["uuid"]}, {"$set": {"current_bar_id": None}})

    updated_bar = await db.bars.find_one({"_id": ObjectId(bar_id)})
    remaining = len(updated_bar.get("current_users", []))

    # Start cooling if empty
    if remaining == 0 and updated_bar["status"] == "active":
        await db.bars.update_one({"_id": ObjectId(bar_id)}, {
            "$set": {"status": "cooling", "cooling_since": now},
        })
        updated_bar = await db.bars.find_one({"_id": ObjectId(bar_id)})
        await _broadcast(bar_id, {"event": "bar.cooling", "data": {"cooling_since": now.isoformat()}})

    await _broadcast(bar_id, {
        "event": "user.left",
        "data": {"user_uuid": user["uuid"], "nickname": user["nickname"], "seat_count": remaining},
    })
    return _bar_doc_to_out(updated_bar)


@router.post("/{bar_id}/messages", response_model=MessageOut, status_code=201)
async def send_message(bar_id: str, data: MessageCreate, user: dict = Depends(get_current_user)):
    db = get_database()
    bar = await db.bars.find_one({"_id": ObjectId(bar_id)})
    if not bar:
        raise HTTPException(status_code=404, detail="Bar not found")
    if bar["status"] == "sealed":
        raise HTTPException(status_code=400, detail="Bar is sealed")
    if user["uuid"] not in bar.get("current_users", []):
        raise HTTPException(status_code=403, detail="You are not in this bar")

    now = datetime.now(timezone.utc)
    msg_doc = {
        "bar_id": ObjectId(bar_id),
        "user_uuid": user["uuid"],
        "nickname": user["nickname"],
        "avatar_url": user.get("avatar_url", ""),
        "content": data.content,
        "created_at": now,
    }
    result = await db.messages.insert_one(msg_doc)
    msg_doc["_id"] = result.inserted_id
    await db.bars.update_one({"_id": ObjectId(bar_id)}, {"$inc": {"message_count": 1}})

    # Broadcast message
    await _broadcast(bar_id, {
        "event": "message.new",
        "data": {
            "id": str(result.inserted_id),
            "user_uuid": user["uuid"],
            "nickname": user["nickname"],
            "avatar_url": user.get("avatar_url", ""),
            "content": data.content,
            "created_at": now.isoformat(),
        },
    })
    return _msg_doc_to_out(msg_doc)


# ── Helpers ──

async def _leave_current_bar(db, user_uuid: str):
    """Ensure user leaves their current bar before joining another."""
    user = await db.users.find_one({"uuid": user_uuid})
    current = user.get("current_bar_id") if user else None
    if current:
        now = datetime.now(timezone.utc)
        await db.bars.update_one({"_id": ObjectId(current)}, {
            "$pull": {"current_users": user_uuid},
            "$set": {"updated_at": now},
        })
        bar = await db.bars.find_one({"_id": ObjectId(current)})
        if bar and len(bar.get("current_users", [])) == 0 and bar["status"] == "active":
            await db.bars.update_one({"_id": ObjectId(current)}, {
                "$set": {"status": "cooling", "cooling_since": now},
            })
        await db.users.update_one({"uuid": user_uuid}, {"$set": {"current_bar_id": None}})


# ── WebSocket ──

async def _broadcast(bar_id: str, message: dict):
    import json
    conns = _bar_connections.get(bar_id, [])
    payload = json.dumps(message, default=str)
    dead = []
    for ws in conns:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        conns.remove(ws)


async def bar_websocket(websocket: WebSocket, bar_id: str):
    """Standalone WS handler — mounted in main.py at /ws/bar/{bar_id}."""
    await websocket.accept()
    if bar_id not in _bar_connections:
        _bar_connections[bar_id] = []
    _bar_connections[bar_id].append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        _bar_connections[bar_id].remove(websocket)
        if not _bar_connections[bar_id]:
            del _bar_connections[bar_id]
