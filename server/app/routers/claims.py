"""Claims list, facets and CSV export (spec §10.3 D, §17). Customers only ever see their own claims, customer-safe."""
from __future__ import annotations

import csv
import io
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from ..services import claim_filters
from ..services.claim_views import customer_status, listed, now_ist, row
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


async def _filtered(request: Request, user: dict) -> list[dict]:
    """Every list filter (Home browser + Dashboard drill-down keys, §10.5) through the shared predicate."""
    try:
        return claim_filters.apply(await _visible(user), dict(request.query_params), await claim_filters.load_context(),
                                   customer=_is_customer(user))
    except KeyError as exc:
        raise HTTPException(422, f"Unknown segment {exc.args[0]}") from exc
    except ValueError as exc:
        raise HTTPException(422, f"Invalid filter value: {exc}") from exc


@router.get("/claims")
async def list_claims(
    request: Request, user=Depends(current_user), status: str | None = None, sort: str = "created_at:desc",
    page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
):
    now = now_ist()
    customer = _is_customer(user)
    rows = await _filtered(request, user)
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
async def export_csv(request: Request, user=Depends(current_user), status: str | None = None, sort: str = "created_at:desc"):
    customer = _is_customer(user)
    rows = await _filtered(request, user)
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
