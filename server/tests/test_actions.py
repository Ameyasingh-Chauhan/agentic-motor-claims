"""Stage 3 (§10.4 + brief addition): handler actions, status-validity matrix, audit/timeline/notifications, undo, customer safety.

Runs on the temporary data copy (conftest.py)."""
import re
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import auth
from app.schemas.claim import STATUSES
from app.services import claim_actions as A
from app.services.json_store import read_json_sync

BANNED = {"fraud", "siu", "risk", "rule", "rules", "score", "scores"}


@pytest.fixture(autouse=True)
def clear_state():
    auth._failures.clear()
    A._undo.clear()
    yield


def login(name="Santosh Kute", password="Admin@123") -> TestClient:
    c = TestClient(app)
    assert c.post("/api/auth/login", json={"username": name, "password": password}).status_code == 200
    return c


def admin() -> TestClient:
    return login()


def other_admin() -> TestClient:
    return login("Ameya Chauhan", "0376")


def rahul() -> TestClient:
    return login("Rahul Sharma", "Pass@123")


def claims() -> list[dict]:
    return [c for c in read_json_sync("claims.json", []) if c.get("origin") != "app"]


def by_scenario(sid: str) -> dict:
    return next(c for c in claims() if c.get("scenario_id") == sid)


def stored(cid: str) -> dict:
    return next(c for c in read_json_sync("claims.json", []) if c["id"] == cid)


def pick(status: str, **kw) -> dict:
    return next(c for c in claims() if c["status"] == status and not c.get("scenario_id")
                and all(c.get(k) == v for k, v in kw.items()) and c.get("financials"))


def act(client, cid, action, **body):
    return client.post(f"/api/claims/{cid}/actions", json={"action": action, "reason": "Checked the file and photos", **body})


def tokens(value) -> set[str]:
    """Every word in every key and string value, split on non-letters (so blur_score → blur, score)."""
    out: set[str] = set()
    if isinstance(value, dict):
        for k, v in value.items():
            out |= tokens(k) | tokens(v)
    elif isinstance(value, list):
        for v in value:
            out |= tokens(v)
    elif isinstance(value, str):
        out |= {w.lower() for w in re.split(r"[^A-Za-z]+", value) if w}
    return out


# ------------------------------------------------------------------------------------------------ matrix

EXPECTED = {   # status → actions that must be allowed (for a claim with an AI estimate)
    "SUBMITTED": {"approve", "approve_revised", "request_info", "escalate_siu", "reject", "reassign", "note"},
    "PROCESSING": {"approve", "approve_revised", "request_info", "escalate_siu", "reject", "reassign", "note"},
    "INFO_REQUESTED": {"approve", "approve_revised", "escalate_siu", "reject", "reassign", "note"},
    "UNDER_REVIEW": {"approve", "approve_revised", "request_info", "escalate_siu", "reject", "reassign", "note"},
    "SIU_INVESTIGATION": {"approve", "approve_revised", "request_info", "reject", "confirm_fraud", "clear_siu", "reassign", "note"},
    "APPROVED": {"approve_revised", "escalate_siu", "reject", "settle", "reassign", "note"},
    "PREAUTH_ISSUED": {"approve_revised", "escalate_siu", "reject", "settle", "reassign", "note"},
    "DECLINED": {"approve", "approve_revised", "escalate_siu", "reassign", "note"},
    "SETTLED": {"note"}, "WITHDRAWN": {"note"}, "FRAUD_CONFIRMED": {"note"}, "DRAFT": set(),
}


@pytest.mark.parametrize("status", STATUSES)
def test_status_validity_matrix(status):
    claim = {"status": status, "financials": {"net_payable": 1000}}
    allowed = A.allowed_actions(claim)
    assert {k for k, v in allowed.items() if v["allowed"]} == EXPECTED[status]
    for k, v in allowed.items():
        assert v["allowed"] or (v["reason"] and len(v["reason"]) > 10), (status, k)
    if status in A.FINAL:
        assert "final status" in allowed["approve"]["reason"]


