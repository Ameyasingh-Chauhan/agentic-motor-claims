"""New claims filed in the app (spec §11.6, §17): create draft → patch → upload files → submit, plus the private file endpoint.

Every claims.json change runs inside `json_store.update_json` (read-modify-write under the file lock) and is validated against the
§11.2 `Claim` schema before it is written, so app-filed claims have exactly the shape of seeded ones. Submit starts the agent pipeline
(agents/orchestrator.py), which fills fraud, financials, decision and risk.
"""
from __future__ import annotations

import asyncio
import re
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, ValidationError

from ..schemas.claim import Claim
from ..services import uploads
from ..services.claim_views import now_ist, to_customer_view, with_media_availability
from ..services.json_store import read_json, update_json
from .auth import current_user

router = APIRouter(prefix="/api", tags=["filing"])

INCIDENT_LABELS = {
    "rear_end": "Rear-end collision", "front_collision": "Front collision", "side_swipe": "Side impact", "parking_scrape": "Parking scrape",
    "pothole": "Pothole / road hazard", "animal": "Animal collision", "skid_fall": "Skid and fall", "glass": "Windshield damage",
    "flood": "Flood / water ingress", "theft": "Vehicle theft",
}
DOC_TYPES = {"claim_form": "ClaimForm", "policy": "Policy", "rc": "RC", "dl": "DL", "kyc": "KYC", "fir": "FIR", "tax_receipt": "TaxReceipt",
             "repair_estimate": "Estimate", "repair_invoice": "Invoice", "repair_bills": "Invoice"}
CHANNEL_LABEL = {"app": "App", "web": "Web", "whatsapp": "WhatsApp", "branch": "Branch"}
UPLOAD_STATUSES = {"DRAFT", "INFO_REQUESTED"}   # customers may add files to a draft, or when ABC asks for more information
SLA_HOURS = 48
ID_RE = re.compile(r"^ABC-MC-(\d{4})-(\d{6})$")


# ------------------------------------------------------------------------------------------------ request bodies

class IncidentIn(BaseModel):
    type: Literal[tuple(INCIDENT_LABELS)] | None = None  # type: ignore[valid-type]
    datetime: str | None = None
    location_text: str | None = Field(None, max_length=200)
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    narrative: str | None = Field(None, max_length=4000)
    narrative_language: str | None = None
    third_party_involved: bool | None = None
    injuries: bool | None = None


class ClaimCreate(BaseModel):
    policy_no: str | None = None
    registration: str | None = None
    claim_type: Literal["OD", "TP", "Theft", "Glass", "Total loss"] = "OD"
    channel: Literal["app", "web", "whatsapp", "branch"] = "app"
    incident: IncidentIn = IncidentIn()
    garage_id: str | None = None
    garage_quote: float | None = Field(None, ge=0)


class ClaimPatch(BaseModel):
    claim_type: Literal["OD", "TP", "Theft", "Glass", "Total loss"] | None = None
    incident: IncidentIn | None = None
    garage_id: str | None = None
    garage_quote: float | None = Field(None, ge=0)


# ------------------------------------------------------------------------------------------------ helpers

def is_admin(user: dict) -> bool:
    return user.get("role") == "admin"


def can_access(user: dict, claim: dict) -> bool:
    return is_admin(user) or (user.get("role") == "customer" and claim["customer_id"] == user.get("customer_id"))


def iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


def actor_of(user: dict) -> str:
    return "customer" if user.get("role") == "customer" else user["id"]


def view_for(user: dict, claim: dict) -> dict:
    claim = with_media_availability(claim)
    return to_customer_view(claim) if user.get("role") == "customer" else claim


def find(claims: list[dict], claim_id: str, user: dict) -> dict:
    """The claim if this user may see it — 404 otherwise (never reveal that another customer's claim exists)."""
    claim = next((c for c in claims if c["id"] == claim_id), None)
    if claim is None or not can_access(user, claim):
        raise HTTPException(404, "Claim not found")
    return claim


