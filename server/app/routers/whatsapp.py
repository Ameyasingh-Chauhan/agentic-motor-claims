"""WhatsApp Journey replays (spec §10.9): scripted conversations from whatsapp_scenarios.json (built from real claims by
scripts/make_whatsapp_scenarios.py). Customers only receive journeys on their own claims, and never the internal under-the-hood
blocks (risk findings, rules, SIU) — rule 5, customer-safe language."""
from __future__ import annotations

import copy

from fastapi import APIRouter, Depends

from ..services.json_store import read_json
from .auth import current_user

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])


def customer_safe(scenario: dict) -> dict:
    s = copy.deepcopy(scenario)
    for m in s["messages"]:
        if (m.get("under_the_hood") or {}).get("internal"):
            m["under_the_hood"] = None
    return s


@router.get("/scenarios")
async def scenarios(user=Depends(current_user)):
    items = await read_json("whatsapp_scenarios.json", [])
    if user.get("role") == "customer":
        items = [customer_safe(s) for s in items if s.get("customer_id") == user.get("customer_id")]
    return {"items": items}