def test_approve_needs_an_ai_estimate_but_revised_amount_does_not():
    allowed = A.allowed_actions({"status": "SUBMITTED", "financials": None})
    assert not allowed["approve"]["allowed"] and "Approve revised amount" in allowed["approve"]["reason"]
    assert allowed["approve_revised"]["allowed"]


# ------------------------------------------------------------------------------------------------ each action

def test_approve_persists_with_audit_timeline_message_and_notifications():
    a = admin()
    c = pick("UNDER_REVIEW")
    res = act(a, c["id"], "approve")
    assert res.status_code == 200, res.text
    body = res.json()
    after = stored(c["id"])
    expected_status = "PREAUTH_ISSUED" if c["settlement"]["mode"] == "cashless" else "APPROVED"
    assert after["status"] == body["claim"]["status"] == expected_status
    assert after["amount_approved"] == c["financials"]["net_payable"] and after["decision"]["decided_by"] == "u_001"
    assert after["audit"][-1] | {} == after["audit"][-1] and after["audit"][-1]["from"] == "UNDER_REVIEW" and after["audit"][-1]["op"] == "approve"
    assert after["timeline"][-1]["type"] == "approved" and after["communications"][-1]["direction"] == "outbound"
    notes = read_json_sync("notifications.json", [])
    assert any(n["user_id"] == "u_002" and n["href"] == f"/claims/{c['id']}" for n in notes)
    assert body["action_id"].startswith("act_") and body["claim"]["allowed_actions"]["approve"]["allowed"] is False


def test_approve_revised_records_the_amount_and_respects_the_idv():
    a = admin()
    c = by_scenario("garage_overquote")
    amount = c["financials"]["net_payable"]
    assert act(a, c["id"], "approve_revised").status_code == 422  # amount required
    too_much = act(a, c["id"], "approve_revised", amount=c["financials"]["total_loss_check"]["idv"] + 1)
    assert too_much.status_code == 422 and "IDV" in too_much.json()["detail"]["message"]
    assert act(a, c["id"], "approve_revised", amount=amount).status_code == 200
    after = stored(c["id"])
    assert after["amount_approved"] == amount and after["decision"]["final_action"] == "approve_revised"
    assert "override" not in after["audit"][-1]  # the AI recommended exactly this


def test_request_info_and_its_invalid_status():
    a = admin()
    c = pick("UNDER_REVIEW")
    assert act(a, c["id"], "request_info").status_code == 422
    assert act(a, c["id"], "request_info", items=["Repair estimate", "Driving licence"]).status_code == 200
    after = stored(c["id"])
    assert after["status"] == "INFO_REQUESTED" and after["decision"]["info_request"]["items"] == ["Repair estimate", "Driving licence"]
    again = act(a, c["id"], "request_info", items=["RC copy"])
    assert again.status_code == 409 and "waiting" in again.json()["detail"]["message"]


def test_escalate_clear_and_confirm_fraud():
    a = admin()
    c = pick("UNDER_REVIEW")
    assert act(a, c["id"], "escalate_siu").status_code == 200 and stored(c["id"])["status"] == "SIU_INVESTIGATION"
    assert act(a, c["id"], "escalate_siu").status_code == 409
    assert act(a, c["id"], "clear_siu").status_code == 200 and stored(c["id"])["status"] == "UNDER_REVIEW"
    assert act(a, c["id"], "confirm_fraud").status_code == 409  # only from SIU
    f = by_scenario("fastag_mismatch")
    res = act(a, f["id"], "confirm_fraud")
    assert res.status_code == 200
    after = stored(f["id"])
    assert after["status"] == "FRAUD_CONFIRMED" and after["timeline"][-1]["type"] == "fraud_confirmed"
    assert act(a, f["id"], "approve").status_code == 409  # final


def test_reject_and_override_of_the_ai():
    a = admin()
    f = by_scenario("fastag_mismatch")  # AI recommended escalate_siu
    assert act(a, f["id"], "approve").status_code == 200
    after = stored(f["id"])
    assert after["audit"][-1]["override"] == "escalate_siu" and "overrides AI recommendation" in after["timeline"][-1]["text"]
    c = pick("UNDER_REVIEW")
    assert act(a, c["id"], "reject").status_code == 200
    assert stored(c["id"])["status"] == "DECLINED" and stored(c["id"])["amount_approved"] == 0
    assert act(a, c["id"], "reject").status_code == 409


