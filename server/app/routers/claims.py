"""Claims list, facets and CSV export (spec §10.3 D, §17). Customers only ever see their own claims, customer-safe."""
from __future__ import annotations

import csv
import io
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from ..services.claim_views import SEGMENTS, customer_status, listed, now_ist, row
from ..services.claim_detail import detail
from ..services.json_store import read_json
from .auth import current_user

router = APIRouter(prefix="/api", tags=["claims"])

SORTS = {
    "created_at:desc": (lambda c: c["created_at"], True), "created_at:asc": (lambda c: c["created_at"], False),
    "updated_at:desc": (lambda c: c["updated_at"], True),
    "amount:desc": (lambda c: c["amount_claimed"], True), "amount:asc": (lambda c: c["amount_claimed"], False),
    "risk:desc": (lambda c: -1 if c.get("risk_score") is None else c["risk_score"], True),  # unscored claims last
}


def _is_customer(user: dict) -> bool:
    return user.get("role") == "customer"


async def _visible(user: dict, *, drafts: bool = False) -> list[dict]:
    claims = await read_json("claims.json", [])
    if not drafts:
        claims = listed(claims)
    if _is_customer(user):
        return [c for c in claims if c["customer_id"] == user.get("customer_id")]
    return claims


def _csv(value: str | None) -> set[str]:
    return {v for v in (value or "").split(",") if v}


def _filter(claims: list[dict], *, user: dict, q, vehicle_type, claim_type, city, garage, risk_band, min_amount, max_amount,
            from_, to, segment) -> list[dict]:
    needle = (q or "").strip().casefold()
    compact = needle.replace(" ", "")
    vt, ct, cities, bands = _csv(vehicle_type), _csv(claim_type), _csv(city), _csv(risk_band)
    pred = SEGMENTS.get(segment) if segment else None
    if segment and pred is None:
        raise HTTPException(422, f"Unknown segment {segment}")
    if _is_customer(user):
        bands = set()  # risk is never filterable for customers

    def keep(c: dict) -> bool:
        if needle:
            hay = " ".join((c["id"], c["customer_name"], c["city"], c["policy_no"])).casefold()
            if needle not in hay and compact not in c["registration"].replace(" ", "").casefold():
                return False
        amount = c["amount_claimed"]
        return ((not vt or c["vehicle"]["type"] in vt) and (not ct or c["claim_type"] in ct) and (not cities or c["city"] in cities)
                and (not garage or c.get("garage_name") == garage) and (not bands or c.get("risk_band") in bands)
                and (min_amount is None or amount >= min_amount) and (max_amount is None or amount <= max_amount)
                and (not from_ or c["created_at"][:10] >= from_) and (not to or c["created_at"][:10] <= to)
                and (pred is None or pred(c)))

    return [c for c in claims if keep(c)]


@router.get("/claims")
async def list_claims(
    user=Depends(current_user), status: str | None = None, q: str | None = None, vehicle_type: str | None = None,
    claim_type: str | None = None, city: str | None = None, garage: str | None = None, risk_band: str | None = None,
    min_amount: float | None = None, max_amount: float | None = None, from_: str | None = Query(None, alias="from"),
    to: str | None = None, segment: str | None = None, sort: str = "created_at:desc",
    page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
):
    now = now_ist()
    customer = _is_customer(user)
    rows = _filter(await _visible(user), user=user, q=q, vehicle_type=vehicle_type, claim_type=claim_type, city=city, garage=garage,
                   risk_band=risk_band, min_amount=min_amount, max_amount=max_amount, from_=from_, to=to, segment=segment)
    # Chips: a SUBMITTED claim is waiting for the AI pipeline, so it counts (and filters) under "AI processing".
    chip = {"SUBMITTED": "PROCESSING"}
    shown = (lambda c: chip.get(s := customer_status(c["status"]), s)) if customer else (lambda c: chip.get(c["status"], c["status"]))
    status_counts = Counter(shown(c) for c in rows)  # live counts for the chips: every filter except status
    statuses = _csv(status)
    if statuses:
        rows = [c for c in rows if shown(c) in statuses]
    key, reverse = SORTS.get(sort if not (customer and sort == "risk:desc") else "created_at:desc", SORTS["created_at:desc"])
    rows.sort(key=key, reverse=reverse)
    total = len(rows)
    start = (page - 1) * page_size
    return {
        "items": [row(c, customer=customer, now=now) for c in rows[start:start + page_size]],
        "total": total, "page": page, "page_size": page_size,
        "status_counts": dict(status_counts), "all_count": sum(status_counts.values()),
    }


@router.get("/claims/facets")
async def facets(user=Depends(current_user)):
    claims = await _visible(user)
    amounts = [c["amount_claimed"] for c in claims] or [0]
    return {
        "cities": sorted({c["city"] for c in claims}),
        "vehicle_types": sorted({c["vehicle"]["type"] for c in claims}),
        "claim_types": sorted({c["claim_type"] for c in claims}),
        "amount": {"min": min(amounts), "max": max(amounts)},
        "date": {"min": min((c["created_at"][:10] for c in claims), default=None), "max": max((c["created_at"][:10] for c in claims), default=None)},
    }


@router.get("/claims/export.csv")
async def export_csv(
    user=Depends(current_user), status: str | None = None, q: str | None = None, vehicle_type: str | None = None,
    claim_type: str | None = None, city: str | None = None, garage: str | None = None, risk_band: str | None = None,
    min_amount: float | None = None, max_amount: float | None = None, from_: str | None = Query(None, alias="from"),
    to: str | None = None, segment: str | None = None, sort: str = "created_at:desc",
):
    customer = _is_customer(user)
    rows = _filter(await _visible(user), user=user, q=q, vehicle_type=vehicle_type, claim_type=claim_type, city=city, garage=garage,
                   risk_band=risk_band, min_amount=min_amount, max_amount=max_amount, from_=from_, to=to, segment=segment)
    statuses = _csv(status)
    if statuses:
        rows = [c for c in rows if c["status"] in statuses]
    key, reverse = SORTS.get(sort, SORTS["created_at:desc"])
    rows.sort(key=key, reverse=reverse)
    cols = ["id", "status", "created_at", "customer_name", "city", "registration", "vehicle", "claim_type", "incident", "amount_claimed", "amount_approved"]
    if not customer:
        cols += ["risk_score", "risk_band"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    for c in rows:
        values = {**c, "vehicle": f"{c['vehicle']['make']} {c['vehicle']['model']}", "incident": c["incident"].get("label")}
        w.writerow([values.get(k) for k in cols])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="claims.csv"'})


@router.get("/claims/{claim_id}")
async def get_claim(claim_id: str, user=Depends(current_user)):
    """Role-shaped detail (§10.4): admins get context + allowed actions; customers the customer-safe projection."""
    claim = next((c for c in await _visible(user, drafts=True) if c["id"] == claim_id), None)
    if claim is None:
        raise HTTPException(404, "Claim not found")
    return await detail(claim, user, await read_json("claims.json", []))
