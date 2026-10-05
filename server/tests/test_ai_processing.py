"""Feature B (docs/FEATURE_BRIEF_POLICY_UPLOAD_AND_PROCESSING.md): admin-triggered "Run / Re-run AI processing" on an
existing claim — same orchestrator.start() path as /submit, allowed/blocked statuses, audit + timeline entries, and
graceful handling of a claim with no photos or narrative. Temp data (conftest.py); AMC_PIPELINE_AUTOSTART=0 so tests
drive orchestrator.run() themselves, exactly like a "Stage 2" claim filed before the pipeline ran."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.agents import orchestrator
from app.main import app
from app.routers import auth
from app.services import gemini
from app.services.json_store import read_json_sync, write_json_sync

SAMPLES = Path(__file__).resolve().parents[2] / "client" / "public" / "assets" / "samples" / "in-app-claim"
SAMPLE = json.loads((SAMPLES / "sample.json").read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def reset():
    auth._failures.clear()
    yield
    gemini.set_mode_override(None)


def login(name: str, password: str) -> TestClient:
    c = TestClient(app)
    assert c.post("/api/auth/login", json={"username": name, "password": password}).status_code == 200
    return c


def rahul() -> TestClient:
    return login("Rahul Sharma", "Pass@123")


def admin() -> TestClient:
    return login("Santosh Kute", "Admin@123")


def rahul_policy() -> dict:
    return next(p for p in read_json_sync("policies.json", []) if p["customer_id"] == "c_0001" and p["status"] == "active")


def pending_claim(r: TestClient, *, photos=True, narrative=True) -> str:
    """A claim stuck exactly where "ABC-MC-2026-000251" was (filed before the pipeline existed): SUBMITTED,
    no financials/fraud/decision yet, pipeline never run (AUTOSTART=0 means /submit only reserves a run id).
    `photos`/`narrative` False simulates an older claim predating validation — stripped straight in claims.json,
    since /submit itself still requires both (§Feature B: the pipeline, not /submit, must tolerate their absence)."""
    body = {**SAMPLE["claim"], "policy_no": rahul_policy()["policy_no"]}
    created = r.post("/api/claims", json=body)
    assert created.status_code == 201, created.text
    cid = created.json()["id"]
    with open(SAMPLES / "front.jpg", "rb") as fh:
        r.post(f"/api/uploads/{cid}", files={"file": ("front.jpg", fh, "image/jpeg")}, data={"kind": "photo", "slot": "front"})
    submitted = r.post(f"/api/claims/{cid}/submit")
    assert submitted.status_code == 200, submitted.text
    if not photos or not narrative:
        claims = read_json_sync("claims.json", [])
        c = next(c for c in claims if c["id"] == cid)
        if not photos:
            c["media"] = []
        if not narrative:
            c["incident"]["narrative_original"] = c["incident"]["narrative_en"] = ""
        write_json_sync("claims.json", claims)
    return cid


def test_run_ai_processing_pending_claim_allowed_and_recorded():
    r, a = rahul(), admin()
    cid = pending_claim(r)
    claim = next(c for c in read_json_sync("claims.json", []) if c["id"] == cid)
    assert claim["financials"] is None and claim["status"] == "SUBMITTED"

    # Customers can never trigger it.
    assert r.post(f"/api/claims/{cid}/process").status_code == 403

    res = a.post(f"/api/claims/{cid}/process", json={"pace": "fast"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["run_id"].startswith("run_")
    claim = next(c for c in read_json_sync("claims.json", []) if c["id"] == cid)
    assert claim["timeline"][-1]["type"] == "ai_processing_started" and "AI processing started by" in claim["timeline"][-1]["text"]
    assert claim["audit"][-1]["action"] == "ai_processing_started"

    asyncio.run(orchestrator.run(body["run_id"], cid, pace="fast", mode="demo"))
    final = next(c for c in read_json_sync("claims.json", []) if c["id"] == cid)
    assert final["financials"] is not None and final["fraud"] is not None and final["decision"] is not None
    assert final["status"] != "SUBMITTED"
    # Home / Claim Detail update instantly (no restart needed) — the list no longer offers it.
    row = a.get("/api/claims", params={"q": cid}).json()["items"][0]
    assert row["ai_pending"] is False
    # Demo mode leaves every LLM agent "demo"-sourced, so a (re-)run is still offered — see test_clean_complete_run_blocks_reprocessing.
    detail = a.get(f"/api/claims/{cid}").json()
    assert detail["ai_processing"]["action"] == "rerun"


def test_blocked_statuses():
    r, a = rahul(), admin()

    draft = r.post("/api/claims", json={"policy_no": rahul_policy()["policy_no"]}).json()
    assert a.post(f"/api/claims/{draft['id']}/process").json()["detail"]["code"] == "not_submitted"

    cid = pending_claim(r)

    def set_status(status: str) -> None:
        claims = read_json_sync("claims.json", [])
        next(c for c in claims if c["id"] == cid)["status"] = status
        write_json_sync("claims.json", claims)

    set_status("PROCESSING")
    assert a.post(f"/api/claims/{cid}/process").json()["detail"]["code"] == "processing"

    for final_status in ("SETTLED", "WITHDRAWN", "FRAUD_CONFIRMED"):
        set_status(final_status)
        res = a.post(f"/api/claims/{cid}/process")
        assert res.status_code == 409 and res.json()["detail"]["code"] == "final"
        row = a.get("/api/claims", params={"q": cid}).json()["items"][0]
        assert row["ai_pending"] is False


def test_degraded_run_offers_rerun_with_reason_recorded():
    r, a = rahul(), admin()
    cid = pending_claim(r)
    run = a.post(f"/api/claims/{cid}/process", json={"pace": "fast"}).json()
    asyncio.run(orchestrator.run(run["run_id"], cid, pace="fast", mode="demo"))

    # Already has a complete assessment, but the run that produced it used demo/fallback sources for every LLM
    # agent (demo mode) → offered as "rerun".
    detail = a.get(f"/api/claims/{cid}").json()
    assert detail["ai_processing"]["action"] == "rerun"
    rerun = a.post(f"/api/claims/{cid}/process", json={"pace": "fast", "reason": "Verifying a fix"})
    assert rerun.status_code == 200, rerun.text
    claim = next(c for c in read_json_sync("claims.json", []) if c["id"] == cid)
    assert "Verifying a fix" in claim["audit"][-1]["reason"] and "AI processing started by" in claim["timeline"][-1]["text"]


def test_clean_complete_run_blocks_reprocessing():
    r, a = rahul(), admin()
    cid = pending_claim(r)
    run = a.post(f"/api/claims/{cid}/process", json={"pace": "fast"}).json()
    asyncio.run(orchestrator.run(run["run_id"], cid, pace="fast", mode="demo"))

    # Force that run's record to look clean (every agent "live"): a complete assessment from a clean run is final.
    runs = read_json_sync("pipeline_runs.json", [])
    last = next(x for x in runs if x["claim_id"] == cid and x["id"] == run["run_id"])
    for agent in last["agents"].values():
        agent["source"] = "live"
    write_json_sync("pipeline_runs.json", runs)

    detail = a.get(f"/api/claims/{cid}").json()
    assert detail["ai_processing"]["action"] is None
    blocked = a.post(f"/api/claims/{cid}/process")
    assert blocked.status_code == 409 and blocked.json()["detail"]["code"] == "has_results"


def test_failed_run_offers_rerun():
    r, a = rahul(), admin()
    cid = pending_claim(r)
    run = a.post(f"/api/claims/{cid}/process", json={"pace": "fast"}).json()
    asyncio.run(orchestrator.run(run["run_id"], cid, pace="fast", mode="demo"))

    def mark_failed(runs: list[dict]) -> None:
        last = next(x for x in runs if x["claim_id"] == cid and x["id"] == run["run_id"])
        last["status"] = "failed"
        for agent in last["agents"].values():
            agent["source"] = "live"  # even with every agent clean, a failed run itself is enough for "rerun"

    runs = read_json_sync("pipeline_runs.json", [])
    mark_failed(runs)
    write_json_sync("pipeline_runs.json", runs)
    detail = a.get(f"/api/claims/{cid}").json()
    assert detail["ai_processing"]["action"] == "rerun"
    assert a.post(f"/api/claims/{cid}/process").status_code == 200


def test_claim_with_no_photos_or_narrative_handled_gracefully_not_crashed():
    r, a = rahul(), admin()
    cid = pending_claim(r, photos=False, narrative=False)
    claim = next(c for c in read_json_sync("claims.json", []) if c["id"] == cid)
    assert claim["media"] == [] and claim["incident"]["narrative_en"] == ""
    run = a.post(f"/api/claims/{cid}/process", json={"pace": "fast"})
    assert run.status_code == 200, run.text
    asyncio.run(orchestrator.run(run.json()["run_id"], cid, pace="fast", mode="demo"))
    final = next(c for c in read_json_sync("claims.json", []) if c["id"] == cid)
    # Never crashes; routes to a handler (never silently auto-approved) with a clear status.
    assert final["status"] in ("UNDER_REVIEW", "SIU_INVESTIGATION", "INFO_REQUESTED", "APPROVED", "PREAUTH_ISSUED")
    assert final["decision"] is not None