def next_id(claims: list[dict], now: datetime) -> str:
    """ABC-MC-<year filed>-<6 digits>, the 6-digit counter continuing from the highest existing ID (§11.4, §11.6)."""
    n = max((int(m.group(2)) for c in claims if (m := ID_RE.match(c["id"]))), default=0)
    return f"ABC-MC-{now.year}-{n + 1:06d}"


def next_item_id(items: list[dict], prefix: str) -> str:
    nums = [int(i["id"].split("_", 1)[1]) for i in items if str(i.get("id", "")).startswith(prefix + "_") and i["id"].split("_", 1)[1].isdigit()]
    return f"{prefix}_{max(nums, default=0) + 1}"


def validated(claim: dict) -> dict:
    try:
        Claim.model_validate(claim)
    except ValidationError as e:  # a bug in this module, not a user error: never write an invalid record
        raise HTTPException(500, f"Claim record failed schema validation: {e.errors()[0]['msg']}") from e
    return claim


def apply_incident(claim: dict, inc: IncidentIn, cities: dict) -> None:
    out = claim["incident"]
    if inc.type:
        out["type"], out["label"], out["cause"] = inc.type, INCIDENT_LABELS[inc.type], INCIDENT_LABELS[inc.type]
    if inc.datetime:
        try:
            when = datetime.fromisoformat(inc.datetime)
        except ValueError:
            raise HTTPException(422, {"code": "validation", "fields": {"incident.datetime": "Use an ISO date and time"}})
        out["datetime"] = iso(when if when.tzinfo else when.replace(tzinfo=now_ist().tzinfo))
    loc = out["location"]
    if inc.location_text is not None:
        loc["text"] = inc.location_text.strip()
    if inc.city:
        loc["city"] = inc.city
        ref = cities.get(inc.city.casefold())
        if ref and inc.lat is None:
            loc["lat"], loc["lng"] = ref["lat"], ref["lng"]
    if inc.lat is not None and inc.lng is not None:
        loc["lat"], loc["lng"] = inc.lat, inc.lng
    if inc.narrative is not None:
        # The Intake agent (Phase 5) detects the language and translates; until then the customer's words are used as-is.
        out["narrative_original"] = out["narrative_en"] = inc.narrative.strip()
    if inc.narrative_language:
        out["narrative_language"] = inc.narrative_language
    for k in ("third_party_involved", "injuries"):
        if getattr(inc, k) is not None:
            out[k] = getattr(inc, k)


async def _reference() -> tuple[list, list, list, list, dict]:
    policies, vehicles, customers, garages, cities = await asyncio.gather(
        read_json("policies.json", []), read_json("vehicles.json", []), read_json("customers.json", []),
        read_json("garages.json", []), read_json("cities.json", []))
    return policies, vehicles, customers, garages, {c["city"].casefold(): c for c in cities}


def _vehicle_thumb(claims: list[dict], vehicle: dict, manifest: dict) -> dict:
    """Same thumbnail rules as seeded claims: this vehicle's existing thumbnail, else the clean photo for its model / type."""
    prior = next((c["vehicle"] for c in reversed(claims) if c["vehicle_id"] == vehicle["id"] and c["vehicle"].get("thumb")), None)
    if prior:
        return {"thumb": prior["thumb"], "blur_data": prior.get("blur_data")}
    clean = [p for p in manifest.get("photos", []) if p.get("category") == "clean" and p.get("thumb")]
    pick = next((p for p in clean if p.get("model_key") == vehicle.get("model_key")), None) or \
        next((p for p in clean if p["vehicle_type"] == vehicle["type"]), None)
    return {"thumb": pick["thumb"], "blur_data": pick.get("blur_data")} if pick else {"thumb": None, "blur_data": None}


# ------------------------------------------------------------------------------------------------ endpoints

