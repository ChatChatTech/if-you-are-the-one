from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.database import connect_to_mongo, close_mongo_connection, get_settings
from app.redis import connect_to_redis, close_redis_connection
from app.routes import auth, users, bars, pats, personality, shrimp, notifications, network, leaderboard


@asynccontextmanager
async def lifespan(application: FastAPI):
    await connect_to_mongo()
    await connect_to_redis()
    yield
    await close_redis_connection()
    await close_mongo_connection()


app = FastAPI(
    title="Agent://Night",
    description="兰桂坊 — 双层社交匹配平台",
    version="0.1.0",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── Routers ──
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(bars.router)
app.include_router(pats.router)
app.include_router(personality.router)
app.include_router(shrimp.router)
app.include_router(notifications.router)
app.include_router(network.router)
app.include_router(leaderboard.router)

# ── Standalone WebSocket routes (no prefix) ──
from fastapi import WebSocket as _WS

@app.websocket("/ws/bar/{bar_id}")
async def ws_bar(websocket: _WS, bar_id: str):
    await bars.bar_websocket(websocket, bar_id)

@app.websocket("/ws/notifications")
async def ws_notif(websocket: _WS):
    await notifications.notification_websocket(websocket)


@app.get("/")
async def root():
    return {"service": "Agent://Night", "version": "0.1.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}
