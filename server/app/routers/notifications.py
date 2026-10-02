from fastapi import APIRouter, Depends, Body
from ..services.json_store import read_json, write_json
from .auth import current_user
router=APIRouter(prefix="/api/notifications",tags=["notifications"])
@router.get("")
async def notifications(user=Depends(current_user)):
    rows=await read_json("notifications.json",[]); rows=[n for n in rows if not n.get("user_id") or n.get("user_id")==user.get("id")]; return {"items":rows,"unread":sum(1 for n in rows if not n.get("read"))}
@router.post("/read")
async def mark_read(payload: dict=Body(default={}), user=Depends(current_user)):
    rows=await read_json("notifications.json",[]); ids=set(payload.get("ids",[])); all_read=payload.get("all",False)
    for n in rows:
        if (not n.get("user_id") or n.get("user_id")==user.get("id")) and (all_read or n.get("id") in ids): n["read"]=True
    await write_json("notifications.json",rows); return {"ok":True}