@router.post("/claims", status_code=201)
async def create_claim(body: ClaimCreate, user=Depends(current_user)):
    if not body.policy_no and not body.registration:
        raise HTTPException(422, {"code": "validation", "fields": {"policy_no": "Enter the policy number or the registration"}})
    policies, vehicles, customers, garages, cities = await _reference()
    by_vehicle = {v["id"]: v for v in vehicles}
    reg = (body.registration or "").replace(" ", "").casefold()
    policy = next((p for p in policies if (body.policy_no and p["policy_no"] == body.policy_no) or
                   (reg and by_vehicle.get(p["vehicle_id"], {}).get("registration", "").replace(" ", "").casefold() == reg)), None)
    if policy is None or (user.get("role") == "customer" and policy["customer_id"] != user.get("customer_id")):
        raise HTTPException(404, {"code": "policy_not_found", "message": "No policy found for that number or registration"})
    vehicle = by_vehicle[policy["vehicle_id"]]
    customer = next(c for c in customers if c["id"] == policy["customer_id"])
    garage = next((g for g in garages if g["id"] == body.garage_id), None) if body.garage_id else None
    if body.garage_id and garage is None:
        raise HTTPException(422, {"code": "validation", "fields": {"garage_id": "Unknown garage"}})
    manifest = await read_json("stock_photo_manifest.json", {}) or {}
    now = now_ist()

    def create(claims: list[dict]) -> dict:
        city = (body.incident.city or customer["city"])
        ref = cities.get(city.casefold(), {})
        claim = {
            "id": next_id(claims, now), "status": "DRAFT", "created_at": iso(now), "updated_at": iso(now), "channel": body.channel,
            "origin": "app", "customer_id": customer["id"], "policy_no": policy["policy_no"], "vehicle_id": vehicle["id"],
            "claim_type": body.claim_type,
            "incident": {"type": "rear_end", "label": INCIDENT_LABELS["rear_end"], "datetime": iso(now), "reported_at": iso(now),
                         "location": {"text": "", "city": city, "lat": ref.get("lat", 0.0), "lng": ref.get("lng", 0.0)},
                         "narrative_original": "", "narrative_language": customer.get("preferred_language") or "en", "narrative_en": "",
                         "cause": INCIDENT_LABELS["rear_end"], "third_party_involved": False, "injuries": False, "fir": None,
                         "damaged_parts_mentioned": []},
            "settlement": {"mode": "cashless" if garage and garage.get("cashless") else "reimbursement",
                           "garage_id": garage["id"] if garage else None, "bank": None},
            "document_conditions": [], "media": [], "documents": [], "checks": {}, "damage": {"items": [], "pre_existing": []},
            "financials": None, "fraud": None, "decision": None, "communications": [], "assignee": None, "internal_notes": [],
            "timeline": [], "audit": [{"ts": iso(now), "actor": user["id"], "action": "created", "from": None, "to": "DRAFT",
                                       "reason": f"Draft created via {CHANNEL_LABEL[body.channel]}"}],
            "pipeline_run_id": None, "ai_processing_s": None, "sla": {"target_hours": SLA_HOURS, "due_at": None, "breached": False},
            "scenario_id": None, "customer_name": customer["name"], "city": city,
            "garage_name": garage["name"] if garage else None, "registration": vehicle["registration"],
            "vehicle": {"make": vehicle["make"], "model": vehicle["model"], "type": vehicle["type"], "segment": vehicle["segment"],
                        "colour": vehicle.get("colour"), **_vehicle_thumb(claims, vehicle, manifest)},
            "amount_claimed": float(body.garage_quote or 0), "amount_approved": 0.0, "risk_score": None, "risk_band": None,
        }
        if body.garage_quote:
            claim["garage_quote"] = float(body.garage_quote)
        apply_incident(claim, body.incident, cities)
        claims.append(validated(claim))
        return claim

    claim = await update_json("claims.json", create, [])
    return view_for(user, claim)


