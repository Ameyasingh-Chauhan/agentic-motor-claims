"""File a Claim wizard support (spec §10.6): policyholder/policy lookup, drafts, document checklist, garages, sample scenarios,
live voice/text intake and live document extraction.

The wizard writes the claim itself through filing.py (create / patch / upload / submit). This module only reads reference data
and runs single agents (Intake, Document) on a draft outside the full pipeline. Each such agent call is recorded as a small
pipeline run (trigger `wizard_intake` / `wizard_document`) so the Dev Tools inspector shows its prompt, response and tokens.
"""
from __future__ import annotations

import asyncio
import hashlib
import secrets
import shutil
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ..agents import adjudication as adj
from ..config import get_settings
from ..services import uploads, vehicle_catalog
from ..services.claim_views import now_ist, to_customer_view, with_media_availability
from ..services.json_store import read_json, update_json
from .auth import current_user
from .filing import ClaimCreate, create_claim, find, is_admin, iso, upload, validated

router = APIRouter(prefix="/api", tags=["wizard"])

SCENARIOS = ("clean_rear_end", "fastag_mismatch", "garage_overquote", "theft_two_wheeler", "flood_total_loss")
SCENARIO_TITLES = {"clean_rear_end": "Clean rear-end (Pune, Creta)", "fastag_mismatch": "FASTag location mismatch (Creta)",
                   "garage_overquote": "Garage over-quote (Kochi, Baleno)", "theft_two_wheeler": "Two-wheeler theft (Activa)",
                   "flood_total_loss": "Flood total loss (Thane, Swift)"}
EXTRACTABLE = {"rc", "dl", "policy", "fir", "repair_estimate", "repair_invoice", "repair_bills"}
WHY = {
    "claim_form": "Your digital claim form — we create it from this wizard, so nothing to upload.",
    "policy": "Confirms your cover. We fetch it from ABC's records if you don't upload it.",
    "rc": "Proves the vehicle is registered to the policyholder and matches the policy.",
    "dl": "The driver must hold a valid licence for this vehicle class on the incident date.",
    "kyc": "Identity check. Already verified for most customers through the CKYC registry.",
    "fir": "A police report is needed for theft, injury and some third-party claims.",
}


def _expired(policy: dict, on: date | None = None) -> bool:
    return date.fromisoformat(policy["end"]) < (on or now_ist().date())


def _policy_card(policy: dict, vehicle: dict, customer: dict) -> dict:
    today = now_ist().date()
    end = date.fromisoformat(policy["end"])
    return {
        "policy_no": policy["policy_no"], "insurer": policy.get("insurer", "ABC General Insurance"), "product": policy.get("product"),
        "cover": policy["cover"], "start": policy["start"], "end": policy["end"], "idv": policy["idv"], "ncb_pct": policy.get("ncb_pct"),
        "add_ons": [k for k, v in (policy.get("add_ons") or {}).items() if v], "expired": end < today,
        "days_left": (end - today).days, "customer_id": customer["id"], "customer_name": customer["name"], "city": customer["city"],
        "vehicle": {k: vehicle.get(k) for k in ("id", "registration", "make", "model", "variant", "type", "segment", "colour", "fuel",
                                                 "registered_on")},
    }


async def _ref():
    return await asyncio.gather(read_json("policies.json", []), read_json("vehicles.json", []), read_json("customers.json", []))


def _norm(s: str | None) -> str:
    return (s or "").replace(" ", "").replace("-", "").casefold()


# ------------------------------------------------------------------------------------------------ policyholders & policies

@router.get("/wizard/policyholders")
async def policyholders(q: str = "", user=Depends(current_user)):
    """Admins pick the policyholder first (step 0): searchable by name, phone, city, policy number or registration."""
    if not is_admin(user):
        raise HTTPException(403, "Admins only")
    policies, vehicles, customers = await _ref()
    vby = {v["id"]: v for v in vehicles}
    by_cust: dict[str, list] = {}
    for p in policies:
        by_cust.setdefault(p["customer_id"], []).append(p)
    nq = _norm(q)
    out = []
    for c in customers:
        pols = by_cust.get(c["id"], [])
        if not pols:
            continue
        regs = [vby[p["vehicle_id"]]["registration"] for p in pols if p["vehicle_id"] in vby]
        hay = _norm(" ".join([c["name"], c.get("phone", ""), c["city"], *[p["policy_no"] for p in pols], *regs]))
        if nq and nq not in hay:
            continue
        out.append({"id": c["id"], "name": c["name"], "city": c["city"], "phone": c.get("phone"), "policies": len(pols),
                    "registrations": sorted(set(regs))[:3]})
    out.sort(key=lambda r: (r["id"] != "c_0001", r["name"]))
    return {"items": out[:50], "total": len(out)}


