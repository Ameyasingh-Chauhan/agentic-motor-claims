"""Agent 2 — Document (AGENT_PROMPTS.md D): ONE vision call for every uploaded document, then Python applies the result.

Digital items need no image: the claim form is the OTP-authorised digital FNOL, the policy is read from ABC's policy core and KYC
from the CKYC registry (exactly as the seeded claims record them). Physical originals without a file keep their status."""
from __future__ import annotations

import difflib
import re
from datetime import date, datetime

from ..services import prompts
from ..services.gemini import MediaPart, image_part
from . import media
from .base import RunContext, llm_step
from .schemas import DocCheck, DocResult, DocumentOut

ACTUAL = {"RC": "RC", "DL": "DL", "Policy": "POLICY", "FIR": "FIR", "ClaimForm": "CLAIM_FORM", "Estimate": "ESTIMATE",
          "Invoice": "INVOICE"}
VEHICLE_CLASS = {"Car": "LMV", "2W": "MCWG", "CV": "Transport (LMV-TR / HGMV)"}
DL_COVERS = {"Car": {"LMV", "LMV-NT", "LMV-TR", "TRANS", "HMV", "LMV-NT(P)"}, "2W": {"MCWG", "MCWOG", "MC 50CC", "MCEX50CC", "MC"},
             "CV": {"TRANS", "LMV-TR", "HMV", "HGMV", "HPMV", "MGV", "LGV"}}


def files_to_read(claim: dict) -> list[tuple[dict, object]]:
    out = []
    for d in claim.get("documents", []):
        path = media.local_path(claim["id"], d.get("url"), d.get("original_url"))
        if path is not None and d.get("status") in (None, "received"):
            out.append((d, path))
    return out


def expected_line(ctx: RunContext) -> str:
    v, c, inc = ctx.vehicle, ctx.customer, ctx.claim["incident"]
    return prompts.pipe_line([c["name"], v["registration"], ctx.policy["policy_no"], f"{v['make']} {v['model']}",
                              (v.get("chassis") or "")[-5:], (v.get("engine") or "")[-5:], inc["datetime"][:10],
                              VEHICLE_CLASS.get(v["type"])])


def default(docs: list[dict]) -> DocumentOut:
    return DocumentOut(documents=[DocResult(doc_id=d["id"], declared_type=d["type"], actual_type=ACTUAL.get(d["type"], "OTHER"),
                                            legibility="partial", checks=[DocCheck(field="document", level="warn",
                                                                                   msg="Not read automatically — manual check needed")],
                                            confidence=0, needs_review=True) for d in docs])


async def run(ctx: RunContext) -> dict:
    todo = files_to_read(ctx.claim)
    if not todo:
        ctx.sources["document"] = "python"
        pre = [d for d in ctx.claim.get("documents", []) if (d.get("ai") or {}).get("read_at")]
        await ctx.progress("document", f"{len(pre)} document(s) already read in the wizard — reusing the results: "
                           + ", ".join(f"{d['type']} {d['status']}" for d in pre) if pre else "No uploaded document images to read")
        return {"documents": [], "missing": []}
    contents: list = []
    for d, path in todo:
        label = f"{d['id']} | {d['type']}"
        if media.is_image(path):
            contents.append(image_part(path, label))
        elif path.suffix.lower() == ".pdf" and path.stat().st_size < 10 * 1024 * 1024:
            contents.append(MediaPart(path.read_bytes(), "application/pdf", label))
    await ctx.progress("document", f"Reading {len(todo)} document(s): " + ", ".join(d["type"] for d, _ in todo))
    out = await llm_step(ctx, agent="document", prompt="document", variables={"expected_line": expected_line(ctx)}, contents=contents,
                         schema=DocumentOut, temperature=0.1, thinking="low", default=lambda: default([d for d, _ in todo]))
    for r in out.documents:
        worst = "fail" if any(c.level == "fail" for c in r.checks) else ("warn" if any(c.level == "warn" for c in r.checks) else "pass")
        await ctx.progress("document", f"{r.doc_id} · {r.actual_type} · {r.legibility}"
                           + (" · type differs from upload slot" if r.type_mismatch else "")
                           + (" · tampering signs" if r.tampering_suspected else ""), worst if worst != "pass" else "pass")
    return out.model_dump(mode="json")


# ------------------------------------------------------------------------------------------------ apply (Python)

def _clean(extracted: dict) -> dict:
    return {k: v for k, v in extracted.items() if v not in (None, "", [], {})}


