"""Phase 5 — agents & pipeline. Gemini is never called: demo mode uses the recorded scenario outputs; the live path replaces
`gemini._transport` with a fake that returns scripted JSON (or fails) so the real orchestration, validation, retry, fallback,
costing, DMN, vehicle-identity and adjudication code runs end to end.
"""
from __future__ import annotations

import asyncio
import json

import pytest

from app.agents import orchestrator
from app.agents import adjudication as adj
from app.services import gemini, pipeline_bus, reference, scenario_replay
from app.services.json_store import read_json_sync

DEV = {"id": "u_002", "role": "admin", "is_developer": True}


def claim(cid: str) -> dict:
    return next(c for c in read_json_sync("claims.json", []) if c["id"] == cid)


def replay(sid: str) -> tuple[dict, dict]:
    async def go():
        c = await scenario_replay.clone(sid, DEV)
        run_id = await orchestrator.start(c["id"], pace="fast", trigger="test", force_mode="demo")
        await orchestrator.run(run_id, c["id"], pace="fast", mode="demo")
        return c["id"], run_id

    cid, run_id = asyncio.run(go())
    run = next(r for r in read_json_sync("pipeline_runs.json", []) if r["id"] == run_id)
    return claim(cid), run


EXPECTED = {  # §14.3
    "clean_rear_end": ("PREAUTH_ISSUED", "approve", "low", {"FR-06"}),
    "fastag_mismatch": ("SIU_INVESTIGATION", "escalate_siu", "high", {"FR-01", "FR-02", "FR-03", "FR-11", "FR-14"}),  # EXIF GPS in Mumbai
    "garage_overquote": ("UNDER_REVIEW", "approve_revised", "medium", {"FR-04", "FR-06", "FR-14"}),
    "theft_two_wheeler": ("INFO_REQUESTED", "request_info", "low", {"FR-12"}),
    "flood_total_loss": ("UNDER_REVIEW", "approve_total_loss", "low", set()),
}


@pytest.fixture(autouse=True)
def reset_gemini():
    reference.reload()
    yield
    gemini._transport = gemini._default_transport
    gemini.set_mode_override(None)
    gemini._forced_failures.clear()


@pytest.mark.parametrize("sid", sorted(EXPECTED))
def test_demo_replay_reaches_expected_outcome(sid):
    status, action, band, rules = EXPECTED[sid]
    c, run = replay(sid)
    assert run["status"] == "completed", run.get("error")
    assert c["status"] == status and c["decision"]["recommended_action"] == action
    assert c["fraud"]["band"] == band and {f["rule_id"] for f in c["fraud"]["fired"]} == rules
    assert c["risk_score"] == c["fraud"]["score"] == min(100, sum(f["points"] for f in c["fraud"]["fired"]))
    assert c["vehicle_identity"]["status"] == "not_assessed"            # demo mode never fakes an identity reading
    assert c["origin"] == "app" and c["pipeline_run_id"] == run["id"] and c["communications"][-1]["by"] == "agent:communication"
    assert c["id"] in c["communications"][-1]["text"] or c["id"] in c["communications"][-1]["text_en"]
    events = [e["event"] for e in run["events"]]
    assert events[0] == "run_started" and events[-1] == "run_completed" and "decision" in events
    assert [e["id"] for e in run["events"]] == list(range(1, len(events) + 1))
    assert {e["data"]["agent"] for e in run["events"] if e["event"] == "agent_completed"} == \
        {"intake", "document", "verification", "damage", "fraud", "adjudication", "communication"}
    if sid == "theft_two_wheeler":
        assert c["decision"]["info_request"]["items"] == ["RTO theft declaration", "All original keys"]
    if sid == "flood_total_loss":
        assert c["claim_type"] == "Total loss" and c["financials"]["salvage"] > 0
    if sid == "clean_rear_end":
        assert c["decision"]["auto"] and c["amount_approved"] == c["financials"]["net_payable"] > 0
    if sid == "fastag_mismatch":
        msg = c["communications"][-1]
        assert not any(w in (msg["text"] + msg["text_en"]).lower() for w in ("fraud", "fastag", "siu", "risk", "investigat"))


def test_replay_leaves_seeded_scenario_untouched():
    before = json.dumps(next(c for c in read_json_sync("claims.json", []) if c.get("scenario_id") == "fastag_mismatch"), sort_keys=True)
    replay("fastag_mismatch")
    after = json.dumps(next(c for c in read_json_sync("claims.json", []) if c.get("scenario_id") == "fastag_mismatch"
                            and c.get("origin") != "app"), sort_keys=True)
    assert before == after


def test_sse_replay_from_last_event_id():
    _, run = replay("clean_rear_end")

    async def collect(last):
        return [e async for e in pipeline_bus.subscribe(run["id"], last)]

    pipeline_bus._live.pop(run["id"], None)        # as after a restart: replay comes from pipeline_runs.json
    full = asyncio.run(collect(0))
    tail = asyncio.run(collect(10))
    assert [e["id"] for e in full] == list(range(1, len(run["events"]) + 1))
    assert [e["id"] for e in tail] == list(range(11, len(run["events"]) + 1))
