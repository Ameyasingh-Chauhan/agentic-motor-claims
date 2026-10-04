"""Agent 5 — Fraud. `dmn_engine.py` scores from facts Python collected; the shared investigation call (AGENT_PROMPTS.md F) writes
evidence cards and the decision explanation for agents 5 and 6. It cannot change rules, points, score, band, action or amounts."""
from __future__ import annotations

from datetime import datetime, timedelta

from ..services import dmn_engine, prompts, reference
from ..services.claim_detail import km
from .base import RunContext, llm_step
from .schemas import EvidenceCard, InvestigationOut

EXIF_GAP = timedelta(hours=24)


def photo_metadata(claim: dict) -> tuple[bool, str | None]:
    """FR-11: EXIF time > 24 h before the incident or EXIF GPS > 25 km from the reported place (missing EXIF → no points)."""
    inc = claim["incident"]
    at, loc = datetime.fromisoformat(inc["datetime"]), inc["location"]
    for m in claim.get("media", []):
        ex = m.get("exif") or {}
        if m["kind"] != "photo" or not ex:
            continue
        if ex.get("captured_at"):
            try:
                cap = datetime.fromisoformat(ex["captured_at"])
                if cap.tzinfo is None:
                    cap = cap.replace(tzinfo=at.tzinfo)
                if cap < at - EXIF_GAP and claim["claim_type"] != "Theft":
                    return True, f"Photo {m['id']} EXIF time {cap:%d %b %Y %H:%M} is more than 24 h before the incident"
            except ValueError:
                pass
        if ex.get("lat") is not None and ex.get("lng") is not None and loc.get("lat") is not None:
            d = km(loc["lat"], loc["lng"], ex["lat"], ex["lng"])
            if d > 25 and claim["claim_type"] != "Theft":
                return True, f"Photo {m['id']} EXIF GPS is {d:.0f} km from the reported location"
    return False, None


def network_link(claim: dict, claims: list[dict], customer: dict, customers: dict, garage: dict | None) -> tuple[bool, str | None]:
    """FR-07: the claimant's phone, or a NON-network garage already linked to an identified network (claims that fired FR-07), shared
    with ≥ 2 other high-risk claims in the last 180 days. Empanelled cashless garages are vetted by ABC and see many legitimate
    claims, so a garage link alone counts only for non-network garages (Decision, PROGRESS.md Phase 5)."""
    since = datetime.fromisoformat(claim["incident"]["datetime"]) - timedelta(days=180)
    gid = (claim.get("settlement") or {}).get("garage_id") if not (garage or {}).get("cashless") else None
    phone = customer.get("phone")
    hits = []
    for c in claims:
        if c["id"] in (claim["id"], claim.get("replay_of")) or c.get("risk_band") != "high" or datetime.fromisoformat(c["created_at"]) < since:
            continue
        other = customers.get(c["customer_id"], {})
        fired = {f["rule_id"] for f in (c.get("fraud") or {}).get("fired", [])}
        if (phone and c["customer_id"] != claim["customer_id"] and other.get("phone") == phone) or \
           (gid and (c.get("settlement") or {}).get("garage_id") == gid and "FR-07" in fired):
            hits.append(c["id"])
    if len(hits) >= 2:
        return True, f"Phone or garage shared with {len(hits)} other high-risk claims in 180 days ({', '.join(hits[:3])})"
    return False, None