@router.patch("/claims/{claim_id}")
async def patch_claim(claim_id: str, body: ClaimPatch, user=Depends(current_user)):
    _policies, _vehicles, _customers, garages, cities = await _reference()
    now = now_ist()

    def patch(claims: list[dict]) -> dict:
        claim = find(claims, claim_id, user)
        if claim["status"] != "DRAFT":
            raise HTTPException(409, {"code": "not_draft", "message": "Only a draft can be edited"})
        if body.claim_type:
            claim["claim_type"] = body.claim_type
        if body.incident:
            apply_incident(claim, body.incident, cities)
        if body.garage_id is not None:
            garage = next((g for g in garages if g["id"] == body.garage_id), None)
            if garage is None:
                raise HTTPException(422, {"code": "validation", "fields": {"garage_id": "Unknown garage"}})
            claim["settlement"] |= {"garage_id": garage["id"], "mode": "cashless" if garage.get("cashless") else "reimbursement"}
            claim["garage_name"] = garage["name"]
        if body.garage_quote is not None:
            claim["garage_quote"] = claim["amount_claimed"] = float(body.garage_quote)
        claim["updated_at"] = iso(now)
        validated(claim)
        return claim

    return view_for(user, await update_json("claims.json", patch, []))


@router.post("/uploads/{claim_id}", status_code=201)
async def upload(claim_id: str, file: UploadFile = File(...), kind: str = Form(...), slot: str | None = Form(None),
                 caption: str | None = Form(None), user=Depends(current_user)):
    claim = find(await read_json("claims.json", []), claim_id, user)  # access check before reading the body into memory
    if not (is_admin(user) or claim["status"] in UPLOAD_STATUSES):
        raise HTTPException(409, {"code": "closed", "message": "Files can be added to a draft or when ABC asks for more information"})
    data = await file.read(uploads.MAX_BYTES + 1)
    try:
        processed = await asyncio.to_thread(uploads.process, claim_id, kind=kind, filename=file.filename or "upload",
                                            content_type=file.content_type, data=data)
    except uploads.UploadError as e:
        raise HTTPException(422, {"code": "invalid_file", "message": str(e)}) from e
    now = now_ist()

    def attach(claims: list[dict]) -> dict:
        c = find(claims, claim_id, user)
        if not (is_admin(user) or c["status"] in UPLOAD_STATUSES):
            raise HTTPException(409, {"code": "closed", "message": "This claim no longer accepts files"})
        fields = processed["fields"]
        if kind == "document":
            item_id = next_item_id(c["documents"], "d")
            req = (slot or "other").strip().lower()
            entry = {"id": item_id, "type": DOC_TYPES.get(req, "Original" if req.startswith("original") else "Other"), "requirement": req,
                     **uploads.finalise(claim_id, processed, item_id), "status": "received", "extracted": {}, "checks": [],
                     "uploaded_at": iso(now), "uploaded_by": actor_of(user), **fields}
            c["documents"].append(entry)
        else:
            item_id = next_item_id(c["media"], "m")
            entry = {"id": item_id, "kind": kind, "slot": slot, **uploads.finalise(claim_id, processed, item_id), "caption": caption,
                     "uploaded_at": iso(now), "uploaded_by": actor_of(user), "credit": None, **fields}
            c["media"].append(entry)
        if c["status"] != "DRAFT":
            label = "document" if kind == "document" else kind
            c["timeline"].append({"ts": iso(now), "actor": actor_of(user), "type": "file_uploaded", "text": f"New {label} uploaded"})
            c["audit"].append({"ts": iso(now), "actor": user["id"], "action": "file_uploaded", "from": None, "to": item_id,
                               "reason": f"{label.title()} added ({fields['original_name']})"})
        c["updated_at"] = iso(now)
        validated(c)
        return entry

    try:
        entry = await update_json("claims.json", attach, [])
    except BaseException:
        uploads.discard(claim_id, processed)
        raise
    return {**entry, "available": True}


