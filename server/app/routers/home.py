from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from ..services.json_store import read_json
from .auth import current_user

router=APIRouter(prefix="/api",tags=["claims"])
SAFE_REMOVE={"fraud","risk","audit","internal_notes","checks"}
def _enrich(c, index=0):
    out=dict(c); out.setdefault("customer_name", "Rahul Sharma" if out.get("customer_id")=="c_0001" else f"Customer {index+1:03d}")
    out.setdefault("vehicle_type", "Car"); out.setdefault("registration", f"MH 12 AB {1000+index:04d}"); out.setdefault("city", "Pune"); out.setdefault("garage", "ABC Network Garage"); out.setdefault("risk_band", "low"); out.setdefault("amount_approved", float(out.get("financials",{}).get("net_payable", 0) or 0)); out.setdefault("amount_claimed", out.get("amount_approved",0)); out.setdefault("channel", "app"); return out
def _safe(c):
    out={k:v for k,v in c.items() if k not in SAFE_REMOVE}; out.pop("fraud",None); return out
@router.get("/claims")
async def claims(user=Depends(current_user), status: str|None=None, q: str|None=None, vehicle_type: str|None=None, claim_type: str|None=None, city: str|None=None, garage: str|None=None, risk_band: str|None=None, min_amount: float|None=None, max_amount: float|None=None, from_: str|None=Query(None, alias="from"), to: str|None=None, sort: str="created_at:desc", page: int=1, page_size: int=25):
    raw=await read_json("claims.json",[]); rows=[_enrich(c,i) for i,c in enumerate(raw)]
    if user.get("role")=="customer": rows=[c for c in rows if c.get("customer_id")==user.get("customer_id")]
    needle=(q or "").strip().casefold()
    def match(c):
        hay=" ".join(str(c.get(k,"")) for k in ("id","customer_name","registration","policy_no")).casefold()
        amount=float(c.get("amount_claimed",0) or 0)
        return (not status or c.get("status")==status) and (not needle or needle in hay) and (not vehicle_type or c.get("vehicle_type")==vehicle_type) and (not claim_type or c.get("claim_type")==claim_type) and (not city or c.get("city")==city) and (not garage or c.get("garage")==garage) and (not risk_band or c.get("risk_band")==risk_band) and (min_amount is None or amount>=min_amount) and (max_amount is None or amount<=max_amount) and (not from_ or c.get("created_at","")[:10]>=from_) and (not to or c.get("created_at","")[:10]<=to)
    rows=[c for c in rows if match(c)]
    field,direction=(sort.split(":",1)+["desc"])[:2] if ":" in sort else (sort,"desc")
    rows.sort(key=lambda c: c.get(field,"") or 0, reverse=direction.lower()=="desc")
    total=len(rows); start=max(0,(page-1)*page_size); result=rows[start:start+page_size]
    return {"items":[_safe(c) if user.get("role")=="customer" else c for c in result],"total":total,"page":page,"page_size":page_size}
@router.get("/stats/home")
async def home_stats(user=Depends(current_user)):
    raw=await read_json("claims.json",[]); rows=[_enrich(c,i) for i,c in enumerate(raw)]
    if user.get("role")=="customer": rows=[c for c in rows if c.get("customer_id")==user.get("customer_id")]
    now=datetime.now(timezone.utc); fy_start=f"{now.year if now.month>=4 else now.year-1}-04-01"; fy=[c for c in rows if c.get("created_at","")[:10]>=fy_start]
    def count(fn): return sum(1 for c in fy if fn(c))
    settled=count(lambda c:c.get("status") in {"SETTLED","APPROVED","AUTO_PREAUTH"}); approved=sum(float(c.get("amount_approved",0) or 0) for c in fy if c.get("status") in {"SETTLED","APPROVED","AUTO_PREAUTH"}); open_count=count(lambda c:c.get("status") not in {"SETTLED","APPROVED","AUTO_PREAUTH","DECLINED"})
    return {"period":{"from":fy_start,"to":now.date().isoformat()},"kpis":[{"key":"total_claims","label":"Total claims","value":len(fy),"delta":0},{"key":"settled_approved","label":"Settled / approved","value":settled,"delta":0},{"key":"amount_approved","label":"Amount approved","value":approved,"delta":0},{"key":"fraud_detected","label":"Fraud detected","value":0 if user.get("role")=="customer" else count(lambda c:c.get("status") in {"FRAUD_CONFIRMED","SIU_INVESTIGATION"}),"delta":0},{"key":"open_claims","label":"Open claims","value":open_count,"delta":0},{"key":"avg_claim","label":"Average claim","value":(sum(float(c.get("amount_claimed",0) or 0) for c in fy)/len(fy) if fy else 0),"delta":0},{"key":"auto_processed","label":"Auto processed","value":count(lambda c:c.get("status")=="AUTO_PREAUTH"),"delta":0},{"key":"customers","label":"Customers served","value":len({c.get("customer_id") for c in fy}),"delta":0}],"sparkline":[len(fy[i:i+4]) for i in range(0,len(fy),4)]}
