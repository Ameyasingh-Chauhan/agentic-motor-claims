"""Phase 5 live path with Gemini mocked: `gemini._transport` returns scripted JSON per schema, so the real code runs — prompt
rendering, structured-output validation, schema retry, transport retry, fallback, costing, DMN (FR-16–18), vehicle identity and the
adjudication policy. Also: pure tests of the adjudication branches and the identity comparison."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.agents import adjudication as adj
from app.agents import orchestrator
from app.agents.schemas import CommunicationOut, DamageOut, DocumentOut, IntakeOut, InvestigationOut
from app.main import app
from app.routers import auth
from app.services import costing, gemini, reference, vehicle_identity as vi
from app.services.json_store import read_json_sync
from app.routers.pipeline import customer_safe

SAMPLES = Path(__file__).resolve().parents[2] / "client" / "public" / "assets" / "samples" / "in-app-claim"
SAMPLE = json.loads((SAMPLES / "sample.json").read_text(encoding="utf-8"))


# ------------------------------------------------------------------------------------------------ fake Gemini

def baleno_photo(pid, **over):
    return {"photo_id": pid, "make": "Maruti Suzuki", "model": "Baleno", "body": "hatch", "colour": "Black", "plate_text": None,
            "plate_conf": 0, "idcon": 0.9, "same_vehicle": True, "same_conf": 0.9, **over}


def damage_json(photos):
    return {"photos": photos, "identity_summary": {"make": "Maruti Suzuki", "model": "Baleno", "confidence": 0.9},
            "items": [{"code": "MAR-BAL-FBMP", "part": "Front bumper", "zone": "front", "damage_type": "tear", "severity": "severe",
                       "operation": "replace", "fresh": True, "confidence": 0.93, "photo_ids": ["m_1", "m_2"],
                       "boxes": [{"photo_id": "m_1", "box_2d": [280, 0, 600, 480], "label": "Front bumper · torn"}]},
                      {"code": "MAR-BAL-HLMP", "part": "Headlamp", "zone": "front", "damage_type": "break", "severity": "severe",
                       "operation": "replace", "fresh": True, "confidence": 0.9, "photo_ids": ["m_2"],
                       "boxes": [{"photo_id": "m_2", "box_2d": [100, 0, 420, 520], "label": "Headlamp · broken"}]},
                      {"code": "MAR-XXX-NOPE", "part": "Imaginary part", "zone": "front", "damage_type": "dent", "severity": "minor",
                       "operation": "replace", "fresh": True, "confidence": 0.8}],
            "story": {"consistent": True, "why": "Front-right corner impact matches a pillar strike", "confidence": 0.85},
            "coverage": {"front": True, "closeup": True}, "overall_severity": "moderate", "wheel_alignment": True,
            "llm_estimate_inr": 99999}


class Fake:
    """Scripted transport. `damage` is the Damage JSON; `bad_first` makes the first reply for that schema invalid."""

    def __init__(self, damage=None, bad_first=None):
        self.damage = damage or damage_json([baleno_photo("m_1"), baleno_photo("m_2", make=None, model=None, idcon=0)])
        self.bad_first = set(bad_first or ())
        self.calls: list[str] = []

    async def __call__(self, *, system, contents, schema, **kw):
        name = schema.__name__
        self.calls.append(name)
        if name in self.bad_first:
            self.bad_first.discard(name)
            return gemini.RawResult(text='{"oops": true}', input_tokens=100, output_tokens=5)
        assert "<customer_input>" in system or name in ("DocumentOut", "InvestigationOut", "CommunicationOut")
        body = {
            "IntakeOut": {"language_codes": ["en"], "language_label": "English", "translation_en": "Hit the society gate pillar.",
                          "incident_type": "accident", "parts_mentioned": ["front bumper", "headlamp", "bonnet"], "injuries": "none"},
            "DocumentOut": {"documents": [
                {"doc_id": "d_1", "declared_type": "RC", "actual_type": "RC", "legibility": "clear", "watermark_noted": True,
                 "extracted": {"registration": "MH 02 DN 8165", "owner": "Aadi Seth", "make_model": "MARUTI SUZUKI BALENO"},
                 "checks": [{"field": "owner", "level": "pass", "msg": "Matches insured"}], "confidence": 0.95},
                {"doc_id": "d_2", "declared_type": "DL", "actual_type": "DL", "legibility": "clear",
                 "extracted": {"holder": "Aadi Seth", "classes": ["LMV", "MCWG"], "valid_to_nt": "2035-01-06", "number_last4": "9233"},
                 "checks": [{"field": "validity", "level": "pass", "msg": "Valid on incident date"}], "confidence": 0.94}]},
            "DamageOut": self.damage,
            "InvestigationOut": {"fraud_summary": "Low risk.", "decision_reasons": ["All checks passed"], "ai_summary": "Clean claim.",
                                 "evidence_cards": [{"rule_id": "FR-99", "expected": "x", "found": "y", "source": "z", "why": "w",
                                                     "confidence": 0.9}]},
            "CommunicationOut": {"message_local": "Hi Aadi, your claim is being processed.", "message_en": "Hi Aadi, your claim is being processed.",
                                 "lang_code": "en", "quick_replies": ["Thanks"]},
        }[name]
        return gemini.RawResult(text=json.dumps(body), input_tokens=1000, output_tokens=200, thinking_tokens=50)


@pytest.fixture(autouse=True)
def live(monkeypatch):
    reference.reload()
    auth._failures.clear()
    gemini.set_mode_override("live")
    monkeypatch.setattr(gemini, "BACKOFF_S", (0, 0, 0))
    yield
    gemini._transport = gemini._default_transport
    gemini.set_mode_override(None)
    gemini._forced_failures.clear()


def file_sample_claim(client: TestClient) -> str:
    res = client.post("/api/claims", json={**SAMPLE["claim"], "policy_no": SAMPLE["policy_no"]})
    assert res.status_code == 201, res.text
    cid = res.json()["id"]
    for f in SAMPLE["files"]:
        with open(SAMPLES / f["path"], "rb") as fh:
            r = client.post(f"/api/uploads/{cid}", files={"file": (f["path"], fh, "image/jpeg")},
                            data={"kind": f["kind"], "slot": f["slot"], "caption": f["caption"]})
        assert r.status_code == 201, r.text
    res = client.post(f"/api/claims/{cid}/submit", json={"pace": "fast"})
    assert res.status_code == 200, res.text
    return cid, res.json()["run_id"]


def admin() -> TestClient:
    c = TestClient(app)
    assert c.post("/api/auth/login", json={"username": "Ameya Chauhan", "password": "0376"}).status_code == 200
    return c


def run_live(fake: Fake) -> tuple[dict, dict]:
    gemini._transport = fake
    cid, run_id = file_sample_claim(admin())
    asyncio.run(orchestrator.run(run_id, cid, pace="fast", mode="live"))
    run = next(r for r in read_json_sync("pipeline_runs.json", []) if r["id"] == run_id)
    claim = next(c for c in read_json_sync("claims.json", []) if c["id"] == cid)
    return claim, run


# ------------------------------------------------------------------------------------------------ end to end

def test_live_sample_claim_full_pipeline():
    fake = Fake()
    c, run = run_live(fake)
    assert run["status"] == "completed"
    assert fake.calls == ["IntakeOut", "DocumentOut", "DamageOut", "InvestigationOut", "CommunicationOut"] or \
        sorted(fake.calls) == sorted(["IntakeOut", "DocumentOut", "DamageOut", "InvestigationOut", "CommunicationOut"])
    assert run["totals"]["llm_calls"] == 5 and run["totals"]["total_tokens"] == 5 * 1250
    assert all(call["prompt"].startswith("You are an agent in ABC General Insurance") for call in run["calls"])

    # Python prices exactly the catalogued items; the invented code is moved to "uncatalogued"; R6 adds alignment.
    items = [{"part_code": i["part_code"], "operation": i["operation"]} for i in c["damage"]["items"]]
    assert [i["part_code"] for i in items] == ["MAR-BAL-FBMP", "MAR-BAL-HLMP"]
    assert c["damage"]["uncatalogued"][0]["part"] == "Imaginary part"
    garage = next(g for g in read_json_sync("garages.json", []) if g["id"] == SAMPLE["claim"]["garage_id"])
    vehicle = next(v for v in read_json_sync("vehicles.json", []) if v["registration"] == SAMPLE["registration"])
    policy = next(p for p in read_json_sync("policies.json", []) if p["policy_no"] == SAMPLE["policy_no"])
    ctx = costing.VehicleContext(segment=vehicle["segment"], vehicle_type="Car", cc=vehicle["cc"], age_months=c["financials"]["vehicle_age_months"],
                                 zero_dep=policy["add_ons"]["zero_dep"], consumables=policy["add_ons"]["consumables"], city_tier=1,
                                 garage_type=garage["type"], idv=policy["idv"])
    expected = costing.calculate_cost(items, ctx, front_impact=True)
    assert c["financials"]["net_payable"] == expected["net_payable"] and c["financials"]["assessed_loss"] == expected["assessed_loss"]
    assert c["financials"]["llm_arithmetic_discrepancy"]["resolution"] == "Python calculation used"
    assert any(a["action"] == "llm_arithmetic_discrepancy" for a in c["audit"])

    # Identity: the Baleno in the photos is the insured Baleno (Vahan + RC agree); the close-up has no identity (not a mismatch).
    assert c["vehicle_identity"]["status"] == "consistent" and c["checks"]["vehicle_identity"]["level"] == "pass"
    assert {r["attribute"]: r["result"] for r in c["vehicle_identity"]["comparison"]}["Make & model"] == "match"
    assert not {"FR-16", "FR-17", "FR-18"} & {f["rule_id"] for f in c["fraud"]["fired"]}

    # Decision: low risk, docs verified (RC + DL read, claim form/policy/KYC digital), cashless network garage → auto pre-auth.
    assert c["status"] == "PREAUTH_ISSUED" and c["decision"]["route"] == "auto" and c["decision"]["policy_rule"] == "A5.7"
    assert c["amount_approved"] == c["financials"]["net_payable"]
    assert not [x for x in c["fraud"]["fired"] if x.get("expected") == "x"]       # an invented rule's card is dropped
    assert c["communications"][-1]["text"].startswith("Hi Aadi") and c["id"] in c["communications"][-1]["text_en"]
    boxes = [b for i in c["damage"]["items"] for b in i["boxes"]]
    assert boxes and all(len(b["box_2d"]) == 4 for b in boxes)


def test_photos_of_another_vehicle_fire_fr16():
    fake = Fake(damage_json([baleno_photo("m_1", make="Toyota", model="Innova Crysta", body="mpv", colour="White", idcon=0.92),
                             baleno_photo("m_2", make=None, model=None, idcon=0)]))
    c, _ = run_live(fake)
    fired = {f["rule_id"] for f in c["fraud"]["fired"]}
    assert "FR-16" in fired and "FR-18" in fired          # colour family differs too (light vs dark)
    assert c["vehicle_identity"]["status"] == "mismatch" and c["checks"]["vehicle_identity"]["level"] == "fail"
    assert c["status"] != "PREAUTH_ISSUED" and c["decision"]["route"] == "handler"
    customer_text = " ".join(m["text"] + m.get("text_en", "") for m in c["communications"]).lower()
    assert "fraud" not in customer_text and "mismatch" not in customer_text


def test_photos_of_two_different_vehicles_fire_fr17():
    fake = Fake(damage_json([baleno_photo("m_1"),
                             baleno_photo("m_2", colour="Grey", same_vehicle=False, same_conf=0.88, diff_reason="Grey paint, different grille")]))
    c, _ = run_live(fake)
    fired = {f["rule_id"]: f for f in c["fraud"]["fired"]}
    assert "FR-17" in fired and fired["FR-17"]["points"] == 25
    assert c["vehicle_identity"]["cross_photo"]["level"] == "fail"
    assert c["fraud"]["score"] == 30 and c["fraud"]["band"] == "medium"       # FR-17 25 + FR-18 5 (grey vs black)
    assert c["decision"]["route"] == "handler" and c["status"] == "UNDER_REVIEW"


def test_schema_failure_retries_once_with_the_error():
    fake = Fake(bad_first={"DamageOut"})
    c, run = run_live(fake)
    dmg = next(call for call in run["calls"] if call["agent"] == "damage")
    assert len(dmg["attempts"]) == 2 and "Schema validation failed" in dmg["attempts"][0]["error"] and dmg["ok"]
    assert any(e["event"] == "agent_retry" and e["data"]["agent"] == "damage" for e in run["events"])
    assert c["vehicle_identity"]["status"] == "consistent"


def test_forced_failure_retries_then_falls_back_without_hanging():
    gemini.force_failure("damage")
    c, run = run_live(Fake())
    events = [e for e in run["events"] if e["data"].get("agent") == "damage"]
    kinds = [e["event"] for e in events]
    assert kinds.count("agent_retry") == 3 and "agent_fallback" in kinds and kinds[-1] == "agent_completed"
    assert run["status"] == "completed" and run["events"][-1]["event"] == "run_completed"
    assert c["vehicle_identity"]["status"] == "not_assessed" and c["damage"]["items"] == []
    assert c["status"] == "UNDER_REVIEW" and c["decision"]["route"] == "handler"
    assert "Automated step unavailable: damage" in c["decision"]["policy_reasons"]
    assert any(a["action"] == "agent_fallback" for a in c["audit"])


def test_missing_key_file_runs_in_demo_mode_without_calling_gemini(monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "google_application_credentials", "credentials/does-not-exist.json")
    assert gemini.effective_mode() == "demo"          # even with the "live" override set by the fixture

    async def never(**kw):
        raise AssertionError("Gemini must not be called without the key file")
    gemini._transport = never
    cid, run_id = file_sample_claim(admin())
    run = next(r for r in read_json_sync("pipeline_runs.json", []) if r["id"] == run_id)
    assert run["mode"] == "demo"
    asyncio.run(orchestrator.run(run_id, cid, pace="fast", mode=run["mode"]))
    run = next(r for r in read_json_sync("pipeline_runs.json", []) if r["id"] == run_id)
    c = next(x for x in read_json_sync("claims.json", []) if x["id"] == cid)
    assert run["status"] == "completed" and run["totals"]["llm_calls"] == 0 and run["events"][-1]["event"] == "run_completed"
    assert run["calls"] and all(call["model"] == "demo" and call["attempts"] == [] for call in run["calls"])   # prompts kept for the inspector
    assert c["llm_mode"] == "demo" and c["status"] == "UNDER_REVIEW" and c["decision"]["route"] == "handler"
    assert c["vehicle_identity"]["status"] == "not_assessed"


def test_schema_failure_twice_falls_back():
    class AlwaysBad(Fake):
        async def __call__(self, *, schema, **kw):
            if schema is InvestigationOut:
                return gemini.RawResult(text="not json")
            return await super().__call__(schema=schema, **kw)
    c, run = run_live(AlwaysBad())
    inv = next(call for call in run["calls"] if call["agent"] == "investigation")
    assert len(inv["attempts"]) == 2 and not inv.get("ok") and inv["source"] == "fallback"
    assert c["fraud"]["narrative"].startswith("Risk score") and run["status"] == "completed"


def test_regenerate_draft_is_customer_safe(monkeypatch):
    c, _ = run_live(Fake())
    client = admin()

    async def unsafe(**kw):
        return gemini.RawResult(text=json.dumps({"message_local": "Your claim failed our fraud score check.", "message_en": "x",
                                                 "lang_code": "en"}))
    gemini._transport = unsafe
    res = client.post(f"/api/claims/{c['id']}/messages/draft")
    assert res.status_code == 200 and res.json()["source"] == "template" and "fraud" not in res.json()["draft"]["text"].lower()
    gemini._transport = Fake()
    res = client.post(f"/api/claims/{c['id']}/messages/draft")
    assert res.json()["source"] == "live" and res.json()["draft"]["draft"] is True
    stored = next(x for x in read_json_sync("claims.json", []) if x["id"] == c["id"])
    assert sum(1 for m in stored["communications"] if m.get("draft")) == 1


def test_customer_events_are_neutral():
    assert customer_safe({"id": 3, "event": "tool_result", "data": {"agent": "verification", "tool": "fastag"}}) is None
    assert customer_safe({"id": 4, "event": "agent_progress", "data": {"agent": "fraud", "message": "FR-01"}}) is None
    d = customer_safe({"id": 9, "event": "decision", "data": {"route": "SIU", "score": 90, "customer_message": "Hi", "ts": "t"}})
    assert d["data"] == {"customer_message": "Hi", "ts": "t"}
    s = customer_safe({"id": 5, "event": "agent_started", "data": {"agent": "fraud", "display_name": "Fraud", "stage": 3, "ts": "t"}})
    assert s["data"]["display_name"] == "Final checks"


# ------------------------------------------------------------------------------------------------ adjudication policy (A5)

def facts(**over) -> adj.Facts:
    base = dict(policy_active=True, od_on_tp_only=False, exclusions=[], hard_stop=False, score=5, band="low", fired={}, failed_rules=[],
                is_total_loss=False, docs_missing=[], docs_unreadable=[], docs_all_verified=True, net_payable=40_000,
                settlement_mode="cashless", garage_network=True)
    return adj.Facts(**(base | over))


@pytest.mark.parametrize("over, action, rule", [
    ({"policy_active": False}, "decline", "A5.1"),
    ({"od_on_tp_only": True}, "decline", "A5.1"),
    ({"exclusions": ["Licence expired"]}, "decline", "A5.2"),
    ({"hard_stop": True, "score": 40, "band": "high"}, "escalate_siu", "A5.3"),
    ({"score": 75, "band": "high"}, "escalate_siu", "A5.3"),
    ({"is_total_loss": True}, "total_loss", "A5.4"),
    ({"docs_missing": ["Driving licence of driver"]}, "request_info", "A5.5"),
    ({"docs_unreadable": ["RC (verified copy)"]}, "request_info", "A5.5"),
    ({"score": 35, "band": "medium", "fired": {"FR-06": 15, "FR-04": 15, "FR-14": 5}}, "approve_revised", "A5.6"),
    ({"score": 35, "band": "medium", "fired": {"FR-04": 15, "FR-09": 15, "FR-14": 5}}, "route_handler", "A5.6"),
    ({"score": 45, "band": "medium", "fired": {"FR-06": 15, "FR-03": 20, "FR-12": 10}}, "route_handler", "A5.6"),
    ({}, "auto_preauth", "A5.7"),
    ({"settlement_mode": "reimbursement"}, "auto_approve", "A5.7"),
    ({"net_payable": 150_001}, "route_handler", "A5.8"),
    ({"garage_network": False}, "route_handler", "A5.8"),
    ({"docs_all_verified": False}, "route_handler", "A5.8"),
    ({"degraded": ["damage"]}, "route_handler", "A5.8"),
    ({"failed_rules": ["FR-17"], "score": 25}, "route_handler", "A5.8"),
])
def test_adjudication_policy_branches(over, action, rule):
    d = adj.decide(facts(**over))
    assert (d["action"], d["rule"]) == (action, rule)


def test_policy_order_first_match_wins():
    assert adj.decide(facts(policy_active=False, hard_stop=True, band="high", score=90))["action"] == "decline"
    assert adj.decide(facts(score=90, band="high", is_total_loss=True))["action"] == "escalate_siu"
    assert adj.decide(facts(is_total_loss=True, docs_missing=["RC"]))["action"] == "total_loss"


# ------------------------------------------------------------------------------------------------ vehicle identity (A4)

VEH = {"make": "Hyundai", "model": "Creta", "model_key": "HYU-CRE", "colour": "Pearl White", "registration": "MH 12 AB 1234"}


def ident(*photos, rc=None, vahan=None):
    return vi.compare({"photos": list(photos)}, vehicle=VEH, vahan=vahan, rc=rc)


def p(pid="m_1", **kw):
    return {"photo_id": pid, "make": "Hyundai", "model": "Creta", "body": "suv", "colour": "White", "idcon": 0.9, **kw}


def test_identity_alias_match_and_rc_variant():
    r = ident(p(), rc={"make_model": "HYUNDAI CRETA 1.5 SX", "registration": "MH12AB1234"},
              vahan={"make_model": "Hyundai Creta", "registration": "MH 12 AB 1234"})
    assert r["status"] == "consistent" and not (r["fr16"] or r["fr17"] or r["fr18"])
    mm = r["comparison"][0]
    assert mm["sources"]["rc"]["result"] == mm["sources"]["vahan"]["result"] == "match"
    assert vi.model_matches("Wagon R", "WagonR") and vi.make_key("Suzuki") == vi.make_key("Maruti Suzuki")


def test_identity_mismatch_needs_confidence():
    assert ident(p(make="Toyota", model="Innova Crysta"))["fr16"] is True
    low = ident(p(make="Toyota", model="Innova Crysta", idcon=0.6))
    assert low["fr16"] is False and low["comparison"][0]["result"] == "unclear"
    assert vi.model_matches("Innova Crysta", "Innova Hycross") is False and vi.model_matches("Innova", "Innova Hycross")


def test_identity_plate_rules():
    assert vi.compare_plate("MH12AB1234", 0.9, "MH 12 AB 1234") == "match"
    assert vi.compare_plate("MH 12 AB 1284", 0.95, "MH 12 AB 1234") == "unclear"      # 1 character differs
    assert vi.compare_plate("MH 14 AB 1284", 0.95, "MH 12 AB 1234") == "mismatch"     # 2 differ, confident
    assert vi.compare_plate("MH 14 AB 1284", 0.6, "MH 12 AB 1234") == "unclear"
    assert ident(p(plate_text="KA 01 ZZ 9999", plate_conf=0.9))["fr16"] is True
    # the RC column compares the photos' plate with the RC reading — an unread plate is unclear, not a match
    rc = {"make_model": "Hyundai Creta", "registration": "MH 12 AB 1234"}
    assert ident(p(), rc=rc)["comparison"][3]["sources"]["rc"]["result"] == "unclear"
    assert ident(p(plate_text="MH12AB1234", plate_conf=0.9), rc=rc)["comparison"][3]["sources"]["rc"]["result"] == "match"


def test_identity_colour_is_warn_and_unclear_photos_fire_fr18():
    r = ident(p(colour="Red"))
    assert r["fr18"] and not r["fr16"] and r["comparison"][2]["level"] == "warn"
    blank = ident({"photo_id": "m_1"}, {"photo_id": "m_2"})
    assert blank["fr18"] and blank["status"] == "unclear"


def test_identity_cross_photo():
    r = ident(p(), p("m_2", same_vehicle=False, same_conf=0.8, diff_reason="Different wheels"))
    assert r["fr17"] and r["cross_photo"]["level"] == "fail" and r["status"] == "mismatch"
    weak = ident(p(), p("m_2", same_vehicle=False, same_conf=0.5))
    assert not weak["fr17"] and weak["cross_photo"]["level"] == "warn"


def test_seeded_claims_have_no_identity_reading():
    assert all("vehicle_identity" not in c for c in read_json_sync("claims.json", []) if c.get("origin") != "app")


def test_output_schemas_accept_the_recorded_fallbacks():
    for sid in ("clean_rear_end", "fastag_mismatch", "garage_overquote", "theft_two_wheeler", "flood_total_loss"):
        for name, model in (("intake", IntakeOut), ("document", DocumentOut), ("damage", DamageOut), ("investigation", InvestigationOut),
                            ("communication", CommunicationOut)):
            model.model_validate(read_json_sync(f"demo_fallback/{sid}/{name}.json"))