def dmn_context(ctx: RunContext, *, verification: dict, damage_block: dict, financials: dict, documents: list[dict],
                identity: dict, dl: dict, claims: list[dict], customers: dict) -> dict:
    claim, inc = ctx.claim, ctx.claim["incident"]
    facts = verification["facts"]
    at = datetime.fromisoformat(inc["datetime"])
    reported = datetime.fromisoformat(inc["reported_at"])
    claimed = {i["part_code"] for i in damage_block.get("items", [])}
    pre = [p for p in damage_block.get("pre_existing", []) if not p.get("part_code") or p.get("part_code") in claimed or not claimed]
    pre_conf = max((p["confidence"] for p in pre), default=0)
    story = damage_block.get("narrative_consistency") or {}
    tamper = max((t["confidence"] for d in documents for t in ((d.get("ai") or {}).get("tampering") or [])), default=0)
    rc = next((d.get("extracted") or {} for d in documents if d.get("requirement") == "rc" or d.get("type") == "RC"), {})
    from .document import name_ratio
    rc_ratio = name_ratio(rc.get("owner"), ctx.customer["name"]) if rc.get("owner") else None
    owner_ratio = min(r for r in (rc_ratio, facts.get("vahan_owner_ratio"), 1.0) if r is not None)
    exif_hit, exif_ev = photo_metadata(claim)
    net_hit, net_ev = network_link(claim, claims, ctx.customer, customers, ctx.garage)
    hour = at.hour
    night = (hour >= 23 or hour < 5) and not inc.get("third_party_involved") and claim["claim_type"] not in ("Theft",) \
        and inc["type"] not in ("flood", "theft")
    variance = financials.get("variance_pct") or 0
    ev = {
        "FR-01": facts.get("fastag_evidence"),
        "FR-02": "; ".join(f"{p['part']}: {p['evidence']} ({p['confidence']:.2f})" for p in pre) or None,
        "FR-03": story.get("explanation"),
        "FR-04": f"{facts.get('od_claims_12m')} own-damage claims on this vehicle in the last 12 months (IIB + ABC)",
        "FR-05": f"Incident {facts.get('days_since_start')} days after policy start",
        "FR-06": (f"Garage quote ₹{financials.get('garage_quote'):,.0f} is {variance:.1f}% above the assessed loss of "
                  f"₹{financials.get('assessed_loss'):,.0f}") if financials.get("garage_quote") else None,
        "FR-07": net_ev,
        "FR-08": "Vahan shows the vehicle as blacklisted or reported stolen before this incident",
        "FR-09": f"RC owner name matches the policyholder at ratio {owner_ratio:.2f} (threshold 0.85)",
        "FR-10": dl.get("summary"),
        "FR-11": exif_ev,
        "FR-12": f"Reported {(reported - at).days} days after the incident",
        "FR-14": f"Single-vehicle incident at {at:%H:%M} with no third party or witness",
        "FR-15": f"Tampering indicators on an uploaded document (confidence {tamper:.2f})",
        "FR-16": "; ".join(identity.get("evidence", [])) or None,
        "FR-17": "; ".join(e for e in identity.get("evidence", []) if "differs" in e) or None,
        "FR-18": "; ".join(e for e in identity.get("evidence", []) if "colour" in e.lower() or "could not be read" in e) or None,
    }
    conf = {"FR-01": 0.95, "FR-02": pre_conf, "FR-03": story.get("confidence", 0), "FR-15": tamper,
            "FR-16": max([p.get("idcon") or 0 for p in identity.get("photos", [])] + [0]),
            "FR-17": max([d["confidence"] for d in (identity.get("cross_photo") or {}).get("differing", [])] + [0])}
    return {
        "location_contradiction": facts.get("location_contradiction"), "pre_existing_confidence": pre_conf,
        "narrative_consistent": story.get("consistent", True), "narrative_confidence": story.get("confidence", 0),
        "od_claims_12m": facts.get("od_claims_12m"), "early_claim": facts.get("early_claim"), "garage_variance_pct": variance,
        "network_link": net_hit, "blacklisted_or_stolen": facts.get("blacklisted_or_stolen"), "owner_mismatch": owner_ratio < 0.85,
        "invalid_dl": bool(dl.get("invalid")), "photo_metadata_mismatch": exif_hit,
        "late_intimation": (reported - at) > timedelta(days=7), "commercial_use": False, "unwitnessed_night": night,
        "tampering_confidence": tamper, "identity_mismatch": identity.get("fr16"), "photos_different_vehicles": identity.get("fr17"),
        "identity_unclear_or_colour": identity.get("fr18"),
        "evidence": {k: v for k, v in ev.items() if v}, "confidence": {k: round(v, 2) for k, v in conf.items() if v},
    }