@router.get("/wizard/policies")
async def policies_for(customer_id: str | None = None, user=Depends(current_user)):
    """Policies of one policyholder (customers: always their own), newest first."""
    cid = customer_id if is_admin(user) else user.get("customer_id")
    if not cid:
        raise HTTPException(422, "Choose a policyholder")
    policies, vehicles, customers = await _ref()
    customer = next((c for c in customers if c["id"] == cid), None)
    if customer is None:
        raise HTTPException(404, "Policyholder not found")
    vby = {v["id"]: v for v in vehicles}
    rows = [_policy_card(p, vby[p["vehicle_id"]], customer) for p in policies if p["customer_id"] == cid and p["vehicle_id"] in vby]
    rows.sort(key=lambda r: r["end"], reverse=True)
    return {"customer": {k: customer.get(k) for k in ("id", "name", "city", "phone", "preferred_language")}, "items": rows}


@router.get("/wizard/lookup")
async def lookup(q: str, user=Depends(current_user)):
    """Live lookup by policy number or registration. Customers only find their own policies (others look like 'not found')."""
    nq = _norm(q)
    if len(nq) < 4:
        raise HTTPException(422, "Type at least 4 characters")
    policies, vehicles, customers = await _ref()
    vby = {v["id"]: v for v in vehicles}
    cby = {c["id"]: c for c in customers}
    hits = [p for p in policies if p["vehicle_id"] in vby and (_norm(p["policy_no"]) == nq or _norm(vby[p["vehicle_id"]]["registration"]) == nq)]
    if not is_admin(user):
        hits = [p for p in hits if p["customer_id"] == user.get("customer_id")]
    if not hits:
        raise HTTPException(404, {"code": "policy_not_found", "message": "No policy found for that number or registration"})
    best = min(hits, key=lambda p: (_expired(p), -int(p["end"].replace("-", ""))))
    return _policy_card(best, vby[best["vehicle_id"]], cby[best["customer_id"]])


# ------------------------------------------------------------------------------------------------ drafts

@router.get("/wizard/drafts")
async def drafts(user=Depends(current_user)):
    """The user's own drafts: a customer's drafts, or the drafts an admin started."""
    claims = await read_json("claims.json", [])
    mine = [c for c in claims if c["status"] == "DRAFT" and (
        (user.get("role") == "customer" and c["customer_id"] == user.get("customer_id")) or
        (is_admin(user) and (c.get("audit") or [{}])[0].get("actor") == user["id"]))]
    mine.sort(key=lambda c: c["updated_at"], reverse=True)
    return {"items": [{"id": c["id"], "updated_at": c["updated_at"], "customer_name": c["customer_name"], "registration": c["registration"],
                       "vehicle": f"{c['vehicle']['make']} {c['vehicle']['model']}", "step": (c.get("wizard") or {}).get("step", 1),
                       "incident": c["incident"].get("label") if (c.get("wizard") or {}).get("incident_chosen") else None,
                       "photos": sum(1 for m in c["media"] if m["kind"] == "photo"), "documents": len(c["documents"])} for c in mine[:10]]}


@router.delete("/wizard/drafts/{claim_id}")
async def discard_draft(claim_id: str, user=Depends(current_user)):
    def drop(claims: list[dict]) -> None:
        c = find(claims, claim_id, user)
        if c["status"] != "DRAFT":
            raise HTTPException(409, {"code": "not_draft", "message": "Only a draft can be discarded"})
        claims.remove(c)

    await update_json("claims.json", drop, [])
    from ..services import uploads
    await asyncio.to_thread(uploads.remove_claim_dir, claim_id)
    return {"ok": True}


# ------------------------------------------------------------------------------------------------ reference lists

