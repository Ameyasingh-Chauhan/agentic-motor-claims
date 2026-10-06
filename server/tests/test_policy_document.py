"""Feature A (docs/FEATURE_BRIEF_POLICY_UPLOAD_AND_PROCESSING.md): policy from an uploaded document — extraction →
confirm → customer/vehicle/policy created, document attached to a new draft, deterministic clean DPI, duplicate and
inactive-policy handling, and the new claim running the full pipeline. Gemini mocked (`gemini._transport`), temp data
(conftest.py)."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.agents import orchestrator
from app.main import app
from app.routers import auth
from app.services import gemini, reference
from app.services.json_store import read_json_sync

SAMPLES = Path(__file__).resolve().parents[2] / "client" / "public" / "assets" / "samples" / "in-app-claim"

# A fictional specimen policy, distinct from any seeded data and from the demo's own test policy (ABC/PC/2025/604821 / RJ 45 CM 4821).
POLICY_EXTRACT = {
    "policy_no": "ABC/PC/2025/777001", "insured": "Priya Deshmukh", "insured_father": "Anil Deshmukh",
    "insured_address": "12, Lake View Society, Nashik", "insured_contact": "+91 98200 11223",
    "period_from": "2025-06-01", "period_to": "2035-05-31", "cover": "OD+TP", "idv": 650000, "ncb_pct": 20,
    "add_ons": ["Zero Depreciation", "Roadside Assistance"], "deductible_compulsory": 1000, "deductible_voluntary": 0,
    "premium": 14250, "registration": "MH 15 XZ 7788", "vehicle_make": "Citroen", "vehicle_model": "C3",
    "vehicle_variant": "Live", "vehicle_colour": "White", "fuel": "Petrol", "vehicle_cc": 1199, "vehicle_year": "2023",
    "chassis5": "48213", "engine5": "90217",
}
FIELD_CONFIDENCE = [{"field": k, "confidence": 0.6 if k == "insured_contact" else 0.92} for k in POLICY_EXTRACT if k not in ("add_ons",)]


class FakeDocument:
    def __init__(self, extract: dict | None = None):
        self.extract = extract if extract is not None else POLICY_EXTRACT
        self.calls = 0

    async def __call__(self, *, system, contents, schema, temperature, thinking, max_output_tokens, timeout_s):
        self.calls += 1
        body = {"documents": [{"doc_id": "d_1", "declared_type": "Policy", "actual_type": "POLICY", "legibility": "clear",
                               "extracted": {**self.extract, "field_confidence": FIELD_CONFIDENCE}, "checks": [],
                               "confidence": 0.9}]}
        return gemini.RawResult(text=json.dumps(body), input_tokens=400, output_tokens=120)


@pytest.fixture(autouse=True)
def reset():
    auth._failures.clear()
    reference.reload()
    yield
    gemini._transport = gemini._default_transport
    gemini.set_mode_override(None)


def login(name: str, password: str) -> TestClient:
    c = TestClient(app)
    assert c.post("/api/auth/login", json={"username": name, "password": password}).status_code == 200
    return c


def rahul() -> TestClient:
    return login("Rahul Sharma", "Pass@123")


def admin() -> TestClient:
    return login("Santosh Kute", "Admin@123")


def extract(client: TestClient, image="rc.jpg") -> dict:
    gemini.set_mode_override("live")
    with open(SAMPLES / image, "rb") as fh:
        res = client.post("/api/wizard/policy-document", files={"file": (image, fh, "image/jpeg")})
    assert res.status_code == 200, res.text
    return res.json()


def test_extract_then_confirm_creates_records_and_runs_pipeline(uploads_dir):
    r = admin()  # a brand-new policyholder, not an existing customer — exercises customer/vehicle/policy creation in full
    gemini._transport = FakeDocument()
    out = extract(r)
    assert out["source"] == "live" and out["staging"]["token"].startswith("stg-")
    assert out["extracted"]["insured"] == "Priya Deshmukh" and out["extracted"]["vehicle_make"] == "Citroen"
    assert out["field_confidence"]["insured_contact"] == pytest.approx(0.6)

    fields = {**out["extracted"]}
    confirm = r.post("/api/wizard/policy-document/confirm", json={"staging": out["staging"], "fields": fields})
    assert confirm.status_code == 200, confirm.text
    body = confirm.json()
    claim = body["claim"]
    assert claim["status"] == "DRAFT" and claim["policy_source"] == "uploaded_document"
    assert claim["registration"] == "MH 15 XZ 7788" and claim["vehicle"]["make"] == "Citroen"
    assert body["warnings"] == []  # policy is active and has OD cover
    cid = claim["id"]

    # Customer + vehicle + policy records really exist (not just echoed back).
    policies = read_json_sync("policies.json", [])
    policy = next(p for p in policies if p["policy_no"] == "ABC/PC/2025/777001")
    vehicle = next(v for v in read_json_sync("vehicles.json", []) if v["id"] == policy["vehicle_id"])
    customer = next(c for c in read_json_sync("customers.json", []) if c["id"] == policy["customer_id"])
    assert customer["name"] == "Priya Deshmukh" and customer["id"] == claim["customer_id"]
    assert vehicle["registration"] == "MH 15 XZ 7788" and vehicle["make"] == "Citroen"
    # A model not in the catalogue got a new, segment-derived, pinned entry (§12).
    model = next(m for m in read_json_sync("vehicle_models.json", []) if m["key"] == vehicle["model_key"])
    assert model["make"] == "Citroen" and model["segment"]
    parts = [p for p in read_json_sync("parts_catalog.json", []) if p["model_key"] == vehicle["model_key"]]
    assert parts and all(p.get("pinned") for p in parts) and all(p["replace"] > 0 for p in parts)

    # Deterministic clean DPI: Vahan owner = insured; no FASTag/IIB/police records were added (neutral, not "clean-flagged").
    vahan = read_json_sync("vahan.json", {})[vehicle["registration"]]
    assert vahan["owner"] == "Priya Deshmukh" and vahan["blacklisted"] is False and vahan["stolen"] is False
    assert vehicle["registration"] not in read_json_sync("fastag.json", {})

    # The uploaded document is attached to the new claim (not left in the staging folder).
    (doc,) = claim["documents"]
    assert doc["type"] == "Policy" and doc["source"] == "uploaded_document" and doc["status"] == "verified"
    assert (uploads_dir / cid).exists() and not (uploads_dir / out["staging"]["token"]).exists()

    # File the claim and run the full pipeline (demo mode — deterministic, no further Gemini calls needed).
    with open(SAMPLES / "front.jpg", "rb") as fh:
        up = r.post(f"/api/uploads/{cid}", files={"file": ("front.jpg", fh, "image/jpeg")}, data={"kind": "photo", "slot": "front"})
    assert up.status_code == 201, up.text
    r.patch(f"/api/claims/{cid}", json={"incident": {"narrative": "Front bumper scratched while parking.", "location_text": "Society parking, Nashik"}})
    gemini.set_mode_override("demo")
    sub = r.post(f"/api/claims/{cid}/submit", json={"pace": "fast"})
    assert sub.status_code == 200, sub.text
    asyncio.run(orchestrator.run(sub.json()["run_id"], cid, pace="fast", mode="demo"))
    final = next(c for c in read_json_sync("claims.json", []) if c["id"] == cid)
    assert final["status"] != "SUBMITTED" and final["financials"] is not None and final["fraud"] is not None
    assert final["policy_source"] == "uploaded_document"  # survives the pipeline write


def test_duplicate_policy_number_blocked_with_existing_offered():
    r = rahul()
    gemini._transport = FakeDocument()
    out = extract(r)
    existing_policy = read_json_sync("policies.json", [])[0]
    fields = {**out["extracted"], "policy_no": existing_policy["policy_no"]}
    confirm = r.post("/api/wizard/policy-document/confirm", json={"staging": out["staging"], "fields": fields})
    assert confirm.status_code == 409
    detail = confirm.json()["detail"]
    assert detail["code"] == "duplicate_policy" and detail["policy"]["policy_no"] == existing_policy["policy_no"]
    assert "duplicate or forged" in detail["message"]


def test_inactive_policy_still_files_but_warns():
    r = rahul()
    gemini._transport = FakeDocument({**POLICY_EXTRACT, "period_from": "2020-01-01", "period_to": "2020-12-31"})
    out = extract(r)
    confirm = r.post("/api/wizard/policy-document/confirm", json={"staging": out["staging"], "fields": out["extracted"]})
    assert confirm.status_code == 200, confirm.text
    body = confirm.json()
    assert body["claim"]["status"] == "DRAFT"
    assert any("expired" in w for w in body["warnings"])


def test_od_only_cover_warns():
    r = rahul()
    gemini._transport = FakeDocument({**POLICY_EXTRACT, "policy_no": "ABC/PC/2025/777002", "registration": "MH 15 XZ 9900", "cover": "TP"})
    out = extract(r)
    confirm = r.post("/api/wizard/policy-document/confirm", json={"staging": out["staging"], "fields": out["extracted"]})
    assert confirm.status_code == 200, confirm.text
    assert any("own-damage cover" in w for w in confirm.json()["warnings"])


def test_demo_mode_cannot_extract_but_confirm_still_works_from_manual_fields():
    r = rahul()
    gemini.set_mode_override("demo")
    with open(SAMPLES / "rc.jpg", "rb") as fh:
        res = r.post("/api/wizard/policy-document", files={"file": ("rc.jpg", fh, "image/jpeg")})
    assert res.status_code == 200
    out = res.json()
    assert out["source"] != "live" and out["staging"] is None and "manually" in out["message"]
    # Manual entry (no staged document) still creates the customer/vehicle/policy and a draft claim.
    manual = {**POLICY_EXTRACT, "policy_no": "ABC/PC/2025/777003", "registration": "MH 15 XZ 1234"}
    confirm = r.post("/api/wizard/policy-document/confirm", json={"staging": None, "fields": manual})
    assert confirm.status_code == 200, confirm.text
    assert confirm.json()["claim"]["documents"] == []


def test_missing_required_fields_rejected():
    r = rahul()
    confirm = r.post("/api/wizard/policy-document/confirm", json={"staging": None, "fields": {}})
    assert confirm.status_code == 422
    assert set(confirm.json()["detail"]["fields"]) == {"policy_no", "registration", "insured"}


def test_admin_can_create_for_a_new_policyholder():
    a = admin()
    gemini._transport = FakeDocument({**POLICY_EXTRACT, "policy_no": "ABC/PC/2025/777004", "registration": "MH 15 XZ 5566"})
    out = extract(a)
    confirm = a.post("/api/wizard/policy-document/confirm", json={"staging": out["staging"], "fields": out["extracted"], "customer_id": None})
    assert confirm.status_code == 200, confirm.text
    claim = confirm.json()["claim"]
    assert claim["customer_name"] == "Priya Deshmukh"
    assert claim["customer_id"] and claim["policy_no"] == "ABC/PC/2025/777004"


def test_admin_confirm_normalizes_document_dates():
    a = admin()
    fields = {**POLICY_EXTRACT, "policy_no": "ABC/PC/2025/777005", "registration": "MH 15 XZ 5567",
              "period_from": "15-03-2026 00:00", "period_to": "14-03-2027 23:59"}
    confirm = a.post("/api/wizard/policy-document/confirm", json={"staging": None, "fields": fields})
    assert confirm.status_code == 200, confirm.text
    policy = next(p for p in read_json_sync("policies.json") if p["policy_no"] == fields["policy_no"])
    assert policy["start"] == "2026-03-15" and policy["end"] == "2027-03-14"
