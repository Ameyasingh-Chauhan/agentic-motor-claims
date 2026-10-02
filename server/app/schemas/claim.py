"""Claim schema (spec §11.2). The seed validates every record; routers use the same shapes."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Level = Literal["pass", "warn", "fail", "pending"]
Status = Literal[
    "DRAFT", "SUBMITTED", "PROCESSING", "INFO_REQUESTED", "UNDER_REVIEW", "SIU_INVESTIGATION",
    "APPROVED", "PREAUTH_ISSUED", "SETTLED", "DECLINED", "FRAUD_CONFIRMED", "WITHDRAWN",
]
STATUSES: tuple[str, ...] = Status.__args__  # type: ignore[attr-defined]


class _Model(BaseModel):
    model_config = ConfigDict(extra="allow")


class Location(_Model):
    text: str
    city: str
    lat: float
    lng: float


class Incident(_Model):
    type: str
    datetime: str
    reported_at: str
    location: Location
    narrative_original: str
    narrative_language: str
    narrative_en: str
    cause: str
    third_party_involved: bool = False
    injuries: bool = False
    fir: dict | None = None
    damaged_parts_mentioned: list[str] = []


class Media(_Model):
    id: str
    kind: Literal["photo", "audio", "video"]
    url: str
    thumb: str | None = None
    blur_data: str | None = None
    slot: str | None = None


class Document(_Model):
    id: str
    type: str
    status: str
    checks: list[dict] = []


class Check(_Model):
    level: Level
    summary: str
    data: dict = {}
    latency_ms: int = 0


class DamageItem(_Model):
    part_code: str
    part: str
    zone: str
    damage_type: str
    severity: Literal["minor", "moderate", "severe"]
    operation: str
    fresh: bool = True
    confidence: float
    photo_ids: list[str] = []
    flag: Level = "pass"


class Damage(_Model):
    items: list[DamageItem] = []
    pre_existing: list[dict] = []
    narrative_consistency: dict = {}
    photo_coverage: dict = {}
    overall_severity: str = "minor"


class Financials(_Model):
    currency: Literal["INR"] = "INR"
    lines: list[dict] = []
    assessed_loss: float
    net_payable: float
    total_loss_check: dict


class FiredRule(_Model):
    rule_id: str
    name: str
    level: Level
    points: int
    evidence: str


class Fraud(_Model):
    score: int = Field(ge=0, le=100)
    band: Literal["low", "medium", "high"]
    fired: list[FiredRule] = []
    not_fired: list[str] = []
    hard_stop: bool = False


class Decision(_Model):
    route: Literal["auto", "handler", "SIU"]
    recommended_action: str
    auto: bool
    confidence: float
    reasons: list[str] = []
    final_action: str | None = None
    decided_by: str | None = None
    decided_at: str | None = None
    approved_amount: float | None = None


class Event(_Model):
    ts: str
    actor: str
    type: str
    text: str


class Claim(_Model):
    id: str
    status: Status
    created_at: str
    updated_at: str
    channel: Literal["whatsapp", "app", "web", "branch"]
    customer_id: str
    policy_no: str
    vehicle_id: str
    claim_type: Literal["OD", "TP", "Theft", "Glass", "Total loss"]
    incident: Incident
    settlement: dict
    media: list[Media]
    documents: list[Document]
    checks: dict[str, Check]
    damage: Damage
    financials: Financials
    fraud: Fraud
    decision: Decision
    communications: list[dict]
    assignee: str | None
    internal_notes: list[dict] = []
    timeline: list[Event]
    audit: list[dict]
    pipeline_run_id: str | None
    sla: dict
    scenario_id: str | None = None
    # Denormalised list fields (derived by the seed from the records above; never edited separately).
    customer_name: str
    city: str
    registration: str
    vehicle: dict
    amount_claimed: float
    amount_approved: float
    risk_score: int
    risk_band: Literal["low", "medium", "high"]