@router.get("/wizard/cities")
async def cities(user=Depends(current_user)):
    rows = await read_json("cities.json", [])
    return [{k: c[k] for k in ("city", "state", "tier", "lat", "lng")} for c in rows]


def _distance_km(garage_id: str) -> float:
    """Garages carry a city, not coordinates: a stable approximate in-city distance for the list (dummy data, labelled approx.)."""
    h = int(hashlib.sha1(garage_id.encode()).hexdigest()[:6], 16)
    return round(1.2 + (h % 140) / 10, 1)


@router.get("/wizard/garages")
async def garages(city: str | None = None, vehicle_type: str | None = None, user=Depends(current_user)):
    rows = await read_json("garages.json", [])
    city_rows = [g for g in rows if not city or g["city"].casefold() == city.casefold()]
    out = []
    for g in city_rows or rows:
        if vehicle_type == "2W" and g.get("type") == "authorised" and not any(b in ("Honda", "TVS", "Bajaj", "Hero", "Royal Enfield", "Suzuki")
                                                                              for b in g.get("brands", [])):
            continue
        out.append({k: g.get(k) for k in ("id", "name", "city", "type", "cashless", "rating", "avg_tat_days", "brands", "contact")}
                   | {"distance_km": _distance_km(g["id"])})
    out.sort(key=lambda g: (not g["cashless"], g["distance_km"]))
    return {"items": out, "in_city": bool(city_rows)}


def _conditions(claim: dict, policy: dict | None) -> list[str]:
    keys = set(adj.conditions_for(claim, vahan=None, policy=policy or {}))
    w = claim.get("wizard") or {}
    if w.get("financed"):
        keys.add("financed")
    if w.get("major_accident"):
        keys.add("major_accident")
    if claim["incident"].get("type") == "vandalism":
        keys.add("malicious_damage")
    return sorted(keys)


@router.get("/wizard/requirements/{claim_id}")
async def requirements(claim_id: str, user=Depends(current_user)):
    """Dynamic checklist (§11.5) for vehicle type × incident × conditions, with each item's upload status."""
    claims, reqs, policies = await asyncio.gather(read_json("claims.json", []), read_json("document_requirements.json", {}),
                                                  read_json("policies.json", []))
    claim = find(claims, claim_id, user)
    policy = next((p for p in policies if p["policy_no"] == claim["policy_no"]), None)
    spec = reqs.get(claim["vehicle"]["type"]) or {}
    conds = set(_conditions(claim, policy))
    by_req: dict[str, list] = {}
    for d in claim["documents"]:
        by_req.setdefault(d.get("requirement"), []).append(d)
    digital = {"claim_form", "policy", "kyc"}   # recorded digitally at processing when not uploaded (Phase 5 decision)

    def item(i: dict, group: str) -> dict:
        docs = by_req.get(i["doc"], [])
        blocking = group == "mandatory" or bool(conds & set(i.get("when") or []) & adj.BLOCKING.get(i["doc"], set()))
        return {"doc": i["doc"], "label": i["label"], "group": group, "why": i.get("reason") or WHY.get(i["doc"]),
                "when": sorted(conds & set(i.get("when") or [])), "required": blocking,
                "digital": i["doc"] in digital, "extractable": i["doc"] in EXTRACTABLE,
                "uploaded": [{k: d.get(k) for k in ("id", "type", "status", "thumb", "url", "original_name", "size_bytes", "mime",
                                                     "extracted", "checks")} for d in docs]}

    groups = {
        "mandatory": [item(i, "mandatory") for i in spec.get("mandatory", []) if i["doc"] != "photos"],
        "situation": [item(i, "situation") for i in spec.get("conditional", []) if conds & set(i.get("when") or [])],
        "optional": [item(i, "optional") for i in spec.get("optional", []) if i["doc"] not in ("photos", "witness")],
    }
    return {"vehicle_type": claim["vehicle"]["type"], "conditions": sorted(conds), "groups": groups}


# ------------------------------------------------------------------------------------------------ sample scenarios (DEMO_MODE)

