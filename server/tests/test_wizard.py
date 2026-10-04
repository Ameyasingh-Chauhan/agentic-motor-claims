"""Phase 6 wizard API (§10.6): policy lookup, policyholders, drafts, dynamic document checklist, garages, sample scenarios, live
voice intake and live document extraction on a draft (Gemini mocked through `gemini._transport`), the Theatre's run lookup, and the
pipeline reusing what the wizard already read. Runs on the temporary data copy (conftest.py)."""
from __future__ import annotations

import asyncio
import io
import json
import wave
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.agents import orchestrator
from app.main import app
from app.routers import auth
from app.services import gemini, reference
from app.services.json_store import read_json_sync

SAMPLES = Path(__file__).resolve().parents[2] / "client" / "public" / "assets" / "samples" / "in-app-claim"
SAMPLE = json.loads((SAMPLES / "sample.json").read_text(encoding="utf-8"))
HINDI = "कल रात नौ बजे खेड शिवापुर टोल के पास एक ट्रक ने पीछे से टक्कर मारी। पीछे का बम्पर टूट गया।"


def login(name: str, password: str) -> TestClient:
    c = TestClient(app)
    assert c.post("/api/auth/login", json={"username": name, "password": password}).status_code == 200
    return c


def rahul() -> TestClient:
    return login("Rahul Sharma", "Pass@123")


def admin() -> TestClient:
    return login("Santosh Kute", "Admin@123")


@pytest.fixture(autouse=True)
def reset():
    auth._failures.clear()
    reference.reload()
    yield
    gemini._transport = gemini._default_transport
    gemini.set_mode_override(None)


def rahul_active_policy() -> dict:
    return max((p for p in read_json_sync("policies.json", []) if p["customer_id"] == "c_0001"), key=lambda p: p["end"])


def new_draft(client: TestClient, policy_no: str, **body) -> dict:
    res = client.post("/api/claims", json={"policy_no": policy_no, **body})
    assert res.status_code == 201, res.text
    return res.json()


def wav_bytes() -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(b"\x00\x00" * 8000)
    return buf.getvalue()


# ------------------------------------------------------------------------------------------------ lookup & policyholders

def test_lookup_by_registration_and_number_customer_scoped():
    r, a = rahul(), admin()
    policy = rahul_active_policy()
    by_reg = r.get("/api/wizard/lookup", params={"q": "mh12ab1234"})
    assert by_reg.status_code == 200
    card = by_reg.json()
    assert card["policy_no"] == policy["policy_no"] and not card["expired"] and card["vehicle"]["model"] == "Creta"
    assert r.get("/api/wizard/lookup", params={"q": policy["policy_no"]}).json()["policy_no"] == policy["policy_no"]
    # Rahul cannot find another customer's policy (looks like "not found"); an admin can.
    other = next(p for p in read_json_sync("policies.json", []) if p["customer_id"] != "c_0001")
    assert r.get("/api/wizard/lookup", params={"q": other["policy_no"]}).status_code == 404
    assert a.get("/api/wizard/lookup", params={"q": other["policy_no"]}).status_code == 200
    assert r.get("/api/wizard/lookup", params={"q": "ZZ99ZZ9999"}).status_code == 404


def test_expired_policy_is_flagged():
    r = rahul()
    old = min((p for p in read_json_sync("policies.json", []) if p["customer_id"] == "c_0001"), key=lambda p: p["end"])
    cards = r.get("/api/wizard/policies").json()["items"]
    assert {c["policy_no"]: c["expired"] for c in cards}[old["policy_no"]] is True
    assert cards[0]["expired"] is False                      # newest (active) first


def test_policyholders_admin_only_and_searchable():
    assert rahul().get("/api/wizard/policyholders").status_code == 403
    a = admin()
    res = a.get("/api/wizard/policyholders", params={"q": "MH 12 AB 1234"}).json()
    assert [x["id"] for x in res["items"]] == ["c_0001"]
    pols = a.get("/api/wizard/policies", params={"customer_id": "c_0044"}).json()
    assert pols["customer"]["id"] == "c_0044" and pols["items"]


# ------------------------------------------------------------------------------------------------ drafts, patch, checklist

def test_draft_patch_wizard_state_settlement_and_listing():
    r = rahul()
    d = new_draft(r, rahul_active_policy()["policy_no"])
    res = r.patch(f"/api/claims/{d['id']}", json={
        "wizard": {"step": 3, "safe": "yes", "incident_chosen": True}, "settlement_mode": "reimbursement",
        "bank": {"account_name": "Rahul Sharma", "account_last4": "4321", "ifsc": "HDFC0001234"},
        "incident": {"type": "fire", "fir": {"number": "PUN/77/2026", "station": "Baner"}}})
    assert res.status_code == 200, res.text
    c = res.json()
    assert c["wizard"]["step"] == 3 and c["settlement"]["mode"] == "reimbursement" and c["settlement"]["bank"]["account_last4"] == "4321"
    assert c["incident"]["label"] == "Fire" and c["incident"]["fir"]["number"] == "PUN/77/2026"
    drafts = r.get("/api/wizard/drafts").json()["items"]
    assert drafts[0]["id"] == d["id"] and drafts[0]["step"] == 3 and drafts[0]["incident"] == "Fire"
    assert admin().get("/api/wizard/drafts").json()["items"] == []        # an admin's list shows only drafts they started
    assert r.delete(f"/api/wizard/drafts/{d['id']}").status_code == 200
    assert r.get(f"/api/claims/{d['id']}").status_code == 404