def test_settle_validates_and_records_payment():
    a = admin()
    c = by_scenario("clean_rear_end")  # PREAUTH_ISSUED
    today = date.today().isoformat()
    assert act(a, c["id"], "settle", amount=24772, date=today).status_code == 422                       # no reference
    future = (date.today() + timedelta(days=3)).isoformat()
    assert act(a, c["id"], "settle", amount=24772, date=future, payment_reference="UTR123456").status_code == 422
    assert act(a, c["id"], "settle", amount=24772, date=today, payment_reference="UTR123456").status_code == 200
    after = stored(c["id"])
    assert after["status"] == "SETTLED" and after["settlement"]["payment_reference"] == "UTR123456" and after["settlement"]["paid_amount"] == 24772
    assert act(a, c["id"], "approve_revised", amount=1000).status_code == 409   # SETTLED is final
    assert act(a, pick("UNDER_REVIEW")["id"], "settle", amount=1, date=today, payment_reference="UTR1").status_code == 409


def test_reassign_and_notes():
    a = admin()
    c = pick("UNDER_REVIEW")
    target = "u_002" if c.get("assignee") != "u_002" else "u_001"
    assert act(a, c["id"], "reassign", assignee="u_999").status_code == 422
    assert act(a, c["id"], "reassign", assignee=target).status_code == 200
    assert stored(c["id"])["assignee"] == target and stored(c["id"])["audit"][-1]["to"] == target
    assert act(a, c["id"], "reassign", assignee=target).status_code == 422
    assert a.post(f"/api/claims/{c['id']}/notes", json={"text": "Called the garage, quote confirmed."}).status_code == 200
    assert stored(c["id"])["internal_notes"][-1]["text"] == "Called the garage, quote confirmed."
    settled = pick("SETTLED")
    assert a.post(f"/api/claims/{settled['id']}/notes", json={"text": "Archived."}).status_code == 200  # notes allowed on final claims


def test_customers_and_anonymous_cannot_act():
    c = pick("UNDER_REVIEW")
    assert act(rahul(), c["id"], "approve").status_code == 403
    assert act(TestClient(app), c["id"], "approve").status_code == 401
    assert act(admin(), c["id"], "bogus").status_code == 422
    assert admin().post(f"/api/claims/{c['id']}/actions", json={"action": "approve", "reason": "ok"}).status_code == 422  # reason too short


def test_app_filed_claim_without_ai_output():
    a = admin()
    pol = next(p for p in read_json_sync("policies.json", []) if p["customer_id"] == "c_0001" and p["status"] == "active")
    r = rahul()
    cid = r.post("/api/claims", json={"policy_no": pol["policy_no"], "incident": {"type": "glass", "location_text": "Baner Road",
                 "narrative": "Stone chip cracked the windscreen on Baner Road."}, "claim_type": "Glass"}).json()["id"]
    from pathlib import Path
    with open(Path(__file__).resolve().parents[2] / "client/public/assets/samples/in-app-claim/closeup.jpg", "rb") as fh:
        r.post(f"/api/uploads/{cid}", files={"file": ("p.jpg", fh, "image/jpeg")}, data={"kind": "photo", "slot": "closeup"})
    assert r.post(f"/api/claims/{cid}/submit").status_code == 200
    detail = a.get(f"/api/claims/{cid}").json()
    assert detail["fraud"] is None and detail["allowed_actions"]["approve"]["allowed"] is False
    assert act(a, cid, "approve").status_code == 409
    assert act(a, cid, "approve_revised", amount=8500).status_code == 200
    assert stored(cid)["decision"]["approved_amount"] == 8500 and stored(cid)["decision"]["ai_pending"]


# ------------------------------------------------------------------------------------------------ undo

