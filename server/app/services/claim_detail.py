"""Role-shaped claim detail for the Claim Detail page (spec §10.4, Phase 3B Stage 3).

Admins get the full claim plus `context`: the registry records the Verification tab shows (Vahan, FASTag events around the incident
with distance from the reported place, IIB, police, driving licence), policy / vehicle / customer / garage records, prior claims, a
linked-claims network where FR-07 fired, people names, the status-validity matrix (`allowed_actions`) and a template AI draft message
when one is due. Customers get the customer-safe projection (claim_views.to_customer_view) plus the policy, vehicle and garage
facts they need — never fraud, risk, rules, SIU, audit, notes, drafts or internal extraction data.
"""
from __future__ import annotations

import asyncio
import math
from datetime import datetime, timedelta

from . import claim_actions
from .claim_views import now_ist, to_customer_view, with_media_availability
from .json_store import read_json

FASTAG_WINDOW = timedelta(hours=36)
FAR_KM, NEAR_HOURS = 25, 6          # an event this far from the reported place this close in time is a contradiction


def km(lat1, lng1, lat2, lng2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(2 * r * math.asin(math.sqrt(a)), 1)


def fastag_events(events: list[dict], incident: dict) -> list[dict]:
    at = datetime.fromisoformat(incident["datetime"])
    loc = incident["location"]
    out = []
    for e in events:
        t = datetime.fromisoformat(e["ts"])
        if abs(t - at) > FASTAG_WINDOW:
            continue
        dist = km(loc["lat"], loc["lng"], e["lat"], e["lng"]) if e.get("lat") is not None else None
        hours = round((t - at).total_seconds() / 3600, 1)
        out.append({**e, "distance_km": dist, "hours_from_incident": hours,
                    "mismatch": dist is not None and dist > FAR_KM and abs(hours) <= NEAR_HOURS})
    return sorted(out, key=lambda e: e["ts"])


def message_channel(claim: dict) -> str:
    return "whatsapp" if claim.get("channel") == "whatsapp" else "sms"


def ai_draft(claim: dict, now: datetime) -> dict | None:
    """Template draft from the Communication agent's playbook (the live agent and "Regenerate" arrive in Phase 5).
    Always customer-safe: an SIU case reads exactly like any other review."""
    first = claim["customer_name"].split()[0]
    cid, status = claim["id"], claim["status"]
    items = ((claim.get("decision") or {}).get("info_request") or {}).get("items") or []
    texts = {
        "SUBMITTED": f"Hi {first}, we've received claim {cid}. Our team will review your photos and documents and update you shortly.",
        "PROCESSING": f"Hi {first}, we're reviewing claim {cid} now and will update you shortly.",
        "INFO_REQUESTED": (f"Hi {first}, a quick reminder: to keep claim {cid} moving we still need {', '.join(items) or 'a few documents'}. "
                           "You can upload them in the app or reply here."),
        "UNDER_REVIEW": f"Hi {first}, claim {cid} is with our claims team for review. We'll update you within one working day.",
        "SIU_INVESTIGATION": f"Hi {first}, claim {cid} is with our claims team for review. We'll update you within one working day.",
        "APPROVED": f"Hi {first}, claim {cid} is approved. We'll confirm the payment details once the repair invoice is received.",
        "PREAUTH_ISSUED": (f"Hi {first}, your cashless pre-approval for claim {cid} is ready at {claim.get('garage_name') or 'the garage'}. "
                           "Please share the final invoice once the repair is done."),
    }
    text = texts.get(status)
    if not text or any(m.get("text") == text for m in claim.get("communications", [])):
        return None
    return {"id": f"draft_{status.lower()}", "channel": message_channel(claim), "direction": "outbound", "status": "draft", "draft": True,
            "text": text, "created_at": now.isoformat(timespec="seconds"), "by": "agent:communication", "generated_by": "template"}


def calculation_ladder(f: dict | None) -> list[dict] | None:
    """§10.4 Financials ladder, one row per step, using only figures costing.py stored (every rupee is Python's; the UI only renders).
    kind: base | minus | plus | subtotal | total."""
    if not f:
        return None
    parts_dep = round(f["total_depreciation"] - f["paint_dep"], 2)
    steps = [
        {"label": "Gross parts", "amount": f["gross_parts"], "kind": "base"},
        {"label": "Depreciation on parts", "amount": -parts_dep, "kind": "minus",
         "note": "Waived (zero depreciation add-on)" if f.get("zero_dep") else "Age-based slabs; plastics, rubber and glass at their own rates"},
        {"label": "Net parts", "amount": f["net_parts"], "kind": "subtotal"},
        {"label": "Labour", "amount": f["labour"], "kind": "plus"},
        {"label": "Paint", "amount": f["paint_gross"], "kind": "plus"},
        {"label": "Paint material depreciation", "amount": -f["paint_dep"], "kind": "minus", "note": "Depreciation applies to paint material, not labour"},
        *({"label": e["description"], "amount": e["amount"], "kind": "plus"} for e in f.get("extras", [])),
        {"label": "Gross assessed loss", "amount": f["assessed_loss"], "kind": "subtotal"},
    ]
    tl = f.get("total_loss_check") or {}
    if tl.get("is_total_loss"):
        steps.append({"label": "Total loss — settled on IDV", "amount": tl["idv"], "kind": "base",
                      "note": f"Assessed loss is above {tl['threshold_pct']}% of the IDV"})
        if f.get("salvage"):
            steps.append({"label": "Salvage value retained", "amount": -f["salvage"], "kind": "minus"})
    steps.append({"label": "Compulsory deductible", "amount": -f["compulsory_deductible"], "kind": "minus"})
    if f.get("voluntary_deductible"):
        steps.append({"label": "Voluntary deductible", "amount": -f["voluntary_deductible"], "kind": "minus"})
    if f.get("salvage") and not tl.get("is_total_loss"):
        steps.append({"label": "Salvage", "amount": -f["salvage"], "kind": "minus"})
    steps.append({"label": "Net payable", "amount": f["net_payable"], "kind": "total", "display": f.get("display_net_payable")})
    return steps


DOC_STATUS = {"verified": "verified", "mismatch": "mismatch", "flagged": "unclear", "received": "received"}


def document_checklist(claim: dict, requirements: dict) -> list[dict]:
    """§11.5 checklist for this vehicle type: mandatory, applicable conditional (with the reason) and optional items, each with the
    status of the matching uploaded document (verified / mismatch / unclear / received) or missing."""
    spec = requirements.get(claim["vehicle"]["type"]) or {}
    conditions = set(claim.get("document_conditions") or [])
    by_req: dict[str, dict] = {}
    for d in claim.get("documents", []):
        by_req.setdefault(d.get("requirement"), d)
    out = []
    for group in ("mandatory", "conditional", "optional"):
        for item in spec.get(group, []):
            if group == "conditional" and not conditions & set(item.get("when") or []):
                continue
            doc = by_req.get(item["doc"])
            if item["doc"] == "photos":
                status = "verified" if any(m["kind"] == "photo" for m in claim.get("media", [])) else "missing"
            else:
                status = DOC_STATUS.get(doc["status"], "received") if doc else "missing"
            out.append({"doc": item["doc"], "label": item["label"], "group": group, "reason": item.get("reason"), "status": status,
                        "document_id": doc["id"] if doc else None})
    return out


async def _registries() -> dict:
    names = ("policies", "vehicles", "customers", "garages", "vahan", "fastag", "iib", "police_records", "driving_licences", "users",
             "document_requirements", "fraud_rules")
    values = await asyncio.gather(*(read_json(f"{n}.json", [] if n in ("policies", "vehicles", "customers", "garages", "users") else {})
                                    for n in names))
    return dict(zip(names, values))


def _network(claim: dict, claims: list[dict]) -> dict | None:
    """Linked claims for FR-07 (shared garage among claims that also fired FR-07)."""
    fired = {f["rule_id"] for f in (claim.get("fraud") or {}).get("fired", [])}
    if "FR-07" not in fired or not claim.get("garage_name"):
        return None
    linked = [c for c in claims if c["id"] != claim["id"] and c.get("garage_name") == claim["garage_name"]
              and "FR-07" in {f["rule_id"] for f in (c.get("fraud") or {}).get("fired", [])}][:6]
    if not linked:
        return None
    return {"shared": {"garage": claim["garage_name"]},
            "claims": [{"id": c["id"], "customer_name": c["customer_name"], "status": c["status"], "risk_score": c.get("risk_score")} for c in linked]}


async def detail(claim: dict, user: dict, claims: list[dict]) -> dict:
    claim = with_media_availability(claim)
    reg = await _registries()
    policy = next((p for p in reg["policies"] if p["policy_no"] == claim["policy_no"]), None)
    vehicle = next((v for v in reg["vehicles"] if v["id"] == claim["vehicle_id"]), None)
    garage_id = (claim.get("settlement") or {}).get("garage_id")
    garage = next((g for g in reg["garages"] if g["id"] == garage_id), None)
    now = now_ist()

    if user.get("role") == "customer":
        out = to_customer_view(claim)
        out["document_checklist"] = document_checklist(claim, reg["document_requirements"])
        out["context"] = {
            "policy": policy and {k: policy.get(k) for k in ("policy_no", "product", "cover", "start", "end", "idv", "ncb_pct", "add_ons", "status")},
            "vehicle": vehicle and {k: vehicle.get(k) for k in ("registration", "make", "model", "variant", "fuel", "colour", "registered_on", "type")},
            "garage": garage and {k: garage.get(k) for k in ("name", "city", "type", "cashless", "contact", "avg_tat_days")},
        }
        return out

    customer = next((c for c in reg["customers"] if c["id"] == claim["customer_id"]), None)
    dl_no = ((claim.get("checks") or {}).get("dl") or {}).get("data", {}).get("dl_number")
    prior = [{"id": c["id"], "status": c["status"], "created_at": c["created_at"], "claim_type": c["claim_type"],
              "amount_claimed": c["amount_claimed"]} for c in claims
             if c["customer_id"] == claim["customer_id"] and c["id"] != claim["id"] and c["status"] != "DRAFT"]
    out = dict(claim)
    out["context"] = {
        "policy": policy, "vehicle": vehicle, "garage": garage,
        "customer": customer and {**customer, "prior_claims": sorted(prior, key=lambda p: p["created_at"], reverse=True)},
        "vahan": reg["vahan"].get(claim["registration"]),
        "fastag_events": fastag_events(reg["fastag"].get(claim["registration"], []), claim["incident"]),
        "iib": reg["iib"].get(claim["registration"], []),
        "police": reg["police_records"].get(claim["registration"], []),
        "dl": {"dl_number": dl_no, **reg["driving_licences"][dl_no]} if dl_no in reg["driving_licences"] else None,
        "network": _network(claim, claims),
        "people": {u["id"]: u.get("display_name") or u["username"] for u in reg["users"] if u.get("role") == "admin"},
        "rule_names": {r["id"]: r["name"] for r in (reg["fraud_rules"] if isinstance(reg["fraud_rules"], list) else reg["fraud_rules"].get("rules", []))},
        "ladder": calculation_ladder(claim.get("financials")),
    }
    out["document_checklist"] = document_checklist(claim, reg["document_requirements"])
    out["allowed_actions"] = claim_actions.allowed_actions(claim)
    out["undo_seconds"] = claim_actions.UNDO_SECONDS
    draft = ai_draft(claim, now)
    out["communications"] = claim.get("communications", []) + ([draft] if draft else [])
    return out