def test_checklist_changes_with_incident_and_settlement():
    r = rahul()
    d = new_draft(r, rahul_active_policy()["policy_no"], garage_id="g_001")
    base = r.get(f"/api/wizard/requirements/{d['id']}").json()
    assert [i["doc"] for i in base["groups"]["mandatory"]] == ["claim_form", "rc", "dl", "policy", "kyc"]
    assert base["groups"]["situation"] == []
    r.patch(f"/api/claims/{d['id']}", json={"claim_type": "Theft", "incident": {"type": "theft"}, "settlement_mode": "reimbursement"})
    theft = r.get(f"/api/wizard/requirements/{d['id']}").json()
    situation = {i["doc"]: i for i in theft["groups"]["situation"]}
    assert "theft" in theft["conditions"] and situation["fir"]["required"] is True and "rto_forms" in situation
    assert "reimbursement" not in theft["conditions"]           # theft settles on IDV, never as a repair reimbursement


def test_customer_sees_extracted_fields_only_while_drafting():
    r = rahul()
    d = new_draft(r, rahul_active_policy()["policy_no"])
    with open(SAMPLES / "rc.jpg", "rb") as fh:
        assert r.post(f"/api/uploads/{d['id']}", files={"file": ("rc.jpg", fh, "image/jpeg")}, data={"kind": "document", "slot": "rc"}).status_code == 201
    claims = read_json_sync("claims.json", [])
    from app.services.json_store import write_json_sync
    c = next(x for x in claims if x["id"] == d["id"])
    c["documents"][0] |= {"extracted": {"owner": "Rahul Sharma"}, "checks": [{"field": "owner", "level": "pass", "message": "Matches"}],
                          "ai": {"tampering_suspected": False}}
    write_json_sync("claims.json", claims)
    doc = r.get(f"/api/claims/{d['id']}").json()["documents"][0]
    assert doc["extracted"]["owner"] == "Rahul Sharma" and doc["checks"] and "ai" not in doc


def test_garages_filtered_by_city_with_distance():
    res = rahul().get("/api/wizard/garages", params={"city": "Pune"}).json()
    assert res["in_city"] and all(g["city"] == "Pune" for g in res["items"])
    assert all(isinstance(g["distance_km"], float) for g in res["items"])
    assert res["items"][0]["cashless"]                           # network garages first


# ------------------------------------------------------------------------------------------------ sample scenarios

def test_scenarios_prefill_text_only_admin():
    assert rahul().get("/api/wizard/scenarios").status_code == 403
    rows = admin().get("/api/wizard/scenarios").json()
    assert [s["id"] for s in rows] == ["clean_rear_end", "fastag_mismatch", "garage_overquote", "theft_two_wheeler", "flood_total_loss"]
    rear = rows[0]
    assert rear["policy"]["vehicle"]["registration"] == "MH 12 AB 1234" and rear["incident"]["type"] == "rear_end"
    assert "Khed Shivapur" in rear["incident"]["narrative"] and rear["incident"]["city"] == "Pune"
    assert rear["settlement"] == {"mode": "cashless", "garage_id": "g_001"}
    assert all("media" not in s and "documents" not in s for s in rows)   # photos and documents are always uploaded by the user
    theft = rows[3]
    assert theft["claim_type"] == "Theft" and theft["fir"]["number"] and theft["settlement"]["garage_id"] is None


# ------------------------------------------------------------------------------------------------ live agents on a draft

class FakeIntake:
    def __init__(self):
        self.calls = []

    async def __call__(self, *, system, contents, schema, **kw):
        self.calls.append((schema.__name__, [getattr(c, "mime_type", None) for c in contents]))
        if schema.__name__ == "IntakeOut":
            body = {"transcript": HINDI, "language_codes": ["hi"], "language_label": "Hindi",
                    "translation_en": "Last night at 9 a truck hit me from behind near Khed Shivapur toll. The rear bumper broke.",
                    "incident_type": "accident", "incident_at": "2026-10-03T21:00:00+05:30", "datetime_conf": 0.9,
                    "location_text": "near Khed Shivapur toll", "city": "Pune", "cause": "Truck hit from behind", "counterparty": "truck",
                    "third_party": True, "injuries": "none", "parts_mentioned": ["rear bumper"], "distress": "upset"}
        else:
            body = {"documents": [{"doc_id": "d_1", "declared_type": "RC", "actual_type": "RC", "legibility": "clear",
                                   "extracted": {"registration": "MH 12 AB 1234", "owner": "Rahul Sharma"},
                                   "checks": [{"field": "owner", "level": "pass", "msg": "RC owner matches"}], "confidence": 0.95}]}
        return gemini.RawResult(text=json.dumps(body), input_tokens=500, output_tokens=100)


