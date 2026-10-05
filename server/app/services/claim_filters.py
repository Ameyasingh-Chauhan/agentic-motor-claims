"""One filter implementation for the claims list (Home) and the Dashboard (§10.5).

Every Dashboard chart counts claims with `matches()` and builds its drill-down link from the same parameter names, so the number
on a chart segment always equals the row count of the Home list it opens.

Derived dimensions (not stored on the claim): garage type (garages.json), city tier (cities.json), FNOL day-of-week / hour (IST),
routing outcome, and the AI-vs-final decision direction used for the human-override rate.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from .claim_views import CLOSED_UNPAID, OPEN_STATUSES, PAID_STATUSES, SEGMENTS, is_auto, is_decided, ts
from .json_store import read_json

# Dashboard filter keys (sticky filter bar) and the extra drill-down keys charts may add on top.
DASHBOARD_FILTERS = ("vehicle_type", "claim_type", "city", "channel", "garage_type")
LIST_KEYS = ("q", "vehicle_type", "claim_type", "city", "garage", "risk_band", "min_amount", "max_amount", "from", "to", "segment",
             "channel", "garage_type", "city_tier", "dow", "hour", "rule", "min_risk", "max_risk", "outcome", "route", "date_on")

OUTCOMES = {  # key → (label, predicate on status)
    "paid": ("Paid / approved", lambda s: s in PAID_STATUSES),
    "declined": ("Declined", lambda s: s == "DECLINED"),
    "fraud_confirmed": ("Fraud confirmed", lambda s: s == "FRAUD_CONFIRMED"),
    "withdrawn": ("Withdrawn", lambda s: s == "WITHDRAWN"),
    "open": ("Still open", lambda s: s in OPEN_STATUSES),
}
ROUTES = {"auto": "Straight-through", "handler": "Handler review", "SIU": "SIU referral", "pending": "Not routed yet"}

_PAY = {"approve", "approve_revised", "approve_total_loss"}
_DENY = {"reject", "escalate_siu", "confirm_fraud", "decline"}


def outcome_of(c: dict) -> str:
    return next(k for k, (_label, pred) in OUTCOMES.items() if pred(c["status"]) or k == "open")


def route_of(c: dict) -> str:
    return (c.get("decision") or {}).get("route") or "pending"


def _direction(action: str | None) -> str | None:
    return "pay" if action in _PAY else "deny" if action in _DENY else None


def is_human_decision(c: dict) -> bool:
    """Decided by a person (not straight-through) where the AI made a pay / deny recommendation to compare against."""
    d = c.get("decision") or {}
    return is_decided(c) and not is_auto(c) and _direction(d.get("recommended_action")) is not None \
        and _direction(d.get("final_action")) is not None


def is_overridden(c: dict) -> bool:
    d = c.get("decision") or {}
    return is_human_decision(c) and _direction(d["recommended_action"]) != _direction(d["final_action"])


def _has_event(kind: str) -> Callable[[dict], bool]:
    return lambda c: any(e["type"] == kind for e in c.get("timeline", []))


SEGMENTS.update({
    "settled": lambda c: c["status"] == "SETTLED",
    "verified": _has_event("checks_complete"),
    "assessed": _has_event("damage_assessed"),
    "human_decided": is_human_decision,
    "overridden": is_overridden,
})
INTERNAL_SEGMENTS = {"fraud_detected", "fraud_savings", "decided", "auto_decided", "pending_action", "human_decided", "overridden",
                     "verified", "assessed", "bucket_siu", "bucket_needs_action"}
SEGMENT_LABELS = {"settled": "Settled", "verified": "Verified", "assessed": "Damage assessed", "human_decided": "Decided by a handler",
                  "overridden": "AI recommendation overridden"}


@dataclass
class Context:
    garage_type: dict[str, str] = field(default_factory=dict)   # garage id → "authorised" | "multibrand"
    garage_by_name: dict[str, str] = field(default_factory=dict)
    city_tier: dict[str, int] = field(default_factory=dict)
    garage_city: dict[str, str] = field(default_factory=dict)   # garage name → its own city

    def garage_type_of(self, c: dict) -> str:
        gid = (c.get("settlement") or {}).get("garage_id")
        return self.garage_type.get(gid) or self.garage_by_name.get(c.get("garage_name") or "") or "none"

    def tier_of(self, c: dict) -> int | None:
        return self.city_tier.get(c["city"])


async def load_context() -> Context:
    garages = await read_json("garages.json", [])
    cities = await read_json("cities.json", [])
    return Context(garage_type={g["id"]: g["type"] for g in garages}, garage_by_name={g["name"]: g["type"] for g in garages},
                   city_tier={c["city"]: c["tier"] for c in cities}, garage_city={g["name"]: g["city"] for g in garages})


def _csv(value) -> set[str]:
    return {v for v in str(value or "").split(",") if v}


def _num(value) -> float | None:
    return None if value in (None, "") else float(value)


def ist_hour_dow(c: dict) -> tuple[int, int]:
    t = ts(c["created_at"])   # stored in IST (+05:30)
    return t.weekday(), t.hour


def event_date(c: dict, date_on: str | None) -> str | None:
    """The date the from/to range applies to: FNOL (default) or the decision date."""
    if date_on == "decided":
        return ((c.get("decision") or {}).get("decided_at") or "")[:10] or None
    return c["created_at"][:10]


def build(params: dict, ctx: Context, *, customer: bool = False) -> Callable[[dict], bool]:
    """Predicate for list/dashboard params. Unknown segments raise KeyError (the router maps it to 422)."""
    p = {k: params.get(k) for k in LIST_KEYS}
    needle = (p["q"] or "").strip().casefold()
    compact = needle.replace(" ", "")
    vt, ct, cities, bands = _csv(p["vehicle_type"]), _csv(p["claim_type"]), _csv(p["city"]), _csv(p["risk_band"])
    channels, gtypes, tiers = _csv(p["channel"]), _csv(p["garage_type"]), {int(t) for t in _csv(p["city_tier"])}
    dows, hours = {int(d) for d in _csv(p["dow"])}, {int(h) for h in _csv(p["hour"])}
    rules, outcomes, routes = _csv(p["rule"]), _csv(p["outcome"]), _csv(p["route"])
    min_amount, max_amount, min_risk, max_risk = _num(p["min_amount"]), _num(p["max_amount"]), _num(p["min_risk"]), _num(p["max_risk"])
    seg = SEGMENTS[p["segment"]] if p["segment"] else None
    garage, date_from, date_to, date_on = p["garage"], p["from"], p["to"], p["date_on"]
    if customer:  # customers never filter on risk, fraud, routing or internal decision data (the filter is ignored, not applied)
        bands, rules, routes, outcomes, min_risk, max_risk = set(), set(), set(), set(), None, None
        if p["segment"] in INTERNAL_SEGMENTS:
            seg = None

    def keep(c: dict) -> bool:
        if needle:
            hay = " ".join((c["id"], c["customer_name"], c["city"], c["policy_no"])).casefold()
            if needle not in hay and compact not in c["registration"].replace(" ", "").casefold():
                return False
        if vt and c["vehicle"]["type"] not in vt or ct and c["claim_type"] not in ct or cities and c["city"] not in cities:
            return False
        if channels and c["channel"] not in channels or garage and c.get("garage_name") != garage:
            return False
        if gtypes and ctx.garage_type_of(c) not in gtypes or tiers and ctx.tier_of(c) not in tiers:
            return False
        if bands and c.get("risk_band") not in bands:
            return False
        amount = c["amount_claimed"]
        if min_amount is not None and amount < min_amount or max_amount is not None and amount > max_amount:
            return False
        risk = c.get("risk_score")
        if (min_risk is not None or max_risk is not None) and (risk is None or min_risk is not None and risk < min_risk
                                                                 or max_risk is not None and risk > max_risk):
            return False
        if date_from or date_to:
            d = event_date(c, date_on)
            if d is None or date_from and d < date_from or date_to and d > date_to:
                return False
        if dows or hours:
            dow, hour = ist_hour_dow(c)
            if dows and dow not in dows or hours and hour not in hours:
                return False
        if rules and not rules & {f["rule_id"] for f in (c.get("fraud") or {}).get("fired", [])}:
            return False
        if outcomes and outcome_of(c) not in outcomes or routes and route_of(c) not in routes:
            return False
        return seg is None or seg(c)

    return keep


def apply(claims: list[dict], params: dict, ctx: Context, *, customer: bool = False) -> list[dict]:
    keep = build(params, ctx, customer=customer)
    return [c for c in claims if keep(c)]


__all__ = ["CLOSED_UNPAID", "Context", "DASHBOARD_FILTERS", "LIST_KEYS", "OUTCOMES", "ROUTES", "SEGMENT_LABELS", "apply", "build",
           "event_date", "ist_hour_dow", "is_human_decision", "is_overridden", "load_context", "outcome_of", "route_of"]
