"""Global notification WebSocket — design doc §10.2.

Clients connect to /ws/notifications with JWT token as query param.
Server pushes pat/pinch/agent events in real-time via Redis pub/sub.
"""

import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.redis import get_redis

router = APIRouter(tags=["Notifications"])

# In-memory: uuid → list[WebSocket]
_user_connections: dict[str, list[WebSocket]] = {}

CHANNEL = "night:notifications"


async def publish_notification(user_uuid: str, event: str, data: dict):
    """Publish a notification to a specific user via Redis pub/sub."""
    r = get_redis()
    payload = json.dumps({"target_uuid": user_uuid, "event": event, "data": data}, default=str)
    await r.publish(CHANNEL, payload)


async def _send_to_user(user_uuid: str, message: dict):
    conns = _user_connections.get(user_uuid, [])
    payload = json.dumps(message, default=str)
    dead = []
    for ws in conns:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        conns.remove(ws)


async def notification_websocket(websocket: WebSocket, token: str = Query(...)):
    """Clients send JWT as ?token= query param."""
    from jose import JWTError, jwt as jose_jwt
    from app.database import get_settings

    settings = get_settings()
    try:
        payload = jose_jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        user_uuid = payload.get("sub")
        if not user_uuid:
            await websocket.close(code=4001)
            return
    except JWTError:
        await websocket.close(code=4001)
        return

    await websocket.accept()
    if user_uuid not in _user_connections:
        _user_connections[user_uuid] = []
    _user_connections[user_uuid].append(websocket)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        _user_connections[user_uuid].remove(websocket)
        if not _user_connections[user_uuid]:
            del _user_connections[user_uuid]
