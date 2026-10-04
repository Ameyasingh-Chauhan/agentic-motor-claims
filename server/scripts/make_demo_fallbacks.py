"""Demo-mode outputs for the five §14.3 scenarios: data/demo_fallback/<scenario>/<agent>.json.

    python scripts/make_demo_fallbacks.py

Each file is a schema-valid agent output (app/agents/schemas.py) built from the seeded scenario claim — its photos, boxes, documents,
narrative and findings — so a Demo-mode replay of a scenario (Dev Tools) reaches the same outcome as the seeded claim. Python still
computes every rupee, the DMN score and the decision from these outputs plus the mock DPI records. `{claim_id}` in the
communication text is replaced with the replay's own claim number. Re-run after a re-seed (photo/document ids may change).
For claims that are not scenarios there is no recorded output: the agents use their conservative defaults (agents/*.default()).
"""
from __future__ import annotations

import sys
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER))
from app.agents.schemas import CommunicationOut, DamageOut, DocumentOut, IntakeOut, InvestigationOut  # noqa: E402
from app.services import reference  # noqa: E402
from app.services.json_store import read_json_sync, write_json_sync  # noqa: E402

LANG = {"hi-en": (["hi", "en"], "Hindi–English mix"), "en": (["en"], "English"), "ml": (["ml"], "Malayalam"), "hi": (["hi"], "Hindi"),
        "mr": (["mr"], "Marathi")}
TYPE = {"rear_end": "accident", "front_collision": "accident", "parking_scrape": "accident", "theft": "theft", "flood": "flood"}
COUNTERPARTY = {"clean_rear_end": "truck", "fastag_mismatch": "object", "garage_overquote": "object", "theft_two_wheeler": "unknown",
                "flood_total_loss": "unknown"}
ACTUAL = {"RC": "RC", "DL": "DL", "Policy": "POLICY", "FIR": "FIR", "Estimate": "ESTIMATE", "Invoice": "INVOICE"}

CUSTOMER_ITEMS = {
    "fastag_mismatch": ["Photos of the full vehicle showing the number plate", "Location details for the night of the incident (any receipts)",
                        "Contact details of anyone who helped at the spot"],
    "theft_two_wheeler": ["Original keys (all sets)", "RTO theft declaration"],
}
NEXT_STEPS = {
    "fastag_mismatch": ["Request Andheri mall parking receipt for 01:30–03:00", "Physical survey of bumper bracket corrosion",
                        "Check expressway CCTV near Khalapur for 01:30–02:30", "Interview the claimant on the route taken"],
    "garage_overquote": ["Share the line-by-line variance with the garage", "Approve at the assessed amount if the garage agrees"],
}
MESSAGES = {
    "clean_rear_end": ("Namaste Rahul ji 🙏 Claim {claim_id} ke liye cashless pre-approval garage ko bhej diya gaya hai. Repair shuru ho sakti hai. "
                       "Repair ke baad final invoice share karein.",
                       "Hello Rahul, cashless pre-approval for claim {claim_id} has been sent to the garage. Repairs can begin. "
                       "Please share the final invoice after the repair.", "hi-Latn", ["Garage details", "Talk to us"]),
    "fastag_mismatch": ("Hi Arjun, thank you for reporting claim {claim_id}. To complete the review we need a few details: full-vehicle "
                        "photos showing the number plate, and any receipts from that night. You can upload them in the app.",
                        "Hi Arjun, thank you for reporting claim {claim_id}. To complete the review we need a few details: full-vehicle "
                        "photos showing the number plate, and any receipts from that night. You can upload them in the app.", "en",
                        ["Upload now", "Call me"]),
    "garage_overquote": ("നമസ്കാരം പ്രിയ, ക്ലെയിം {claim_id} ഞങ്ങളുടെ ക്ലെയിംസ് ടീം പരിശോധിക്കുന്നു. രണ്ട് പ്രവൃത്തി ദിവസത്തിനുള്ളിൽ അറിയിക്കും.",
                         "Hello Priya, claim {claim_id} is being reviewed by our claims team. We'll update you within 2 working days.", "ml",
                         ["Talk to us"]),
    "theft_two_wheeler": ("नमस्ते इमरान जी, क्लेम {claim_id} आगे बढ़ाने के लिए हमें चाहिए: गाड़ी की सभी ओरिजिनल चाबियाँ और RTO चोरी घोषणा। "
                          "आप इन्हें ऐप में अपलोड कर सकते हैं।",
                          "Hello Imran, to move claim {claim_id} forward we need: all original keys and the RTO theft declaration. "
                          "You can upload them in the app.", "hi", ["Upload now", "Call me"]),
    "flood_total_loss": ("नमस्कार कविता ताई, क्लेम {claim_id} आमच्या क्लेम्स टीमकडे तपासणीसाठी आहे. दोन कामकाजाच्या दिवसांत आम्ही कळवू.",
                         "Hello Kavita, claim {claim_id} is with our claims team for review. We'll update you within 2 working days.", "mr",
                         ["Talk to us"]),
}


