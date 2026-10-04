"""Dev Tools: replay a §14.3 demo scenario as a NEW in-app claim, in Demo mode.

The seeded scenario claims stay untouched (they are illustrative history). A replay copies the scenario's inputs — customer, policy,
vehicle, incident, photos, voice note, documents, garage and quote — into a new SUBMITTED claim (origin "app", same scenario_id) and
runs the full pipeline with the recorded `demo_fallback/` outputs. The incident time and the original FNOL time are kept, so the mock
DPI records (FASTag, IIB, police) line up exactly as they do for the seeded claim. Documents with an image go back to "received" so
the Document agent reads them again; physical/digital items keep their status.
"""
from __future__ import annotations

import copy

from .claim_views import now_ist
from .json_store import update_json

SCENARIOS = ("clean_rear_end", "fastag_mismatch", "garage_overquote", "theft_two_wheeler", "flood_total_loss")
PIPELINE_FIELDS = ("checks", "financials", "fraud", "decision", "vehicle_identity", "intake", "risk_score", "risk_band")


async def clone(scenario_id: str, user: dict) -> dict:
    from ..routers.filing import iso, next_id, validated   # avoid an import cycle at module load

    if scenario_id not in SCENARIOS:
        raise KeyError(scenario_id)
    now = now_ist()

    def add(claims: list[dict]) -> dict:
        src = next(c for c in claims if c.get("scenario_id") == scenario_id and c.get("origin") != "app")
        c = copy.deepcopy(src)
        c["id"] = next_id(claims, now)
        c |= {"status": "SUBMITTED", "created_at": iso(now), "updated_at": iso(now), "origin": "app", "replay_of": src["id"],
              "garage_quote": (src.get("financials") or {}).get("garage_quote"), "assignee": None, "internal_notes": [],
              "communications": [], "pipeline_run_id": None, "ai_processing_s": None, "amount_approved": 0.0,
              "damage": {"items": [], "pre_existing": []}, "sla": {"target_hours": 48, "due_at": None, "breached": False}}
        for f in PIPELINE_FIELDS:
            c[f] = {} if f == "checks" else None
        if not c["garage_quote"]:
            c.pop("garage_quote")
        for d in c["documents"]:
            if d.get("url"):
                d |= {"status": "received", "extracted": {}, "checks": []}
        c["timeline"] = [{"ts": iso(now), "actor": "customer", "type": "fnol_received",
                          "text": f"FNOL received via {'WhatsApp' if c['channel'] == 'whatsapp' else c['channel'].title()} (scenario replay)"}]
        c["audit"] = [{"ts": iso(now), "actor": user["id"], "action": "created", "from": None, "to": "SUBMITTED",
                       "reason": f"Demo scenario replay of {src['id']} ({scenario_id})"}]
        claims.append(validated(c))
        return c

    return await update_json("claims.json", add, [])