def test_undo_restores_state_withdraws_notifications_and_keeps_the_audit():
    a = admin()
    c = pick("UNDER_REVIEW")
    before = stored(c["id"])
    res = act(a, c["id"], "approve").json()
    n_msgs = len(stored(c["id"])["communications"])
    assert any(n["href"] == f"/claims/{c['id']}" and n["created_at"] for n in read_json_sync("notifications.json", []))
    undo = a.post(f"/api/claims/{c['id']}/actions", json={"action": "undo", "action_id": res["action_id"]})
    assert undo.status_code == 200, undo.text
    after = stored(c["id"])
    assert after["status"] == "UNDER_REVIEW" and after["amount_approved"] == before["amount_approved"]
    assert len(after["communications"]) == n_msgs - 1 and after["decision"] == before["decision"]
    assert [e["op"] for e in after["audit"][-2:]] == ["approve", "undo"]               # immutable: both recorded
    assert after["timeline"][-1]["type"] == "action_undone"
    assert not any(n["href"] == f"/claims/{c['id']}" and n["title"].endswith("by Santosh Kute") for n in read_json_sync("notifications.json", []))
    again = a.post(f"/api/claims/{c['id']}/actions", json={"action": "undo", "action_id": res["action_id"]})
    assert again.status_code == 409


def test_undo_works_on_final_statuses_but_only_in_the_window_and_for_the_same_person():
    a = admin()
    c = by_scenario("clean_rear_end")
    res = act(a, c["id"], "settle", amount=24772, date=date.today().isoformat(), payment_reference="UTR998877").json()
    assert other_admin().post(f"/api/claims/{c['id']}/actions", json={"action": "undo", "action_id": res["action_id"]}).status_code == 403
    assert a.post(f"/api/claims/{c['id']}/actions", json={"action": "undo", "action_id": res["action_id"]}).status_code == 200
    assert stored(c["id"])["status"] == "PREAUTH_ISSUED"
    res = act(a, c["id"], "reject").json()
    A._undo[res["action_id"]]["at"] -= timedelta(seconds=A.UNDO_SECONDS + A.UNDO_GRACE + 1)
    late = a.post(f"/api/claims/{c['id']}/actions", json={"action": "undo", "action_id": res["action_id"]})
    assert late.status_code == 409 and stored(c["id"])["status"] == "DECLINED"


# ------------------------------------------------------------------------------------------------ customer side

def rahul_claims(r: TestClient) -> list[str]:
    return [i["id"] for i in r.get("/api/claims", params={"page_size": 100}).json()["items"]]


def test_customer_sees_only_a_neutral_not_approved_after_confirm_fraud():
    a, r = admin(), rahul()
    c = by_scenario("clean_rear_end")  # Rahul's Creta
    assert act(a, c["id"], "escalate_siu", reason="Inspection photos look inconsistent").status_code == 200
    assert r.get(f"/api/claims/{c['id']}").json()["status"] == "UNDER_REVIEW"   # SIU is never shown
    assert act(a, c["id"], "confirm_fraud", reason="SIU confirmed staged accident — fraud").status_code == 200
    view = r.get(f"/api/claims/{c['id']}").json()
    assert view["status"] == "DECLINED" and view["timeline"][-1]["text"] == "Claim not approved"
    assert "unable to approve" in view["communications"][-1]["text"]
    assert not tokens(view) & BANNED
    assert "staged" not in str(view)


def test_recursive_banned_words_over_all_of_rahuls_responses():
    a, r = admin(), rahul()
    ids = rahul_claims(r)
    for cid in ids:   # exercise every customer-visible action first so their messages and notifications are included
        allowed = a.get(f"/api/claims/{cid}").json()["allowed_actions"]
        if allowed["escalate_siu"]["allowed"]:
            act(a, cid, "escalate_siu", reason="Escalated for SIU fraud review")
    responses = [r.get("/api/auth/me").json(), r.get("/api/stats/home").json(), r.get("/api/notifications").json(),
                 r.get("/api/claims/facets").json()]
    for page in (1, 2):
        responses.append(r.get("/api/claims", params={"page": page, "page_size": 100}).json())
    responses += [r.get(f"/api/claims/{cid}").json() for cid in ids]
    for resp in responses:
        assert not tokens(resp) & BANNED, tokens(resp) & BANNED
    detail = r.get(f"/api/claims/{ids[0]}").json()
    for key in ("scenario_id", "pipeline_run_id", "audit", "internal_notes", "fraud", "allowed_actions", "sla"):
        assert key not in detail
    assert all(not m.get("draft") for m in detail["communications"])
    assert all("extracted" not in d and "checks" not in d for d in detail["documents"])
    assert detail["financials"] is None or "llm_arithmetic_discrepancy" not in detail["financials"]