@router.get("/wizard/scenarios")
async def scenarios(user=Depends(current_user)):
    """Text + details for each step from the 5 seeded scenarios. Photos and documents are never attached — the user uploads them."""
    if not get_settings().demo_mode:
        raise HTTPException(404, "Not available")
    if not is_admin(user):
        raise HTTPException(403, "Admins only")
    claims, policies, vehicles, customers = await asyncio.gather(read_json("claims.json", []), *_ref_coros())
    vby = {v["id"]: v for v in vehicles}
    cby = {c["id"]: c for c in customers}
    out = []
    for sid in SCENARIOS:
        c = next((x for x in claims if x.get("scenario_id") == sid and not x.get("replay_of")), None)
        if c is None:
            continue
        policy = next(p for p in policies if p["policy_no"] == c["policy_no"])
        inc = c["incident"]
        out.append({
            "id": sid, "title": SCENARIO_TITLES[sid], "customer_id": c["customer_id"], "customer_name": c["customer_name"],
            "policy": _policy_card(policy, vby[policy["vehicle_id"]], cby[c["customer_id"]]),
            "claim_type": c["claim_type"] if c["claim_type"] != "Total loss" else "OD",
            "incident": {"type": inc["type"], "narrative": inc["narrative_original"], "narrative_language": inc.get("narrative_language"),
                         "datetime": inc["datetime"], "location_text": inc["location"]["text"], "city": inc["location"]["city"],
                         "lat": inc["location"]["lat"], "lng": inc["location"]["lng"],
                         "third_party_involved": bool(inc.get("third_party_involved")), "injuries": bool(inc.get("injuries"))},
            "fir": inc.get("fir"),
            "settlement": {"mode": c["settlement"]["mode"], "garage_id": c["settlement"].get("garage_id") if c["settlement"]["mode"] == "cashless" else None},
            "garage_quote": c.get("garage_quote"),
        })
    return out


def _ref_coros():
    return read_json("policies.json", []), read_json("vehicles.json", []), read_json("customers.json", [])


# ------------------------------------------------------------------------------------------------ live agents on a draft

async def _standalone(claim_id: str, trigger: str):
    from ..agents import orchestrator
    from ..services import gemini, pipeline_bus
    mode = "demo" if gemini.effective_mode() == "demo" else "live"
    run_id = await pipeline_bus.next_run_id()
    await pipeline_bus.create_run(run_id, claim_id, mode=mode, pace="fast", trigger=trigger)
    ctx = await orchestrator._context(run_id, claim_id, mode, "fast")
    return ctx, run_id


async def _close(run_id: str, ok: bool = True) -> None:
    from ..services import pipeline_bus
    await pipeline_bus.emit(run_id, "run_completed" if ok else "run_failed", {"run_id": run_id})
    await pipeline_bus.update_run(run_id, status="completed" if ok else "failed", finished_at=pipeline_bus.now_iso())


def intake_view(out: dict) -> dict:
    """What the wizard shows the customer: language, transcript, translation and the auto-filled fields (no internal flags)."""
    keys = ("transcript", "language_codes", "language_label", "translation_en", "incident_type", "incident_at", "datetime_conf",
            "location_text", "city", "cause", "counterparty", "third_party", "injuries", "police_informed", "fir_number", "drivable",
            "driver_is_policyholder", "driver_name", "parts_mentioned", "missing", "follow_up")
    return {k: out.get(k) for k in keys}