def apply(claim: dict, result: dict, *, now: str) -> None:
    """Write the Document agent's findings into claim.documents (status, extracted fields, checks)."""
    by_id = {r["doc_id"]: r for r in result.get("documents", [])}
    for d in claim.get("documents", []):
        r = by_id.get(d["id"])
        if r is None:
            continue
        d["extracted"] = {**(d.get("extracted") or {}), **_clean(r.get("extracted") or {})}
        d["checks"] = [{"field": c["field"], "level": c["level"], "message": c["msg"]} for c in r.get("checks", [])]
        d["ai"] = {"actual_type": r["actual_type"], "type_mismatch": r.get("type_mismatch", False), "legibility": r["legibility"],
                   "tampering": r.get("tampering", []), "tampering_suspected": r.get("tampering_suspected", False),
                   "confidence": r.get("confidence"), "needs_review": r.get("needs_review", False), "read_at": now}
        if r["legibility"] == "illegible":
            d["status"], d["checks"] = "flagged", d["checks"] or [{"field": "legibility", "level": "warn", "message": "Illegible — re-upload needed"}]
        elif r.get("tampering_suspected"):
            d["status"] = "flagged"
        elif any(c["level"] == "fail" for c in r.get("checks", [])):
            d["status"] = "mismatch"
        elif (r.get("confidence") or 0) == 0 and r.get("needs_review"):
            d["status"] = "received"          # conservative default: present, not verified
        else:
            d["status"] = "verified"


def add_digital(claim: dict, *, customer: dict, policy: dict, now: str) -> None:
    """Claim form (digital FNOL), policy (policy core) and KYC (CKYC) — recorded like the seeded claims when not uploaded."""
    have = {d.get("requirement") for d in claim.get("documents", [])}

    def add(type_, req, extracted, check):
        n = max((int(x["id"].split("_")[1]) for x in claim["documents"] if x["id"].split("_")[1].isdigit()), default=0) + 1
        claim["documents"].append({"id": f"d_{n}", "type": type_, "requirement": req, "url": None, "thumb": None, "status": "verified",
                                   "extracted": extracted, "checks": [check], "uploaded_at": now, "uploaded_by": "system"})

    if "claim_form" not in have:
        add("ClaimForm", "claim_form", {"submitted_via": f"Digital FNOL ({claim['channel']})", "signed": "OTP-authorised"},
            {"field": "signature", "level": "pass", "message": "Digitally authorised by OTP"})
    if "policy" not in have:
        add("Policy", "policy", {"policy_no": policy["policy_no"], "product": policy.get("product"), "cover": policy["cover"],
                                 "period": f"{policy['start']} – {policy['end']}", "idv": policy["idv"], "source": "ABC policy core"},
            {"field": "validity", "level": "pass", "message": "Retrieved from ABC policy core"})
    kyc = customer.get("kyc") or {}
    if "kyc" not in have and kyc.get("verified"):
        add("KYC", "kyc", {"aadhaar": kyc.get("aadhaar"), "pan": kyc.get("pan"), "method": "CKYC registry lookup"},
            {"field": "identity", "level": "pass", "message": "KYC verified in the CKYC registry"})


def _date(s: str | None) -> date | None:
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d %b %Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(s.strip()[:11].strip(), fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(s).date()
    except ValueError:
        return None


def name_ratio(a: str | None, b: str | None) -> float:
    norm = lambda s: " ".join(sorted(re.sub(r"\b(mr|mrs|ms|shri|smt|dr)\b\.?", "", (s or "").lower()).replace(".", " ").split()))
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


def dl_check(claim: dict, vehicle_type: str) -> dict:
    """checks.dl from the DL extraction: valid on the incident date and the class covers the vehicle (FR-10)."""
    dl = next((d for d in claim.get("documents", []) if d.get("requirement") == "dl" or d.get("type") == "DL"), None)
    if dl is None:
        return {"level": "pending", "summary": "Driving licence not provided", "data": {}, "latency_ms": 0}
    ex = dl.get("extracted") or {}
    if dl.get("status") == "received" and not ex:
        return {"level": "warn", "summary": "Licence received — not read automatically", "data": {}, "latency_ms": 0}
    incident = datetime.fromisoformat(claim["incident"]["datetime"]).date()
    transport = vehicle_type == "CV"
    valid_to = _date(ex.get("valid_to_tr") if transport else (ex.get("valid_to_nt") or ex.get("valid_to")))
    classes = {c.upper().replace(" ", "") for c in (ex.get("classes") or [])}
    covers = bool(classes & {c.replace(" ", "") for c in DL_COVERS[vehicle_type]}) if classes else None
    data = {"dl_number": ex.get("dl_number") or (f"XXXX{ex['number_last4']}" if ex.get("number_last4") else None),
            "holder": ex.get("holder"), "classes": sorted(classes), "valid_to": valid_to and valid_to.isoformat()}
    if valid_to and valid_to < incident:
        return {"level": "fail", "summary": "Licence expired before the incident date", "data": data, "latency_ms": 0, "invalid": True}
    if covers is False:
        return {"level": "fail", "summary": f"Licence class {', '.join(sorted(classes))} does not cover this vehicle", "data": data,
                "latency_ms": 0, "invalid": True}
    if valid_to is None or covers is None:
        return {"level": "warn", "summary": "Validity or class could not be read", "data": data, "latency_ms": 0}
    return {"level": "pass", "summary": f"Valid · {', '.join(sorted(classes))}", "data": data, "latency_ms": 0}