def test_customer_responds_to_an_information_request():
    a, r = admin(), rahul()
    cid = next(i for i in rahul_claims(r) if stored(i)["status"] == "INFO_REQUESTED")
    assert r.post(f"/api/claims/{cid}/respond", json={"message": ""}).status_code == 422
    res = r.post(f"/api/claims/{cid}/respond", json={"message": "Uploaded the bill and my licence."})
    assert res.status_code == 200 and res.json()["claim"]["status"] == "UNDER_REVIEW"
    after = stored(cid)
    assert after["communications"][-1]["direction"] == "inbound" and after["audit"][-1]["to"] == "UNDER_REVIEW"
    assert r.post(f"/api/claims/{cid}/respond", json={"message": "again"}).status_code == 409
    assert a.post(f"/api/claims/{cid}/respond", json={"message": "x"}).status_code == 403


def test_messages_drafts_and_audit_export():
    a, r = admin(), rahul()
    cid = next(i for i in rahul_claims(r) if stored(i)["status"] in ("INFO_REQUESTED", "UNDER_REVIEW", "PREAUTH_ISSUED"))
    detail = a.get(f"/api/claims/{cid}").json()
    draft = next(m for m in detail["communications"] if m.get("draft"))
    assert draft["generated_by"] == "template" and not tokens(draft["text"]) & BANNED
    sent = a.post(f"/api/claims/{cid}/messages", json={"text": draft["text"] + " Thanks!", "draft_id": draft["id"]})
    assert sent.status_code == 200
    assert stored(cid)["communications"][-1]["text"].endswith("Thanks!")
    assert any(n["user_id"] == "u_003" for n in read_json_sync("notifications.json", []))
    assert r.post(f"/api/claims/{cid}/messages", json={"text": "Okay, thank you"}).json()["claim"]["communications"][-1]["direction"] == "inbound"
    csv_res = a.get(f"/api/claims/{cid}/export.csv")
    assert csv_res.status_code == 200 and csv_res.text.splitlines()[0].startswith("timestamp,actor")
    assert r.get(f"/api/claims/{cid}/export.csv").status_code == 403


def test_admin_detail_carries_the_verification_evidence():
    a = admin()
    f = a.get(f"/api/claims/{by_scenario('fastag_mismatch')['id']}").json()
    ctx = f["context"]
    assert ctx["vahan"]["registration"] == f["registration"] and ctx["policy"]["policy_no"] == f["policy_no"]
    assert ctx["fastag_events"] and any(e["mismatch"] for e in ctx["fastag_events"])
    assert all(e["distance_km"] is not None for e in ctx["fastag_events"])
    assert set(ctx["people"]) == {"u_001", "u_002"}
    assert a.get("/api/claims/ABC-MC-1999-000000").status_code == 404


def test_calculation_ladder_comes_from_the_costing_engine():
    """Every ladder row is a figure costing.py stored; the steps between subtotals add up to the next subtotal (Python wins, §12.9)."""
    a = admin()
    for sid in ("fastag_mismatch", "flood_total_loss"):
        claim = a.get(f"/api/claims/{by_scenario(sid)['id']}").json()
        f, ladder = claim["financials"], claim["context"]["ladder"]
        assert ladder[-1]["kind"] == "total" and ladder[-1]["amount"] == f["net_payable"]
        running = None
        for step in ladder:
            if step["kind"] == "base":
                running = step["amount"]
            elif step["kind"] in ("plus", "minus"):
                running += step["amount"]
            else:
                assert step["amount"] == pytest.approx(running, abs=0.5), (sid, step["label"])
                running = step["amount"]
        assert any(s["label"].startswith("Total loss") for s in ladder) == f["total_loss_check"]["is_total_loss"]