def intake(c: dict) -> IntakeOut:
    inc = c["incident"]
    codes, label = LANG.get(inc["narrative_language"], ([inc["narrative_language"]], inc["narrative_language"]))
    return IntakeOut(transcript=inc["narrative_original"], language_codes=codes, language_label=label, translation_en=inc["narrative_en"],
                     incident_type=TYPE.get(inc["type"], "other"), incident_at=inc["datetime"], datetime_conf=0.9,
                     location_text=inc["location"]["text"], city=inc["location"]["city"], cause=inc["cause"],
                     counterparty=COUNTERPARTY[c["scenario_id"]], third_party=inc["third_party_involved"], injuries="none",
                     police_informed=bool(inc.get("fir")), fir_number=(inc.get("fir") or {}).get("number"), drivable=c["claim_type"] == "OD",
                     driver_is_policyholder=True, driver_name=c["customer_name"],
                     parts_mentioned=[i["part"].lower() for i in c["damage"]["items"][:4]], distress="upset" if c["claim_type"] != "OD" else "calm")


def extract(d: dict) -> dict:
    ex = d.get("extracted") or {}
    t = d["type"]
    if t == "RC":
        return {"registration": ex.get("registration"), "owner": ex.get("owner"), "vehicle_class": ex.get("vehicle_class"),
                "make_model": ex.get("make_model"), "fuel": ex.get("fuel"), "reg_date": ex.get("registered_on"),
                "chassis5": (ex.get("chassis") or "")[-5:] or None, "engine5": (ex.get("engine") or "")[-5:] or None,
                "financier": ex.get("hypothecation")}
    if t == "DL":
        return {"number_last4": (ex.get("dl_number") or "")[-4:] or None, "holder": ex.get("holder"), "classes": ex.get("classes") or [],
                "valid_to_nt": ex.get("valid_to")}
    if t == "Policy":
        return {"policy_no": ex.get("policy_no"), "insured": ex.get("insured"), "cover": ex.get("cover"), "idv": ex.get("idv"),
                "add_ons": [a for a in ex.get("add_ons") or [] if a != "None"]}
    if t == "FIR":
        return {"fir_no": ex.get("fir_number"), "station": ex.get("station"), "date": ex.get("date"), "facts": (ex.get("facts") or "")[:160]}
    if t in ("Estimate", "Invoice"):
        return {"garage": ex.get("garage"), "date": ex.get("date"), "total": ex.get("total")}
    return {}


def document(c: dict) -> DocumentOut:
    docs = []
    for d in c["documents"]:
        if not d.get("url"):
            continue
        docs.append({"doc_id": d["id"], "declared_type": d["type"], "actual_type": ACTUAL.get(d["type"], "OTHER"), "legibility": "clear",
                     "extracted": extract(d), "checks": [{"field": k["field"], "level": k["level"] if k["level"] != "pending" else "warn",
                                                          "msg": k["message"]} for k in d.get("checks", [])],
                     "watermark_noted": True, "confidence": 0.93})
    return DocumentOut.model_validate({"documents": docs})


