"""Shared claim logic for list, stats and exports.

KPI values and KPI click-through filters use the same `SEGMENTS` predicates, so a card's number always
equals the row count of the list it opens.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

from ..config import SERVER_DIR
from . import uploads

PUBLIC_DIR = SERVER_DIR.parent / "client" / "public"

IST = timezone(timedelta(hours=5, minutes=30))

OPEN_STATUSES = {"SUBMITTED", "PROCESSING", "INFO_REQUESTED", "UNDER_REVIEW", "SIU_INVESTIGATION"}
PENDING_ACTION = {"INFO_REQUESTED", "UNDER_REVIEW", "SIU_INVESTIGATION"}
PAID_STATUSES = {"APPROVED", "PREAUTH_ISSUED", "SETTLED"}
CLOSED_UNPAID = {"DECLINED", "FRAUD_CONFIRMED", "WITHDRAWN"}


def listed(claims: list[dict]) -> list[dict]:
    """Claims shown in lists, stats and search: everything except unsubmitted drafts (§11.6)."""
    return [c for c in claims if c["status"] != "DRAFT"]


def now_ist() -> datetime:
    return datetime.now(IST)


def ts(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def fy_start(now: datetime) -> datetime:
    year = now.year if now.month >= 4 else now.year - 1
    return datetime(year, 4, 1, tzinfo=IST)


def is_fraud_detected(c: dict) -> bool:
    return c["status"] in {"FRAUD_CONFIRMED", "SIU_INVESTIGATION"} or (c["status"] == "DECLINED" and c.get("risk_band") == "high")


def overquote_saving(c: dict) -> float:
    f = c.get("financials") or {}
    if c["status"] in PAID_STATUSES and f.get("variance_level") in ("warn", "fail") and f.get("garage_quote"):
        return max(0.0, f["garage_quote"] - f["assessed_loss"])
    return 0.0


def fraud_saving(c: dict) -> float:
    if c["status"] == "FRAUD_CONFIRMED" or (c["status"] == "DECLINED" and c.get("risk_band") == "high"):
        return float(c.get("amount_claimed") or 0)
    return overquote_saving(c)


def is_decided(c: dict) -> bool:
    return bool((c.get("decision") or {}).get("decided_at"))


def is_auto(c: dict) -> bool:
    return bool((c.get("decision") or {}).get("auto")) and is_decided(c)


# Status buckets for the Home donut. Customers get their own grouping and never see internal statuses.
BUCKETS = [
    ("in_progress", "In progress", {"SUBMITTED", "PROCESSING"}),
    ("needs_action", "Needs action", {"INFO_REQUESTED", "UNDER_REVIEW"}),
    ("siu", "SIU", {"SIU_INVESTIGATION"}),
    ("paid", "Paid & approved", PAID_STATUSES),
    ("closed", "Closed", CLOSED_UNPAID),
]
CUSTOMER_BUCKETS = [
    ("c_in_progress", "In progress", {"SUBMITTED", "PROCESSING", "UNDER_REVIEW", "SIU_INVESTIGATION"}),
    ("c_needs_input", "Needs input", {"INFO_REQUESTED"}),
    ("c_paid", "Paid & approved", PAID_STATUSES),
    ("c_closed", "Closed", CLOSED_UNPAID),
]
# Internal statuses a customer must never see (§6.5 customer labels are applied on top of these in the UI).
CUSTOMER_STATUS = {"SIU_INVESTIGATION": "UNDER_REVIEW", "FRAUD_CONFIRMED": "DECLINED"}


def customer_status(status: str) -> str:
    return CUSTOMER_STATUS.get(status, status)


SEGMENTS: dict[str, Callable[[dict], bool]] = {
    "paid": lambda c: c["status"] in PAID_STATUSES,
    "fraud_detected": is_fraud_detected,
    "fraud_savings": lambda c: fraud_saving(c) > 0,
    "decided": is_decided,
    "auto_decided": is_auto,
    "pending_action": lambda c: c["status"] in PENDING_ACTION,
    "open": lambda c: c["status"] in OPEN_STATUSES,
}
for _key, _label, _statuses in BUCKETS + CUSTOMER_BUCKETS:
    SEGMENTS[f"bucket_{_key}"] = (lambda st: lambda c: c["status"] in st)(_statuses)


def status_at(c: dict, when: datetime) -> str | None:
    """Replay the audit trail to find the claim's status at `when` (None if not yet created)."""
    if ts(c["created_at"]) > when:
        return None
    status = "PROCESSING"
    for entry in sorted(c.get("audit", []), key=lambda a: a["ts"]):
        if entry.get("action") == "status_change" and ts(entry["ts"]) <= when:
            status = entry["to"]
    return status