@router.post("/intake/voice")
async def intake_voice(claim_id: str = Form(...), file: UploadFile | None = File(None), text: str | None = Form(None),
                       user=Depends(current_user)):
    """Voice note (or typed text) → Intake agent → transcript, translation, language and auto-filled fields, stored on the draft
    (`claim.intake`, so the pipeline's Intake step reuses it instead of calling Gemini again)."""
    claim = find(await read_json("claims.json", []), claim_id, user)
    if claim["status"] != "DRAFT":
        raise HTTPException(409, {"code": "not_draft", "message": "Only a draft can be edited"})
    if file is None and not (text or "").strip():
        raise HTTPException(422, "Record a voice note or type a description")
    media_id = None
    if file is not None:
        # replace an earlier voice note: one statement per claim
        def drop_old(claims: list[dict]) -> list[str]:
            c = find(claims, claim_id, user)
            old = [m["id"] for m in c["media"] if m["kind"] == "audio"]
            c["media"] = [m for m in c["media"] if m["kind"] != "audio"]
            return old
        from ..services import uploads
        for old in await update_json("claims.json", drop_old, []):
            await asyncio.to_thread(uploads.remove, claim_id, old)
        entry = await upload(claim_id, file=file, kind="audio", slot="voice_note", caption="Voice statement", user=user)
        media_id = entry["id"]
    elif text:
        def set_text(claims: list[dict]) -> None:
            c = find(claims, claim_id, user)
            c["incident"]["narrative_original"] = c["incident"]["narrative_en"] = text.strip()[:4000]
            c["media"] = [m for m in c["media"] if m["kind"] != "audio"]
        await update_json("claims.json", set_text, [])

    from ..agents import intake
    ctx, run_id = await _standalone(claim_id, "wizard_intake")
    if file is not None:  # the statement is the audio; ignore any earlier typed text
        ctx.claim["incident"]["narrative_original"] = ctx.claim["incident"]["narrative_en"] = ""
    ctx.claim.pop("intake", None)
    try:
        out = await intake.run(ctx)
    except Exception:  # noqa: BLE001
        await _close(run_id, ok=False)
        raise HTTPException(502, "The Intake agent is unavailable — please type the description instead")
    await _close(run_id)
    source = ctx.sources.get("intake", "live")
    live = source == "live"
    now = iso(now_ist())

    def save(claims: list[dict]) -> dict:
        c = find(claims, claim_id, user)
        inc = c["incident"]
        if live:
            c["intake"] = out
            if out.get("transcript") and file is not None:
                inc["narrative_original"] = out["transcript"]
            if out.get("translation_en"):
                inc["narrative_en"] = out["translation_en"]
            codes = out.get("language_codes") or []
            if codes:
                inc["narrative_language"] = "-".join(codes[:2]) if len(codes) > 1 else codes[0]
            if out.get("parts_mentioned"):
                inc["damaged_parts_mentioned"] = out["parts_mentioned"]
        c["updated_at"] = now
        validated(c)
        return c

    await update_json("claims.json", save, [])
    return {"source": source, "run_id": run_id, "media_id": media_id, "intake": intake_view(out) if live else None,
            "message": None if live else "AI is in demo mode, so the statement could not be read automatically — please type it."}


class ExtractBody(BaseModel):
    claim_id: str
    doc_id: str


@router.post("/documents/extract")
async def extract(body: ExtractBody, user=Depends(current_user)):
    """Run the Document agent on one uploaded document of a draft and record the extracted fields and match flags."""
    claim = find(await read_json("claims.json", []), body.claim_id, user)
    if claim["status"] != "DRAFT":
        raise HTTPException(409, {"code": "not_draft", "message": "Only a draft's documents are read here"})
    doc = next((d for d in claim["documents"] if d["id"] == body.doc_id), None)
    if doc is None:
        raise HTTPException(404, "Document not found")
    from ..agents import document
    ctx, run_id = await _standalone(body.claim_id, "wizard_document")
    for d in ctx.claim["documents"]:  # read only this one (the agent reads documents whose status is "received")
        d["status"] = "received" if d["id"] == body.doc_id else "skip"
    try:
        out = await document.run(ctx)
    except Exception:  # noqa: BLE001
        await _close(run_id, ok=False)
        raise HTTPException(502, "The Document agent is unavailable — the document will be checked during processing")
    await _close(run_id)
    source = ctx.sources.get("document", "python")
    if source != "live":
        return {"source": source, "document": None, "message": "Automatic reading is unavailable right now — we'll check it during processing."}
    now = iso(now_ist())

    def save(claims: list[dict]) -> dict:
        c = find(claims, body.claim_id, user)
        document.apply(c, out, now=now)
        d = next(x for x in c["documents"] if x["id"] == body.doc_id)
        c["updated_at"] = now
        validated(c)
        return d

    d = await update_json("claims.json", save, [])
    return {"source": source, "document": {k: d.get(k) for k in ("id", "type", "requirement", "status", "extracted", "checks")}
            | {"actual_type": (d.get("ai") or {}).get("actual_type"), "type_mismatch": (d.get("ai") or {}).get("type_mismatch", False),
               "legibility": (d.get("ai") or {}).get("legibility")}}


