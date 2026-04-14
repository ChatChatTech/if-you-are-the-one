"""Auth routes: register, login, token."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import JSONResponse

from app.database import get_database
from app.models.schemas import Token, UserLogin, UserRegister
from app.redis import get_redis
from app.utils.auth import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["Auth"])


MAX_FAILED_ATTEMPTS = 5
LOCKOUT_SECONDS = 600
IP_RATE_LIMIT_PER_MINUTE = 30


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        first = forwarded_for.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"


def _ip_rate_key(ip: str) -> str:
    return f"auth:login:rate:{ip}"


def _fail_key(ip: str, email: str) -> str:
    return f"auth:login:fail:{ip}:{email}"


def _lock_key(ip: str, email: str) -> str:
    return f"auth:login:lock:{ip}:{email}"


def _rate_limit_response(detail: str, retry_after_seconds: int) -> JSONResponse:
    retry_after_seconds = max(1, int(retry_after_seconds))
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        headers={"Retry-After": str(retry_after_seconds)},
        content={
            "detail": detail,
            "retry_after_seconds": retry_after_seconds,
        },
    )


async def _enforce_ip_rate_limit(ip: str):
    redis = get_redis()
    key = _ip_rate_key(ip)
    current = await redis.incr(key)
    if current == 1:
        await redis.expire(key, 60)
    if current > IP_RATE_LIMIT_PER_MINUTE:
        ttl = await redis.ttl(key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "message": "Too many login attempts, try again later",
                "retry_after_seconds": max(1, ttl if ttl > 0 else 60),
            },
        )


async def _lock_ttl_seconds(ip: str, email: str) -> int:
    redis = get_redis()
    ttl = await redis.ttl(_lock_key(ip, email))
    if ttl is None or ttl < 0:
        return 0
    return int(ttl)


async def _mark_failed_login(ip: str, email: str):
    redis = get_redis()
    fail_key = _fail_key(ip, email)
    lock_key = _lock_key(ip, email)

    failed = await redis.incr(fail_key)
    await redis.expire(fail_key, LOCKOUT_SECONDS)
    if failed >= MAX_FAILED_ATTEMPTS:
        await redis.set(lock_key, "1", ex=LOCKOUT_SECONDS)
        await redis.delete(fail_key)


async def _clear_failed_login(ip: str, email: str):
    redis = get_redis()
    await redis.delete(_fail_key(ip, email), _lock_key(ip, email))


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister):
    db = get_database()
    normalized_email = _normalize_email(data.email)

    existing = await db.users.find_one({"email": normalized_email})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user_uuid = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    user_doc = {
        "uuid": user_uuid,
        "nickname": data.nickname,
        "bio": data.bio,
        "contact": data.contact,
        "email": normalized_email,
        "hashed_password": hash_password(data.password),
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
async def login(data: UserLogin, request: Request):
    db = get_database()
    ip = _client_ip(request)
    email = _normalize_email(data.email)

    try:
        await _enforce_ip_rate_limit(ip)
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
        return _rate_limit_response(
            detail=detail.get("message", "Too many login attempts, try again later"),
            retry_after_seconds=detail.get("retry_after_seconds", 60),
        )

    locked_ttl = await _lock_ttl_seconds(ip, email)
    if locked_ttl > 0:
        return _rate_limit_response(
            detail="Too many failed attempts, try again later",
            retry_after_seconds=locked_ttl,
        )

    user = await db.users.find_one({"email": email})
    if not user or not user.get("hashed_password"):
        await _mark_failed_login(ip, email)
        locked_ttl = await _lock_ttl_seconds(ip, email)
        if locked_ttl > 0:
            return _rate_limit_response(
                detail="Too many failed attempts, try again later",
                retry_after_seconds=locked_ttl,
            )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not verify_password(data.password, user["hashed_password"]):
        await _mark_failed_login(ip, email)
        locked_ttl = await _lock_ttl_seconds(ip, email)
        if locked_ttl > 0:
            return _rate_limit_response(
                detail="Too many failed attempts, try again later",
                retry_after_seconds=locked_ttl,
            )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    await _clear_failed_login(ip, email)

    token = create_access_token({"sub": user["uuid"]})
    return Token(access_token=token)