def sla_state(c: dict, now: datetime) -> dict:
    sla = c.get("sla") or {}
    due = ts(sla.get("due_at"))
    if c["status"] not in OPEN_STATUSES or not due:
        return {"due_at": None, "breached": False, "due_soon": False, "hours_left": None}
    hours_left = (due - now).total_seconds() / 3600
    return {"due_at": sla["due_at"], "breached": hours_left < 0, "due_soon": 0 <= hours_left <= 12, "hours_left": round(hours_left, 1)}


def flag_counts(c: dict) -> dict:
    fired = (c.get("fraud") or {}).get("fired", [])
    return {"red": sum(1 for f in fired if f["level"] == "fail"), "amber": sum(1 for f in fired if f["level"] == "warn")}


def row(c: dict, *, customer: bool, now: datetime) -> dict:
    """Slim list row; customers never receive risk or flag information."""
    first_photo = next((m for m in c.get("media", []) if m["kind"] == "photo"), None)
    out = {
        "id": c["id"], "status": customer_status(c["status"]) if customer else c["status"], "created_at": c["created_at"], "updated_at": c["updated_at"],
        "channel": c["channel"], "origin": c.get("origin"), "claim_type": c["claim_type"], "customer_name": c["customer_name"], "city": c["city"],
        "registration": c["registration"], "vehicle": c["vehicle"], "garage_name": c.get("garage_name"),
        "incident": {"type": c["incident"]["type"], "label": c["incident"].get("label"), "description": c["incident"]["narrative_en"],
                     "datetime": c["incident"]["datetime"]},
        "amount_claimed": c["amount_claimed"], "amount_approved": c["amount_approved"],
        "photo": {"url": first_photo["url"], "thumb": first_photo.get("thumb"), "blur_data": first_photo.get("blur_data")} if first_photo else None,
        "sla": sla_state(c, now),
    }
    if not customer:
        out |= {"risk_score": c.get("risk_score"), "risk_band": c.get("risk_band"), "flags": flag_counts(c), "assignee": c.get("assignee")}
    return out


CUSTOMER_DROP = {"fraud", "risk_score", "risk_band", "audit", "internal_notes", "assignee", "ai_processing_s"}
CUSTOMER_EVENT_TYPES = {"fnol_received", "customer_notified", "info_requested", "settled", "decision", "preauth_issued", "approved",
                        "declined", "fraud_confirmed", "withdrawn"}
CUSTOMER_EVENT_TEXT = {"fraud_confirmed": "Claim not approved", "declined": "Claim not approved", "customer_notified": "Update sent to you"}


def to_customer_view(c: dict) -> dict:
    """Customer-safe projection (§11.2): no fraud, risk, audit, internal notes, check data or pre-existing findings."""
    out = {k: v for k, v in c.items() if k not in CUSTOMER_DROP}
    out["status"] = customer_status(c["status"])
    out["checks"] = {k: {"level": "pass" if v["level"] == "pass" else "pending", "summary": "Verified" if v["level"] == "pass" else "In progress"}
                     for k, v in c.get("checks", {}).items()}
    damage = dict(c.get("damage") or {})
    damage.pop("pre_existing", None)
    damage.pop("narrative_consistency", None)
    damage["items"] = [{k: v for k, v in i.items() if k not in ("boxes", "flag", "fresh")} for i in damage.get("items", [])]
    out["damage"] = damage
    decision = dict(c.get("decision") or {})
    for k in ("reasons", "route", "recommended_action", "confidence", "auto"):
        decision.pop(k, None)
    out["decision"] = decision
    out["timeline"] = [{**e, "type": "declined" if e["type"] == "fraud_confirmed" else e["type"], "text": CUSTOMER_EVENT_TEXT.get(e["type"], e["text"]), "actor": "abc" if e["actor"].startswith(("agent:", "u_", "system")) else e["actor"]}
                       for e in c.get("timeline", []) if e["type"] in CUSTOMER_EVENT_TYPES]
    out["documents"] = [{k: v for k, v in d.items() if k != "checks"} for d in c.get("documents", [])]
    return out


def with_media_availability(c: dict) -> dict:
    """Mark each media item `available` (its file exists). Scenario voice notes are recorded by the user and dropped
    into client/public/assets/audio/scenarios/ later; until then the UI shows the transcript with "Audio not retained"."""
    media = []
    for m in c.get("media", []):
        url = m.get("url")
        if url and url.startswith("/api/files/"):  # private upload (§11.6): server/uploads/<claim_id>/<file>
            _, _, _, claim_id, name = url.split("/", 4)
            available = uploads.safe_file(claim_id, name) is not None
        else:
            available = bool(url) and (not url.startswith("/assets/") or (PUBLIC_DIR / url.lstrip("/")).is_file())
        media.append({**m, "available": available})
    return {**c, "media": media}
