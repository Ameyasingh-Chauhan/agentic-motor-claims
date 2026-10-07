"""Data Manager — admin/developer only. Removes claims and policies independently of each other.

- Removing a CLAIM deletes its record, private upload folder, pipeline runs and notifications that link to it.
- Removing a POLICY deletes the policy record, plus the customer / vehicle / Vahan record it pointed at **only if** nothing else
  (another policy or any claim) still references them. Claims filed on the policy are left alone.
All writes go through json_store.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..services import uploads
from ..services.json_store import read_json, update_json
from .auth import current_user

router = APIRouter(prefix="/api/admin/data", tags=["data-admin"])


def data_manager(user=Depends(current_user)) -> dict:
    if user.get("role") != "admin" and not user.get("is_developer"):
        raise HTTPException(403, {"code": "forbidden", "message": "You don't have access"})
    return user


class ClaimIds(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500)


class PolicyNos(BaseModel):
    policy_nos: list[str] = Field(min_length=1, max_length=500)


@router.get("/claims")
async def list_claims(_=Depends(data_manager)):
    claims = await read_json("claims.json", [])
    rows = [{"id": c["id"], "customer_name": c.get("customer_name"), "policy_no": c.get("policy_no"), "registration": c.get("registration"),
             "status": c.get("status"), "created_at": c.get("created_at"), "amount_claimed": c.get("amount_claimed"),
             "origin": c.get("origin")} for c in claims]
    rows.sort(key=lambda r: r["created_at"] or "", reverse=True)
    return {"items": rows}


@router.get("/policies")
async def list_policies(_=Depends(data_manager)):
    policies, vehicles, customers, claims = await asyncio.gather(
        read_json("policies.json", []), read_json("vehicles.json", []), read_json("customers.json", []), read_json("claims.json", []))
    vby, cby = {v["id"]: v for v in vehicles}, {c["id"]: c for c in customers}
    used: dict[str, int] = {}
    for c in claims:
        used[c.get("policy_no")] = used.get(c.get("policy_no"), 0) + 1
    rows = [{"policy_no": p["policy_no"], "insured": cby.get(p["customer_id"], {}).get("name"),
             "registration": vby.get(p["vehicle_id"], {}).get("registration"),
             "vehicle": " ".join(filter(None, [vby.get(p["vehicle_id"], {}).get("make"), vby.get(p["vehicle_id"], {}).get("model")])),
             "end": p.get("end"), "status": p.get("status"), "claims": used.get(p["policy_no"], 0)} for p in policies]
    rows.reverse()  # most recently added first
    return {"items": rows}


@router.post("/claims/delete")
async def delete_claims(body: ClaimIds, _=Depends(data_manager)):
    ids = set(body.ids)
    removed: list[str] = []

    def drop(rows: list[dict]) -> None:
        keep = [c for c in rows if c["id"] not in ids]
        removed.extend(c["id"] for c in rows if c["id"] in ids)
        rows[:] = keep
    await update_json("claims.json", drop, [])
    gone = set(removed)
    if gone:
        await update_json("pipeline_runs.json", lambda rows: rows.__setitem__(slice(None), [r for r in rows if r.get("claim_id") not in gone]), [])
        await update_json("notifications.json", lambda rows: rows.__setitem__(
            slice(None), [n for n in rows if not any((n.get("href") or "").rstrip("/").endswith(f"/{i}") for i in gone)]), [])
        for claim_id in gone:
            await asyncio.to_thread(uploads.remove_claim_dir, claim_id)
    return {"removed": sorted(gone), "not_found": sorted(ids - gone)}


@router.post("/policies/delete")
async def delete_policies(body: PolicyNos, _=Depends(data_manager)):
    wanted = {p.strip().casefold() for p in body.policy_nos}
    dropped: list[dict] = []

    def drop(rows: list[dict]) -> None:
        dropped.extend(p for p in rows if p["policy_no"].strip().casefold() in wanted)
        rows[:] = [p for p in rows if p["policy_no"].strip().casefold() not in wanted]
    await update_json("policies.json", drop, [])

    # Orphan clean-up: only what nothing else points at any more.
    policies, claims, users = await asyncio.gather(read_json("policies.json", []), read_json("claims.json", []), read_json("users.json", []))
    live_vehicles = {p["vehicle_id"] for p in policies} | {c.get("vehicle_id") for c in claims}
    live_customers = {p["customer_id"] for p in policies} | {c.get("customer_id") for c in claims} | {u.get("customer_id") for u in users}
    orphan_vehicle_ids = {p["vehicle_id"] for p in dropped} - live_vehicles
    orphan_customer_ids = {p["customer_id"] for p in dropped} - live_customers

    registrations: list[str] = []

    def drop_vehicles(rows: list[dict]) -> None:
        registrations.extend(v["registration"] for v in rows if v["id"] in orphan_vehicle_ids)
        rows[:] = [v for v in rows if v["id"] not in orphan_vehicle_ids]
    if orphan_vehicle_ids:
        await update_json("vehicles.json", drop_vehicles, [])
        await update_json("vahan.json", lambda d: [d.pop(r, None) for r in registrations], {})
    if orphan_customer_ids:
        await update_json("customers.json", lambda rows: rows.__setitem__(slice(None), [c for c in rows if c["id"] not in orphan_customer_ids]), [])

    found = {p["policy_no"].strip().casefold() for p in dropped}
    return {"removed": [p["policy_no"] for p in dropped], "not_found": sorted(wanted - found),
            "also_removed": {"customers": len(orphan_customer_ids), "vehicles": len(orphan_vehicle_ids)}}