@router.delete("/uploads/{claim_id}/{item_id}")
async def delete_upload(claim_id: str, item_id: str, user=Depends(current_user)):
    now = now_ist()

    def drop(claims: list[dict]) -> None:
        c = find(claims, claim_id, user)
        if c["status"] != "DRAFT":
            raise HTTPException(409, {"code": "not_draft", "message": "Files can only be removed from a draft"})
        for key in ("media", "documents"):
            kept = [i for i in c[key] if i["id"] != item_id]
            if len(kept) != len(c[key]):
                c[key] = kept
                c["updated_at"] = iso(now)
                return
        raise HTTPException(404, "File not found")

    await update_json("claims.json", drop, [])
    await asyncio.to_thread(uploads.remove, claim_id, item_id)
    return {"ok": True}


@router.get("/files/{claim_id}/{name}")
async def get_file(claim_id: str, name: str, user=Depends(current_user)):
    """Private uploads: only the claim's owner or an admin; everyone else gets 404 (no hint that the file exists)."""
    find(await read_json("claims.json", []), claim_id, user)
    path = uploads.safe_file(claim_id, name)
    if path is None:
        raise HTTPException(404, "File not found")
    return FileResponse(path, media_type=uploads.media_type(path), headers={"Cache-Control": "private, max-age=3600"})


class SubmitBody(BaseModel):
    pace: Literal["presentation", "fast"] = "presentation"


@router.post("/claims/{claim_id}/submit")
async def submit_claim(claim_id: str, body: SubmitBody | None = None, user=Depends(current_user)):
    users = await read_json("users.json", [])
    now = now_ist()

    def submit(claims: list[dict]) -> dict:
        c = find(claims, claim_id, user)
        if c["status"] != "DRAFT":
            raise HTTPException(409, {"code": "not_draft", "message": "This claim has already been submitted"})
        inc, errors = c["incident"], {}
        if len(inc.get("narrative_en", "").strip()) < 10:
            errors["incident.narrative"] = "Describe what happened (at least 10 characters)"
        if not inc["location"]["text"]:
            errors["incident.location_text"] = "Enter where it happened"
        if datetime.fromisoformat(inc["datetime"]) > now + timedelta(minutes=5):
            errors["incident.datetime"] = "The incident time cannot be in the future"
        if c["claim_type"] != "Theft" and not any(m["kind"] == "photo" for m in c["media"]):
            errors["media"] = "Add at least one photo of the damage"
        if errors:
            raise HTTPException(422, {"code": "validation", "fields": errors})
        c |= {"status": "SUBMITTED", "created_at": iso(now), "updated_at": iso(now)}
        inc["reported_at"] = iso(now)
        c["sla"] = {"target_hours": SLA_HOURS, "due_at": iso(now + timedelta(hours=SLA_HOURS)), "breached": False}
        c["timeline"].append({"ts": iso(now), "actor": actor_of(user), "type": "fnol_received",
                              "text": f"FNOL received via {CHANNEL_LABEL[c['channel']]}"})
        c["audit"].append({"ts": iso(now), "actor": user["id"], "action": "status_change", "from": "DRAFT", "to": "SUBMITTED",
                           "reason": "Submitted in app; AI pipeline starting"})
        validated(c)
        return c

    claim = await update_json("claims.json", submit, [])

    def notify(rows: list[dict]) -> None:
        n = max((int(r["id"].split("_")[1]) for r in rows if str(r.get("id", "")).startswith("n_")), default=-1)
        for admin in (u for u in users if u.get("role") == "admin"):
            n += 1
            rows.insert(0, {"id": f"n_{n:03d}", "user_id": admin["id"], "title": f"New claim filed in app: {claim['id']}",
                            "body": f"{claim['customer_name']} · {claim['vehicle']['model']}", "href": f"/claims/{claim['id']}",
                            "created_at": iso(now), "read": False})

    await update_json("notifications.json", notify, [])
    from ..agents import orchestrator  # the pipeline runs server-side; the client follows it on /api/pipeline/{run_id}/events
    run_id = await orchestrator.start(claim["id"], pace=(body or SubmitBody()).pace, trigger="submit")
    return {"claim": view_for(user, claim), "run_id": run_id}
