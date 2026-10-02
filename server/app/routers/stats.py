"""Home statistics (spec §10.3). Everything is derived from claims.json at request time (CLAUDE.md rule 14).

- KPI values cover the current financial year (Apr–Mar); "Pending action" is a live snapshot.
- Deltas compare the last 30 days with the 30 days before ("vs prior 30 days"); rates use percentage points.
- Sparklines are 12 consecutive 30-day windows ending now, so the last two points are the delta windows.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from statistics import mean
from typing import Callable

from fastapi import APIRouter, Depends

from ..services.claim_views import (
    BUCKETS, CUSTOMER_BUCKETS, OPEN_STATUSES, PAID_STATUSES, PENDING_ACTION, customer_status, fraud_saving, fy_start, is_auto, is_decided,
    is_fraud_detected, now_ist, sla_state, status_at, to_customer_view, ts,
)
from ..config import get_settings
from ..services.json_store import read_json
from .auth import current_user

router = APIRouter(prefix="/api/stats", tags=["stats"])

WINDOW = timedelta(days=30)
AGENTS = 7


def _windows(now: datetime, n: int = 12) -> list[tuple[datetime, datetime]]:
    return [(now - WINDOW * (i + 1), now - WINDOW * i) for i in reversed(range(n))]


def _in(value: str | None, lo: datetime, hi: datetime) -> bool:
    t = ts(value)
    return t is not None and lo < t <= hi


def _turnaround_h(c: dict) -> float:
    return (ts(c["decision"]["decided_at"]) - ts(c["created_at"])).total_seconds() / 3600


def _pct_change(cur: float, prev: float) -> float | None:
    if prev == 0:
        return None if cur == 0 else 100.0
    return round((cur - prev) / prev * 100, 1)


def _series(metric: Callable[[datetime, datetime], float], now: datetime) -> list[float]:
    return [round(metric(lo, hi), 2) for lo, hi in _windows(now)]


def _kpi(key, label, value, fmt, series, *, semantics="up-good", rate=False, link=None):
    cur, prev = series[-1], series[-2]
    delta = round(cur - prev, 1) if rate else _pct_change(cur, prev)
    return {"key": key, "label": label, "value": value, "format": fmt, "series": series,
            "delta": None if delta is None else {"value": delta, "unit": "pp" if rate else "%"},
            "delta_semantics": semantics, "link": link or {}}


def admin_kpis(claims: list[dict], now: datetime) -> list[dict]:
    fy = fy_start(now)
    fy_from = fy.date().isoformat()
    fy_claims = [c for c in claims if ts(c["created_at"]) >= fy]
    paid = [c for c in fy_claims if c["status"] in PAID_STATUSES]
    decided = [c for c in fy_claims if is_decided(c)]

    def created(lo, hi):
        return [c for c in claims if _in(c["created_at"], lo, hi)]

    def decided_in(lo, hi):
        return [c for c in claims if is_decided(c) and _in(c["decision"]["decided_at"], lo, hi)]

    def avg_tat(lo, hi):
        rows = decided_in(lo, hi)
        return mean(_turnaround_h(c) for c in rows) if rows else 0.0

    def stp(lo, hi):
        rows = decided_in(lo, hi)
        return 100 * sum(1 for c in rows if is_auto(c)) / len(rows) if rows else 0.0

    def pending_at(_lo, hi):
        return sum(1 for c in claims if status_at(c, hi) in PENDING_ACTION)

    return [
        _kpi("total_claims", "Total claims", len(fy_claims), "number", _series(lambda lo, hi: len(created(lo, hi)), now),
             link={"from": fy_from}),
        _kpi("settled_approved", "Settled / approved", len(paid), "number",
             _series(lambda lo, hi: sum(1 for c in decided_in(lo, hi) if c["status"] in PAID_STATUSES), now),
             link={"segment": "paid", "from": fy_from}),
        _kpi("amount_approved", "Amount approved", sum(c["amount_approved"] for c in paid), "inr",
             _series(lambda lo, hi: sum(c["amount_approved"] for c in decided_in(lo, hi) if c["status"] in PAID_STATUSES), now),
             link={"segment": "paid", "from": fy_from, "sort": "amount:desc"}),
        _kpi("fraud_detected", "Fraud detected", sum(1 for c in fy_claims if is_fraud_detected(c)), "number",
             _series(lambda lo, hi: sum(1 for c in created(lo, hi) if is_fraud_detected(c)), now), semantics="up-bad",
             link={"segment": "fraud_detected", "from": fy_from}),
        _kpi("fraud_savings", "Fraud savings", sum(fraud_saving(c) for c in fy_claims), "inr",
             _series(lambda lo, hi: sum(fraud_saving(c) for c in created(lo, hi)), now),
             link={"segment": "fraud_savings", "from": fy_from, "sort": "amount:desc"}),
        _kpi("avg_turnaround", "Avg turnaround", mean(_turnaround_h(c) for c in decided) if decided else 0, "hours",
             _series(avg_tat, now), semantics="up-bad", link={"segment": "decided", "from": fy_from}),
        _kpi("stp_rate", "STP rate", 100 * sum(1 for c in decided if is_auto(c)) / len(decided) if decided else 0, "percent",
             _series(stp, now), rate=True, link={"segment": "auto_decided", "from": fy_from}),
        _kpi("pending_action", "Pending action", sum(1 for c in claims if c["status"] in PENDING_ACTION), "number",
             _series(pending_at, now), semantics="up-bad", link={"segment": "pending_action"})
        | {"breakdown": {s: sum(1 for c in claims if c["status"] == s) for s in ("INFO_REQUESTED", "UNDER_REVIEW", "SIU_INVESTIGATION")}},
    ]


def customer_kpis(claims: list[dict]) -> list[dict]:
    paid = [c for c in claims if c["status"] in PAID_STATUSES]
    latest = max(claims, key=lambda c: c["updated_at"], default=None)
    return [
        {"key": "my_claims", "label": "My claims", "value": len(claims), "format": "number", "link": {}},
        {"key": "approved_amount", "label": "Approved amount", "value": sum(c["amount_approved"] for c in paid), "format": "inr",
         "link": {"segment": "paid"}},
        {"key": "in_progress", "label": "In progress", "value": sum(1 for c in claims if c["status"] in OPEN_STATUSES), "format": "number",
         "link": {"segment": "open"}},
        {"key": "last_update", "label": "Last update", "value": latest["updated_at"] if latest else None, "format": "datetime",
         "link": {"sort": "updated_at:desc"}, "claim_id": latest["id"] if latest else None},
    ]


def hero(claims: list[dict], now: datetime, *, customer: bool) -> dict:
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    recent = [c for c in claims if ts(c["created_at"]) > now - WINDOW] or claims
    out = {"agents_online": AGENTS, "agents_total": AGENTS,
           "avg_ai_seconds": round(mean(c.get("ai_processing_s", 0) for c in recent), 1) if recent else None}
    todays = [c for c in claims if ts(c["created_at"]) >= today]
    if customer:
        return out | {"claims_filed": len(claims), "in_progress": sum(1 for c in claims if c["status"] in OPEN_STATUSES)}
    return out | {"processed_today": len(todays), "flagged_today": sum(1 for c in todays if c["risk_band"] != "low")}


def _reason(c: dict, sla: dict, *, customer: bool) -> dict:
    if customer:
        items = ((c.get("decision") or {}).get("info_request") or {}).get("items") or []
        return {"level": "warn", "text": "We need: " + ", ".join(items) if items else "We need a little more information"}
    fired = sorted(c["fraud"]["fired"], key=lambda f: -f["points"])
    top = fired[0]["name"] if fired else None
    if c["status"] == "SIU_INVESTIGATION":
        base = {"level": "fail", "text": f"SIU referral · {top}" if top else "SIU referral"}
    elif c["status"] == "INFO_REQUESTED":
        items = (c["decision"].get("info_request") or {}).get("items") or ["documents"]
        base = {"level": "warn", "text": f"Awaiting customer · {items[0]}"}
    elif c["financials"]["total_loss_check"]["is_total_loss"]:
        base = {"level": "warn", "text": "Total loss · handler review"}
    elif c["financials"].get("variance_level") in ("warn", "fail"):
        base = {"level": "warn", "text": f"Garage quote {c['financials']['variance_pct']:.0f}% above estimate"}
    else:
        base = {"level": "warn", "text": f"Medium risk · {top}" if top else "Handler review"}
    if sla["breached"]:
        return {"level": "fail", "text": "SLA breached · " + base["text"]}
    if sla["due_soon"]:
        return {"level": "warn" if base["level"] == "warn" else "fail", "text": f"SLA due in {max(1, round(sla['hours_left']))} h · " + base["text"]}
    return base


def needs_attention(claims: list[dict], now: datetime, *, customer: bool) -> list[dict]:
    statuses = {"INFO_REQUESTED"} if customer else PENDING_ACTION
    rows = []
    for c in claims:
        if c["status"] not in statuses:
            continue
        sla = sla_state(c, now)
        priority = (3 if sla["breached"] else 2 if sla["due_soon"] else 0) + (2 if c["status"] == "SIU_INVESTIGATION" else 0) + c["risk_score"] / 100
        rows.append((priority, c, sla))
    rows.sort(key=lambda r: (-r[0], r[1]["created_at"]))
    out = []
    for _p, c, sla in rows[:6]:
        item = {"id": c["id"], "status": customer_status(c["status"]) if customer else c["status"], "customer_name": c["customer_name"], "city": c["city"],
                "registration": c["registration"], "vehicle": c["vehicle"], "created_at": c["created_at"], "sla": sla,
                "reason": _reason(c, sla, customer=customer)}
        if not customer:
            item["risk_score"] = c["risk_score"]
        out.append(item)
    return out


ACTIVITY_TYPES = {"fnol_received", "siu_referral", "decision", "settled", "info_requested", "approved", "preauth_issued",
                  "declined", "fraud_confirmed", "risk_scored", "assigned"}


def customer_activity(claims: list[dict], insurer: str) -> list[dict]:
    events = []
    for c in claims:
        events.append({"ts": c["created_at"], "claim_id": c["id"], "kind": "customer", "actor": "You", "type": "fnol_received",
                       "text": f"Claim filed via {'WhatsApp' if c['channel'] == 'whatsapp' else c['channel'].title()}", "customer_name": c["customer_name"]})
        for m in c.get("communications", []):
            if m.get("direction") == "outbound" and not m.get("draft"):
                events.append({"ts": m["created_at"], "claim_id": c["id"], "kind": "system", "actor": insurer, "type": "message",
                               "text": m["text"], "customer_name": c["customer_name"]})
    events.sort(key=lambda e: e["ts"], reverse=True)
    return events[:6]


def recent_activity(claims: list[dict], users: dict, *, customer: bool) -> list[dict]:
    events = []
    for c in claims:
        source = to_customer_view(c)["timeline"] if customer else c["timeline"]
        for e in source:
            if customer or e["type"] in ACTIVITY_TYPES:
                if not customer and e["type"] == "risk_scored" and c["risk_band"] == "low":
                    continue
                events.append((e, c))
    events.sort(key=lambda p: p[0]["ts"], reverse=True)
    out = []
    for e, c in events[:6]:
        actor = e["actor"]
        kind = "agent" if actor.startswith("agent:") else "human" if actor.startswith("u_") else "customer" if actor == "customer" else "system"
        label = (actor.split(":", 1)[1].title() + " agent" if kind == "agent" else users.get(actor, "Claims handler") if kind == "human"
                 else c["customer_name"] if kind == "customer" else "System")
        out.append({"ts": e["ts"], "claim_id": c["id"], "kind": kind, "actor": label, "type": e["type"], "text": e["text"],
                    "customer_name": c["customer_name"]})
    return out


@router.get("/home")
async def home_stats(user=Depends(current_user)):
    now = now_ist()
    customer = user.get("role") == "customer"
    claims = await read_json("claims.json", [])
    if customer:
        claims = [c for c in claims if c["customer_id"] == user.get("customer_id")]
    users = {u["id"]: u.get("display_name") for u in await read_json("users.json", [])}
    buckets = CUSTOMER_BUCKETS if customer else BUCKETS
    return {
        "generated_at": now.isoformat(timespec="seconds"),
        "period": {"from": fy_start(now).date().isoformat(), "to": now.date().isoformat(), "delta_label": "vs prior 30 days"},
        "hero": hero(claims, now, customer=customer),
        "kpis": customer_kpis(claims) if customer else admin_kpis(claims, now),
        "needs_attention": needs_attention(claims, now, customer=customer),
        "status_buckets": [{"key": k, "label": label, "segment": f"bucket_{k}", "count": sum(1 for c in claims if c["status"] in s)}
                           for k, label, s in buckets],
        "total_claims": len(claims),
        "recent_activity": customer_activity(claims, get_settings().insurer_name) if customer else recent_activity(claims, users, customer=False),
    }
