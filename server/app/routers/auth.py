"""Authentication (spec §9): bcrypt passwords, JWT in an httpOnly cookie, 5-attempt / 60 s lockout."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from ..config import get_settings
from ..services.json_store import read_json

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE = "amc_session"
LOCKOUT_ATTEMPTS = 5
LOCKOUT_SECONDS = 60
_failures: dict[str, list[datetime]] = {}

# DEMO_MODE only: the quick-login tiles fill these credentials into the form; sign-in still goes through
# POST /login. An account is offered only while its stored hash still matches, so a changed password
# simply hides that tile.
DEMO_PASSWORDS = {"Santosh Kute": "Admin@123", "Ameya Chauhan": "0376", "Rahul Sharma": "Pass@123"}
_verified: dict[tuple[str, str], bool] = {}


class LoginBody(BaseModel):
    username: str
    password: str
    remember: bool = True  # False → browser-session cookie (no max-age)


def _public(u: dict) -> dict:
    keys = ("id", "username", "display_name", "role", "is_developer", "title", "email", "avatar", "customer_id", "preferences")
    return {k: u.get(k) for k in keys}


def _norm(name: str) -> str:
    return name.strip().casefold()


async def _users() -> list[dict]:
    return await read_json("users.json", [])


def _find(users: list[dict], name: str) -> dict | None:
    n = _norm(name)
    return next((u for u in users if _norm(u.get("username", "")) == n), None)


def _check(password: str, password_hash: str) -> bool:
    key = (password, password_hash)
    if key not in _verified:
        _verified[key] = bcrypt.checkpw(password.encode(), password_hash.encode())
    return _verified[key]


async def current_user(request: Request) -> dict:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Session expired")
    user = next((u for u in await _users() if u.get("id") == payload.get("sub")), None)
    if not user:
        raise HTTPException(401, "Session expired")
    return user


@router.post("/login")
async def login(body: LoginBody, response: Response):
    now = datetime.now(timezone.utc)
    key = _norm(body.username)
    recent = [t for t in _failures.get(key, []) if (now - t).total_seconds() < LOCKOUT_SECONDS]
    _failures[key] = recent
    if len(recent) >= LOCKOUT_ATTEMPTS:
        retry = max(1, LOCKOUT_SECONDS - int((now - recent[0]).total_seconds()))
        raise HTTPException(429, detail={"code": "locked", "message": "Too many attempts. Try again shortly.", "retry_after": retry})

    user = _find(await _users(), body.username)
    if not user or not bcrypt.checkpw(body.password.encode(), user["password_hash"].encode()):
        recent.append(now)
        raise HTTPException(401, detail={"code": "invalid_credentials", "message": "Invalid username or password",
                                         "attempts_left": max(0, LOCKOUT_ATTEMPTS - len(recent))})

    _failures.pop(key, None)
    settings = get_settings()
    token = jwt.encode({"sub": user["id"], "exp": now + timedelta(minutes=settings.jwt_expires_minutes)}, settings.jwt_secret, algorithm="HS256")
    response.set_cookie(COOKIE, token, httponly=True, samesite="lax",
                        max_age=settings.jwt_expires_minutes * 60 if body.remember else None)
    return {"user": _public(user)}


@router.get("/demo-accounts")
async def demo_accounts():
    """Quick-login tile data (DEMO_MODE only). Includes the demo password so the tile can fill the form."""
    if not get_settings().demo_mode:
        raise HTTPException(404, "Not found")
    users = await _users()
    accounts = []
    for name, password in DEMO_PASSWORDS.items():
        user = _find(users, name)
        if user and _check(password, user["password_hash"]):
            accounts.append({"username": user["username"], "display_name": user.get("display_name"), "role": user.get("role"),
                             "is_developer": bool(user.get("is_developer")), "title": user.get("title"),
                             "avatar": user.get("avatar"), "password": password})
    return {"accounts": accounts}


@router.get("/me")
async def me(request: Request):
    """Session restore. Anonymous visitors get `{"user": null}` (200), not an error, so a normal visit to the
    login page is clean; protected endpoints still answer 401."""
    if not request.cookies.get(COOKIE):
        return {"user": None}
    return {"user": _public(await current_user(request))}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE)
    return {"ok": True}