def score(context: dict) -> dict:
    return dmn_engine.evaluate_fraud(context)


def facts_block(ctx: RunContext, *, verification: dict, damage_block: dict, financials: dict, identity: dict, docs_line: str) -> str:
    intake = ctx.outputs.get("intake") or {}
    checks = verification["checks"]
    f = financials
    lines = [
        f"Intake: {intake.get('translation_en') or ctx.claim['incident'].get('narrative_en')} | type {ctx.claim['incident'].get('label')} | "
        f"at {ctx.claim['incident']['datetime'][:16]} | {ctx.claim['incident']['location'].get('text')}",
        "Verification: " + "; ".join(f"{k} {c['level']}: {c['summary']}" for k, c in checks.items()),
        f"Vehicle identity: {identity.get('status')} — {identity.get('summary') or identity.get('reason')}",
        "Damage: " + ("; ".join(f"{i['part']} {i['severity']} {i['operation']}{'' if i['fresh'] else ' (older)'}" for i in damage_block.get("items", []))
                      or "none assessed") + f" | story consistent={damage_block.get('narrative_consistency', {}).get('consistent')}",
        f"Documents: {docs_line}",
        f"Financials: assessed ₹{f.get('assessed_loss', 0):,.0f} | garage quote {('₹%s' % format(f['garage_quote'], ',.0f')) if f.get('garage_quote') else 'none'}"
        f" | variance {f.get('variance_pct')}% | net payable ₹{f.get('net_payable', 0):,.0f} | IDV ₹{f.get('total_loss_check', {}).get('idv', 0):,.0f}",
    ]
    return "\n".join(lines)


def default(result: dict, decision: dict) -> InvestigationOut:
    cards = [EvidenceCard(rule_id=f["rule_id"], expected="No indicator", found=f["evidence"], source=", ".join(f.get("evidence_refs", [])),
                          why=f"{f['name']} ({f['points']} points).", confidence=f.get("confidence", 0.9)) for f in result["fired"]]
    summary = (f"Risk score {result['score']} ({result['band']}). " +
               ("Indicators: " + "; ".join(f["name"] for f in result["fired"][:3]) + "." if result["fired"] else "No risk indicators fired."))
    return InvestigationOut(evidence_cards=cards, fraud_summary=summary, decision_reasons=decision["reasons"][:4],
                            customer_items=decision["info_items"], ai_summary=summary + " " + decision["reasons"][0])


async def investigate(ctx: RunContext, *, result: dict, decision: dict, facts: str) -> InvestigationOut:
    rules = {r["id"]: r for r in reference.load().fraud_rules}
    fired_rows = prompts.pipe_table([{"id": f["rule_id"], "name": f["name"], "points": f["points"], "evidence": f["evidence"]}
                                     for f in result["fired"]], ["id", "name", "points", "evidence"]) or "none"
    variables = {"score": result["score"], "band": result["band"], "hard_stop": result["hard_stop"], "fired_rows": fired_rows,
                 "not_fired_ids": ", ".join(result["not_fired"]) or "none", "action": decision["action"], "route": decision["route"],
                 "reason_code": decision["reason_code"], "facts_block": facts, "garage": (ctx.garage or {}).get("name") or "the garage"}
    out = await llm_step(ctx, agent="fraud", call_name="investigation", prompt="investigation", variables=variables,
                         contents=["Write the explanation now."], schema=InvestigationOut, temperature=0.3, thinking="medium",
                         default=lambda: default(result, decision), max_output_tokens=8192)
    known = {f["rule_id"] for f in result["fired"]}
    out.evidence_cards = [c for c in out.evidence_cards if c.rule_id in known]   # cannot invent rules
    _ = rules
    return out