# ------------------------------------------------------------------------------------------------ policy from an uploaded document
# Step 1 fallback (§10.6 / Feature A): read a policy document before any claim exists yet. The Document agent runs on a
# throwaway placeholder context (reusing document.md/DocumentOut unchanged — see docs/FEATURE_BRIEF…), and the file sits in a
# private staging folder (server/uploads/<token>/) until /confirm moves it onto the new claim; never confirmed = never attached.

ADDON_WORDS = {"zero_dep": ("zero", "depreciation"), "consumables": ("consumable",), "engine_protect": ("engine",),
              "rti": ("return to invoice", "rti"), "rsa": ("road", "assistance", "rsa")}


def _addons_from(words: list[str]) -> dict:
    hay = " ".join(words).casefold()
    return {k: any(w in hay for w in ws) for k, ws in ADDON_WORDS.items()}


@router.post("/wizard/policy-document")
async def upload_policy_document(file: UploadFile = File(...), user=Depends(current_user)):
    """Read an uploaded policy document (image or PDF) and return its extracted fields with confidence, before any
    claim or policy record exists. Nothing is written to claims.json / policies.json here — see /confirm."""
    data = await file.read(uploads.MAX_BYTES + 1)
    staging_id = "stg-" + secrets.token_hex(8)
    try:
        processed = await asyncio.to_thread(uploads.process, staging_id, kind="document", filename=file.filename or "policy",
                                            content_type=file.content_type, data=data)
    except uploads.UploadError as e:
        raise HTTPException(422, {"code": "invalid_file", "message": str(e)}) from e
    fields = await asyncio.to_thread(uploads.finalise, staging_id, processed, "d_1")

    from ..agents import document
    from ..agents.base import RunContext
    from ..services import gemini
    today = now_ist().date().isoformat()
    claim = {"id": staging_id, "scenario_id": None,
             "documents": [{"id": "d_1", "type": "Policy", "url": fields["url"], "original_url": fields["original_url"],
                            "status": "received"}],
             "incident": {"datetime": f"{today}T00:00:00+05:30"}}
    vehicle = {"registration": "", "make": "", "model": "", "type": "Car", "chassis": None, "engine": None}
    mode = "demo" if gemini.effective_mode() == "demo" else "live"
    ctx = RunContext(run_id=f"adhoc-{staging_id}", claim=claim, policy={"policy_no": ""}, vehicle=vehicle,
                     customer={"name": ""}, garage=None, city={}, mode=mode, pace_ms=0)
    try:
        out = await document.run(ctx)
    except Exception:  # noqa: BLE001
        await asyncio.to_thread(uploads.remove_claim_dir, staging_id)
        raise HTTPException(502, "The Document agent is unavailable — please enter the policy details manually")

    source = ctx.sources.get("document", "python")
    result = next(iter(out.get("documents", [])), None)
    if source != "live" or result is None:
        await asyncio.to_thread(uploads.remove_claim_dir, staging_id)
        return {"source": source, "staging": None, "extracted": {}, "field_confidence": {},
                "message": "Automatic reading is unavailable right now — enter the policy details manually below."}

    extracted = {k: v for k, v in result["extracted"].items() if k != "field_confidence" and v not in (None, "", [], {})}
    conf = {c["field"]: c["confidence"] for c in result["extracted"].get("field_confidence", [])}
    return {"source": source, "staging": {"token": staging_id, "files": processed["files"]}, "extracted": extracted,
            "field_confidence": conf, "overall_confidence": result.get("confidence", 0),
            "legibility": result.get("legibility"), "tampering_suspected": result.get("tampering_suspected", False),
            "watermark_noted": result.get("watermark_noted", False),
            "file": {"original_name": processed["fields"]["original_name"], "mime": processed["fields"]["mime"]},
            "message": None if not result.get("tampering_suspected") else
            "Some signs on this document look altered — a handler will review it before the claim is processed."}


class StagingRef(BaseModel):
    token: str
    files: dict[str, str]


class ConfirmPolicyDocument(BaseModel):
    staging: StagingRef | None = None
    customer_id: str | None = None   # admin only: an existing policyholder chosen in step 0; else a new customer is made
    fields: dict


def _guess_city(address: str | None, cities: list[dict]) -> str:
    addr = (address or "").casefold()
    return next((c["city"] for c in cities if c["city"].casefold() in addr), cities[0]["city"] if cities else "Pune")


