"""Per-claim document records for the seed (spec §11.2 documents, §11.5 requirements, §18 specimens).

Every record's `extracted` fields come from the claim's own customer / vehicle / policy / licence data, and
`make_specimen_docs.py` draws the image from exactly those fields. Match flags (`checks`) follow the fraud rules the
claim was generated with (FR-09 owner mismatch, FR-10 expired licence, FR-15 tampering, FR-05 early claim).
KYC and the claim form are recorded as verifications without an image (no Aadhaar / PAN images are ever produced).
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta

from faker import Faker

BANKS = ["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank", "Bank of Baroda", "Kotak Mahindra Bank"]
CLASS_BY_TYPE = {"2W": ["MCWG"], "Car": ["LMV", "MCWG"], "CV": ["LMV", "TRANS"]}
VEHICLE_CLASS = {"2W": "MCWG (Motor cycle with gear)", "Car": "LMV (Motor car)", "CV": "LGV (Goods carrier)"}


def _d(dt) -> str:
    return (dt if isinstance(dt, str) else dt.date().isoformat())[:10]


def driving_licence(rng: random.Random, customer: dict, rto: str, vtype: str, incident_at: datetime, *, expired: bool) -> dict:
    """A licence consistent with the customer; expired before the incident when FR-10 applies."""
    issued_year = incident_at.year - rng.randint(4, 18)
    valid_to = (incident_at - timedelta(days=rng.randint(20, 400))) if expired else incident_at + timedelta(days=rng.randint(400, 6000))
    return {
        "dl_number": f"{rto.replace(' ', '')}-{issued_year}XXXX{rng.randint(1000, 9999)}",
        "holder": customer["name"], "dob": f"{issued_year - rng.randint(18, 30)}-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}",
        "address": customer.get("address"), "classes": CLASS_BY_TYPE[vtype],
        "valid_from": f"{issued_year}-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}", "valid_to": _d(valid_to),
        "issued_by": f"RTO {customer['city']}",
    }


def _check(field: str, level: str, message: str) -> dict:
    return {"field": field, "level": level, "message": message}


def documents_for(*, rng: random.Random, fake: Faker, customer: dict, vehicle: dict, model: dict, policy: dict, garage: dict,
                  rto: str, incident_at: datetime, created: datetime, claim_type: str, rules: set[str], fir: dict | None,
                  financials: dict, garage_quote: float | None, settlement_mode: str, status: str, third_party: bool,
                  severity: str, info_items: list[str], incident: dict) -> tuple[list[dict], list[str], dict]:
    """Returns (documents, condition keys, licence record)."""
    vtype = vehicle["type"]
    theft = claim_type == "Theft"
    hyp = rng.choice(BANKS) if rng.random() < 0.3 else None
    owner = customer["name"] if "FR-09" not in rules else fake.name()
    lic = driving_licence(rng, customer, rto, vtype, incident_at, expired="FR-10" in rules)
    docs: list[dict] = []

    def add(type_, requirement, extracted, checks, status="verified", **extra):
        docs.append({"id": f"d_{len(docs) + 1}", "type": type_, "requirement": requirement, "url": None, "thumb": None,
                     "status": status, "extracted": extracted, "checks": checks,
                     "uploaded_at": (created + timedelta(minutes=rng.randint(2, 30))).isoformat(timespec="seconds"), **extra})

    # Claim form + KYC: digital verifications, no image.
    add("ClaimForm", "claim_form", {"submitted_via": "Digital FNOL", "signed": "OTP-authorised"}, [_check("signature", "pass", "Digitally authorised by OTP")])
    add("KYC", "kyc", {"aadhaar": customer["kyc"]["aadhaar"], "pan": customer["kyc"]["pan"], "method": "CKYC registry lookup"},
        [_check("identity", "pass", "Name and date of birth match the policy record")])

    tampered = "FR-15" in rules
    add("RC", "rc", {
        "registration": vehicle["registration"], "owner": owner, "address": customer.get("address"),
        "make_model": f"{model['make']} {model['model']}", "variant": vehicle.get("variant"), "fuel": vehicle.get("fuel"),
        "cc": vehicle.get("cc"), "colour": vehicle.get("colour"), "chassis": vehicle.get("chassis"), "engine": vehicle.get("engine"),
        "registered_on": vehicle.get("registered_on"), "authority": f"RTO {customer['city']} ({rto})", "vehicle_class": VEHICLE_CLASS[vtype],
        "hypothecation": hyp,
    }, [
        _check("owner", "warn" if "FR-09" in rules else "pass", "Owner differs from policyholder — no transfer record" if "FR-09" in rules else "Matches policyholder"),
        _check("registration", "pass", "Matches policy and Vahan record"),
        _check("integrity", "fail" if tampered else "pass", "Font and alignment irregularities in the owner field" if tampered else "No signs of editing"),
    ], status="flagged" if tampered else ("mismatch" if "FR-09" in rules else "verified"), **({"tampered_field": "owner"} if tampered else {}))

    expired = "FR-10" in rules
    add("DL", "dl", dict(lic), [
        _check("validity", "fail" if expired else "pass", "Expired before the incident date" if expired else "Valid on incident date"),
        _check("class", "pass", f"Class {', '.join(lic['classes'])} covers the vehicle"),
        _check("holder", "pass", "Holder matches the driver named in the claim"),
    ], status="mismatch" if expired else "verified")

    early = "FR-05" in rules
    add("Policy", "policy", {
        "policy_no": policy["policy_no"], "product": policy["product"], "insured": customer["name"],
        "vehicle": f"{model['make']} {model['model']} · {vehicle['registration']}", "cover": policy["cover"],
        "period": f"{datetime.fromisoformat(policy['start']).strftime('%d %b %Y')} – {datetime.fromisoformat(policy['end']).strftime('%d %b %Y')}",
        "idv": policy["idv"], "ncb": policy["ncb_pct"],
        "add_ons": [k.replace("_", " ").title() for k, v in policy["add_ons"].items() if v] or ["None"],
        "voluntary_deductible": policy["voluntary_deductible"], "premium": policy["premium"],
    }, [_check("validity", "warn" if early else "pass", "Incident within 30 days of policy start" if early else "Active on the incident date")])

    if fir:
        add("FIR", "fir", {
            "fir_number": fir["number"], "station": fir["station"], "date": fir["date"], "complainant": customer["name"],
            "incident_at": incident["datetime"], "place": incident["location"]["text"], "facts": incident["narrative_en"],
        }, [_check("details", "pass", "Date, place and vehicle match the claim")])

    estimate_requested = any("estimate" in i.lower() for i in info_items)
    lines = financials.get("lines", [])
    if garage_quote and lines and not theft and not estimate_requested:
        ratio = garage_quote / max(1.0, sum(l["line_total"] for l in lines))
        add("Estimate", "repair_estimate", {
            "garage": f"{garage['name']}, {garage['city']}", "estimate_no": f"EST/{created.year}/{rng.randint(1000, 9999)}",
            "claim_id": "{id}", "registration": vehicle["registration"], "vehicle": f"{model['make']} {model['model']}",
            "date": _d(created + timedelta(hours=rng.randint(2, 30))), "total": garage_quote,
        }, [_check("total", {"pass": "pass", "warn": "warn", "fail": "fail"}.get(financials.get("variance_level"), "pass"),
                   f"Quote is {financials.get('variance_pct', 0):.1f}% vs the AI estimate")],
            lines=[{"description": l["description"], "operation": l["operation"], "parts": l["base_price"] * ratio,
                    "labour": (l["labour"] + l["paint"]) * ratio, "amount": l["line_total"] * ratio} for l in lines])

    if settlement_mode == "reimbursement" and status == "SETTLED" and lines and not theft:
        add("Invoice", "repair_invoice", {
            "garage": f"{garage['name']}, {garage['city']}", "invoice_no": f"INV/{created.year}/{rng.randint(10000, 99999)}",
            "claim_id": "{id}", "registration": vehicle["registration"], "vehicle": f"{model['make']} {model['model']}",
            "date": _d(created + timedelta(days=rng.randint(4, 12))), "total": financials["assessed_loss"],
        }, [_check("total", "pass", "Matches the approved assessment")],
            lines=[{"description": l["description"], "operation": l["operation"], "parts": l["net_parts"],
                    "labour": l["labour"] + l["paint"] - l["paint_material_dep"], "amount": l["line_total"]} for l in lines])

    if theft:
        if vtype == "2W":
            add("TaxReceipt", "tax_receipt", {"receipt_no": f"MVT/{rng.randint(100000, 999999)}", "registration": vehicle["registration"],
                                              "owner": owner, "tax_period": "Lifetime", "amount": rng.randint(4, 9) * 1000, "date": vehicle.get("registered_on")},
                [_check("registration", "pass", "Matches RC")])
        missing = " ".join(info_items).lower()
        for req, label in (("original_rc", "Original RC"), ("original_policy", "Original policy")):
            add("Original", req, {"note": f"{label} received at branch"}, [_check("received", "pass", "Original sighted and retained")])
        if "key" not in missing:
            add("Original", "original_keys", {"note": "All original keys received"}, [_check("received", "pass", "2 of 2 keys received")])
        if "rto" not in missing and "form" not in missing:
            add("Original", "rto_theft_declaration" if vtype == "2W" else "rto_forms", {"note": "RTO declaration received"},
                [_check("received", "pass", "Acknowledged by RTO")])

    conditions = []
    if theft:
        conditions.append("theft")
    if third_party:
        conditions.append("third_party")
    if severity == "severe" and not theft:
        conditions.append("major_accident")
    if settlement_mode == "reimbursement" and not theft:
        conditions.append("reimbursement")
    if hyp:
        conditions.append("financed")
    if financials.get("total_loss_check", {}).get("is_total_loss"):
        conditions.append("second_hand_or_total_loss")
    if vtype == "CV" and not theft:
        conditions.append("damage")
    return docs, conditions, lic
