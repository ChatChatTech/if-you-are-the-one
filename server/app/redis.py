from typing import Optional
import redis.asyncio as aioredis

_redis: Optional[aioredis.Redis] = None


async def connect_to_redis():
    global _redis
    from app.database import get_settings
    settings = get_settings()
    _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    await _redis.ping()


async def close_redis_connection():
    global _redis
    if _redis:
        await _redis.aclose()


def get_redis() -> aioredis.Redis:
    assert _redis is not None, "Redis not connected"
    return _redis