def damage(c: dict) -> DamageOut:
    dmg, parts = c["damage"], reference.load().parts
    photos = [m["id"] for m in c["media"] if m["kind"] == "photo"]
    items = [{"code": i["part_code"], "part": i["part"], "zone": i["zone"],
              "damage_type": i["damage_type"] if i["damage_type"] in ("scratch", "dent", "crack", "tear", "break", "shatter", "deform", "burn", "water")
              else ("water" if c["scenario_id"] == "flood_total_loss" else "dent"),
              "severity": i["severity"], "operation": i["operation"], "fresh": i.get("fresh", True), "confidence": i["confidence"],
              "photo_ids": i.get("photo_ids", []), "boxes": i.get("boxes", [])} for i in dmg["items"]]
    pre = [{"code": next((i["part_code"] for i in dmg["items"] if not i.get("fresh", True)), None), "part": p["part"],
            "photo_id": (p.get("photo_ids") or [None])[0], "evidence": p["evidence"], "confidence": p["confidence"],
            "box": (p.get("boxes") or [{}])[0].get("box_2d")} for p in dmg.get("pre_existing", [])]
    nc = dmg.get("narrative_consistency") or {"consistent": True, "explanation": "", "confidence": 0.9}
    est = sum(parts[i["part_code"]]["replace"] if i["operation"] == "replace" else (parts[i["part_code"]].get("repair") or 0)
              if i["operation"] in ("repair_minor_dent", "repair_moderate_dent", "plastic_repair") else 0 for i in dmg["items"])
    return DamageOut.model_validate({
        "photos": [{"photo_id": p} for p in photos], "items": items, "pre_existing": pre,
        "story": {"consistent": nc["consistent"], "why": nc["explanation"], "confidence": nc["confidence"]},
        "coverage": {k: bool(v) for k, v in (dmg.get("photo_coverage") or {}).items() if k in ("front", "rear", "left", "right", "closeup", "odometer")},
        "overall_severity": dmg.get("overall_severity", "moderate"), "total_loss_indicator": c["scenario_id"] == "flood_total_loss",
        "total_loss_evidence": "Water line above the dashboard" if c["scenario_id"] == "flood_total_loss" else None,
        "llm_estimate_inr": est, "notes": "Recorded scenario output (demo mode)."})


def investigation(c: dict) -> InvestigationOut:
    f, d = c["fraud"], c["decision"]
    cards = [{"rule_id": r["rule_id"], "expected": "No indicator", "found": r["evidence"], "source": ", ".join(r.get("evidence_refs", [])),
              "why": f"{r['name']} — this {'indicates' if r['level'] == 'fail' else 'may indicate'} the claim needs closer review.",
              "confidence": r.get("confidence", 0.9)} for r in f["fired"]]
    summary = (f"Score {f['score']} ({f['band']}). " + ("; ".join(r["name"] for r in f["fired"][:3]) + "." if f["fired"]
                                                         else "No risk indicators fired."))
    return InvestigationOut.model_validate({
        "evidence_cards": cards, "fraud_summary": summary, "next_steps": NEXT_STEPS.get(c["scenario_id"], []),
        "decision_reasons": d["reasons"][:4], "conditions": ["Pre-auth valid 15 days at the selected network garage"] if c["status"] == "PREAUTH_ISSUED" else [],
        "customer_items": CUSTOMER_ITEMS.get(c["scenario_id"], []), "ai_summary": summary + " " + d["reasons"][0]})


def communication(c: dict) -> CommunicationOut:
    local, en, code, replies = MESSAGES[c["scenario_id"]]
    return CommunicationOut(message_local=local, message_en=en, lang_code=code, quick_replies=replies)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    claims = [c for c in read_json_sync("claims.json", []) if c.get("scenario_id") and c.get("origin") != "app"]
    for c in claims:
        sid = c["scenario_id"]
        for name, fn in (("intake", intake), ("document", document), ("damage", damage), ("investigation", investigation),
                         ("communication", communication)):
            write_json_sync(f"demo_fallback/{sid}/{name}.json", fn(c).model_dump(mode="json"))
        print(f"{sid:<18} {c['id']}  → data/demo_fallback/{sid}/ (5 files)")


if __name__ == "__main__":
    main()