def _next_id(rows: list[dict], key: str, prefix: str, width: int) -> str:
    n = max((int(r[key].split("_", 1)[1]) for r in rows if str(r.get(key, "")).startswith(prefix + "_")
             and r[key].split("_", 1)[1].isdigit()), default=0)
    return f"{prefix}_{n + 1:0{width}d}"


def _move_staged(staging_id: str, files: dict[str, str], claim_id: str, item_id: str) -> dict:
    src_dir, dst_dir = uploads.claim_dir(staging_id), uploads.claim_dir(claim_id)
    dst_dir.mkdir(parents=True, exist_ok=True)
    out = {}
    for role, suffix in files.items():
        s, d = src_dir / f"d_1{suffix}", dst_dir / f"{item_id}{suffix}"
        if s.exists():
            shutil.move(str(s), str(d))
            out[role] = uploads.file_url(claim_id, d.name)
    shutil.rmtree(src_dir, ignore_errors=True)
    return {"url": out.get("main") or out.get("original"), "thumb": out.get("thumb"), "original_url": out.get("original")}


@router.post("/wizard/policy-document/confirm")
async def confirm_policy_document(body: ConfirmPolicyDocument, user=Depends(current_user)):
    """Create customer + vehicle + policy from the (edited) extracted fields, start a new draft claim on that policy
    (same path as any other draft) and attach the document to it. Blocks on a policy number already on file."""
    f = body.fields
    policy_no = (f.get("policy_no") or "").strip()
    registration = (f.get("registration") or "").strip().upper()
    insured = (f.get("insured") or "").strip()
    values = {"policy_no": policy_no, "registration": registration, "insured": insured}
    labels = {"policy_no": "Enter the policy number", "registration": "Enter the vehicle registration", "insured": "Enter the insured's name"}
    missing = {k: m for k, m in labels.items() if not values[k]}
    if missing:
        raise HTTPException(422, {"code": "validation", "fields": missing})

    policies, vehicles, customers = await _ref()
    dup = next((p for p in policies if _norm(p["policy_no"]) == _norm(policy_no)), None)
    if dup is not None:
        vby, cby = {v["id"]: v for v in vehicles}, {c["id"]: c for c in customers}
        same = _norm(vby.get(dup["vehicle_id"], {}).get("registration")) == _norm(registration)
        raise HTTPException(409, {"code": "duplicate_policy", "policy": _policy_card(dup, vby[dup["vehicle_id"]], cby[dup["customer_id"]]),
                                  "message": "A policy with this number is already on file"
                                             + ("." if same else " with different details — this looks like a duplicate or forged document.")})

    if is_admin(user):
        customer = next((c for c in customers if c["id"] == body.customer_id), None) if body.customer_id else None
    else:
        customer = next((c for c in customers if c["id"] == user.get("customer_id")), None)
    if customer is None:
        cities = await read_json("cities.json", [])
        customer = {"id": _next_id(customers, "id", "c", 4), "name": insured, "phone": f.get("insured_contact"), "email": None,
                   "city": _guess_city(f.get("insured_address"), cities), "state": None, "address": f.get("insured_address"),
                   "kyc": {"aadhaar": None, "pan": None, "verified": True}, "avatar": None, "preferred_language": "en"}

        def add_customer(rows: list[dict]) -> None:
            rows.append(customer)
        await update_json("customers.json", add_customer, [])

    vehicle = next((v for v in vehicles if _norm(v["registration"]) == _norm(registration)), None)
    if vehicle is None:
        make = (f.get("vehicle_make") or "").strip() or "Unknown"
        model = (f.get("vehicle_model") or "").strip() or "Unknown"
        model_key = await vehicle_catalog.ensure_model(make=make, model=model, variant=f.get("vehicle_variant"),
                                                       cc=f.get("vehicle_cc"), fuel=f.get("fuel"), vtype="Car")
        year = f.get("vehicle_year")
        vehicle = {"id": _next_id(vehicles, "id", "v", 4), "registration": registration, "make": make, "model": model,
                  "model_key": model_key, "variant": f.get("vehicle_variant"), "segment": None, "fuel": f.get("fuel") or "Petrol",
                  "cc": f.get("vehicle_cc") or 0, "registered_on": f"{year}-01-01" if year else None, "colour": f.get("vehicle_colour"),
                  "chassis": "X" * 12 + str(f.get("chassis5") or "00000")[-5:].rjust(5, "0"),
                  "engine": "X" * 6 + str(f.get("engine5") or "00000")[-5:].rjust(5, "0"), "type": "Car", "use": "private"}

        def add_vehicle(rows: list[dict]) -> None:
            rows.append(vehicle)
        await update_json("vehicles.json", add_vehicle, [])

    models = await read_json("vehicle_models.json", [])
    model_ref = next((m for m in models if m["key"] == vehicle.get("model_key")), {})
    if vehicle.get("segment") is None and model_ref:
        def fix_segment(rows: list[dict]) -> None:
            next(v for v in rows if v["id"] == vehicle["id"])["segment"] = model_ref["segment"]
        await update_json("vehicles.json", fix_segment, [])
        vehicle["segment"] = model_ref["segment"]

    end = f.get("period_to") or now_ist().date().replace(year=now_ist().date().year + 1).isoformat()
    policy = {"policy_no": policy_no, "customer_id": customer["id"], "vehicle_id": vehicle["id"],
             "product": "Private Car Package", "cover": f.get("cover") or "OD+TP",
             "start": f.get("period_from") or now_ist().date().isoformat(), "end": end,
             "idv": float(f.get("idv") or round(model_ref.get("ex_showroom", 700_000) * 0.75, -3)),
             "ncb_pct": float(f.get("ncb_pct") or 0), "add_ons": _addons_from(f.get("add_ons") or []),
             "voluntary_deductible": float(f.get("deductible_voluntary") or 0), "premium": float(f.get("premium") or 0),
             "insurer": "ABC General Insurance", "status": "active", "previous_break_in": False}

    def add_policy(rows: list[dict]) -> None:
        rows.append(policy)
    await update_json("policies.json", add_policy, [])

    vclass = {"Car": "LMV", "2W": "MCWG", "CV": "Transport (LMV-TR / HGMV)"}.get(vehicle["type"], "LMV")

    def add_vahan(rows: dict) -> None:
        rows[vehicle["registration"]] = {"registration": vehicle["registration"], "owner": insured, "class": vclass,
                                         "make_model": f"{vehicle['make']} {vehicle['model']}", "rc_status": "active",
                                         "hypothecation": None, "blacklisted": False, "stolen": False,
                                         "registered_on": vehicle.get("registered_on"), "profile": "uploaded_document"}
    await update_json("vahan.json", add_vahan, {})

    created = await create_claim(ClaimCreate(policy_no=policy_no, channel="app"), user=user)
    now = iso(now_ist())

    def attach(claims: list[dict]) -> dict:
        c = find(claims, created["id"], user)
        if body.staging is not None:
            moved = _move_staged(body.staging.token, body.staging.files, c["id"], "d_1")
            clean = {k: v for k, v in f.items() if v not in (None, "", [], {})}
            c["documents"].append({"id": "d_1", "type": "Policy", "requirement": "policy", **moved, "status": "verified",
                                   "extracted": clean, "checks": [], "uploaded_at": now, "uploaded_by": "customer" if user.get("role") == "customer" else user["id"],
                                   "source": "uploaded_document"})
        c["policy_source"] = "uploaded_document"
        c["timeline"].append({"ts": now, "actor": "customer" if user.get("role") == "customer" else user["id"],
                              "type": "policy_document_uploaded", "text": "Policy verified from an uploaded document"})
        c["audit"].append({"ts": now, "actor": user["id"], "action": "policy_verified_uploaded_document", "from": None,
                           "to": policy_no, "reason": "Policy, customer and vehicle created from an uploaded document"})
        c["updated_at"] = now
        validated(c)
        return c

    claim = await update_json("claims.json", attach, [])
    end_date = date.fromisoformat(policy["end"])
    warnings = []
    if end_date < now_ist().date():
        warnings.append("This policy has already expired — the claim can still be filed but is likely to be declined.")
    if policy["cover"] != "OD+TP":
        warnings.append("This policy does not include own-damage cover — the claim can still be filed but is likely to be declined.")
    claim = with_media_availability(claim)
    return {"claim": to_customer_view(claim) if user.get("role") == "customer" else claim, "warnings": warnings}

