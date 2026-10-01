from __future__ import annotations
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
import bcrypt, jwt
from ..config import get_settings
from ..services.json_store import read_json, write_json

router=APIRouter(prefix="/api/auth", tags=["auth"])
_failures: dict[str, list[datetime]] = {}
class LoginBody(BaseModel): username: str; password: str
class DemoBody(BaseModel): username: str
def _key(): return get_settings().jwt_secret
def _public(u): return {k:u.get(k) for k in ("id","username","display_name","role","is_developer","title","email","avatar","customer_id","preferences")}
async def _users(): return await read_json("users.json", [])
def _find(users, name):
    n=name.strip().casefold(); return next((u for u in users if u.get("username","").strip().casefold()==n),None)
def _issue(u): return jwt.encode({"sub":u["id"],"exp":datetime.now(timezone.utc)+timedelta(minutes=get_settings().jwt_expires_minutes)},_key(),algorithm="HS256")
async def _login(response, username, password):
    users=await _users(); u=_find(users,username); now=datetime.now(timezone.utc); key=username.strip().casefold(); recent=[t for t in _failures.get(key,[]) if (now-t).total_seconds()<60]; _failures[key]=recent
    if len(recent)>=5: raise HTTPException(429,detail={"message":"Too many attempts","retry_after":max(1,60-int((now-recent[0]).total_seconds()))})
    if not u or not bcrypt.checkpw(password.encode(),u["password_hash"].encode()):
        recent.append(now); _failures[key]=recent; raise HTTPException(401,detail="Invalid username or password")
    _failures.pop(key,None); response.set_cookie("amc_session",_issue(u),httponly=True,samesite="lax",max_age=get_settings().jwt_expires_minutes*60)
    return {"user":_public(u)}
@router.post("/login")
async def login(body:LoginBody,response:Response): return await _login(response,body.username,body.password)
@router.post("/demo-login")
async def demo_login(body:DemoBody,response:Response):
    if not get_settings().demo_mode: raise HTTPException(404,"Demo login disabled")
    u=_find(await _users(),body.username)
    if not u: raise HTTPException(401,"Unknown demo user")
    return await _login(response,u["username"],{"Santosh Kute":"Admin@123","Ameya Chauhan":"0376","Rahul Sharma":"Pass@123"}[u["username"]])
@router.get("/me")
async def me(request:Request):
    token=request.cookies.get("amc_session")
    if not token: raise HTTPException(401,"Not authenticated")
    try: payload=jwt.decode(token,_key(),algorithms=["HS256"])
    except jwt.PyJWTError: raise HTTPException(401,"Session expired")
    u=next((x for x in await _users() if x.get("id")==payload.get("sub")),None)
    if not u: raise HTTPException(401,"Session expired")
    return {"user":_public(u)}
@router.post("/logout")
async def logout(response:Response): response.delete_cookie("amc_session"); return {"ok":True}
