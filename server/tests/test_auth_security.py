from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.models.schemas import UserLogin, UserRegister
from app.routes import auth


class FakeUsersCollection:
    def __init__(self):
        self.docs = []

    async def find_one(self, query):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items()):
                return doc
        return None

    async def insert_one(self, doc):
        self.docs.append(doc)
        return SimpleNamespace(inserted_id="fake-id")


class FakeDB:
    def __init__(self):
        self.users = FakeUsersCollection()


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.ttls = {}

    async def incr(self, key):
        current = int(self.values.get(key, 0)) + 1
        self.values[key] = current
        return current

    async def expire(self, key, seconds):
        self.ttls[key] = int(seconds)
        return True

    async def ttl(self, key):
        if key in self.values or key in self.ttls:
            return self.ttls.get(key, -1)
        return -2

    async def set(self, key, value, ex=None):
        self.values[key] = value
        if ex is not None:
            self.ttls[key] = int(ex)
        return True

    async def delete(self, *keys):
        removed = 0
        for key in keys:
            if key in self.values:
                del self.values[key]
                removed += 1
            if key in self.ttls:
                del self.ttls[key]
        return removed


def _request(ip="127.0.0.1"):
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/auth/login",
        "headers": [(b"x-forwarded-for", ip.encode("utf-8"))],
        "client": (ip, 12345),
        "query_string": b"",
    }
    return Request(scope)


@pytest.mark.asyncio
async def test_register_normalizes_email_and_rejects_duplicate(monkeypatch):
    fake_db = FakeDB()
    fake_db.users.docs.append(
        {
            "uuid": "u1",
            "email": "hello@example.com",
            "hashed_password": "x",
            "nickname": "n1",
        }
    )

    monkeypatch.setattr(auth, "get_database", lambda: fake_db)

    with pytest.raises(HTTPException) as err:
        await auth.register(
            UserRegister(
                nickname="new",
                bio="",
                email="  HELLO@Example.com ",
                password="123456",
            )
        )

    assert err.value.status_code == 409
    assert err.value.detail == "Email already registered"


@pytest.mark.asyncio
async def test_login_locks_after_five_failed_attempts(monkeypatch):
    fake_db = FakeDB()
    fake_db.users.docs.append(
        {
            "uuid": "u1",
            "email": "hello@example.com",
            "hashed_password": "hashed",
            "nickname": "n1",
        }
    )
    fake_redis = FakeRedis()

    monkeypatch.setattr(auth, "get_database", lambda: fake_db)
    monkeypatch.setattr(auth, "get_redis", lambda: fake_redis)
    monkeypatch.setattr(auth, "verify_password", lambda plain, hashed: False)

    req = _request("10.0.0.1")
    payload = UserLogin(email="HELLO@example.com", password="wrong")

    for _ in range(4):
        with pytest.raises(HTTPException) as err:
            await auth.login(payload, req)
        assert err.value.status_code == 401
        assert err.value.detail == "Invalid credentials"

    locked_res = await auth.login(payload, req)
    assert locked_res.status_code == 429
    assert locked_res.body
    assert b"Too many failed attempts, try again later" in locked_res.body
    assert b"retry_after_seconds" in locked_res.body


@pytest.mark.asyncio
async def test_login_success_clears_failure_and_lock_keys(monkeypatch):
    fake_db = FakeDB()
    fake_db.users.docs.append(
        {
            "uuid": "u1",
            "email": "hello@example.com",
            "hashed_password": "hashed",
            "nickname": "n1",
        }
    )
    fake_redis = FakeRedis()

    monkeypatch.setattr(auth, "get_database", lambda: fake_db)
    monkeypatch.setattr(auth, "get_redis", lambda: fake_redis)

    def _verify(plain, hashed):
        return plain == "correct"

    monkeypatch.setattr(auth, "verify_password", _verify)

    req = _request("10.0.0.2")

    with pytest.raises(HTTPException):
        await auth.login(UserLogin(email="hello@example.com", password="wrong"), req)

    result = await auth.login(UserLogin(email="HELLO@example.com", password="correct"), req)
    assert result.access_token

    norm = "hello@example.com"
    fail_key = f"auth:login:fail:10.0.0.2:{norm}"
    lock_key = f"auth:login:lock:10.0.0.2:{norm}"
    assert fail_key not in fake_redis.values
    assert lock_key not in fake_redis.values


@pytest.mark.asyncio
async def test_login_ip_rate_limit_returns_429_with_retry_after(monkeypatch):
    fake_db = FakeDB()
    fake_db.users.docs.append(
        {
            "uuid": "u1",
            "email": "hello@example.com",
            "hashed_password": "hashed",
            "nickname": "n1",
        }
    )
    fake_redis = FakeRedis()

    monkeypatch.setattr(auth, "get_database", lambda: fake_db)
    monkeypatch.setattr(auth, "get_redis", lambda: fake_redis)
    monkeypatch.setattr(auth, "verify_password", lambda plain, hashed: True)

    req = _request("10.0.0.9")
    payload = UserLogin(email="hello@example.com", password="okokok")

    for _ in range(auth.IP_RATE_LIMIT_PER_MINUTE):
        token = await auth.login(payload, req)
        assert token.access_token

    limited = await auth.login(payload, req)
    assert limited.status_code == 429
    assert b"Too many login attempts, try again later" in limited.body
    assert b"retry_after_seconds" in limited.body
