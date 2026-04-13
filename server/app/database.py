from functools import lru_cache
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    mongodb_url: str = "mongodb://night:nightpass@localhost:27017/agent_night?authSource=admin"
    database_name: str = "agent_night"
    redis_url: str = "redis://:nightredis@localhost:6379/0"
    secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080  # 7 days
    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    anet_daemon_url: str = "http://localhost:3998"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()


# ── MongoDB singleton ──
_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None


async def connect_to_mongo():
    global _client, _db
    settings = get_settings()
    _client = AsyncIOMotorClient(settings.mongodb_url)
    _db = _client[settings.database_name]
    # Ensure indexes
    await _db.users.create_index("uuid", unique=True)
    await _db.users.create_index("email", unique=True, sparse=True)
    await _db.bars.create_index("status")
    await _db.bars.create_index("created_at")
    await _db.messages.create_index([("bar_id", 1), ("created_at", 1)])
    await _db.pats.create_index([("from_uuid", 1), ("to_uuid", 1)], unique=True)
    await _db.shrimp_bars.create_index("status")
    await _db.shrimp_messages.create_index([("bar_id", 1), ("created_at", 1)])
    await _db.pinches.create_index([("from_did", 1), ("to_did", 1)], unique=True)
    await _db.agent_logs.create_index([("owner_uuid", 1), ("created_at", -1)])


async def close_mongo_connection():
    global _client
    if _client:
        _client.close()


def get_database() -> AsyncIOMotorDatabase:
    assert _db is not None, "Database not connected"
    return _db
