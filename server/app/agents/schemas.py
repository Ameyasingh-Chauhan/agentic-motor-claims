"""Structured-output contracts for the five Gemini calls (AGENT_PROMPTS.md C–G). Each is sent as `response_schema` and the
reply is validated against the same model. Kept flat with short fields (token discipline); no free-form dicts (Gemini's
schema subset does not support them)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Conf = float


# ------------------------------------------------------------------------------------------------ intake (C)

class FollowUp(BaseModel):
    local: str
    en: str


class IntakeOut(BaseModel):
    transcript: str | None = Field(None, description="Verbatim transcript if audio was attached")
    language_codes: list[str]
    language_label: str
    translation_en: str
    incident_type: Literal["accident", "theft", "fire", "flood", "third_party", "glass", "vandalism", "other"]
    incident_at: str | None = Field(None, description="ISO 8601 with +05:30")
    datetime_conf: Conf = 0
    location_text: str | None = None
    city: str | None = None
    cause: str | None = None
    counterparty: Literal["truck", "car", "two-wheeler", "bus", "auto", "pedestrian", "object", "unknown"] = "unknown"
    third_party: bool = False
    injuries: Literal["none", "minor", "serious", "fatal", "unknown"] = "unknown"
    police_informed: bool | None = None
    fir_number: str | None = None
    drivable: bool | None = None
    driver_is_policyholder: bool | None = None
    driver_name: str | None = None
    parts_mentioned: list[str] = []
    missing: list[str] = []
    follow_up: list[FollowUp] = []
    distress: Literal["calm", "upset", "high"] = "calm"
    urgent_safety: bool = False
    injection_suspected: bool = False
    injection_quote: str | None = None
    needs_review: bool = False


# ------------------------------------------------------------------------------------------------ document (D)

class DocCheck(BaseModel):
    field: str
    level: Literal["pass", "warn", "fail"]
    msg: str


class TamperSign(BaseModel):
    sign: str
    confidence: Conf


class EstimateLine(BaseModel):
    desc: str
    type: Literal["part", "labour", "paint"]
    amount: float


class FieldConf(BaseModel):
    field: str
    confidence: Conf


class DocExtract(BaseModel):
    # RC
    registration: str | None = None
    owner: str | None = None
    vehicle_class: str | None = None
    make_model: str | None = None
    fuel: str | None = None
    reg_date: str | None = None
    chassis5: str | None = None
    engine5: str | None = None
    financier: str | None = None
    valid_to: str | None = None
    # DL
    number_last4: str | None = None
    holder: str | None = None
    valid_to_nt: str | None = None
    valid_to_tr: str | None = None
    classes: list[str] = []
    # Policy
    policy_no: str | None = None
    insured: str | None = None
    insured_father: str | None = None
    insured_address: str | None = None
    insured_contact: str | None = None
    period_from: str | None = None
    period_to: str | None = None
    cover: str | None = None
    idv: float | None = None
    ncb_pct: float | None = None
    add_ons: list[str] = []
    deductible_compulsory: float | None = None
    deductible_voluntary: float | None = None
    premium: float | None = None
    vehicle_make: str | None = None
    vehicle_model: str | None = None
    vehicle_variant: str | None = None
    vehicle_colour: str | None = None
    vehicle_cc: float | None = None
    vehicle_year: str | None = None
    # Any document: per-field confidence (only for fields this document actually carries)
    field_confidence: list[FieldConf] = []
    # FIR
    fir_no: str | None = None
    station: str | None = None
    date: str | None = None
    facts: str | None = None
    # Estimate / invoice
    garage: str | None = None
    lines: list[EstimateLine] = []
    total: float | None = None


class DocResult(BaseModel):
    doc_id: str
    declared_type: str
    actual_type: Literal["RC", "DL", "POLICY", "FIR", "CLAIM_FORM", "ESTIMATE", "INVOICE", "NOC", "FORM_35", "FORM_28_29_30", "CHEQUE", "OTHER"]
    type_mismatch: bool = False
    legibility: Literal["clear", "partial", "illegible"]
    extracted: DocExtract = DocExtract()
    checks: list[DocCheck] = []
    tampering: list[TamperSign] = []
    tampering_suspected: bool = False
    watermark_noted: bool = False
    confidence: Conf = 0.9
    needs_review: bool = False


class DocumentOut(BaseModel):
    documents: list[DocResult]
    missing: list[str] = []
    injection_suspected: bool = False


# ------------------------------------------------------------------------------------------------ damage + identity (E)

Body = Literal["hatch", "sedan", "suv", "mpv", "scooter", "motorcycle", "pickup", "truck", "van"]


class PhotoIdentity(BaseModel):
    photo_id: str
    make: str | None = None
    model: str | None = None
    body: Body | None = None
    colour: str | None = None
    plate_text: str | None = None
    plate_conf: Conf = 0
    idcon: Conf = Field(0, description="Confidence in make/model")
    same_vehicle: bool | None = None
    same_conf: Conf = 0
    diff_reason: str | None = None
    usable: bool = True
    issues: list[Literal["blur", "glare", "dark", "too_far", "partial"]] = []


class IdentitySummary(BaseModel):
    make: str | None = None
    model: str | None = None
    body: Body | None = None
    colour: str | None = None
    plate_text: str | None = None
    confidence: Conf = 0


class Box(BaseModel):
    photo_id: str
    box_2d: list[int] = Field(description="[ymin, xmin, ymax, xmax], 0-1000")
    label: str


class DamageItemOut(BaseModel):
    code: str
    part: str
    zone: str
    damage_type: Literal["scratch", "dent", "crack", "tear", "break", "shatter", "deform", "burn", "water"]
    severity: Literal["minor", "moderate", "severe"]
    operation: Literal["replace", "repair_minor_dent", "repair_moderate_dent", "plastic_repair", "paint_only", "refit_only"]
    fresh: bool = True
    confidence: Conf
    photo_ids: list[str] = []
    boxes: list[Box] = []


class Uncatalogued(BaseModel):
    part: str
    zone: str | None = None
    damage_type: str | None = None
    severity: str | None = None
    photo_ids: list[str] = []


class PreExisting(BaseModel):
    code: str | None = None
    part: str
    photo_id: str | None = None
    evidence: str
    confidence: Conf
    box: list[int] | None = Field(None, description="[ymin, xmin, ymax, xmax], 0-1000")


class Story(BaseModel):
    consistent: bool
    why: str
    confidence: Conf


class Coverage(BaseModel):
    front: bool = False
    rear: bool = False
    left: bool = False
    right: bool = False
    closeup: bool = False
    odometer: bool = False


class DamageOut(BaseModel):
    photos: list[PhotoIdentity]
    identity_summary: IdentitySummary = IdentitySummary()
    items: list[DamageItemOut] = []
    uncatalogued: list[Uncatalogued] = []
    pre_existing: list[PreExisting] = []
    story: Story
    coverage: Coverage = Coverage()
    suggested_photos: list[str] = []
    overall_severity: Literal["none", "minor", "moderate", "severe"] = "minor"
    wheel_alignment: bool = Field(False, description="R6: true when a wheel_alignment operation is added")
    total_loss_indicator: bool = False
    total_loss_evidence: str | None = None
    llm_estimate_inr: float | None = None
    notes: str | None = None
    injection_suspected: bool = False


# ------------------------------------------------------------------------------------------------ investigation (F)

class EvidenceCard(BaseModel):
    rule_id: str
    expected: str
    found: str
    source: str
    why: str
    confidence: Conf


class Observation(BaseModel):
    text: str
    evidence: str
    confidence: Conf


class InvestigationOut(BaseModel):
    evidence_cards: list[EvidenceCard] = []
    fraud_summary: str
    extra_observations: list[Observation] = []
    next_steps: list[str] = []
    decision_reasons: list[str]
    conditions: list[str] = []
    customer_items: list[str] = []
    ai_summary: str


# ------------------------------------------------------------------------------------------------ communication (G)

class CommunicationOut(BaseModel):
    message_local: str
    message_en: str
    lang_code: str
    quick_replies: list[str] = []
    email_subject: str | None = None
    email_local: str | None = None
    email_en: str | None = None


OUTPUT_MODELS = {"intake": IntakeOut, "document": DocumentOut, "damage": DamageOut, "investigation": InvestigationOut,
                 "communication": CommunicationOut}