def test_voice_intake_fills_fields_and_pipeline_reuses_it():
    gemini.set_mode_override("live")
    fake = FakeIntake()
    gemini._transport = fake
    r = rahul()
    d = new_draft(r, rahul_active_policy()["policy_no"], garage_id="g_001")
    res = r.post("/api/intake/voice", data={"claim_id": d["id"]}, files={"file": ("note.wav", wav_bytes(), "audio/wav")})
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["source"] == "live" and out["intake"]["language_label"] == "Hindi" and out["intake"]["transcript"] == HINDI
    assert out["intake"]["counterparty"] == "truck" and "distress" not in out["intake"]
    assert fake.calls[0][0] == "IntakeOut" and "audio/wav" in fake.calls[0][1]          # the audio itself went to the model
    c = next(x for x in read_json_sync("claims.json", []) if x["id"] == d["id"])
    assert c["intake"]["language_codes"] == ["hi"] and c["incident"]["narrative_original"] == HINDI
    assert c["incident"]["narrative_en"].startswith("Last night") and [m["kind"] for m in c["media"]] == ["audio"]
    run = next(x for x in read_json_sync("pipeline_runs.json", []) if x["id"] == out["run_id"])
    assert run["trigger"] == "wizard_intake" and run["status"] == "completed" and run["totals"]["llm_calls"] == 1
    # A second recording replaces the first voice note.
    r.post("/api/intake/voice", data={"claim_id": d["id"]}, files={"file": ("note2.wav", wav_bytes(), "audio/wav")})
    c = next(x for x in read_json_sync("claims.json", []) if x["id"] == d["id"])
    assert len([m for m in c["media"] if m["kind"] == "audio"]) == 1

    # Submit: the pipeline's Intake step reuses the wizard's intake (no second Intake call).
    r.patch(f"/api/claims/{d['id']}", json={"incident": {"location_text": "NH48 near Khed Shivapur toll", "datetime": "2026-10-03T21:00:00"}})
    with open(SAMPLES / "front.jpg", "rb") as fh:
        r.post(f"/api/uploads/{d['id']}", files={"file": ("front.jpg", fh, "image/jpeg")}, data={"kind": "photo", "slot": "rear"})
    gemini.set_mode_override("demo")
    sub = r.post(f"/api/claims/{d['id']}/submit", json={"pace": "fast"})
    assert sub.status_code == 200, sub.text
    asyncio.run(orchestrator.run(sub.json()["run_id"], d["id"], pace="fast", mode="demo"))
    run = next(x for x in read_json_sync("pipeline_runs.json", []) if x["id"] == sub.json()["run_id"])
    intake_lines = [e["data"]["message"] for e in run["events"] if e["event"] == "agent_progress" and e["data"]["agent"] == "intake"]
    assert any("already captured in the wizard" in m for m in intake_lines)
    # Theatre lookup: the claim's run (never the wizard's single-agent runs); customers can read it, others cannot.
    by_claim = r.get(f"/api/pipeline/by-claim/{d['id']}")
    assert by_claim.status_code == 200 and by_claim.json()["id"] == sub.json()["run_id"] and "agents" not in by_claim.json()


def test_typed_text_intake_in_demo_mode_says_so():
    gemini.set_mode_override("demo")
    r = rahul()
    d = new_draft(r, rahul_active_policy()["policy_no"])
    res = r.post("/api/intake/voice", data={"claim_id": d["id"], "text": "A bike scraped my left door in a parking lot."}).json()
    assert res["source"] != "live" and res["intake"] is None and "demo" in res["message"]
    c = next(x for x in read_json_sync("claims.json", []) if x["id"] == d["id"])
    assert c["incident"]["narrative_original"].startswith("A bike") and "intake" not in c


def test_document_extract_live_records_match_flags():
    gemini.set_mode_override("live")
    gemini._transport = FakeIntake()
    r = rahul()
    d = new_draft(r, rahul_active_policy()["policy_no"])
    with open(SAMPLES / "rc.jpg", "rb") as fh:
        doc = r.post(f"/api/uploads/{d['id']}", files={"file": ("rc.jpg", fh, "image/jpeg")}, data={"kind": "document", "slot": "rc"}).json()
    res = r.post("/api/documents/extract", json={"claim_id": d["id"], "doc_id": doc["id"]})
    assert res.status_code == 200, res.text
    out = res.json()["document"]
    assert out["status"] == "verified" and out["extracted"]["owner"] == "Rahul Sharma" and out["checks"][0]["message"] == "RC owner matches"
    stored = next(x for x in read_json_sync("claims.json", []) if x["id"] == d["id"])["documents"][0]
    assert stored["ai"]["read_at"] and stored["status"] == "verified"
