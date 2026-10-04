"""Agent 6 — Adjudication. Python decides (AGENT_PROMPTS.md A5, first match wins); the shared investigation call only explains.

`decide()` is pure so every branch is unit-tested. Document blocking rules (which conditional documents must be in hand before a
decision) are in `required_documents()` — see the "Decisions" in docs/PROGRESS.md (Phase 5)."""
from __future__ import annotations

from dataclasses import dataclass, field

AUTO_LIMIT = 150_000

# action → (recommended_action shown in the UI, route, claim status)
OUTCOME = {
    "decline": ("reject", "handler", "UNDER_REVIEW"),
    "escalate_siu": ("escalate_siu", "SIU", "SIU_INVESTIGATION"),
    "route_handler": ("review", "handler", "UNDER_REVIEW"),
    "total_loss": ("approve_total_loss", "handler", "UNDER_REVIEW"),
    "request_info": ("request_info", "handler", "INFO_REQUESTED"),
    "approve_revised": ("approve_revised", "handler", "UNDER_REVIEW"),
    "auto_preauth": ("approve", "auto", "PREAUTH_ISSUED"),
    "auto_approve": ("approve", "auto", "APPROVED"),
}


@dataclass
class Facts:
    policy_active: bool
    od_on_tp_only: bool
    exclusions: list[str]
    hard_stop: bool
    score: int
    band: str
    fired: dict[str, int]                 # rule id → points
    failed_rules: list[str]               # fired rules at level "fail" (block straight-through processing)
    is_total_loss: bool                   # never true for theft (theft settles on IDV by definition)
    docs_missing: list[str]
    docs_unreadable: list[str]
    docs_all_verified: bool
    net_payable: float
    settlement_mode: str                  # cashless | reimbursement
    garage_network: bool
    degraded: list[str] = field(default_factory=list)


def decide(f: Facts) -> dict:
    """→ {action, rule, reason_code, reasons[], info_items[]}"""
    def out(action, rule, code, reasons, items=None):
        rec, route, status = OUTCOME[action]
        return {"action": action, "rule": rule, "reason_code": code, "reasons": reasons, "info_items": items or [],
                "recommended_action": rec, "route": route, "status": status, "auto": route == "auto"}

    if not f.policy_active:
        return out("decline", "A5.1", "POLICY_INACTIVE", ["Policy was not active on the incident date"])
    if f.od_on_tp_only:
        return out("decline", "A5.1", "TP_ONLY_COVER", ["Own-damage claim on a third-party-only policy"])
    if f.exclusions:
        return out("decline", "A5.2", "EXCLUSION", [f"Policy exclusion: {e}" for e in f.exclusions])
    if f.hard_stop or f.score >= 71:
        return out("escalate_siu", "A5.3", "HARD_STOP" if f.hard_stop else "HIGH_RISK",
                   [f"Risk score {f.score} ({f.band})" + (" with a hard stop" if f.hard_stop else "")])
    if f.is_total_loss:
        return out("total_loss", "A5.4", "TOTAL_LOSS", ["Total loss — settle on IDV basis"])
    if f.docs_missing or f.docs_unreadable:
        items = list(f.docs_missing) + [f"Clearer copy of {d}" for d in f.docs_unreadable]
        return out("request_info", "A5.5", "DOCS_MISSING", ["Mandatory documents missing or illegible"], items)
    if f.band == "medium":
        fr06 = f.fired.get("FR-06", 0)
        if fr06 and f.score - fr06 < 30:   # FR-06 alone lifts the claim into the medium band
            return out("approve_revised", "A5.6", "OVERQUOTE", ["Garage quote above the assessed estimate — approve at the assessed amount"])
        return out("route_handler", "A5.6", "MEDIUM_RISK", [f"Risk score {f.score} (medium) — handler review"])
    blockers = []
    if f.band != "low":
        blockers.append(f"Risk band {f.band}")
    if f.failed_rules:
        blockers.append("Failed check(s) need a handler: " + ", ".join(f.failed_rules))
    if f.degraded:
        blockers.append("Automated step unavailable: " + ", ".join(f.degraded))
    if f.net_payable > AUTO_LIMIT:
        blockers.append("Net payable above the ₹1,50,000 auto-approval limit")
    if not f.docs_all_verified:
        blockers.append("Mandatory documents not all verified")
    if f.settlement_mode == "cashless" and not f.garage_network:
        blockers.append("Garage is not in the cashless network")
    if not blockers:
        if f.settlement_mode == "cashless":
            return out("auto_preauth", "A5.7", "AUTO_PREAUTH", ["Low risk, documents verified, within the auto limit at a network garage"])
        return out("auto_approve", "A5.7", "AUTO_APPROVE", ["Low risk, documents verified, within the auto limit"])
    return out("route_handler", "A5.8", "BLOCKED", blockers)


# ------------------------------------------------------------------------------------------------ documents

BLOCKING = {   # conditional document → condition keys that make it required before a decision
    "fir": {"theft", "bodily_injury"},
    "original_keys": {"theft"}, "rto_forms": {"theft"}, "rto_theft_declaration": {"theft"}, "subrogation_letter": {"theft"},
    "discharge_voucher": {"theft"}, "original_rc": {"theft"}, "original_policy": {"theft"}, "tax_receipt": {"theft"},
    "repair_estimate": {"reimbursement"}, "medical_reports": {"bodily_injury"},
}


def conditions_for(claim: dict, *, vahan: dict | None, policy: dict) -> list[str]:
    inc = claim["incident"]
    keys = []
    if claim["claim_type"] == "Theft":
        keys.append("theft")
    if inc.get("third_party_involved"):
        keys.append("third_party")
    if inc.get("injuries"):
        keys.append("bodily_injury")
    if (claim.get("settlement") or {}).get("mode") == "reimbursement" and claim["claim_type"] != "Theft":
        keys.append("reimbursement")
    if (vahan or {}).get("hypothecation"):
        keys.append("financed")
    if claim["claim_type"] in ("Total loss", "Theft"):
        keys.append("second_hand_or_total_loss")
    if policy.get("add_ons", {}).get("rti") and claim["claim_type"] in ("Total loss", "Theft"):
        keys.append("rti_claim")
    return keys


def required_documents(claim: dict, requirements: dict) -> tuple[list[str], list[str], bool]:
    """→ (missing labels, unreadable labels, all mandatory+blocking verified)."""
    spec = requirements.get(claim["vehicle"]["type"]) or {}
    conds = set(claim.get("document_conditions") or [])
    by_req: dict[str, dict] = {}
    for d in claim.get("documents", []):
        by_req.setdefault(d.get("requirement"), d)
    needed = [i for i in spec.get("mandatory", []) if i["doc"] != "photos"]
    needed += [i for i in spec.get("conditional", []) if conds & set(i.get("when") or []) & BLOCKING.get(i["doc"], set())]
    missing, unreadable, all_verified = [], [], True
    for item in needed:
        d = by_req.get(item["doc"])
        if d is None:
            missing.append(item["label"])
            all_verified = False
        elif d.get("status") == "flagged" and (d.get("ai") or {}).get("legibility") == "illegible":
            unreadable.append(item["label"])
            all_verified = False
        elif d.get("status") != "verified":
            all_verified = False
    return missing, unreadable, all_verified
