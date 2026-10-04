"""Explainable, deterministic fraud scoring (spec §13).

Rule metadata (name, points, level, customer-safe reason, enabled) lives in `fraud_rules.json`; the
conditions below read a flat `context` built from the claim. Score = min(100, Σ points of fired rules).
The LLM may write narrative/evidence text but never changes points or the score.
"""
from __future__ import annotations

from typing import Callable

from . import reference


def _fr06_points(c: dict) -> int:
    v = c.get("garage_variance_pct") or 0
    return 15 if v > 30 else (5 if v > 15 else 0)


CONDITIONS: dict[str, Callable[[dict], bool]] = {
    "FR-01": lambda c: bool(c.get("location_contradiction")),
    "FR-02": lambda c: (c.get("pre_existing_confidence") or 0) >= 0.70,
    "FR-03": lambda c: c.get("narrative_consistent") is False and (c.get("narrative_confidence") or 0) >= 0.65,
    "FR-04": lambda c: (c.get("od_claims_12m") or 0) >= 2,
    "FR-05": lambda c: bool(c.get("early_claim")),
    "FR-06": lambda c: _fr06_points(c) > 0,
    "FR-07": lambda c: bool(c.get("network_link")),
    "FR-08": lambda c: bool(c.get("blacklisted_or_stolen")),
    "FR-09": lambda c: bool(c.get("owner_mismatch")),
    "FR-10": lambda c: bool(c.get("invalid_dl")),
    "FR-11": lambda c: bool(c.get("photo_metadata_mismatch")),
    "FR-12": lambda c: bool(c.get("late_intimation")),
    "FR-13": lambda c: bool(c.get("commercial_use")),
    "FR-14": lambda c: bool(c.get("unwitnessed_night")),
    "FR-15": lambda c: (c.get("tampering_confidence") or 0) >= 0.70,
    # AGENT_PROMPTS.md A6 — from the deterministic vehicle-identity comparison (services/vehicle_identity.py, A4).
    "FR-16": lambda c: bool(c.get("identity_mismatch")),
    "FR-17": lambda c: bool(c.get("photos_different_vehicles")),
    "FR-18": lambda c: bool(c.get("identity_unclear_or_colour")),
}

EVIDENCE_REFS = {
    "FR-01": ["checks.fastag"], "FR-02": ["damage.pre_existing"], "FR-03": ["damage.narrative_consistency"],
    "FR-04": ["checks.iib"], "FR-05": ["checks.policy"], "FR-06": ["financials.variance_pct"],
    "FR-07": ["fraud.network_links"], "FR-08": ["checks.vahan"], "FR-09": ["checks.vahan"], "FR-10": ["checks.dl"],
    "FR-11": ["media.exif"], "FR-12": ["incident.reported_at"], "FR-13": ["checks.fastag"],
    "FR-14": ["incident.datetime"], "FR-15": ["documents"], "FR-16": ["vehicle_identity"], "FR-17": ["vehicle_identity.cross_photo"],
    "FR-18": ["vehicle_identity"],
}


def band(score: int, hard_stop: bool = False) -> str:
    """§6.5 bands: 0–29 low, 30–70 medium, 71–100 high. Hard stop → high."""
    if hard_stop or score >= 71:
        return "high"
    return "medium" if score >= 30 else "low"


def evaluate_fraud(context: dict, rules: list[dict] | None = None) -> dict:
    """`context` keys are documented in CONDITIONS; optional `evidence` {rule_id: text} and
    `confidence` {rule_id: float} explain fired rules."""
    rules = rules if rules is not None else reference.load().fraud_rules
    evidence = context.get("evidence", {})
    confidence = context.get("confidence", {})
    fired, not_fired = [], []
    score, hard_stop = 0, False
    for rule in rules:
        rid = rule["id"]
        cond = CONDITIONS.get(rid)
        if not rule.get("enabled", True) or cond is None or not cond(context):
            not_fired.append(rid)
            continue
        points = _fr06_points(context) if rid == "FR-06" else rule["points"]
        level = ("warn" if points == rule.get("points_warn") else "fail") if rid == "FR-06" else rule["level"]
        hard_stop |= bool(rule.get("hard_stop"))
        score += points
        fired.append({
            "rule_id": rid, "name": rule["name"], "level": level, "points": points,
            "evidence": evidence.get(rid, rule["description"]), "evidence_refs": EVIDENCE_REFS.get(rid, []),
            "confidence": confidence.get(rid, 0.9), "customer_safe_reason": rule.get("customer_safe_reason"),
        })
    score = min(100, score)
    b = band(score, hard_stop)
    return {
        "score": score, "band": b, "hard_stop": hard_stop,
        "routing": "SIU" if b == "high" else ("handler" if b == "medium" else "auto"),
        "fired": fired, "not_fired": not_fired,
        "fired_rule_ids": [f["rule_id"] for f in fired],
    }
